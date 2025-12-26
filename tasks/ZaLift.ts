import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:zalift:addresses", "Prints deployed fUSDT and ZaLiftFactory addresses").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const token = await deployments.get("fUSDT");
    const factory = await deployments.get("ZaLiftFactory");
    console.log(`fUSDT: ${token.address}`);
    console.log(`ZaLiftFactory: ${factory.address}`);
  },
);

task("task:zalift:create", "Creates a new fundraising campaign")
  .addParam("name", "Campaign name")
  .addParam("target", "Target amount in token base units (decimals=6)")
  .addParam("end", "End timestamp (unix seconds)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const factoryDeployment = await deployments.get("ZaLiftFactory");
    const factory = await ethers.getContractAt("ZaLiftFactory", factoryDeployment.address);
    const [signer] = await ethers.getSigners();

    const tx = await factory.connect(signer).createCampaign(taskArguments.name, taskArguments.target, taskArguments.end);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();

    const event = receipt?.logs.find((l) => "topics" in l && (l as any).topics?.length > 0);
    console.log(`Campaign created. Tx: ${tx.hash}`);
    if (event) console.log(`Log: ${(event as any).transactionHash}`);
  });

task("task:zalift:mint", "Mints test fUSDT to an address (plaintext amount)")
  .addParam("to", "Receiver address")
  .addParam("amount", "Amount in token base units (decimals=6)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const tokenDeployment = await deployments.get("fUSDT");
    const token = await ethers.getContractAt("fUSDT", tokenDeployment.address);
    const [signer] = await ethers.getSigners();

    const tx = await token.connect(signer).mint(taskArguments.to, taskArguments.amount);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log(`Minted ${taskArguments.amount} to ${taskArguments.to}`);
  });

task("task:zalift:contribute", "Contributes to a campaign using encrypted fUSDT")
  .addParam("campaign", "Campaign address")
  .addParam("amount", "Amount in token base units (decimals=6)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const [signer] = await ethers.getSigners();
    const tokenDeployment = await deployments.get("fUSDT");
    const tokenAddress = tokenDeployment.address;
    const token = await ethers.getContractAt("fUSDT", tokenAddress);

    const encrypted = await fhevm
      .createEncryptedInput(tokenAddress, signer.address)
      .add64(BigInt(taskArguments.amount))
      .encrypt();

    const tx = await token
      .connect(signer)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        taskArguments.campaign,
        encrypted.handles[0],
        encrypted.inputProof,
        "0x",
      );
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log(`Contributed ${taskArguments.amount} to ${taskArguments.campaign}`);
  });

task("task:zalift:decrypt", "Decrypts contribution/points/totalRaised for a given user")
  .addParam("campaign", "Campaign address")
  .addParam("user", "User address to decrypt for")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const [signer] = await ethers.getSigners();
    const campaign = await ethers.getContractAt("ZaLiftCampaign", taskArguments.campaign);

    const contribution = await campaign.contributionOf(taskArguments.user);
    const points = await campaign.pointsOf(taskArguments.user);
    const totalRaised = await campaign.totalRaised();

    if (contribution === ethers.ZeroHash) console.log(`Contribution: 0`);
    else {
      const clear = await fhevm.userDecryptEuint(FhevmType.euint64, contribution, taskArguments.campaign, signer);
      console.log(`Contribution: ${clear}`);
    }

    if (points === ethers.ZeroHash) console.log(`Points: 0`);
    else {
      const clear = await fhevm.userDecryptEuint(FhevmType.euint64, points, taskArguments.campaign, signer);
      console.log(`Points: ${clear}`);
    }

    if (totalRaised === ethers.ZeroHash) console.log(`TotalRaised: 0`);
    else {
      const clear = await fhevm.userDecryptEuint(FhevmType.euint64, totalRaised, taskArguments.campaign, signer);
      console.log(`TotalRaised: ${clear}`);
    }
  });

