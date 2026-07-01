import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using deployer address:", deployer.address);

  const predictionPoolAddress = process.env.NEXT_PUBLIC_PREDICTION_POOL_ADDRESS;
  if (!predictionPoolAddress) {
    throw new Error("Missing NEXT_PUBLIC_PREDICTION_POOL_ADDRESS in environment");
  }

  console.log("Connecting to PredictionPool at:", predictionPoolAddress);
  const pool = await ethers.getContractAt("PredictionPool", predictionPoolAddress);

  const now = Math.floor(Date.now() / 1000);
  
  // Set stake deadline to 7 days from now, resolution deadline to 9 days from now
  const stakeDeadline = now + 7 * 24 * 3600;
  const resolutionDeadline = stakeDeadline + 2 * 24 * 3600;
  const disputeWindow = 3600; // 1 hour
  const feeBps = 100; // 1%

  // Pool 1
  console.log("Creating Pool: Will Bitcoin reach $150,000 in 2026?");
  const tx1 = await pool.createPool(
    "Will Bitcoin reach $150,000 in 2026?",
    ["Yes", "No"],
    stakeDeadline,
    resolutionDeadline,
    disputeWindow,
    feeBps
  );
  const receipt1 = await tx1.wait();
  console.log("Pool 1 Transaction Mined:", receipt1?.hash);

  // Pool 2
  console.log("Creating Pool: Will OpenAI release GPT-5 before December 2026?");
  const tx2 = await pool.createPool(
    "Will OpenAI release GPT-5 before December 2026?",
    ["Yes", "No"],
    stakeDeadline + 3600, // staggered slightly
    resolutionDeadline + 3600,
    disputeWindow,
    feeBps
  );
  const receipt2 = await tx2.wait();
  console.log("Pool 2 Transaction Mined:", receipt2?.hash);

  console.log("Pools created successfully on Celo Sepolia!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
