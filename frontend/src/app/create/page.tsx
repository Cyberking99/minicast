"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { getPredictionPoolAddress, getFeeCurrencyAddress, PREDICTION_POOL_ABI, publicClient } from "@/shared/lib/contracts";

export default function CreatePoolPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { writeContractAsync, data: txHash, isPending } = useWriteContract();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["Yes", "No"]);
  const [stakeDeadline, setStakeDeadline] = useState(() => {
    const d = new Date(Date.now() + 2 * 3600 * 1000); // 2 hours from now
    return d.toISOString().slice(0, 16);
  });
  const [resolutionDeadline, setResolutionDeadline] = useState(() => {
    const d = new Date(Date.now() + 3 * 3600 * 1000); // 3 hours from now
    return d.toISOString().slice(0, 16);
  });
  const [error, setError] = useState("");

  const handleAddOption = () => {
    if (options.length >= 10) return;
    setOptions([...options, ""]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, val: string) => {
    const next = [...options];
    next[index] = val;
    setOptions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isConnected) {
      setError("Please connect your wallet first!");
      return;
    }

    if (!question.trim()) {
      setError("Please enter a question.");
      return;
    }

    const filteredOptions = options.map(o => o.trim()).filter(Boolean);
    if (filteredOptions.length < 2) {
      setError("Please enter at least 2 non-empty options.");
      return;
    }

    const stakeTs = Math.floor(new Date(stakeDeadline).getTime() / 1000);
    const resolveTs = Math.floor(new Date(resolutionDeadline).getTime() / 1000);
    const nowTs = Math.floor(Date.now() / 1000);

    if (stakeTs <= nowTs + 3600) {
      setError("Staking deadline must be at least 1 hour in the future.");
      return;
    }

    if (resolveTs <= stakeTs + 3600) {
      setError("Resolution deadline must be at least 1 hour after the staking deadline.");
      return;
    }

    try {
      console.log("Creating pool on-chain...");
      const predictionPoolAddress = getPredictionPoolAddress();

      /* eslint-disable @typescript-eslint/no-explicit-any */
      let gasEstimate;
      try {
        gasEstimate = await publicClient.estimateContractGas({
          address: predictionPoolAddress as `0x${string}`,
          abi: PREDICTION_POOL_ABI,
          functionName: "createPool",
          args: [
            question,
            filteredOptions,
            BigInt(stakeTs),
            BigInt(resolveTs),
            BigInt(86400), // disputeWindowSecs: 24 hours
            BigInt(100),   // feeBps: 1.00%
          ],
          account: address,
          feeCurrency: getFeeCurrencyAddress(),
        } as any);
      } catch (e) {
        console.warn("Failed to estimate gas for createPool, using fallback:", e);
        gasEstimate = 300000n;
      }

      await writeContractAsync({
        address: predictionPoolAddress as `0x${string}`,
        abi: PREDICTION_POOL_ABI,
        functionName: "createPool",
        args: [
          question,
          filteredOptions,
          BigInt(stakeTs),
          BigInt(resolveTs),
          BigInt(86400), // disputeWindowSecs: 24 hours
          BigInt(100),   // feeBps: 1.00%
        ],
        feeCurrency: getFeeCurrencyAddress(),
        gas: gasEstimate + 100000n,
      } as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */
    } catch (err: unknown) {
      console.error("Failed to deploy prediction pool:", err);
      const errMsg = err instanceof Error ? err.message : "Transaction rejected or execution failed.";
      setError(errMsg);
    }
  };

  // Wait for tx confirmation before redirecting
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  React.useEffect(() => {
    if (isSuccess) {
      console.log("Pool successfully created! Redirecting to feed...");
      router.push("/");
    }
  }, [isSuccess, router]);

  return (
    <main className="app-main" style={{ maxWidth: "680px", margin: "40px auto 80px", padding: "0 16px" }}>
      <div className="section-header" style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700 }}>Create New Prediction</h1>
        <p style={{ color: "var(--muted)", fontSize: "14px", marginTop: "4px" }}>
          Deploy a parimutuel prediction pool on Celo Sepolia.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "32px" }}>
        
        {error && (
          <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "12px 16px", borderRadius: "6px", fontSize: "14px", fontWeight: 600, marginBottom: "20px" }}>
            ⚠️ {error}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">PREDICTION QUESTION</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Will Solana cross $500 before July 2026?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isPending || isConfirming}
          />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>OUTCOME OPTIONS</span>
            {options.length < 10 && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "11px", padding: "4px 8px", minHeight: "auto" }}
                onClick={handleAddOption}
                disabled={isPending || isConfirming}
              >
                + Add Option
              </button>
            )}
          </label>
          {options.map((opt, idx) => (
            <div className="option-row" key={idx}>
              <input
                type="text"
                className="form-input"
                placeholder={`Option ${idx + 1}`}
                value={opt}
                onChange={(e) => handleOptionChange(idx, e.target.value)}
                disabled={isPending || isConfirming}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  className="option-remove"
                  onClick={() => handleRemoveOption(idx)}
                  disabled={isPending || isConfirming}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="form-row form-group">
          <div>
            <label className="form-label">STAKING DEADLINE</label>
            <input
              type="datetime-local"
              className="form-input"
              value={stakeDeadline}
              onChange={(e) => setStakeDeadline(e.target.value)}
              disabled={isPending || isConfirming}
            />
          </div>
          <div>
            <label className="form-label">RESOLUTION DEADLINE</label>
            <input
              type="datetime-local"
              className="form-input"
              value={resolutionDeadline}
              onChange={(e) => setResolutionDeadline(e.target.value)}
              disabled={isPending || isConfirming}
            />
          </div>
        </div>

        <div className="form-group fee-preview" style={{ borderRadius: "8px", border: "1px dashed var(--border)", fontSize: "13px", color: "var(--muted)", background: "var(--bg)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span>Protocol Fee</span>
            <strong>1.00% BPS</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Dispute Window</span>
            <strong>24 Hours</strong>
          </div>
        </div>

        <div style={{ marginTop: "32px", display: "flex", gap: "12px" }}>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flex: 1, padding: "14px" }}
            disabled={isPending || isConfirming}
          >
            {isPending
              ? "Confirming Wallet..."
              : isConfirming
              ? "Deploying Pool on Celo Sepolia..."
              : "Create Prediction Pool"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "14px 20px" }}
            onClick={() => router.push("/")}
            disabled={isPending || isConfirming}
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
