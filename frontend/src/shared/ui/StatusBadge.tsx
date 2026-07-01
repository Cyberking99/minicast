import React from "react";

export type PoolStatus = "open" | "locked" | "resolving" | "settled";

export function StatusBadge({ status }: { status: PoolStatus }) {
  const getBadgeContent = () => {
    switch (status) {
      case "open":
        return (
          <>
            <span className="status-dot"></span>Open
          </>
        );
      case "locked":
        return "Locked";
      case "resolving":
        return (
          <>
            <span className="status-spin"></span>Resolved
          </>
        );
      case "settled":
        return "Settled";
      default:
        return null;
    }
  };

  return <span className={`status-badge ${status}`}>{getBadgeContent()}</span>;
}
