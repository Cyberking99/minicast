# Frontend Implementation Plan

## Phase 1: Setup and Foundation
1. **Initialize Next.js App:** Create the `frontend` workspace using Next.js App Router, TypeScript, and Tailwind CSS.
2. **Web3 Tooling:** Install and configure `viem`, `wagmi`, and `@tanstack/react-query`.
3. **Directory Structure:** Scaffold the Feature-Sliced Design structure (`src/app`, `src/features`, `src/shared`).

## Phase 2: Design System & Shared UI
1. **Tailwind Config:** Port the color palette, fonts (Inter/Geist), and custom styles from `styles.css` in the prototype.
2. **Base Components:** Implement shared UI components like `<Button />`, `<Card />`, and `<StatusBadge />` based on the prototype HTML.
3. **Layouts:** Implement the global layout, top navigation (wallet connection placeholder), and main wrappers.

## Phase 3: Core Features (Static to Server Components)
1. **Feed/Home Page:** Migrate `home.html` to `app/page.tsx`, displaying dummy/initial open prediction pools.
2. **Pool Detail Page:** Migrate `pool-detail.html` to `app/pool/[id]/page.tsx`, displaying the question, options, and status.
3. **Portfolio Page:** Migrate `portfolio.html` to `app/portfolio/page.tsx` for active positions and history.

## Phase 4: Interactive Islands (Wagmi Integration)
1. **Live Stake Bar:** Implement `<LiveStakeBar />` client component using Wagmi to poll for on-chain totals and render the proportional bar.
2. **Stake Panel:** Implement `<StakePanel />` client component to calculate implied odds on the fly and handle the stake transaction flow.
3. **Wallet Connection:** Implement the real connect wallet flow with Wagmi and MetaMask.

## Phase 5: Advanced Integrations
1. **1Shot API:** Integrate the backend route to relay gasless stakes via ERC-7715 session keys.
2. **Venice AI & x402:** Implement the blurred `<AIAnalysisModal />` and the x402 micropayment check.
3. **Testing & Edge Cases:** Handle 100% split edge cases, error states, and ensure proper mobile responsiveness (bottom sheets).
