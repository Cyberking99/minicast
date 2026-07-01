import Link from "next/link";
import { PoolCard } from "@/features/pools/components/PoolCard";
import { fetchOnChainPools } from "@/shared/lib/contracts";

export const revalidate = 0; // Disable Next.js page caching for real-time reads

export default async function Home() {
  const allPools = await fetchOnChainPools();

  // Sort pools by total pool size (descending) so the largest pool is featured
  const sortedPools = [...allPools].sort((a, b) => {
    const aVal = parseFloat(a.poolTotal.replace(/[^0-9.]/g, "")) || 0;
    const bVal = parseFloat(b.poolTotal.replace(/[^0-9.]/g, "")) || 0;
    return bVal - aVal;
  });

  const featuredPool = sortedPools[0];
  const remainingPools = sortedPools.slice(1);

  // Chunk remaining pools into pairs of 2 for the asymmetric grid rows
  const poolPairs: typeof remainingPools[] = [];
  for (let i = 0; i < remainingPools.length; i += 2) {
    poolPairs.push(remainingPools.slice(i, i + 2));
  }

  return (
    <>
      <nav className="filter-bar">
        <button className="filter-chip active">ALL MARKETS</button>
        <button className="filter-chip">SPORTS</button>
        <button className="filter-chip">STABLECOIN</button>
        <button className="filter-chip">POLITICS</button>
        <button className="filter-chip">TECH</button>
      </nav>

      <main className="app-main" style={{ display: "flex", flexDirection: "column", gap: "64px" }}>
        
        {allPools.length === 0 ? (
          <div style={{ 
            textAlign: "center", 
            padding: "80px 32px", 
            border: "1px dashed var(--border)", 
            background: "var(--surface)",
            borderRadius: "12px",
            maxWidth: "600px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px"
          }}>
            <div style={{ fontSize: "32px" }}>🔍</div>
            <h3 style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" }}>No Active Markets</h3>
            <p style={{ color: "var(--muted)", fontSize: "14px", lineHeight: "1.6", maxWidth: "420px", margin: "0 auto 8px" }}>
              Be the first to forecast the future. Launch a custom prediction pool on Celo Sepolia.
            </p>
            <Link href="/create" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block", width: "auto", padding: "12px 24px" }}>
              Create Prediction Market
            </Link>
          </div>
        ) : (
          <div className="asymmetric-feed">
            {/* Featured Pool (Full Width) */}
            {featuredPool && (
              <div className="featured-row">
                <div style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
                  ★ FEATURED PREDICTION
                </div>
                <PoolCard {...featuredPool} featured={true} />
              </div>
            )}

            {/* Asymmetric Grid Rows */}
            {poolPairs.map((pair, idx) => (
              <div key={idx} className="grid-row">
                {pair.map((pool) => (
                  <PoolCard key={pool.id} {...pool} />
                ))}
              </div>
            ))}
          </div>
        )}


      </main>
    </>
  );
}
