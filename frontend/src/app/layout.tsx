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
                  <Link href="/portfolio" className="btn btn-secondary" style={{ marginRight: "8px" }}>My Portfolio</Link>
                  <Link href="/create" className="btn btn-primary">Create Prediction</Link>
                </div>
              </div>
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
