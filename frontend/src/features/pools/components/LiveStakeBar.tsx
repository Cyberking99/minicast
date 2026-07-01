"use client";

import React from "react";

interface LiveStakeBarProps {
  options: {
    label: string;
    percentage: number;
    totalStakedStr: string;
    stakers: number;
    odds: string;
  }[];
  status?: string; // e.g. "OPEN", "LOCKED", "RESOLVED", "SETTLED", "DISPUTED", "UNRESOLVABLE"
  winningOptionId?: number | null;
}

export function LiveStakeBar({ options, status = "OPEN", winningOptionId = null }: LiveStakeBarProps) {
  const isResolved = status === "SETTLED" || status === "RESOLVED" || status === "UNRESOLVABLE" || winningOptionId !== null;

  // Calculate segment boundaries
  let currentAccumulator = 0;
  const ticks = options.slice(0, -1).map((opt) => {
    currentAccumulator += opt.percentage;
    return currentAccumulator;
  });

  return (
    <div className="stake-bar-container" style={{ margin: "24px 0" }}>
      {/* Top Labels: Option names & percentages */}
      <div className="stake-bar-label-top" style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        {options.map((opt, idx) => (
          <div key={idx} style={{ textAlign: idx === 0 ? "left" : idx === options.length - 1 ? "right" : "center" }}>
            <span style={{ fontWeight: 700 }}>{opt.label}</span>
            <span style={{ color: "var(--accent)", marginLeft: "6px" }}>{opt.percentage.toFixed(0)}%</span>
          </div>
        ))}
      </div>

      {/* The Tick Bar Line */}
      <div className="stake-bar-line" style={{ position: "relative", height: "2px", background: "var(--border)", margin: "14px 0" }}>
        {/* Left endpoint tick */}
        <div className="stake-bar-tick" style={{ left: "0%" }}></div>

        {/* Segment division ticks */}
        {ticks.map((pct, idx) => (
          <div key={idx} className="stake-bar-tick" style={{ left: `${pct}%` }}></div>
        ))}

        {/* Right endpoint tick */}
        <div className="stake-bar-tick" style={{ right: "0%" }}></div>

        {/* Overlay highlights for resolved states */}
        {isResolved && options.map((opt, idx) => {
          // Calculate start & width of this option's segment
          let startPct = 0;
          for (let i = 0; i < idx; i++) {
            startPct += options[i].percentage;
          }
          const widthPct = opt.percentage;

          const isWinner = winningOptionId === idx;

          if (isWinner) {
            // Winning option fills solid
            return (
              <div
                key={idx}
                className="stake-bar-winning-solid"
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                }}
                title={`${opt.label} (Winner)`}
              ></div>
            );
          } else {
            // Losing options stay as outlines
            return (
              <div
                key={idx}
                className="stake-bar-losing-outline"
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                }}
                title={`${opt.label} (Lost)`}
              ></div>
            );
          }
        })}
      </div>

      {/* Bottom Labels: Odds & totals */}
      <div className="stake-bar-label-bottom" style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
        {options.map((opt, idx) => (
          <div key={idx} style={{ textAlign: idx === 0 ? "left" : idx === options.length - 1 ? "right" : "center" }}>
            <span>{opt.odds} Odds</span>
            <span style={{ marginLeft: "8px", opacity: 0.6 }}>({opt.totalStakedStr})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
