import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { isAddress, parseUnits, formatUnits } from 'viem';
import { Contract } from 'ethers';

import { Header } from './Header';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import {
  FUSDT_ABI,
  FUSDT_ADDRESS,
  SEPOLIA_CHAIN_ID,
  ZALIFT_CAMPAIGN_ABI,
  ZALIFT_FACTORY_ABI,
  ZALIFT_FACTORY_ADDRESS,
} from '../config/contracts';
import '../styles/ZaLiftApp.css';

type CampaignSummary = {
  address: `0x${string}`;
  name: string;
  creator: `0x${string}`;
  endTime: bigint;
  targetAmount: bigint;
  ended: boolean;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function toAddress(value: string): `0x${string}` | null {
  if (!isAddress(value)) return null;
  const addr = value as `0x${string}`;
  return addr.toLowerCase() === ZERO_ADDRESS ? null : addr;
}

function formatAmount(value: bigint, decimals = 6) {
  return formatUnits(value, decimals);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function ZaLiftApp() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signer = useEthersSigner({ chainId: SEPOLIA_CHAIN_ID });
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [tokenAddressInput, setTokenAddressInput] = useState<string>(FUSDT_ADDRESS);
  const [factoryAddressInput, setFactoryAddressInput] = useState<string>(ZALIFT_FACTORY_ADDRESS);

  const tokenAddress = useMemo(() => toAddress(tokenAddressInput), [tokenAddressInput]);
  const factoryAddress = useMemo(() => toAddress(factoryAddressInput), [factoryAddressInput]);

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [reloadCampaignsKey, setReloadCampaignsKey] = useState(0);

  const [selectedCampaign, setSelectedCampaign] = useState<`0x${string}` | null>(null);

  const [mintAmount, setMintAmount] = useState<string>('100');
  const [isMinting, setIsMinting] = useState(false);
  const [decryptedBalance, setDecryptedBalance] = useState<bigint | null>(null);
  const [isDecryptingBalance, setIsDecryptingBalance] = useState(false);

  const [newCampaignName, setNewCampaignName] = useState<string>('My Fundraising');
  const [newCampaignTarget, setNewCampaignTarget] = useState<string>('1000');
  const [newCampaignEnd, setNewCampaignEnd] = useState<string>(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);

  const [contributeAmount, setContributeAmount] = useState<string>('1');
  const [isContributing, setIsContributing] = useState(false);
  const [decryptedContribution, setDecryptedContribution] = useState<bigint | null>(null);
  const [decryptedPoints, setDecryptedPoints] = useState<bigint | null>(null);
  const [isDecryptingStats, setIsDecryptingStats] = useState(false);

  const { data: encryptedTokenBalance } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: FUSDT_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!tokenAddress && !!address,
    },
  });

  const { data: campaignName } = useReadContract({
    address: selectedCampaign ?? undefined,
    abi: ZALIFT_CAMPAIGN_ABI,
    functionName: 'campaignName',
    query: { enabled: !!selectedCampaign },
  });
  const { data: campaignCreator } = useReadContract({
    address: selectedCampaign ?? undefined,
    abi: ZALIFT_CAMPAIGN_ABI,
    functionName: 'creator',
    query: { enabled: !!selectedCampaign },
  });
  const { data: campaignEndTime } = useReadContract({
    address: selectedCampaign ?? undefined,
    abi: ZALIFT_CAMPAIGN_ABI,
    functionName: 'endTime',
    query: { enabled: !!selectedCampaign },
  });
  const { data: campaignTarget } = useReadContract({
    address: selectedCampaign ?? undefined,
    abi: ZALIFT_CAMPAIGN_ABI,
    functionName: 'targetAmount',
    query: { enabled: !!selectedCampaign },
  });
  const { data: campaignEnded } = useReadContract({
    address: selectedCampaign ?? undefined,
    abi: ZALIFT_CAMPAIGN_ABI,
    functionName: 'ended',
    query: { enabled: !!selectedCampaign },
  });
  const { data: encryptedTotalRaised } = useReadContract({
    address: selectedCampaign ?? undefined,
    abi: ZALIFT_CAMPAIGN_ABI,
    functionName: 'totalRaised',
    query: { enabled: !!selectedCampaign },
  });

  const [decryptedTotalRaised, setDecryptedTotalRaised] = useState<bigint | null>(null);
  const [isDecryptingTotal, setIsDecryptingTotal] = useState(false);

  useEffect(() => {
    setDecryptedBalance(null);
  }, [encryptedTokenBalance]);

  useEffect(() => {
    let cancelled = false;

    async function decryptTotalIfNeeded() {
      if (!instance || !encryptedTotalRaised) return;
      if (encryptedTotalRaised === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        setDecryptedTotalRaised(0n);
        return;
      }
      setIsDecryptingTotal(true);
      try {
        const result = await instance.publicDecrypt([encryptedTotalRaised]);
        if (cancelled) return;
        const clear = result.clearValues[encryptedTotalRaised as `0x${string}`];
        setDecryptedTotalRaised(typeof clear === 'bigint' ? clear : null);
      } catch (e) {
        if (!cancelled) setDecryptedTotalRaised(null);
      } finally {
        if (!cancelled) setIsDecryptingTotal(false);
      }
    }

    decryptTotalIfNeeded();
    return () => {
      cancelled = true;
    };
  }, [encryptedTotalRaised, instance]);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaigns() {
      if (!publicClient || !factoryAddress) return;
      setCampaignsLoading(true);
      setCampaignsError(null);
      try {
        const count = (await publicClient.readContract({
          address: factoryAddress,
          abi: ZALIFT_FACTORY_ABI,
          functionName: 'campaignCount',
        })) as bigint;

        const max = Number(count > 50n ? 50n : count);
        const addresses = await Promise.all(
          Array.from({ length: max }, (_, i) =>
            publicClient.readContract({
              address: factoryAddress,
              abi: ZALIFT_FACTORY_ABI,
              functionName: 'campaignAt',
              args: [BigInt(i)],
            }) as Promise<`0x${string}`>,
          ),
        );

        const summaries = await Promise.all(
          addresses.map(async (campaignAddr) => {
            const [name, creator, endTime, targetAmount, ended] = await Promise.all([
              publicClient.readContract({
                address: campaignAddr,
                abi: ZALIFT_CAMPAIGN_ABI,
                functionName: 'campaignName',
              }) as Promise<string>,
              publicClient.readContract({
                address: campaignAddr,
                abi: ZALIFT_CAMPAIGN_ABI,
                functionName: 'creator',
              }) as Promise<`0x${string}`>,
              publicClient.readContract({
                address: campaignAddr,
                abi: ZALIFT_CAMPAIGN_ABI,
                functionName: 'endTime',
              }) as Promise<bigint>,
              publicClient.readContract({
                address: campaignAddr,
                abi: ZALIFT_CAMPAIGN_ABI,
                functionName: 'targetAmount',
              }) as Promise<bigint>,
              publicClient.readContract({
                address: campaignAddr,
                abi: ZALIFT_CAMPAIGN_ABI,
                functionName: 'ended',
              }) as Promise<boolean>,
            ]);

            return { address: campaignAddr, name, creator, endTime, targetAmount, ended } satisfies CampaignSummary;
          }),
        );

        if (cancelled) return;
        setCampaigns(summaries);
        if (summaries.length > 0) setSelectedCampaign((cur) => cur ?? summaries[0].address);
      } catch (e) {
        if (!cancelled) setCampaignsError(e instanceof Error ? e.message : 'Failed to load campaigns');
      } finally {
        if (!cancelled) setCampaignsLoading(false);
      }
    }

    loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, [publicClient, factoryAddress, reloadCampaignsKey]);

  async function mintEncrypted() {
    if (!instance || !address || !tokenAddress || !signer) return;
    setIsMinting(true);
    try {
      const amount = parseUnits(mintAmount || '0', 6);
      const encrypted = await instance.createEncryptedInput(tokenAddress, address).add64(amount).encrypt();
      const resolvedSigner = await signer;
      if (!resolvedSigner) throw new Error('Signer not available');

      const token = new Contract(tokenAddress, FUSDT_ABI, resolvedSigner);
      const tx = await token.mintEncrypted(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
    } finally {
      setIsMinting(false);
    }
  }

  async function decryptMyBalance() {
    if (!instance || !address || !tokenAddress || !encryptedTokenBalance || !signer) return;
    if (encryptedTokenBalance === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      setDecryptedBalance(0n);
      return;
    }

    setIsDecryptingBalance(true);
    try {
      const keypair = instance.generateKeypair();
      const handleContractPairs = [{ handle: encryptedTokenBalance, contractAddress: tokenAddress }];
      const startTimeStamp = nowSeconds().toString();
      const durationDays = '10';
      const contractAddresses = [tokenAddress];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

      const resolvedSigner = await signer;
      if (!resolvedSigner) throw new Error('Signer not available');
      const signature = await resolvedSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const clear = result[encryptedTokenBalance as `0x${string}`];
      setDecryptedBalance(typeof clear === 'bigint' ? clear : null);
    } finally {
      setIsDecryptingBalance(false);
    }
  }

  async function createCampaign() {
    if (!factoryAddress || !signer) return;
    setIsCreatingCampaign(true);
    try {
      const endTs = Math.floor(new Date(newCampaignEnd).getTime() / 1000);
      const target = parseUnits(newCampaignTarget || '0', 6);
      const resolvedSigner = await signer;
      if (!resolvedSigner) throw new Error('Signer not available');

      const factory = new Contract(factoryAddress, ZALIFT_FACTORY_ABI, resolvedSigner);
      const tx = await factory.createCampaign(newCampaignName, target, endTs);
      await tx.wait();

      setReloadCampaignsKey((v) => v + 1);
    } finally {
      setIsCreatingCampaign(false);
    }
  }

  async function contribute() {
    if (!instance || !address || !tokenAddress || !selectedCampaign || !signer) return;
    setIsContributing(true);
    try {
      const amount = parseUnits(contributeAmount || '0', 6);
      const encrypted = await instance.createEncryptedInput(tokenAddress, address).add64(amount).encrypt();

      const resolvedSigner = await signer;
      if (!resolvedSigner) throw new Error('Signer not available');

      const token = new Contract(tokenAddress, FUSDT_ABI, resolvedSigner);
      const tx = await token['confidentialTransferAndCall(address,bytes32,bytes,bytes)'](
        selectedCampaign,
        encrypted.handles[0],
        encrypted.inputProof,
        '0x',
      );
      await tx.wait();

      setDecryptedContribution(null);
      setDecryptedPoints(null);
    } finally {
      setIsContributing(false);
    }
  }

  async function decryptMyStats() {
    if (!instance || !address || !selectedCampaign || !signer) return;
    setIsDecryptingStats(true);
    try {
      const [encryptedContribution, encryptedPoints] = (await Promise.all([
        publicClient?.readContract({
          address: selectedCampaign,
          abi: ZALIFT_CAMPAIGN_ABI,
          functionName: 'contributionOf',
          args: [address],
        }),
        publicClient?.readContract({
          address: selectedCampaign,
          abi: ZALIFT_CAMPAIGN_ABI,
          functionName: 'pointsOf',
          args: [address],
        }),
      ])) as [`0x${string}` | undefined, `0x${string}` | undefined];

      const contributionHandle =
        encryptedContribution ??
        ('0x0000000000000000000000000000000000000000000000000000000000000000' as const);
      const pointsHandle =
        encryptedPoints ?? ('0x0000000000000000000000000000000000000000000000000000000000000000' as const);

      if (
        contributionHandle === '0x0000000000000000000000000000000000000000000000000000000000000000' &&
        pointsHandle === '0x0000000000000000000000000000000000000000000000000000000000000000'
      ) {
        setDecryptedContribution(0n);
        setDecryptedPoints(0n);
        return;
      }

      const keypair = instance.generateKeypair();
      const handleContractPairs = [
        { handle: contributionHandle, contractAddress: selectedCampaign },
        { handle: pointsHandle, contractAddress: selectedCampaign },
      ];
      const startTimeStamp = nowSeconds().toString();
      const durationDays = '10';
      const contractAddresses = [selectedCampaign];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

      const resolvedSigner = await signer;
      if (!resolvedSigner) throw new Error('Signer not available');
      const signature = await resolvedSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const clearContribution = result[contributionHandle];
      const clearPoints = result[pointsHandle];
      setDecryptedContribution(typeof clearContribution === 'bigint' ? clearContribution : null);
      setDecryptedPoints(typeof clearPoints === 'bigint' ? clearPoints : null);
    } finally {
      setIsDecryptingStats(false);
    }
  }

  async function endAndWithdraw() {
    if (!selectedCampaign || !signer) return;
    const resolvedSigner = await signer;
    if (!resolvedSigner) throw new Error('Signer not available');
    const campaign = new Contract(selectedCampaign, ZALIFT_CAMPAIGN_ABI, resolvedSigner);
    const tx = await campaign.endAndWithdraw();
    await tx.wait();
  }

  const onSepolia = chainId === SEPOLIA_CHAIN_ID;

  return (
    <div className="app-root">
      <Header />
      <main className="app-container">
        <section className="card">
          <h2 className="card-title">Settings</h2>
          <div className="grid-2">
            <div className="field">
              <label className="label">fUSDT address</label>
              <input
                className="input"
                value={tokenAddressInput}
                onChange={(e) => setTokenAddressInput(e.target.value)}
                placeholder="0x..."
              />
              {!tokenAddress && <p className="hint error">Invalid address</p>}
            </div>
            <div className="field">
              <label className="label">Factory address</label>
              <input
                className="input"
                value={factoryAddressInput}
                onChange={(e) => setFactoryAddressInput(e.target.value)}
                placeholder="0x..."
              />
              {!factoryAddress && <p className="hint error">Invalid address</p>}
            </div>
          </div>
          <p className="hint">
            After deploying on Sepolia, run <code>npx hardhat task:sync-frontend --networkName sepolia</code> to update
            the default addresses.
          </p>
        </section>

        <section className="grid-main">
          <div className="stack">
            <section className="card">
              <h2 className="card-title">Token</h2>
              {!isConnected && <p className="hint">Connect a wallet to mint and decrypt balances.</p>}
              {isConnected && !onSepolia && (
                <p className="hint error">Wrong network. Switch your wallet to Sepolia.</p>
              )}
              {zamaError && <p className="hint error">{zamaError}</p>}
              <div className="grid-2">
                <div className="field">
                  <label className="label">Mint (encrypted, fUSDT)</label>
                  <input className="input" value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} />
                </div>
                <button
                  className="button primary"
                  disabled={!isConnected || !onSepolia || !instance || !tokenAddress || isMinting || zamaLoading}
                  onClick={mintEncrypted}
                >
                  {isMinting ? 'Minting…' : 'Mint'}
                </button>
              </div>
              <div className="row">
                <button
                  className="button"
                  disabled={!isConnected || !onSepolia || !instance || !tokenAddress || !encryptedTokenBalance || isDecryptingBalance}
                  onClick={decryptMyBalance}
                >
                  {isDecryptingBalance ? 'Decrypting…' : 'Decrypt my balance'}
                </button>
                <div className="stat">
                  <div className="stat-label">Balance</div>
                  <div className="stat-value">
                    {decryptedBalance === null ? '***' : `${formatAmount(decryptedBalance)} fUSDT`}
                  </div>
                </div>
              </div>
            </section>

            <section className="card">
              <h2 className="card-title">Create Campaign</h2>
              <div className="field">
                <label className="label">Name</label>
                <input className="input" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="label">Target (fUSDT)</label>
                  <input className="input" value={newCampaignTarget} onChange={(e) => setNewCampaignTarget(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">End</label>
                  <input className="input" type="datetime-local" value={newCampaignEnd} onChange={(e) => setNewCampaignEnd(e.target.value)} />
                </div>
              </div>
              <button
                className="button primary"
                disabled={!isConnected || !onSepolia || !factoryAddress || !signer || isCreatingCampaign}
                onClick={createCampaign}
              >
                {isCreatingCampaign ? 'Creating…' : 'Create'}
              </button>
            </section>
          </div>

          <div className="stack">
            <section className="card">
              <div className="row space-between">
                <h2 className="card-title">Campaigns</h2>
                {campaignsLoading && <span className="hint">Loading…</span>}
              </div>
              {campaignsError && <p className="hint error">{campaignsError}</p>}
              {campaigns.length === 0 && !campaignsLoading && <p className="hint">No campaigns found.</p>}
              <div className="campaign-list">
                {campaigns.map((c) => (
                  <button
                    key={c.address}
                    className={`campaign-item ${selectedCampaign === c.address ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedCampaign(c.address);
                      setDecryptedContribution(null);
                      setDecryptedPoints(null);
                    }}
                  >
                    <div className="campaign-name">{c.name || c.address.slice(0, 10)}</div>
                    <div className="campaign-meta">
                      <span>{c.ended ? 'Ended' : 'Active'}</span>
                      <span>End: {new Date(Number(c.endTime) * 1000).toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              <h2 className="card-title">Campaign</h2>
              {!selectedCampaign && <p className="hint">Select a campaign.</p>}
              {selectedCampaign && (
                <>
                  <div className="campaign-details">
                    <div className="detail">
                      <div className="detail-label">Address</div>
                      <div className="detail-value mono">{selectedCampaign}</div>
                    </div>
                    <div className="detail">
                      <div className="detail-label">Name</div>
                      <div className="detail-value">{(campaignName as string) || '—'}</div>
                    </div>
                    <div className="detail">
                      <div className="detail-label">Creator</div>
                      <div className="detail-value mono">{(campaignCreator as string) || '—'}</div>
                    </div>
                    <div className="detail">
                      <div className="detail-label">Target</div>
                      <div className="detail-value">
                        {campaignTarget ? `${formatAmount(campaignTarget as bigint)} fUSDT` : '—'}
                      </div>
                    </div>
                    <div className="detail">
                      <div className="detail-label">Total raised</div>
                      <div className="detail-value">
                        {isDecryptingTotal ? 'Decrypting…' : decryptedTotalRaised === null ? '***' : `${formatAmount(decryptedTotalRaised)} fUSDT`}
                      </div>
                    </div>
                    <div className="detail">
                      <div className="detail-label">Status</div>
                      <div className="detail-value">
                        {campaignEnded === undefined ? '—' : campaignEnded ? 'Ended' : (campaignEndTime && Number(campaignEndTime as bigint) <= nowSeconds()) ? 'Closed' : 'Open'}
                      </div>
                    </div>
                  </div>

                  <div className="divider" />

                  <h3 className="section-title">Contribute</h3>
                  <div className="grid-2">
                    <div className="field">
                      <label className="label">Amount (fUSDT)</label>
                      <input className="input" value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)} />
                    </div>
                    <button
                      className="button primary"
                      disabled={
                        !isConnected ||
                        !onSepolia ||
                        !instance ||
                        !tokenAddress ||
                        !selectedCampaign ||
                        !!campaignEnded ||
                        isContributing
                      }
                      onClick={contribute}
                    >
                      {isContributing ? 'Sending…' : 'Contribute (encrypted)'}
                    </button>
                  </div>

                  <div className="row">
                    <button
                      className="button"
                      disabled={!isConnected || !onSepolia || !instance || !selectedCampaign || !address || isDecryptingStats}
                      onClick={decryptMyStats}
                    >
                      {isDecryptingStats ? 'Decrypting…' : 'Decrypt my contribution + points'}
                    </button>
                    <div className="stat">
                      <div className="stat-label">My contribution</div>
                      <div className="stat-value">
                        {decryptedContribution === null ? '***' : `${formatAmount(decryptedContribution)} fUSDT`}
                      </div>
                    </div>
                    <div className="stat">
                      <div className="stat-label">My points</div>
                      <div className="stat-value">{decryptedPoints === null ? '***' : formatAmount(decryptedPoints)}</div>
                    </div>
                  </div>

                  {address && campaignCreator && address.toLowerCase() === (campaignCreator as string).toLowerCase() && (
                    <>
                      <div className="divider" />
                      <h3 className="section-title">Creator</h3>
                      <button className="button danger" disabled={!onSepolia || !signer} onClick={endAndWithdraw}>
                        End campaign and withdraw all fUSDT
                      </button>
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
