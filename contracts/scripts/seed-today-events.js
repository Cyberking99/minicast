const { ethers } = require("hardhat");

async function main() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();
  console.log("Seeding today's 6:10 PM GMT+1 events...");

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log("Current network chain ID:", chainId);

  let predictionPoolAddress, usdcAddress;
  if (chainId === 31337) {
    predictionPoolAddress = "0xD5ac451B0c50B9476107823Af206eD814a2e2580";
    usdcAddress = "0x18E317A7D70d8fBf8e6E893616b52390EbBdb629";
  } else if (chainId === 11142220) {
    predictionPoolAddress = "0x3E15a1974e39CD0e59b6F221b904aB926aEbAEbb";
    usdcAddress = "0x01C5C0122039549AD1493B8220cABEdD739BC44E";
  } else {
    throw new Error("Unsupported network");
  }

  const pool = await ethers.getContractAt("PredictionPool", predictionPoolAddress);
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);

  // Mint USDC to Alice, Bob, and Carol (only if on local node)
  if (chainId === 31337) {
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
  }

  // Calculate dynamic timestamps for 6:10 PM GMT+1 (June 13, 2026)
  const resolutionDate = new Date();
  resolutionDate.setHours(12, 10, 0, 0); // 18:10 (6:10 PM) GMT+1 today
  const resolutionTimestamp = Math.floor(resolutionDate.getTime() / 1000);

  const stakeDate = new Date();
  stakeDate.setHours(12, 5, 0, 0); // 18:08 (6:08 PM) GMT+1 today
  const stakeTimestamp = Math.floor(stakeDate.getTime() / 1000);

  console.log(`Stake Deadline: ${stakeDate.toLocaleString()} (${stakeTimestamp})`);
  console.log(`Resolution Deadline: ${resolutionDate.toLocaleString()} (${resolutionTimestamp})`);

  // const events = [
  //   {
  //     title: "Will the price of Bitcoin (BTC) be above $64,200.00 USD at 12:07 PM GMT+1 on June 14, 2026, according to CoinGecko or Binance?",
  //     options: ["Yes", "No"]
  //   },
  //   {
  //     title: "Will the price of Ethereum (ETH) be below $1,670.00 USD at 12:07 PM GMT+1 on June 14, 2026, according to CoinGecko or Binance?",
  //     options: ["Yes", "No"]
  //   },
  //   {
  //     title: "Will the price of BNB (BNB) be above $608.00 USD at 12:07 PM GMT+1 on June 14, 2026, according to CoinGecko or Binance?",
  //     options: ["Yes", "No"]
  //   }
  // ];

  const events2 = [
    {
      title: "Who will win the match between Brazil and Morocco in the 2026 world cup?",
      options: ["Brazil wins", "Morocco wins"],
      stakeTime: "2026-07-01T12:45:00+01:00",
      resolveTime: "2026-07-01T12:48:00+01:00"
    },
    {
      title: "Who will win the match between Ivory Coast and Ecuador in the 2026 world cup on 15/06/2026?",
      options: ["Ivory Coast wins", "Ecuador wins"],
      stakeTime: "2026-07-01T00:00:00+01:00",
      resolveTime: "2026-07-01T02:30:00+01:00"
    },
    {
      title: "Will Germany win Curacao in the 2026 world cup on 14/06/2026?",
      options: ["Yes", "No"],
      stakeTime: "2026-07-01T18:00:00+01:00",
      resolveTime: "2026-07-01T22:00:00+01:00"
    }
  ];

  // for (const event of events) {
  //   console.log(`Creating pool: "${event.title}"`);
  //   const tx = await pool.createPool(
  //     event.title,
  //     event.options,
  //     stakeTimestamp,
  //     resolutionTimestamp,
  //     10, // 10 seconds dispute window
  //     100 // 1% fee (100 bps)
  //   );
  //   const receipt = await tx.wait();
  //   const eventLog = receipt.logs.find(
  //     (l) => l.fragment && l.fragment.name === "PoolCreated"
  //   );
  //   const poolId = eventLog.args[0];
  //   console.log(`Pool created successfully with ID: ${poolId}`);

  //   // If on local node, seed some random stakes for demonstration
  //   if (chainId === 31337) {
  //     console.log("Staking on options...");
  //     await (await pool.connect(alice).stake(poolId, 0, 500n * 10n ** 6n)).wait();
  //     await (await pool.connect(bob).stake(poolId, 1, 300n * 10n ** 6n)).wait();
  //   }
  // }

  for (const event of events2) {
    console.log(`Creating pool: "${event.title}"`);

    const stakeDate = new Date(event.stakeTime);
    const stakeTimestamp = Math.floor(stakeDate.getTime() / 1000);
    const resolutionDate = new Date(event.resolveTime);
    const resolutionTimestamp = Math.floor(resolutionDate.getTime() / 1000);

    const tx = await pool.createPool(
      event.title,
      event.options,
      stakeTimestamp,
      resolutionTimestamp,
      10, // 10 seconds dispute window
      100 // 1% fee (100 bps)
    );
    const receipt = await tx.wait();
    const eventLog = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "PoolCreated"
    );
    const poolId = eventLog.args[0];
    console.log(`Pool created successfully with ID: ${poolId}`);

    // If on local node, seed some random stakes for demonstration
    if (chainId === 31337) {
      console.log("Staking on options...");
      await (await pool.connect(alice).stake(poolId, 0, 500n * 10n ** 6n)).wait();
      await (await pool.connect(bob).stake(poolId, 1, 300n * 10n ** 6n)).wait();
    }
  }

  console.log("Seeding completed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
