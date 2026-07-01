import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/lib/prisma';
import { publicClient, PREDICTION_POOL_ABI, getPredictionPoolAddress } from '@/shared/lib/contracts';

export const dynamic = 'force-dynamic';

interface ContractStake {
  staker: string;
  optionId: number;
  amount: bigint;
  timestamp: bigint;
}

export async function POST(req: NextRequest) {
  try {
    const { poolId, txHash } = await req.json();

    if (!poolId || !txHash) {
      return NextResponse.json({ error: 'Missing poolId or txHash' }, { status: 400 });
    }

    const predictionPoolAddress = getPredictionPoolAddress() as `0x${string}`;

    // 1. Fetch latest pool details from on-chain contract
    console.log(`Fetching on-chain details for settling pool: ${poolId}`);
    const poolData = (await publicClient.readContract({
      address: predictionPoolAddress,
      abi: PREDICTION_POOL_ABI,
      functionName: 'pools',
      args: [poolId],
    })) as readonly unknown[];

    // PoolStatus enum: 0: OPEN, 1: LOCKED, 2: RESOLVED, 3: SETTLED
    const statusUint = Number(poolData[7]);
    const winningOption = Number(poolData[6]);
    const totalPool = poolData[8] as bigint;
    const feeBps = poolData[9] as bigint;

    if (statusUint !== 3) {
      return NextResponse.json({
        error: `Pool is not settled on-chain. Current status uint: ${statusUint}`
      }, { status: 400 });
    }

    // 2. Fetch all stakes for this pool from the contract
    const contractStakes = (await publicClient.readContract({
      address: predictionPoolAddress,
      abi: PREDICTION_POOL_ABI,
      functionName: 'getPoolStakes',
      args: [poolId],
    })) as readonly ContractStake[];

    // Calculate settlement parameters
    const fee = (totalPool * feeBps) / 10000n;
    const distributable = totalPool - fee;

    // Calculate total stakes on the winning option
    let winningTotal = 0n;
    let losingPool = 0n;

    for (const stake of contractStakes) {
      const optId = Number(stake.optionId);
      const amt = stake.amount;
      if (optId === winningOption) {
        winningTotal += amt;
      } else {
        losingPool += amt;
      }
    }

    const isRefund = winningTotal === 0n || losingPool === 0n;

    // 3. Retrieve all stakes from the database for this pool
    const dbStakes = await prisma.stake.findMany({
      where: { poolId }
    });

    // Update each stake's payout in the database
    for (const dbStake of dbStakes) {
      let payout = 0n;

      if (isRefund) {
        // Refund case: stakers get their original amount back
        payout = dbStake.amount;
      } else if (dbStake.optionId === winningOption) {
        // Winning case: proportional share of the distributable pool
        payout = (dbStake.amount * distributable) / winningTotal;
      }

      await prisma.stake.update({
        where: { id: dbStake.id },
        data: {
          payout,
          payoutTxHash: txHash
        }
      });
    }

    // 4. Update the pool status to SETTLED
    await prisma.pool.update({
      where: { id: poolId },
      data: {
        status: 'SETTLED',
        settleTxHash: txHash,
        winningOptionId: winningOption
      }
    });

    console.log(`✅ Successfully synced settlement for pool ${poolId} in the database.`);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Pool settlement sync error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
