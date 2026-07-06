import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PredictionPool", function () {
  const FEE_BPS = 100n;
  const DISPUTE_WINDOW = 3600n;
  const STAKE_AMOUNT = 100n * 10n ** 6n;

  async function deployFixture() {
    const [owner, oracle, alice, bob, carol] = await ethers.getSigners();

    const usdc = await ethers.deployContract("MockUSDC");
    const oracleVerifier = await ethers.deployContract("OracleVerifier", [oracle.address]);
    const feeCollector = await ethers.deployContract("FeeCollector", [await usdc.getAddress()]);
    const pool = await ethers.deployContract("PredictionPool", [
      await usdc.getAddress(),
      await oracleVerifier.getAddress(),
      await feeCollector.getAddress(),
    ]);

    for (const user of [alice, bob, carol]) {
      await usdc.mint(user.address, 10_000n * 10n ** 6n);
      await usdc.connect(user).approve(await pool.getAddress(), ethers.MaxUint256);
    }

    const now = await time.latest();
    const stakeDeadline = BigInt(now + 7200);
    const resolutionDeadline = BigInt(now + 7200 + 7200);

    const tx = await pool.createPool(
      "Will Team A win?",
      ["Yes", "No"],
      stakeDeadline,
      resolutionDeadline,
      DISPUTE_WINDOW,
      FEE_BPS
    );
    const receipt = await tx.wait();
    const created = receipt?.logs.find(
      (l: { fragment?: { name: string } }) => l.fragment?.name === "PoolCreated"
    ) as { args: [string] } | undefined;
    const poolId = created?.args[0] as string;

    return {
      pool,
      usdc,
      oracleVerifier,
      feeCollector,
      poolId,
      oracle,
      alice,
      bob,
      carol,
      stakeDeadline,
      resolutionDeadline,
    };
  }

  async function signVerdict(oracle: { signMessage: (msg: string) => Promise<string> }, verdictHash: string) {
    return oracle.signMessage(ethers.getBytes(verdictHash));
  }

  it("creates a pool and accepts stakes", async function () {
    const { pool, poolId, alice, bob } = await deployFixture();

    await pool.connect(alice).stake(poolId, 0, STAKE_AMOUNT);
    await pool.connect(bob).stake(poolId, 1, STAKE_AMOUNT * 2n);

    expect(await pool.optionTotals(poolId, 0)).to.equal(STAKE_AMOUNT);
    expect(await pool.optionTotals(poolId, 1)).to.equal(STAKE_AMOUNT * 2n);
    expect((await pool.pools(poolId)).totalPool).to.equal(STAKE_AMOUNT * 3n);
  });

  it("locks after stake deadline", async function () {
    const { pool, poolId, stakeDeadline } = await deployFixture();
    await time.increaseTo(stakeDeadline);
    await pool.lockPool(poolId);
    expect((await pool.pools(poolId)).status).to.equal(1);
  });

  it("allows winners to claim parimutuel payouts", async function () {
    const {
      pool,
      usdc,
      feeCollector,
      poolId,
      oracle,
      alice,
      bob,
      stakeDeadline,
    } = await deployFixture();

    await pool.connect(alice).stake(poolId, 0, STAKE_AMOUNT);
    await pool.connect(bob).stake(poolId, 1, STAKE_AMOUNT * 2n);

    await time.increaseTo(stakeDeadline);
    await pool.lockPool(poolId);

    const verdictHash = ethers.id('{"winningOptionId":0}');
    const sig = await signVerdict(oracle, verdictHash);
    await pool.submitVerdict(poolId, 0, verdictHash, sig);

    await time.increase(DISPUTE_WINDOW + 1n);
    await pool.settle(poolId);

    const total = STAKE_AMOUNT * 3n;
    const fee = (total * FEE_BPS) / 10_000n;
    const distributable = total - fee;
    const expectedAlice = (STAKE_AMOUNT * distributable) / STAKE_AMOUNT;

    expect(await usdc.balanceOf(await feeCollector.getAddress())).to.equal(fee);

    const aliceBalanceBefore = await usdc.balanceOf(alice.address);
    const [aliceClaimable, aliceIsRefund] = await pool.claimableWinnings(poolId, alice.address);
    expect(aliceClaimable).to.equal(expectedAlice);
    expect(aliceIsRefund).to.be.false;

    const [bobClaimable, bobIsRefund] = await pool.claimableWinnings(poolId, bob.address);
    expect(bobClaimable).to.equal(0n);
    expect(bobIsRefund).to.be.false;

    await expect(pool.connect(bob).claim(poolId)).to.be.revertedWith("PredictionPool: nothing to claim");

    await pool.connect(alice).claim(poolId);
    expect(await usdc.balanceOf(alice.address)).to.equal(aliceBalanceBefore + expectedAlice);

    await expect(pool.connect(alice).claim(poolId)).to.be.revertedWith("PredictionPool: nothing to claim");
    expect((await pool.pools(poolId)).status).to.equal(3);
  });

  it("allows claiming refunds when pool is unresolvable", async function () {
    const { pool, usdc, poolId, oracle, alice, stakeDeadline } = await deployFixture();

    await pool.connect(alice).stake(poolId, 0, STAKE_AMOUNT);
    await time.increaseTo(stakeDeadline);
    await pool.lockPool(poolId);

    const verdictHash = ethers.id('{"winningOptionId":0}');
    const sig = await signVerdict(oracle, verdictHash);
    await pool.submitVerdict(poolId, 0, verdictHash, sig);
    await time.increase(DISPUTE_WINDOW + 1n);

    await pool.settle(poolId);

    const [aliceClaimable, aliceIsRefund] = await pool.claimableWinnings(poolId, alice.address);
    expect(aliceClaimable).to.equal(STAKE_AMOUNT);
    expect(aliceIsRefund).to.be.true;

    const balanceBefore = await usdc.balanceOf(alice.address);
    await pool.connect(alice).claim(poolId);
    const balanceAfter = await usdc.balanceOf(alice.address);

    expect(balanceAfter - balanceBefore).to.equal(STAKE_AMOUNT);
    expect((await pool.pools(poolId)).status).to.equal(3);
  });
});
