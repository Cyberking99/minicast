import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { WalletConnectButton } from "@/shared/ui/WalletConnectButton";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MiniCast — Prediction Pool",
  description: "Web3 prediction pool powered by Venice AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app-shell">
            <header className="app-header">
              <div className="app-header-inner">
                <Link href="/" className="logo">
                  <span className="logo-icon">M</span>
                  MiniCast
                </Link>
                <div className="header-actions">
                  <ThemeToggle />
                  <WalletConnectButton />
                  <Link href="/portfolio" className="btn btn-secondary header-btn" style={{ marginRight: "8px" }}>My Portfolio</Link>
                  <Link href="/create" className="btn btn-primary header-btn">Create Prediction</Link>
                </div>
              </div>
            </header>
            {children}
            
            <nav className="mobile-footer-nav">
              <Link href="/" className="mobile-nav-item">
                <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span className="nav-label">Home</span>
              </Link>
              <Link href="/portfolio" className="mobile-nav-item">
                <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter">
                  <rect x="3" y="4" width="18" height="16" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="nav-label">Portfolio</span>
              </Link>
              <Link href="/create" className="mobile-nav-item">
                <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="nav-label">Create Prediction</span>
              </Link>
            </nav>
          </div>
        </Providers>
      </body>
    </html>
  );
}
