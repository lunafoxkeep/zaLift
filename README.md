# ZaLift

ZaLift is a privacy-preserving fundraising protocol built on Zama's FHEVM. It lets creators launch on-chain campaigns with a name, target amount, and end time, while contributors donate confidential fUSDT. Contribution amounts and point rewards are encrypted on-chain, but the campaign remains auditable through public metadata and an optionally public total raised.

## What This Project Does

ZaLift provides a complete, end-to-end stack for confidential fundraising:

- Creators launch campaigns with clear rules (name, target, end time).
- Contributors donate fUSDT via confidential transfers; amounts are encrypted.
- Each contribution also earns encrypted points (1 point per 1 fUSDT unit).
- Campaigns can be ended by the creator at any time, and all funds are withdrawn in a single confidential transfer.

## The Problem It Solves

On-chain fundraising is transparent by default. That transparency is useful for accountability, but it exposes donor privacy and makes it hard to reward participants without revealing sensitive amounts. ZaLift addresses these gaps:

- Donors should not be forced to reveal their contribution size.
- Fundraisers still need a verifiable, on-chain record of progress.
- Incentives (points) should be trackable without public leakage.
- The flow should remain simple for both creators and contributors.

## The Solution

ZaLift combines confidential tokens (ERC7984) with FHEVM encryption to keep amounts private while keeping campaign metadata and lifecycle visible. It provides:

- Encrypted contributions per participant.
- Encrypted points per participant.
- A total raised value that can be publicly decrypted.
- A minimal, creator-controlled lifecycle.

## Key Advantages

- Privacy by default: contribution amounts are never stored in plaintext.
- On-chain accountability: campaign metadata and totals remain verifiable.
- Simple UX: contributors only need to send one confidential transfer.
- Composable architecture: a factory creates many campaigns with the same ABI.
- Clear lifecycle: creators can end at any time and withdraw all funds.

## How It Works

1. Deploy `fUSDT`, `ZaLiftFactory`, and an optional `ZaLiftCampaign` template.
2. A creator calls `ZaLiftFactory.createCampaign(...)`.
3. Contributors encrypt their amount and use `confidentialTransferAndCall` to the campaign.
4. The campaign records:
   - Encrypted contribution amount per user.
   - Encrypted points per user (1:1 with contribution).
   - Encrypted total raised (publicly decryptable).
5. The creator ends the campaign and withdraws the confidential balance.

## Contracts

### `fUSDT`

- Confidential ERC7984 token used for contributions.
- Supports plaintext minting for local testing.
- Supports encrypted minting for real privacy flows.
- Amounts are expressed in base units; tasks and tests use a 6-decimal convention.

### `ZaLiftFactory`

- Creates `ZaLiftCampaign` instances.
- Keeps a list of all campaigns.
- Keeps a list of campaigns per creator.

### `ZaLiftCampaign`

- Stores campaign metadata: name, target amount, end time, creator.
- Accepts confidential transfers only from `fUSDT`.
- Records encrypted contributions and encrypted points.
- Tracks participants and their addresses.
- Allows the creator to end and withdraw at any time.

### `FHECounter` (template)

- Example contract kept for FHEVM reference and testing.

## Data Visibility

| Data                              | Stored On-Chain | Who Can Decrypt | Notes |
|-----------------------------------|----------------|----------------|-------|
| Campaign name/target/end time     | Public         | Anyone         | Plaintext metadata |
| Participant addresses             | Public         | Anyone         | Stored in a list |
| Individual contribution amounts   | Encrypted      | Contributor    | Uses `euint64` |
| Individual points                 | Encrypted      | Contributor    | 1 point per 1 fUSDT unit |
| Total raised                      | Encrypted      | Anyone         | Marked publicly decryptable |

## Tech Stack

- Smart contracts: Solidity 0.8.27 + Zama FHEVM (`@fhevm/solidity`)
- Confidential token standard: OpenZeppelin ERC7984
- Tooling: Hardhat, hardhat-deploy, TypeChain, ethers v6
- Frontend: React + Vite + RainbowKit + wagmi
- Reads: viem
- Writes: ethers
- Relayer/crypto helpers: `@zama-fhe/relayer-sdk`

## Repository Layout

- `contracts/` - ZaLift smart contracts and FHECounter reference
- `deploy/` - hardhat-deploy scripts for token, factory, and campaign template
- `tasks/` - CLI tasks for minting, creating campaigns, contributing, decrypting
- `test/` - Hardhat tests for the ZaLift flows
- `home/` - React frontend application
- `deployments/` - Network deployments and ABIs (used by frontend sync)

## Setup

### Prerequisites

- Node.js 20+
- npm 7+

### Install Dependencies

```bash
npm install
```

Frontend:

```bash
cd home
npm install
```

### Environment Variables

Create a `.env` in the repository root:

```bash
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=optional
REPORT_GAS=optional
```

Notes:
- Deployment uses `PRIVATE_KEY` only (no mnemonic).
- `INFURA_API_KEY` is required for Sepolia.

## Compile and Test

```bash
npm run compile
npm run test
```

## Deploy

### Sepolia

```bash
npm run deploy:sepolia
```

### Sync Frontend ABI and Addresses

The frontend must use ABIs from `deployments/sepolia`.

```bash
npx hardhat task:sync-frontend --networkName sepolia
```

This writes to:

- `home/src/config/contracts.ts`

## CLI Tasks

- Print deployed addresses:
  ```bash
  npx hardhat task:zalift:addresses
  ```
- Create a campaign:
  ```bash
  npx hardhat task:zalift:create --name "My Campaign" --target 50000000 --end 1750000000
  ```
- Mint test fUSDT:
  ```bash
  npx hardhat task:zalift:mint --to 0xYourAddress --amount 1000000
  ```
- Contribute (encrypted):
  ```bash
  npx hardhat task:zalift:contribute --campaign 0xCampaign --amount 1000000
  ```
- Decrypt your values:
  ```bash
  npx hardhat task:zalift:decrypt --campaign 0xCampaign --user 0xYourAddress
  ```

## Frontend

The frontend lives in `home/` and connects to Sepolia deployments via `home/src/config/contracts.ts`.

```bash
cd home
npm run dev
```

## Campaign Lifecycle Example

1. Creator deploys `fUSDT` and `ZaLiftFactory`.
2. Creator calls `createCampaign` with name, target, and end time.
3. Contributors mint or acquire fUSDT and send encrypted contributions.
4. Contributors can decrypt their own contributions and points.
5. Creator ends the campaign and withdraws the confidential balance.

## Limitations and Assumptions

- `fUSDT` minting is unrestricted for development purposes; it is not production-ready.
- Campaigns do not auto-finalize on target; the creator ends manually.
- The target amount is metadata only and is not enforced by on-chain logic.
- No refund path exists for unsuccessful campaigns; this can be added as a future feature.
- Contribution amounts are private, but participant addresses are public.
- Confidential transfers require an FHEVM-compatible network.

## Future Roadmap

- Role-based minting and faucet controls for `fUSDT`.
- Optional goal-based completion with refunds on failure.
- Points redemption and reward distribution (potentially confidential).
- Campaign analytics dashboard powered by encrypted totals.
- Multi-token fundraising and cross-campaign aggregation.
- Indexer support for faster frontend discovery.

## License

BSD-3-Clause-Clear. See `LICENSE` for details.
