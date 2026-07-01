import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/lib/prisma';
import { publicClient, PREDICTION_POOL_ABI, getPredictionPoolAddress } from '@/shared/lib/contracts';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { poolId, staker, optionId, amount, txHash } = await req.json();

    if (!poolId || !staker || optionId === undefined || !amount || !txHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Ensure the pool exists in the database
    let dbPool = await prisma.pool.findUnique({
      where: { id: poolId }
    });

    if (!dbPool) {
      try {
        console.log(`Syncing pool ${poolId} to DB...`);
        const poolData = await publicClient.readContract({
          address: getPredictionPoolAddress() as `0x${string}`,
          abi: PREDICTION_POOL_ABI,
          functionName: 'pools',
          args: [poolId],
        }) as unknown as unknown[];

        const optionsArray = await publicClient.readContract({
          address: getPredictionPoolAddress() as `0x${string}`,
          abi: PREDICTION_POOL_ABI,
          functionName: 'getPoolOptions',
          args: [poolId],
        }) as string[];

        dbPool = await prisma.pool.create({
          data: {
            id: poolId,
            question: poolData[1] as string,
            options: optionsArray,
            stakeDeadline: new Date(Number(poolData[2]) * 1000),
            resolutionDeadline: new Date(Number(poolData[3]) * 1000),
            disputeWindowSecs: Number(poolData[4]),
            feeBps: Number(poolData[9]),
            creatorAddress: poolData[10] as string,
            totalPool: poolData[8] as bigint,
          }
        });
        console.log(`Successfully synced pool ${poolId} to database.`);
      } catch (err) {
        console.error(`Error syncing pool ${poolId} to database:`, err);
        return NextResponse.json({ error: 'Failed to sync pool from contract' }, { status: 500 });
      }
    }

    // Check if stake already exists by txHash
    const existingStake = await prisma.stake.findFirst({
      where: { txHash }
    });

    if (existingStake) {
      return NextResponse.json({ success: true, stake: { ...existingStake, amount: existingStake.amount.toString() } });
    }

    // Create the stake
    const stake = await prisma.stake.create({
      data: {
        poolId,
        staker: staker.toLowerCase(),
        optionId: Number(optionId),
        amount: BigInt(amount),
        txHash
      }
    });

    // Update total pool
    await prisma.pool.update({
      where: { id: poolId },
      data: { totalPool: { increment: BigInt(amount) } }
    });

    return NextResponse.json({ success: true, stake: { ...stake, amount: stake.amount.toString() } });
  } catch (error: unknown) {
    console.error('Failed to save stake:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
