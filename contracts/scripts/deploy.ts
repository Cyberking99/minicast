import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const network = await ethers.provider.getNetwork();
  let usdcAddress = process.env.USDC_ADDRESS;

  if (network.chainId === 31337n || !usdcAddress) {
    const mockUSDC = await ethers.deployContract("MockUSDC");
    await mockUSDC.waitForDeployment();
    usdcAddress = await mockUSDC.getAddress();
    console.log("MockUSDC:", usdcAddress);
  } else {
    console.log("Using USDC address:", usdcAddress);
  }

  const oracleAddress = process.env.ORACLE_ADDRESS ?? deployer.address;

  const oracleVerifier = await ethers.deployContract("OracleVerifier", [oracleAddress]);
  await oracleVerifier.waitForDeployment();
  console.log("OracleVerifier:", await oracleVerifier.getAddress());

  const feeCollector = await ethers.deployContract("FeeCollector", [usdcAddress]);
  await feeCollector.waitForDeployment();
  console.log("FeeCollector:", await feeCollector.getAddress());

  const predictionPool = await ethers.deployContract("PredictionPool", [
    usdcAddress,
    await oracleVerifier.getAddress(),
    await feeCollector.getAddress(),
  ]);
  await predictionPool.waitForDeployment();
  console.log("PredictionPool:", await predictionPool.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
