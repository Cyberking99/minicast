import React from "react";
import Link from "next/link";
import { StatusBadge, PoolStatus } from "@/shared/ui/StatusBadge";
import { LiveStakeBar } from "./LiveStakeBar";

interface Option {
  label: string;
  percentage: number;
  totalStakedStr: string;
  stakers: number;
}

export interface PoolCardProps {
  id: string;
  question: string;
  category: string;
  status: PoolStatus;
  thumbnailUrl: string;
  poolTotal: string;
  timeLeft: string;
  totalStakers: number;
  options: Option[];
  featured?: boolean;
}

export function PoolCard({
  id,
  question,
  status,
  poolTotal,
  timeLeft,
  options,
  featured = false,
}: PoolCardProps) {
  // Format options for the redesigned LiveStakeBar
  const formattedOptions = options.map((opt) => {
    const odds = opt.percentage > 0 ? (100 / opt.percentage).toFixed(2) + "x" : "1.00x";
    return {
      ...opt,
      odds,
    };
  });

  return (
    <Link
      href={`/pool/${id}`}
      className={`brutalist-card ${featured ? "featured-card" : ""}`}
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div className="pool-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "16px" }}>
        <h2 className="pool-card-question" style={{ margin: 0 }}>
          {question}
        </h2>
        <StatusBadge status={status} />
      </div>

      {/* Option Names below the question in mono */}
      <div className="pool-card-options-list">
        {options.map((opt, idx) => (
          <span key={idx} className="pool-card-option-item">
            {opt.label}
          </span>
        ))}
      </div>

      {/* Redeemed Stake Bar */}
      <LiveStakeBar options={formattedOptions} status={status} />

      {/* Small caps, right-aligned meta */}
      <div className="pool-card-meta">
        <span>TOTAL POOL: {poolTotal}</span>
        <span>TIME LEFT: {timeLeft}</span>
      </div>
    </Link>
  );
}
