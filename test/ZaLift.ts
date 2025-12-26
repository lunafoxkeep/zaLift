import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

import { ZaLiftCampaign, ZaLiftFactory, fUSDT, ZaLiftFactory__factory, fUSDT__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  creator: HardhatEthersSigner;
  contributor: HardhatEthersSigner;
};

async function deployFixture() {
  const tokenFactory = (await ethers.getContractFactory("fUSDT")) as fUSDT__factory;
  const token = (await tokenFactory.deploy()) as fUSDT;
  const tokenAddress = await token.getAddress();

  const factoryFactory = (await ethers.getContractFactory("ZaLiftFactory")) as ZaLiftFactory__factory;
  const factory = (await factoryFactory.deploy(tokenAddress)) as ZaLiftFactory;

  return { token, tokenAddress, factory };
}

describe("ZaLift", function () {
  let signers: Signers;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], creator: ethSigners[1], contributor: ethSigners[2] };
  });

  it("creates a campaign, accepts encrypted contributions, tracks points, and withdraws funds", async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    const { token, tokenAddress, factory } = await deployFixture();

    const mintAmount = 10_000_000n;
    await (await token.connect(signers.deployer).mint(signers.contributor.address, Number(mintAmount))).wait();

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const endTime = Number(now + 7n * 24n * 60n * 60n);
    await (await factory.connect(signers.creator).createCampaign("Demo", 50_000_000, endTime)).wait();

    const campaignAddress = await factory.campaignAt(0);
    const campaign = (await ethers.getContractAt("ZaLiftCampaign", campaignAddress)) as ZaLiftCampaign;

    const contributeAmount = 1_500_000n;
    const encrypted = await fhevm
      .createEncryptedInput(tokenAddress, signers.contributor.address)
      .add64(contributeAmount)
      .encrypt();

    await (
      await token
        .connect(signers.contributor)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          campaignAddress,
          encrypted.handles[0],
          encrypted.inputProof,
          "0x",
        )
    ).wait();

    expect(await campaign.participantCount()).to.eq(1n);
    expect(await campaign.participantAt(0)).to.eq(signers.contributor.address);

    const encryptedContribution = await campaign.contributionOf(signers.contributor.address);
    const decryptedContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedContribution,
      campaignAddress,
      signers.contributor,
    );
    expect(decryptedContribution).to.eq(contributeAmount);

    const encryptedPoints = await campaign.pointsOf(signers.contributor.address);
    const decryptedPoints = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedPoints,
      campaignAddress,
      signers.contributor,
    );
    expect(decryptedPoints).to.eq(contributeAmount);

    const encryptedTotal = await campaign.totalRaised();
    const decryptedTotal = await fhevm.userDecryptEuint(FhevmType.euint64, encryptedTotal, campaignAddress, signers.creator);
    expect(decryptedTotal).to.eq(contributeAmount);

    const creatorBalanceBefore = await token.confidentialBalanceOf(signers.creator.address);
    const creatorBalanceBeforeClear =
      creatorBalanceBefore === ethers.ZeroHash
        ? 0n
        : await fhevm.userDecryptEuint(FhevmType.euint64, creatorBalanceBefore, tokenAddress, signers.creator);

    await (await campaign.connect(signers.creator).endAndWithdraw()).wait();

    const creatorBalanceAfter = await token.confidentialBalanceOf(signers.creator.address);
    const creatorBalanceAfterClear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      creatorBalanceAfter,
      tokenAddress,
      signers.creator,
    );
    expect(creatorBalanceAfterClear - creatorBalanceBeforeClear).to.eq(contributeAmount);

    const contributorBalanceAfter = await token.confidentialBalanceOf(signers.contributor.address);
    const contributorBalanceAfterClear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      contributorBalanceAfter,
      tokenAddress,
      signers.contributor,
    );
    expect(contributorBalanceAfterClear).to.eq(mintAmount - contributeAmount);
  });

  it("refunds encrypted contributions after campaign end", async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    const { token, tokenAddress, factory } = await deployFixture();

    const mintAmount = 3_000_000n;
    await (await token.connect(signers.deployer).mint(signers.contributor.address, Number(mintAmount))).wait();

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const endTime = Number(now + 7n * 24n * 60n * 60n);
    await (await factory.connect(signers.creator).createCampaign("Demo", 50_000_000, endTime)).wait();

    const campaignAddress = await factory.campaignAt(0);
    const campaign = (await ethers.getContractAt("ZaLiftCampaign", campaignAddress)) as ZaLiftCampaign;

    await (await campaign.connect(signers.creator).endAndWithdraw()).wait();

    const contributorBalanceBefore = await token.confidentialBalanceOf(signers.contributor.address);
    const contributorBalanceBeforeClear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      contributorBalanceBefore,
      tokenAddress,
      signers.contributor,
    );

    const contributeAmount = 1_000_000n;
    const encrypted = await fhevm
      .createEncryptedInput(tokenAddress, signers.contributor.address)
      .add64(contributeAmount)
      .encrypt();

    await (
      await token
        .connect(signers.contributor)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          campaignAddress,
          encrypted.handles[0],
          encrypted.inputProof,
          "0x",
        )
    ).wait();

    const contributorBalanceAfter = await token.confidentialBalanceOf(signers.contributor.address);
    const contributorBalanceAfterClear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      contributorBalanceAfter,
      tokenAddress,
      signers.contributor,
    );

    expect(contributorBalanceAfterClear).to.eq(contributorBalanceBeforeClear);
  });
});
