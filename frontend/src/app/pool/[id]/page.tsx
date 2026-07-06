"use client";

import React, { useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { getPredictionPoolAddress, getFeeCurrencyAddress, PREDICTION_POOL_ABI, publicClient } from "@/shared/lib/contracts";
import { StatusBadge, PoolStatus } from "@/shared/ui/StatusBadge";
import { LiveStakeBar } from "@/features/pools/components/LiveStakeBar";
import { StakePanel } from "@/features/staking/components/StakePanel";
import Link from "next/link";


export default function PoolDetail({ params }: { params: { id: string } }) {
  const poolId = params.id as `0x${string}`;
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);
  
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [isSettling, setIsSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const handleSettle = async () => {
    setIsSettling(true);
    setSettleError(null);
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      let gasEstimate;
      try {
        gasEstimate = await publicClient.estimateContractGas({
          address: getPredictionPoolAddress() as `0x${string}`,
          abi: PREDICTION_POOL_ABI,
          functionName: "settle",
          args: [poolId],
          account: address,
          feeCurrency: getFeeCurrencyAddress(),
        } as any);
      } catch (e) {
        console.warn("Failed to estimate gas for settle, using fallback:", e);
        gasEstimate = 200000n;
      }

      const txHash = await writeContractAsync({
        address: getPredictionPoolAddress() as `0x${string}`,
        abi: PREDICTION_POOL_ABI,
        functionName: "settle",
        args: [poolId],
        feeCurrency: getFeeCurrencyAddress(),
        gas: gasEstimate + 100000n,
      } as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      console.log("Settle transaction sent:", txHash);
      
      // Sync status to database
      const syncRes = await fetch("/api/pools/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId, txHash }),
      });
      
      if (!syncRes.ok) {
        const errorData = await syncRes.json();
        throw new Error(errorData.error || "Failed to sync settlement state to database");
      }
      
      console.log("Settlement successfully synchronized to database.");
      refetchAll();
    } catch (err: unknown) {
      console.error("Failed to settle pool:", err);
      // Clean up readable messages if we can
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("PredictionPool: dispute window")) {
        setSettleError("Dispute window is still open on-chain. Please wait for the window to expire.");
      } else {
        setSettleError(msg);
      }
    } finally {
      setIsSettling(false);
    }
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    setClaimError(null);
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      let gasEstimate;
      try {
        gasEstimate = await publicClient.estimateContractGas({
          address: getPredictionPoolAddress() as `0x${string}`,
          abi: PREDICTION_POOL_ABI,
          functionName: "claim",
          args: [poolId],
          account: address,
          feeCurrency: getFeeCurrencyAddress(),
        } as any);
      } catch (e) {
        console.warn("Failed to estimate gas for claim, using fallback:", e);
        gasEstimate = 150000n;
      }

      const txHash = await writeContractAsync({
        address: getPredictionPoolAddress() as `0x${string}`,
        abi: PREDICTION_POOL_ABI,
        functionName: "claim",
        args: [poolId],
        feeCurrency: getFeeCurrencyAddress(),
        gas: gasEstimate + 50000n,
      } as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      console.log("Claim transaction sent:", txHash);

      // Sync claim status to database
      const syncRes = await fetch("/api/stakes/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId, staker: address, txHash }),
      });

      if (!syncRes.ok) {
        console.error("Failed to sync claim state to database");
      }

      console.log("Claim successfully synchronized to database.");
      refetchAll();
    } catch (err: unknown) {
      console.error("Failed to claim:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setClaimError(msg);
    } finally {
      setIsClaiming(false);
    }
  };

  // 1. Fetch Pool Details
  const { data: poolData, isLoading: isPoolLoading, refetch: refetchPool } = useReadContract({
    address: getPredictionPoolAddress() as `0x${string}`,
    abi: PREDICTION_POOL_ABI,
    functionName: "pools",
    args: [poolId],
  });

  // 2. Fetch Option Labels
  const { data: optionsData, isLoading: isOptionsLoading, refetch: refetchOptions } = useReadContract({
    address: getPredictionPoolAddress() as `0x${string}`,
    abi: PREDICTION_POOL_ABI,
    functionName: "getPoolOptions",
    args: [poolId],
  });

  const optionsArray = (optionsData || []) as string[];

  // 3. Fetch Option Totals
  const { data: totalsData, refetch: refetchTotals } = useReadContracts({
    contracts: optionsArray.map((_, idx) => ({
      address: getPredictionPoolAddress() as `0x${string}`,
      abi: PREDICTION_POOL_ABI,
      functionName: "optionTotals",
      args: [poolId, idx],
    })),
    query: { enabled: optionsArray.length > 0 },
  });

  // 4. Fetch User's Claimable Winnings
  const { data: claimableData, refetch: refetchClaimable } = useReadContract({
    address: getPredictionPoolAddress() as `0x${string}`,
    abi: PREDICTION_POOL_ABI,
    functionName: "claimableWinnings",
    args: address ? [poolId, address] : undefined,
    query: { enabled: !!address },
  });

  const refetchAll = () => {
    refetchPool();
    refetchOptions();
    refetchTotals();
    refetchClaimable();
  };

  const [claimableAmount, isRefundWinnings] = (claimableData || [0n, false]) as [bigint, boolean];
  const claimableFormatted = Number(claimableAmount) / 1e6;

  if (isPoolLoading || isOptionsLoading) {
    return (
      <main className="app-main" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px", fontFamily: "var(--font-mono)" }}>
        <div style={{ color: "var(--muted)" }}>LOADING POOL DETAILS...</div>
      </main>
    );
  }

  const poolDetails = poolData as readonly unknown[];
  const hasPool = poolDetails && (poolDetails[0] as string) !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (!hasPool) {
    return (
      <main className="app-main">
        <div style={{ textAlign: "center", padding: "64px 32px", border: "2px solid var(--border)", background: "var(--surface)" }}>
          <h3 style={{ fontSize: "20px", marginBottom: "8px" }}>PREDICTION POOL NOT FOUND</h3>
          <p style={{ color: "var(--muted)", fontSize: "12px", marginBottom: "20px" }}>The pool you are trying to access does not exist on-chain.</p>
          <Link href="/" className="btn btn-primary">Back to Feed</Link>
        </div>
      </main>
    );
  }

  const totalPoolRaw = poolDetails[8] as bigint;
  const totalPool = Number(totalPoolRaw) / 10 ** 6;

  // Construct options with live data
  const mappedOptions = optionsArray.map((label, idx) => {
    const totalStakedRaw = (totalsData?.[idx]?.result as bigint) ?? BigInt(0);
    const totalStaked = Number(totalStakedRaw) / 10 ** 6;
    const percentage = totalPool > 0 ? Number(((totalStaked / totalPool) * 100).toFixed(1)) : 0;
    const odds = totalStaked > 0 ? `${(totalPool / totalStaked).toFixed(2)}x` : "1.00x";
    
    return {
      label,
      percentage,
      totalStakedStr: `$${totalStaked.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`,
      stakers: 0,
      odds: `${odds} odds`,
      totalStakedRaw,
    };
  });

  const statusMap = ["open", "locked", "resolving", "settled"];
  const statusUint = poolDetails[7] as number;
  const status = (statusMap[statusUint] || "open") as PoolStatus;

  // Calculate time remaining (single large number + unit, e.g. "14h" or "2d" or "Closed")
  const stakeDeadline = Number(poolDetails[2] as bigint);
  const resolutionDeadline = Number(poolDetails[3] as bigint);
  const resolutionDate = new Date(resolutionDeadline * 1000);
  const formattedResolutionTime = resolutionDate.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  });

  const now = Math.floor(Date.now() / 1000);
  const diffSecs = stakeDeadline - now;
  let timeLeft = "CLOSED";
  if (diffSecs > 0) {
    const days = Math.floor(diffSecs / (24 * 3600));
    const hours = Math.floor((diffSecs % (24 * 3600)) / 3600);
    const mins = Math.floor((diffSecs % 3600) / 60);
    if (days > 0) {
      timeLeft = `${days}d`;
    } else if (hours > 0) {
      timeLeft = `${hours}h`;
    } else {
      timeLeft = `${mins}m`;
    }
  }

  return (
    <main className="app-main">
      {/* Breadcrumb */}
      <div style={{ marginBottom: "24px" }}>
        <Link href="/" style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--muted)", fontFamily: "var(--font-mono)", textDecoration: "none" }}>
          ← BACK TO FEED
        </Link>
      </div>

      {/* Hero Header: question fills top ~30% of viewport, inline status, large countdown */}
      <div className="pool-detail-hero" style={{ borderBottom: "2px solid var(--border)", paddingBottom: "32px", marginBottom: "40px" }}>
        <div className="pool-detail-question-wrap">
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                MARKET RESOLUTION
              </span>
              <StatusBadge status={status} />
            </div>
            <h1 className="pool-detail-question" style={{ margin: 0 }}>
              {poolDetails[1] as string}
            </h1>
          </div>

          <div className="pool-detail-countdown-wrap">
            <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
              TIME REMAINING
            </div>
            <div className="pool-detail-countdown">
              {timeLeft}
            </div>
          </div>
        </div>
      </div>

      {/* Settlement Banner */}
      {status === "resolving" && (
        <div style={{
          background: "var(--surface)",
          border: "2px solid var(--border)",
          padding: "24px",
          marginBottom: "40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px"
        }}>
          <div style={{ flex: 1, minWidth: "280px" }}>
            <h4 style={{ margin: 0, fontWeight: 700, fontSize: "14px", textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
              ★ Market Resolved (Dispute Window Open)
            </h4>
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--muted)", lineHeight: "1.5" }}>
              The oracle has declared a verdict. Once the dispute window has passed (or if you wish to trigger settlement directly), click Settle Pool to execute the on-chain payout calculations and distribute USDC winnings.
            </p>
            {settleError && (
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--red)", fontWeight: 600 }}>
                ⚠️ Error: {settleError}
              </p>
            )}
          </div>
          <div>
            <button
              onClick={handleSettle}
              disabled={isSettling}
              className="btn btn-primary"
              style={{ padding: "12px 24px", minWidth: "150px" }}
            >
              {isSettling ? "Settling Pool..." : "Settle Pool"}
            </button>
          </div>
        </div>
      )}

      {/* Claim Winnings Banner */}
      {status === "settled" && claimableAmount > 0n && (
        <div style={{
          background: "var(--surface)",
          border: "2px solid var(--border)",
          padding: "24px",
          marginBottom: "40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px"
        }}>
          <div style={{ flex: 1, minWidth: "280px" }}>
            <h4 style={{ margin: 0, fontWeight: 700, fontSize: "14px", textTransform: "uppercase", fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
              ★ {isRefundWinnings ? "Refund Available" : "Winnings Available to Claim"}
            </h4>
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--muted)", lineHeight: "1.5" }}>
              {isRefundWinnings 
                ? `This pool was resolved as unresolvable. You are eligible to claim a full refund of your staked amount: $${claimableFormatted.toFixed(2)} USDC.`
                : `Congratulations! You won the prediction. You have $${claimableFormatted.toFixed(2)} USDC ready to claim.`
              }
            </p>
            {claimError && (
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--red)", fontWeight: 600 }}>
                ⚠️ Error: {claimError}
              </p>
            )}
          </div>
          <div>
            <button
              onClick={handleClaim}
              disabled={isClaiming}
              className="btn btn-primary btn-accent"
              style={{ padding: "12px 24px", minWidth: "150px" }}
            >
              {isClaiming ? "Claiming..." : isRefundWinnings ? "Claim Refund" : "Claim Winnings"}
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Details left, Staking panel right */}
      <div className="pool-detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          
          {/* Redeemed Stake Bar */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
              Live Staking Distribution
            </div>
            <LiveStakeBar options={mappedOptions} status={status} />
          </div>

          {/* Option Selector List */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "16px" }}>
              OUTCOME SELECTION
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {mappedOptions.map((opt, idx) => {
                const isSelected = selectedOptionIdx === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => status === "open" && setSelectedOptionIdx(idx)}
                    className={`pool-outcome-card ${isSelected ? "selected" : ""}`}
                    style={{
                      cursor: status === "open" ? "pointer" : "default",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div className="pool-outcome-checkbox">
                        {isSelected && <span style={{ color: "#FFF", fontSize: "10px" }}>✓</span>}
                      </div>
                      <span style={{ fontWeight: 700, fontSize: "14px" }}>{opt.label}</span>
                    </div>

                    <div className="pool-outcome-details">
                      <span>{opt.percentage}% SHARE</span>
                      <span className="pool-outcome-odds">{opt.odds}</span>
                      <span className="pool-outcome-staked">{opt.totalStakedStr} STAKED</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Meta specs */}
          <div className="pool-meta-specs">
            <div>
              <div style={{ fontSize: "10px", color: "var(--muted)" }}>POOL ADDRESS</div>
              <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", wordBreak: "break-all", marginTop: "4px" }}>{poolId}</div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "var(--muted)" }}>TOTAL TELEMETRY POOL</div>
              <div style={{ fontSize: "20px", fontWeight: 800, marginTop: "4px", color: "var(--accent)" }}>
                ${totalPool.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC
              </div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "var(--muted)" }}>EXPECTED RESOLUTION TIME</div>
              <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", marginTop: "4px", color: "var(--fg)", fontWeight: 700 }}>
                {formattedResolutionTime}
              </div>
            </div>
          </div>

        </div>

        {/* Right column: Staking Panel */}
        <div>
          <StakePanel
            poolId={poolId}
            options={mappedOptions}
            selectedOptionIdx={selectedOptionIdx}
            setSelectedOptionIdx={setSelectedOptionIdx}
            totalPool={totalPool}
            refetch={refetchAll}
            question={poolDetails[1] as string}
            optionsLabels={optionsArray}
          />
        </div>
      </div>
    </main>
  );
}
