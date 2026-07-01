import { NextResponse } from 'next/server';
import { prisma } from '@/shared/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 });
    }

    // Normalize address to lowercase for database queries
    const normalizedAddress = address.toLowerCase();

    // Query stakes by this staker
    const stakes = await prisma.stake.findMany({
      where: {
        staker: {
          equals: normalizedAddress,
          mode: 'insensitive'
        }
      },
      include: {
        pool: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format fields (BigInt to string conversion)
    const formattedStakes = stakes.map((stake) => ({
      id: stake.id,
      poolId: stake.poolId,
      staker: stake.staker,
      optionId: stake.optionId,
      amount: stake.amount.toString(),
      txHash: stake.txHash,
      createdAt: stake.createdAt,
      payout: stake.payout ? stake.payout.toString() : null,
      payoutTxHash: stake.payoutTxHash,
      pool: {
        id: stake.pool.id,
        question: stake.pool.question,
        options: stake.pool.options,
        stakeDeadline: stake.pool.stakeDeadline,
        resolutionDeadline: stake.pool.resolutionDeadline,
        status: stake.pool.status,
        winningOptionId: stake.pool.winningOptionId,
        totalPool: stake.pool.totalPool.toString(),
      }
    }));

    return NextResponse.json({ success: true, stakes: formattedStakes });
  } catch (error: unknown) {
    console.error('Failed to fetch portfolio stakes:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
