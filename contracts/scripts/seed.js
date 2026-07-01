const { ethers } = require("hardhat");

async function main() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();
  console.log("Seeding local node with stakers...");

  const predictionPoolAddress = "0xD5ac451B0c50B9476107823Af206eD814a2e2580";
  const usdcAddress = "0x18E317A7D70d8fBf8e6E893616b52390EbBdb629";

  const pool = await ethers.getContractAt("PredictionPool", predictionPoolAddress);
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);

  // Mint USDC to Alice, Bob, and Carol
  const mintAmount = 100_000n * 10n ** 6n; // 100k USDC
  for (const user of [alice, bob, carol]) {
    const tx = await usdc.mint(user.address, mintAmount);
    await tx.wait();
    console.log(`Minted 100k USDC to ${user.address}`);

    // Approve the PredictionPool to spend USDC
    const approveTx = await usdc.connect(user).approve(predictionPoolAddress, ethers.MaxUint256);
    await approveTx.wait();
    console.log(`Approved PredictionPool to spend USDC for ${user.address}`);
  }

  // Create Pool 1
  const now = Math.floor(Date.now() / 1000);
  const stakeDeadline1 = now + 14 * 24 * 3600; // 14 days
  const resolutionDeadline1 = stakeDeadline1 + 2 * 24 * 3600; // 2 days later

  console.log("Creating Pool 1: Will Real Madrid win the 2026 Champions League final?");
  const createTx1 = await pool.createPool(
    "Will Real Madrid win the 2026 Champions League final?",
    ["Yes", "No"],
    stakeDeadline1,
    resolutionDeadline1,
    3600, // 1 hour dispute window
    100 // 1% fee (100 bps)
  );
  const receipt1 = await createTx1.wait();
  
  // Find poolId from event logs
  const poolCreatedEvent1 = receipt1.logs.find(
    (l) => l.fragment && l.fragment.name === "PoolCreated"
  );
  const poolId1 = poolCreatedEvent1.args[0];
  console.log("Pool 1 created with ID:", poolId1);

  // Place stakes on Pool 1
  // Yes: 62% ($124.8k), No: 38% ($76.2k) -> Total: $201.0k
  // Alice stakes $124.8k on Yes (Option 0)
  console.log("Alice staking $124,800 on Yes...");
  const stakeTx1 = await pool.connect(alice).stake(poolId1, 0, 124_800n * 10n ** 6n);
  await stakeTx1.wait();

  // Bob stakes $76.2k on No (Option 1)
  console.log("Bob staking $76,200 on No...");
  const stakeTx2 = await pool.connect(bob).stake(poolId1, 1, 76_200n * 10n ** 6n);
  await stakeTx2.wait();

  // Create Pool 2
  const stakeDeadline2 = now + 38 * 24 * 3600; // 38 days
  const resolutionDeadline2 = stakeDeadline2 + 2 * 24 * 3600;

  console.log("Creating Pool 2: Will Solana surpass $500 before July 2026?");
  const createTx2 = await pool.createPool(
    "Will Solana surpass $500 before July 2026?",
    ["Yes", "No"],
    stakeDeadline2,
    resolutionDeadline2,
    3600,
    100
  );
  const receipt2 = await createTx2.wait();
  const poolCreatedEvent2 = receipt2.logs.find(
    (l) => l.fragment && l.fragment.name === "PoolCreated"
  );
  const poolId2 = poolCreatedEvent2.args[0];
  console.log("Pool 2 created with ID:", poolId2);

  // Place stakes on Pool 2
  // Yes: 44% ($56.2k), No: 56% ($72.1k)
  console.log("Alice staking $56,200 on Yes...");
  await (await pool.connect(alice).stake(poolId2, 0, 56_200n * 10n ** 6n)).wait();

  console.log("Carol staking $72,100 on No...");
  await (await pool.connect(carol).stake(poolId2, 1, 72_100n * 10n ** 6n)).wait();

  console.log("Seeding completed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
