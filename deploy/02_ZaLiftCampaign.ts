import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const TEMPLATE_END_TIME = 4_102_444_800; // 2100-01-01T00:00:00Z

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  const token = await get("fUSDT");

  const deployed = await deploy("ZaLiftCampaign", {
    from: deployer,
    args: [deployer, token.address, "Template", 0, TEMPLATE_END_TIME],
    log: true,
  });

  console.log(`ZaLiftCampaign (template) contract:`, deployed.address);
};

export default func;
func.id = "deploy_zalift_campaign_template";
func.tags = ["ZaLiftCampaign"];
func.dependencies = ["fUSDT"];

