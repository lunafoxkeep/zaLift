import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  const token = await get("fUSDT");

  const deployed = await deploy("ZaLiftFactory", {
    from: deployer,
    args: [token.address],
    log: true,
  });

  console.log(`ZaLiftFactory contract:`, deployed.address);
};

export default func;
func.id = "deploy_zalift_factory";
func.tags = ["ZaLiftFactory"];
func.dependencies = ["fUSDT"];

