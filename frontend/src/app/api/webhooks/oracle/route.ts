import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/lib/prisma';
import { publicClient, PREDICTION_POOL_ABI, getPredictionPoolAddress } from '@/shared/lib/contracts';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.ORACLE_WEBHOOK_SECRET;

    // Simple Bearer token authentication for the Oracle -> Backend call
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { poolId, verdictJson, verdictHash, winningOptionId } = await req.json();

    if (!poolId || !verdictJson) {
      return NextResponse.json({ error: 'Missing poolId or verdictJson' }, { status: 400 });
    }

    const parsedVerdict = JSON.parse(verdictJson);
    const newStatus = parsedVerdict.status === 'UNRESOLVABLE' ? 'UNRESOLVABLE' : 'RESOLVED';

    // Ensure the pool exists in the database first
    const dbPool = await prisma.pool.findUnique({
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

        await prisma.pool.create({
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
      }
    }

    // Update the pool with the AI's transparent reasoning and status
    await prisma.pool.update({
      where: { id: poolId },
      data: {
        status: newStatus,
        winningOptionId: winningOptionId ?? null,
        verdictHash: verdictHash,
        verdictJson: verdictJson,
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Oracle webhook error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

