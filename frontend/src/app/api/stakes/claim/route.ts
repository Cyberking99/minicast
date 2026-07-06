import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/lib/prisma';
import { publicClient, PREDICTION_POOL_ABI, getPredictionPoolAddress } from '@/shared/lib/contracts';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { poolId, staker, txHash } = await req.json();

    if (!poolId || !staker || !txHash) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const predictionPoolAddress = getPredictionPoolAddress() as `0x${string}`;

    // Verify on-chain that hasClaimed is true for this user
    const hasClaimed = await publicClient.readContract({
      address: predictionPoolAddress,
      abi: PREDICTION_POOL_ABI,
      functionName: 'hasClaimed',
      args: [poolId as `0x${string}`, staker as `0x${string}`],
    }) as boolean;

    if (!hasClaimed) {
      return NextResponse.json({ error: 'Not claimed on-chain yet' }, { status: 400 });
    }

    // Update the database stakes
    await prisma.stake.updateMany({
      where: {
        poolId,
        staker: {
          equals: staker,
          mode: 'insensitive'
        }
      },
      data: {
        payoutTxHash: txHash
      }
    });

    console.log(`✅ Synced claim for staker ${staker} in pool ${poolId}.`);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Claim sync error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
