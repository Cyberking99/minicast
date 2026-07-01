"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useChainId, useSwitchChain } from "wagmi";
import { getPredictionPoolAddress, getUsdcAddress, getFeeCurrencyAddress, PREDICTION_POOL_ABI, USDC_ABI, publicClient } from "@/shared/lib/contracts";
import { AIAnalysisModal } from "@/features/analysis/components/AIAnalysisModal";

interface Option {
  label: string;
  percentage: number;
  totalStakedStr: string;
  stakers: number;
  odds: string;
  totalStakedRaw: bigint;
}

interface StakePanelProps {
  poolId: string;
  options: Option[];
  selectedOptionIdx: number | null;
  setSelectedOptionIdx: (idx: number | null) => void;
  totalPool: number;
  refetch: () => void;
  question?: string;
  optionsLabels?: string[];
}

export function StakePanel({
  poolId,
  options,
  selectedOptionIdx,
  setSelectedOptionIdx,
  totalPool,
  refetch,
  question = "Will this prediction resolve?",
  optionsLabels = []
}: StakePanelProps) {
  const [amount, setAmount] = useState<string>("");
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  // Separate loading states for permission grant vs staking to avoid UI overlap
  const [isStakePending, setIsStakePending] = useState(false);
  
  const [txError, setTxError] = useState<string | null>(null);
  const [showPopupWarning, setShowPopupWarning] = useState(false);

  const poolAddress = getPredictionPoolAddress() as `0x${string}`;
  const usdcAddress = getUsdcAddress() as `0x${string}`;

  const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);
  const isWrongNetwork = isConnected && chainId !== targetChainId;

  const { data: balanceResult, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !isWrongNetwork },
  });

  const balanceRaw = balanceResult as bigint | undefined;
  const balanceFormatted = balanceRaw ? Number(balanceRaw) / 10 ** 6 : 0;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, poolAddress] : undefined,
    query: { enabled: !!address && !isWrongNetwork },
  });

  // Show warning popup guide if transaction is pending for too long
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isStakePending) {
      timer = setTimeout(() => {
        setShowPopupWarning(true);
      }, 8000);
    } else {
      setShowPopupWarning(false);
    }
    return () => clearTimeout(timer);
  }, [isStakePending]);

  // Math formula elements
  let mathFormula = "0 × (0 / 0) = 0.00 USDC";
  let payoutResult = "0.00";
  let impliedOdds = "1.00x";

  if (selectedOptionIdx !== null && options[selectedOptionIdx]) {
    const selectedOpt = options[selectedOptionIdx];
    const ti = Number(selectedOpt.totalStakedRaw) / 10 ** 6;
    const s = amount && !isNaN(parseFloat(amount)) ? parseFloat(amount) : 0;

    const currentTotalPool = totalPool;
    const odds = (currentTotalPool + s) / (ti + s);
    impliedOdds = `${odds.toFixed(2)}x`;
    const payout = s * odds;
    payoutResult = payout.toFixed(2);

    mathFormula = `${s.toLocaleString(undefined, { maximumFractionDigits: 2 })} × (${(currentTotalPool + s).toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${(ti + s).toLocaleString(undefined, { maximumFractionDigits: 0 })}) = ${payoutResult} USDC`;
  }

  const handleStake = async () => {
    if (!isConnected || isWrongNetwork || selectedOptionIdx === null || !amount) return;

    setIsStakePending(true);
    setTxError(null);
    setShowPopupWarning(false);

    try {
      const parsedAmount = Math.floor(parseFloat(amount) * 10 ** 6);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Invalid stake amount");
      }

      const amountBigInt = BigInt(parsedAmount);

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const currentAllowance = (allowance as bigint) ?? BigInt(0);
      if (currentAllowance < amountBigInt) {
        let approveGasEstimate;
        try {
          approveGasEstimate = await publicClient.estimateContractGas({
            address: usdcAddress,
            abi: USDC_ABI,
            functionName: "approve",
            args: [poolAddress, amountBigInt * BigInt(10)],
            account: address,
            feeCurrency: getFeeCurrencyAddress(),
          } as any);
        } catch (e) {
          console.warn("Failed to estimate gas for approve, using fallback:", e);
          approveGasEstimate = 80000n;
        }

        await writeContractAsync({
          address: usdcAddress,
          abi: USDC_ABI,
          functionName: "approve",
          args: [poolAddress, amountBigInt * BigInt(10)],
          feeCurrency: getFeeCurrencyAddress(),
          gas: approveGasEstimate + 50000n,
        } as any);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await refetchAllowance();
      }

      let stakeGasEstimate;
      try {
        stakeGasEstimate = await publicClient.estimateContractGas({
          address: poolAddress,
          abi: PREDICTION_POOL_ABI,
          functionName: "stake",
          args: [poolId as `0x${string}`, selectedOptionIdx, amountBigInt],
          account: address,
          feeCurrency: getFeeCurrencyAddress(),
        } as any);
      } catch (e) {
        console.warn("Failed to estimate gas for stake, using fallback:", e);
        stakeGasEstimate = 200000n;
      }

      const txHash = await writeContractAsync({
        address: poolAddress,
        abi: PREDICTION_POOL_ABI,
        functionName: "stake",
        args: [poolId as `0x${string}`, selectedOptionIdx, amountBigInt],
        feeCurrency: getFeeCurrencyAddress(),
        gas: stakeGasEstimate + 100000n,
      } as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      // Sync stake with the database backend api
      if (txHash && address) {
        try {
          const syncRes = await fetch('/api/stakes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              poolId,
              staker: address,
              optionId: selectedOptionIdx,
              amount: amountBigInt.toString(),
              txHash,
            }),
          });
          if (!syncRes.ok) {
            console.error("Failed to sync stake to backend DB:", await syncRes.text());
          } else {
            console.log("Successfully synced stake to backend DB:", txHash);
          }
        } catch (syncErr) {
          console.error("Error during backend stake syncing:", syncErr);
        }
      }

      setAmount("");
      setSelectedOptionIdx(null);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      refetch();
      refetchBalance();
      refetchAllowance();
    } catch (err: unknown) {
      console.error("Staking transaction failed:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const shortMessage = err && typeof err === "object" && "shortMessage" in err ? String((err as { shortMessage?: unknown }).shortMessage) : undefined;
      setTxError(shortMessage || errorMessage || "Transaction failed");
    } finally {
      setIsStakePending(false);
    }
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const displayLabels = optionsLabels.length > 0 ? optionsLabels : options.map((o) => o.label);

  return (
    <>
      <div className="stake-panel-col">
        <h3 style={{ fontSize: "18px", marginBottom: "20px" }}>PLACE YOUR STAKE</h3>

        {isWrongNetwork ? (
          <div style={{ padding: "16px", border: "2px solid var(--border)", background: "var(--surface)", marginBottom: "20px" }}>
            <p style={{ fontSize: "12px", marginBottom: "16px" }}>Please connect to the correct network.</p>
            <button className="btn btn-primary btn-block" onClick={() => switchChain({ chainId: targetChainId })}>
              Switch Network
            </button>
          </div>
        ) : (
          <>
            {isConnected && balanceRaw !== undefined && (
              <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", marginBottom: "16px" }}>
                BALANCE: <span style={{ color: "var(--fg)" }}>{balanceFormatted.toFixed(2)} USDC</span>
              </div>
            )}



            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
              {options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedOptionIdx(idx)}
                  className={`btn btn-block ${selectedOptionIdx === idx ? "btn-primary" : "btn-secondary"}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textTransform: "uppercase" }}
                >
                  <span>{opt.label}</span>
                  <span style={{ fontSize: "11px", color: selectedOptionIdx === idx ? "inherit" : "var(--muted)" }}>
                    ODDS: {opt.odds}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ position: "relative", marginBottom: "24px" }}>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  width: "100%",
                  padding: "16px 64px 16px 16px",
                  fontSize: "20px",
                  fontFamily: "var(--font-mono)",
                  border: "2px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  borderRadius: 0,
                  outline: "none"
                }}
              />
              <span style={{ position: "absolute", right: 0, bottom: "12px", fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--muted)" }}>
                USDC
              </span>
            </div>

            {/* Inline Mathematical Formula */}
            <div className="math-formula">
              <div style={{ textTransform: "uppercase", fontSize: "10px", color: "var(--muted)", marginBottom: "4px" }}>
                Projected Return Formula
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", wordBreak: "break-all" }}>
                {mathFormula}
              </div>
              <div style={{ marginTop: "8px", fontSize: "10px", color: "var(--muted)" }}>
                Implied Odds: <strong style={{ color: "var(--fg)" }}>{impliedOdds}</strong>
              </div>
            </div>

            {txError && (
              <div style={{ color: "var(--red)", fontSize: "12px", marginTop: "12px", border: "1.5px solid var(--red)", padding: "10px", background: "var(--surface)" }}>
                ⚠️ {txError}
              </div>
            )}

            <button
              className="btn btn-primary btn-block btn-accent"
              style={{ marginTop: "24px" }}
              disabled={!isConnected || selectedOptionIdx === null || !amount || isStakePending}
              onClick={handleStake}
            >
              {isStakePending
                ? "CONFIRMING..."
                : !isConnected
                ? "CONNECT WALLET"
                : selectedOptionIdx === null
                ? "SELECT OPTION"
                : "STAKE"}
            </button>

            {showPopupWarning && (
              <div style={{ marginTop: "12px", padding: "12px", border: "1.5px solid var(--accent)", background: "var(--surface)", fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                💡 Transaction taking longer than expected? Check if your wallet confirmation popup is minimized or blocked by your browser.
              </div>
            )}
          </>
        )}

        <button
          className="btn btn-secondary btn-block"
          style={{ marginTop: "16px" }}
          onClick={() => setIsModalOpen(true)}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ marginRight: "8px" }}
          >
            <path d="M12 3v18M3 12h18" />
          </svg>
          UNLOCK AI ANALYSIS — $0.50
        </button>
      </div>

      <AIAnalysisModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        question={question}
        options={displayLabels}
      />
    </>
  );
}
