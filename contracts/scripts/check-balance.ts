import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const address = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(address);
  console.log("Address:", address);
  console.log("Balance:", ethers.formatEther(balance), "CELO");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
