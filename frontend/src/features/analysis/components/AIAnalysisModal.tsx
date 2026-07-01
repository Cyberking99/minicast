"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useWriteContract, useSendCalls } from "wagmi";
import { USDC_ABI, getUsdcAddress, getFeeCurrencyAddress } from "@/shared/lib/contracts";

interface AIAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  question?: string;
  options?: string[];
}

export function AIAnalysisModal({
  isOpen,
  onClose,
  question = "Will this prediction resolve?",
  options = ["Yes", "No"]
}: AIAnalysisModalProps) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPopupWarning, setShowPopupWarning] = useState(false);
  const [analysis, setAnalysis] = useState<{
    confidence: number;
    riskLevel: string;
    analysisText: string[];
    sources: string[];
    probabilities: number[];
  } | null>(null);

  const { isConnected, connector } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { sendCallsAsync } = useSendCalls();

  const isPorto = connector?.id === "xyz.ithaca.porto";

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading && !isUnlocked) {
      timer = setTimeout(() => {
        setShowPopupWarning(true);
      }, 8000);
    } else {
      setShowPopupWarning(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading, isUnlocked]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleUnlock = async () => {
    if (!isConnected) {
      alert("Please connect your wallet first!");
      return;
    }

    setIsLoading(true);
    setShowPopupWarning(false);
    try {
      console.log("Initiating USDC transfer for AI Analysis...");
      
      let txHash: string;
      if (isPorto) {
        // Use sendCallsAsync for Porto AA smart accounts
        const callsResult = await sendCallsAsync({
          calls: [
            {
              to: getUsdcAddress() as `0x${string}`,
              abi: USDC_ABI,
              functionName: "transfer",
              args: ["0x47D190ed0bBcD757765a0A3862535D68BF000cF5", BigInt(500000)],
            }
          ]
        });
        txHash = callsResult.id;
      } else {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        txHash = await writeContractAsync({
          address: getUsdcAddress() as `0x${string}`,
          abi: USDC_ABI,
          functionName: "transfer",
          args: ["0x47D190ed0bBcD757765a0A3862535D68BF000cF5", BigInt(500000)],
          feeCurrency: getFeeCurrencyAddress(),
        } as any);
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }
      
      console.log(`Payment transaction submitted: ${txHash}. Fetching AI report...`);

      const q = encodeURIComponent(question);
      const opts = encodeURIComponent(options.join(","));
      const res = await fetch(`/api/analysis?question=${q}&options=${opts}&tx=${txHash}`, {
        headers: {
          "Authorization": "L402 invoice=\"lnbc12000...\", macaroon=\"MDAxY2xvY2F0...\"",
        },
      });
      if (res.ok) {
        const json = await res.json();
        setAnalysis(json.data);
        setIsUnlocked(true);
      } else {
        console.error("Payment validation failed:", res.status);
      }
    } catch (err) {
      console.error("Error unlocking AI analysis:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const displayProbabilities = analysis?.probabilities || options.map((_, i) => (i === 0 ? 62 : i === 1 ? 38 : Math.floor(100 / options.length)));
  const confidenceScore = analysis?.confidence || 68;
  const sources = analysis?.sources || ["Market Volume & Sentiment Indicators", "Historical Industry Trend Analysis"];
  const reasoningLines = analysis?.analysisText || [
    "Evaluating historical trends and key performance benchmarks relevant to this market. Our models assess standard variance bounds and macroeconomic triggers.",
    "Current sentiment index and underlying trade volumes reflect standard liquidity distribution, indicating balanced odds.",
    "Key resolution parameters are monitored in real time. Full analysis report details will unlock upon invoice settlement."
  ];

  return (
    <div className="modal-overlay" id="ai-modal" style={{ display: "grid" }}>
      <div className="modal-content">
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "24px",
            right: "24px",
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--fg)",
            cursor: "pointer",
          }}
        >
          ✕ CLOSE
        </button>

        <h2 style={{ fontSize: "24px", marginBottom: "24px" }}>
          AI Forecast Report
        </h2>

        <div style={{ position: "relative" }}>
          {/* Main Content (Blurred/Preview if locked) */}
          <div style={{ filter: !isUnlocked ? "blur(3px)" : "none", pointerEvents: !isUnlocked ? "none" : "auto", userSelect: !isUnlocked ? "none" : "auto" }}>
            
            <div style={{ fontSize: "14px", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", marginBottom: "8px" }}>
              Prediction Question
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 800, textTransform: "uppercase", marginBottom: "24px", lineHeight: "1.2" }}>
              {question}
            </div>

            {/* Implied Probabilities */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--muted)", marginBottom: "12px", fontWeight: 700 }}>
                Projected Outcome Odds
              </div>
              {options.map((opt, idx) => {
                const probability = displayProbabilities[idx] || 0;
                return (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-soft)", padding: "8px 0", fontFamily: "var(--font-mono)", fontSize: "13px" }}>
                    <span>{opt}</span>
                    <span style={{ fontWeight: 700, color: "var(--accent)" }}>{probability}% Probability</span>
                  </div>
                );
              })}
            </div>

            {/* Venice's Reasoning Text displayed as an indented Pull-Quote */}
            <div className="oracle-pull-quote">
              {reasoningLines.map((p, i) => (
                <p key={i} style={{ marginBottom: "12px" }}>{p}</p>
              ))}
            </div>

            {/* Confidence Score as horizontal progress line, no percentage label */}
            <div style={{ margin: "24px 0" }}>
              <div style={{ textTransform: "uppercase", fontSize: "11px", color: "var(--muted)", fontWeight: 700, marginBottom: "8px" }}>
                Confidence Score Indicator
              </div>
              <div className="oracle-confidence-bar">
                <div className="oracle-confidence-fill" style={{ width: `${confidenceScore}%` }}></div>
              </div>
            </div>

            {/* Sources as numbered footnotes at the bottom */}
            <div style={{ marginTop: "32px" }}>
              <div style={{ textTransform: "uppercase", fontSize: "11px", color: "var(--muted)", fontWeight: 700, marginBottom: "8px" }}>
                Footnotes & Sources
              </div>
              <ol className="footnote-links">
                {sources.map((src, i) => (
                  <li key={i}>{src}</li>
                ))}
              </ol>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "32px", paddingTop: "12px", borderTop: "1px solid var(--border-soft)", fontSize: "10px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              <span>PRIVACY PRESERVING INFERENCE POWERED BY VENICE AI</span>
            </div>
          </div>

          {/* Paywall Overlay */}
          {!isUnlocked && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(245, 242, 237, 0.5)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "24px",
              }}
            >
              <div style={{ background: "var(--bg)", border: "2px solid var(--border)", padding: "32px", width: "100%", maxWidth: "380px" }}>
                <h3 style={{ fontSize: "18px", marginBottom: "8px" }}>REPORT LOCKED</h3>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "20px" }}>
                  Unlock the full predictive report powered by Venice AI for 0.50 USDC.
                </p>
                <button
                  className="btn btn-primary btn-block btn-accent"
                  onClick={handleUnlock}
                  disabled={isLoading}
                >
                  {isLoading ? "UNLOCKING..." : "UNLOCK FOR 0.50 USDC"}
                </button>

                {showPopupWarning && (
                  <div style={{ marginTop: "16px", padding: "12px", border: "1px solid var(--accent)", background: "var(--surface)", fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-mono)", textAlign: "left" }}>
                    💡 Taking longer than expected? Check if a MetaMask or Porto confirmation popup is minimized or blocked by your browser.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
