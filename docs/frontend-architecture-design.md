# Frontend Architecture Design: Forecast Prediction Pool

## 1. Understanding Summary
*   **What is being built:** A Next.js App Router frontend architecture to bring the Forecast static HTML prototypes to life.
*   **Why it exists:** To create a production-ready Web3 application that interfaces with smart contracts and off-chain APIs (like Venice AI and 1Shot).
*   **Who it is for:** Web3 users who want a seamless, gasless prediction market experience (via MetaMask smart accounts) without dealing with typical crypto UX friction.
*   **Key constraints:** Web3 wallet connection only, USDC as the sole currency, complex Web3 terms hidden from the user, and x402 payment gating for AI analysis.
*   **Explicit non-goals:** Building a custom complex indexer (relying on Wagmi polling instead), or relying on a fully client-side SPA architecture.

## 2. Assumptions (Non-Functional Requirements)
*   **Performance:** Initial page loads under 1.5s (leveraging Server Components). Live on-chain data polls every 10-15 seconds.
*   **Scale:** Designed for early-stage/beta scale (e.g., 10k–50k MAU, dozens of concurrent active pools).
*   **Security:** Strict validation of user input before constructing transactions; x402 endpoints require cryptographic verification.
*   **Reliability:** High reliance on Base Sepolia RPCs and 1Shot API uptime; graceful degradation if the oracle or relayer is delayed.
*   **Maintenance:** Modular, component-based structure using Tailwind CSS so a small team can easily maintain and extend it.

## 3. Decision Log

### Decision 1: Data Fetching Strategy
*   **What was decided:** Use Server Components for initial fast load, with Client Components using Wagmi hooks and polling for live on-chain updates.
*   **Alternatives considered:** 
    *   Server-Sent Events (SSE) / WebSockets
    *   Fully client-side rendering (SPA)
*   **Why this option was chosen:** Balances fast initial page loads and SEO with the reality of Web3 dApps where on-chain data is best synced directly from the client via RPC polling to avoid complex backend indexer infrastructure.

### Decision 2: Directory Structure and Architecture
*   **What was decided:** Feature-Sliced Design with Interactive Islands.
*   **Alternatives considered:** 
    *   Monolithic Page-Level Client Components
    *   Strict Atomic Design with Global Context
*   **Why this option was chosen:** It provides the best separation of concerns, aligning perfectly with Next.js App Router. It allows server components to fetch static data while delegating heavy interactivity to encapsulated client components, keeping maintenance easy for a small team.

## 4. Final Design

### Architecture & Directory Structure
We use a **Feature-Sliced Design** tailored for Next.js App Router.

```text
src/
├── app/                  # Next.js App Router (Server Components)
│   ├── layout.tsx        # Global layout, Wagmi Provider setup
│   ├── page.tsx          # Home/Feed (Server-fetched initial list)
│   ├── pool/[id]/        # Pool Detail
│   │   └── page.tsx      # Fetches pool metadata on server
│   └── portfolio/        # User Portfolio
├── features/             # Feature domains
│   ├── pools/            # Pool-related logic & UI
│   │   ├── components/   # e.g., PoolCard, LiveStakeBar, StatusBadge
│   │   ├── hooks/        # e.g., usePoolLiveUpdates, useCreatePool
│   │   └── utils.ts      # Formatting odds, percentages
│   ├── staking/          # Staking functionality
│   │   ├── components/   # StakePanel (Client Component)
│   │   └── hooks/        # session key integration, 1shot API calls
│   └── analysis/         # Venice AI & x402 integration
│       └── components/   # AIAnalysisModal (x402 gate)
├── shared/               # Shared cross-feature elements
│   ├── ui/               # Base UI components (Button, Modal, Input)
│   └── lib/              # Wagmi config, viem clients
```

### Data Flow & Component Boundaries
*   **Server Fetch (Initial Load):** When a user visits `/pool/[id]`, the Server Component fetches the static pool configuration directly from the blockchain RPC or database.
*   **Client Hydration (Live Data):** The Server Component passes this static data as props to Client Components like `<LiveStakeBar />`.
*   **Wagmi Polling:** `<LiveStakeBar />` mounts and initiates a Wagmi `useReadContracts` hook with manual polling to fetch the latest `optionTotals` and `totalPool` from the smart contract.
*   **The Stake Panel:** A pure Client Component inside `features/staking/`. It calculates real-time implied odds locally using the live data provided by Wagmi. Upon staking, it submits a gasless transaction via the 1Shot relay API and updates optimistically.

### Error Handling
*   **Transaction Failures:** Handled gracefully with optimistic UI reversion and localized toasts.
*   **Session Key Expiration:** Prompts user to sign a new permission delegation.
*   **x402 Gating Failures:** Keeps AI analysis behind a blurred preview state with clear error messaging.

### Edge Cases
*   **100% Stake on One Side:** `LiveStakeBar` maintains a minimum 1% visual width; implied odds cap out gracefully.
*   **Oracle Resolution Delay:** Pool remains `LOCKED` with an "Awaiting Oracle Verification" banner.

### Testing Strategy
*   **Unit Tests (Vitest):** Financial math utilities (implied odds, payouts) in `features/pools/utils.ts`.
*   **Component Tests:** React Testing Library for interactive islands (e.g., `<StakePanel />` input validation).
