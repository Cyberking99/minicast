"use client";

import React, { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";

interface StakeItem {
  id: string;
  poolId: string;
  staker: string;
  optionId: number;
  amount: string;
  txHash: string;
  createdAt: string;
  payout: string | null;
  payoutTxHash: string | null;
  pool: {
    id: string;
    question: string;
    options: string[];
    stakeDeadline: string;
    resolutionDeadline: string;
    status: string;
    winningOptionId: number | null;
    totalPool: string;
  };
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [stakes, setStakes] = useState<StakeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setStakes([]);
      return;
    }

    const fetchPortfolio = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/portfolio?address=${address}`);
        if (res.ok) {
          const json = await res.json();
          setStakes(json.stakes || []);
        }
      } catch (err) {
        console.error("Failed to load portfolio stats:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPortfolio();
  }, [address, isConnected]);

  if (!isConnected) {
    return (
      <main className="app-main">
        <div style={{ textAlign: "center", padding: "64px 32px", border: "2px solid var(--border)", background: "var(--surface)" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔒</div>
          <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>PORTFOLIO LOCKED</h2>
          <p style={{ color: "var(--muted)", fontSize: "12px", marginBottom: "24px" }}>
            Please connect your wallet using the button in the header to view your prediction dashboard.
          </p>
        </div>
      </main>
    );
  }

  // Calculate summaries
  const totalStaked = stakes.reduce((acc, curr) => acc + parseFloat(curr.amount) / 1e6, 0);
  
  const totalWon = stakes.reduce((acc, curr) => {
    if (curr.payout) {
      const payoutVal = parseFloat(curr.payout) / 1e6;
      const amountVal = parseFloat(curr.amount) / 1e6;
      if (payoutVal > amountVal) {
        return acc + (payoutVal - amountVal);
      }
    }
    return acc;
  }, 0);

  const totalLost = stakes.reduce((acc, curr) => {
    if (curr.pool.status === "SETTLED" || curr.pool.status === "UNRESOLVABLE") {
      const payoutVal = curr.payout ? parseFloat(curr.payout) / 1e6 : 0;
      const amountVal = parseFloat(curr.amount) / 1e6;
      if (payoutVal < amountVal) {
        return acc + (amountVal - payoutVal);
      }
    }
    return acc;
  }, 0);

  const netPl = totalWon - totalLost;

  const activeStakes = stakes.filter(s => s.pool.status !== "SETTLED" && s.pool.status !== "UNRESOLVABLE");
  const historyStakes = stakes.filter(s => s.pool.status === "SETTLED" || s.pool.status === "UNRESOLVABLE");

  return (
    <main className="app-main">
      <h1 style={{ fontSize: "32px", marginBottom: "32px" }}>MY PORTFOLIO</h1>

      {/* Summary Stats Cards */}
      <div className="portfolio-summary" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "48px" }}>
        <div style={{ background: "var(--surface)", border: "2px solid var(--border)", padding: "24px" }}>
          <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Total Staked</div>
          <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "8px", fontFamily: "var(--font-mono)" }}>
            ${totalStaked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ background: "var(--surface)", border: "2px solid var(--border)", padding: "24px" }}>
          <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Total Winnings</div>
          <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "8px", color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
            +${totalWon.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ background: "var(--surface)", border: "2px solid var(--border)", padding: "24px" }}>
          <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Net P&amp;L</div>
          <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "8px", color: netPl >= 0 ? "var(--accent)" : "inherit", fontFamily: "var(--font-mono)" }}>
            {netPl >= 0 ? "+" : "-"}${Math.abs(netPl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Main Grid with Vertical Left Sidebar Filter */}
      <div className="portfolio-grid">
        {/* Left Sidebar Filter */}
        <aside className="portfolio-sidebar-filter">
          <button
            className={`portfolio-filter-btn ${activeTab === "active" ? "active" : ""}`}
            onClick={() => setActiveTab("active")}
          >
            ACTIVE POSITIONS ({activeStakes.length})
          </button>
          <button
            className={`portfolio-filter-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            SETTLEMENT ({historyStakes.length})
          </button>
        </aside>

        {/* Right Content */}
        <section style={{ flex: 1 }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              LOADING PORTFOLIO DATA...
            </div>
          ) : activeTab === "active" ? (
            activeStakes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 32px", border: "2px dashed var(--border)" }}>
                <p style={{ color: "var(--muted)", fontSize: "12px", marginBottom: "20px" }}>
                  You do not have any active prediction stakes.
                </p>
                <Link href="/" className="btn btn-primary">Browse Markets</Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {activeStakes.map((stake) => {
                  const amountUSDC = parseFloat(stake.amount) / 1e6;
                  const poolTotalUSDC = parseFloat(stake.pool.totalPool) / 1e6;
                  const poolShare = poolTotalUSDC > 0 ? (amountUSDC / poolTotalUSDC) * 100 : 0;
                  const selectedOptionName = stake.pool.options[stake.optionId] || `Option ${stake.optionId}`;

                  return (
                    <Link key={stake.id} href={`/pool/${stake.poolId}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <div className="brutalist-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px" }}>
                        <div>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 800, textTransform: "uppercase", marginBottom: "8px", lineHeight: "1.2" }}>
                            {stake.pool.question}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "12px", fontFamily: "var(--font-mono)" }}>
                            <span>STAKED: <strong>${amountUSDC.toFixed(2)} USDC</strong> ON <strong>{selectedOptionName}</strong></span>
                            <span className={`status-badge ${stake.pool.status.toLowerCase()}`}>
                              {stake.pool.status}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", paddingLeft: "24px", fontFamily: "var(--font-mono)" }}>
                          <div style={{ fontSize: "16px", fontWeight: 700 }}>${amountUSDC.toFixed(2)}</div>
                          <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px" }}>{poolShare.toFixed(1)}% SHARE</div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )
          ) : historyStakes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "64px 32px", border: "2px dashed var(--border)" }}>
              <p style={{ color: "var(--muted)", fontSize: "12px" }}>No past prediction payouts recorded.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {historyStakes.map((stake) => {
                const amountUSDC = parseFloat(stake.amount) / 1e6;
                const payoutVal = stake.payout ? parseFloat(stake.payout) / 1e6 : 0;
                const isWinner = payoutVal > amountUSDC;
                const isRefund = stake.pool.status === "UNRESOLVABLE";
                const selectedOptionName = stake.pool.options[stake.optionId] || `Option ${stake.optionId}`;
                const winningOptionName = stake.pool.winningOptionId !== null ? (stake.pool.options[stake.pool.winningOptionId] || `Option ${stake.pool.winningOptionId}`) : "N/A";

                return (
                  <Link key={stake.id} href={`/pool/${stake.poolId}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="brutalist-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px" }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 800, textTransform: "uppercase", marginBottom: "8px", lineHeight: "1.2" }}>
                          {stake.pool.question}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                          STAKED: <strong>${amountUSDC.toFixed(2)} USDC</strong> ON <strong>{selectedOptionName}</strong> ·
                          {isRefund ? (
                            <span style={{ marginLeft: "6px" }}>REFUNDED</span>
                          ) : (
                            <span style={{ marginLeft: "6px" }}>
                              WINNING OUTCOME: <strong style={{ color: "var(--accent)" }}>{winningOptionName}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", paddingLeft: "24px", fontFamily: "var(--font-mono)" }}>
                        {isRefund ? (
                          <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--muted)" }}>REFUND</div>
                        ) : isWinner ? (
                          <div className="amount-won" style={{ fontSize: "16px" }}>
                            +${(payoutVal - amountUSDC).toFixed(2)}
                          </div>
                        ) : (
                          <div className="amount-lost" style={{ fontSize: "16px" }}>
                            -${amountUSDC.toFixed(2)}
                          </div>
                        )}
                        <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px" }}>
                          PAYOUT: ${payoutVal.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
