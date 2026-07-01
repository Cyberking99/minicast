# Claude Design Prompt — Prediction Pool Frontend

---

Paste everything below this line into Claude.

---

Design a complete, production-ready frontend for a prediction pool web app called **Forecast**. Users stake USDC on outcome options for real-world questions. The winning side shares the losing pool. A Venice AI oracle resolves outcomes automatically.

## What to design

Design every screen and component listed below. Output all screens as full-page mockups. After the mockups, provide a complete design system specification as a reference table.

---

## The screens

**1. Home / Feed**
A feed of open prediction pools. Each card shows the question, two or more outcome options with a horizontal proportional bar showing current stake split, total pool size in USDC, and time remaining. Separate sections for "Trending", "Closing Soon", and "Newly Created". A fixed top nav with logo, wallet connection state, and a "Create Prediction" button. A subtle sticky category filter row (Sports, Crypto, Politics, Culture, Tech).

**2. Pool Detail**
Full-page view of a single prediction. Top section: the question in large type, status badge (Open / Locked / Resolving / Settled), and countdown timer. Below: a horizontal option bar showing live stake distribution with percentages. Each option is a selectable card — clicking one opens a stake input inline. Below the option cards: a live activity feed of recent stakes ("0xA1…b2 staked 80 USDC on Real Madrid · 4 min ago"). Right sidebar (desktop) / bottom sheet (mobile): the stake panel — option selected, USDC amount input, your implied odds, a prominent Stake button, and a secondary "Unlock AI Analysis" link. After staking, the button becomes a "You staked X USDC on [Option]" confirmation state.

**3. AI Analysis Report** (premium, x402 gated)
A modal or drawer that slides in over the Pool Detail. Shows: implied probability per option as horizontal gauge bars, Venice AI written analysis (2–3 paragraphs), a confidence score, sourced evidence links, and a risk score indicator. A small "Powered by Venice AI · Private inference" attribution at the bottom. Before payment: show a blurred preview of the report with a "Unlock for 0.50 USDC" CTA.

**4. Create Pool**
A focused form. Large input for the question. Dynamic "Add option" rows (minimum 2, maximum 10). Date/time pickers for Stake Deadline and Resolution Deadline. A fee preview ("1% of pool goes to protocol"). A Preview step before submitting. Clean, minimal — feels like composing a post, not filling a form.

**5. My Portfolio**
Two tabs: Active Positions and History. Active: cards for each pool the user has staked on, showing their option, their stake, current pool split, and status. History: settled pools with payout result — green "Won +X USDC" or muted "Lost X USDC". A summary strip at top: Total Staked, Total Won, Net P&L.

**6. Settlement / Payout screen**
Triggered when a pool the user won gets settled. A full-screen or modal celebration state — not cheesy confetti, something tasteful. Shows "You won X USDC", the oracle's verdict and reasoning snippet, the transaction hash, and a "Share" button.

---

## Design direction

**The feeling:** Confident, data-forward, slightly editorial. Think the intersection of a Bloomberg terminal and a modern fintech app — precise and information-dense but never sterile. Like Robinhood or Linear met Polymarket and had good taste.

**Absolutely avoid:** Generic SaaS purple gradients, glowing neon on dark backgrounds, floating orbs, hero sections with "The Future of Prediction" in a gradient font, AI-startup aesthetics, rounded pill buttons on everything, glass morphism cards, generic dashboard grid layouts with random donut charts.

**Typography:** A single grotesque or geometric sans-serif for everything — something like Inter, Geist, or DM Sans. Headlines are large and confident, not light. Numbers (stake amounts, percentages, odds) are tabular figures, mono weight where possible. No decorative serif accents.

**Color:** Build the palette around one primary accent — something unexpected but not loud. Consider a specific warm amber, a muted cobalt, or a deep forest green as the accent. Everything else is neutral grays with high contrast. The accent appears only on interactive states and key data points (winning option highlight, CTA buttons, live indicator dot). Never paint large surfaces with the accent color.

**Density:** Medium-high. Show real data. Cards have enough breathing room but this is not a sparse marketing page — users are making financial decisions and want to see information. Avoid padding so large that it feels like an NFT minting site.

**Status system:** Design a tight badge/pill system for pool statuses. OPEN should feel active (live dot + green tint). LOCKED should feel paused (muted, clock icon). RESOLVING should feel tense (amber, spinning indicator). SETTLED should feel final (neutral, check icon). These statuses appear on cards and the pool detail header.

**Stake bar:** The proportional bar showing option split is the most important visual element in the whole product. Design it carefully. It should show percentage labels inside the bar segments when segments are wide enough, truncate to icons or colors when narrow. Hovering a segment reveals that option's total and staker count. Animate the bar when new stakes come in.

**The stake input:** Inline, not a modal. When the user selects an option and types an amount, show live feedback: "Your share of the pool if you win: ~X USDC" and "Your implied odds: 2.4x". This calculation updates as they type. The Stake button should be large and clear — this is the primary conversion action.

**Oracle verdict display:** When Venice AI resolves a pool, show the AI's reasoning snippet prominently — this is a feature, not a footnote. Design a specific "Oracle verdict" component that looks authoritative. Include the confidence score as a small arc or line indicator, not a percentage number alone.

**Mobile:** Design mobile versions for Pool Detail and My Portfolio. The stake panel becomes a bottom sheet. The option bar stacks vertically on narrow screens. Navigation is a bottom tab bar with five items: Feed, Create, Portfolio, Activity, Profile.

**Micro-interactions to specify:** Stake button press state (not just hover — the actual pressed state), the transition when an option is selected (the card shifts, the stake panel slides in), the live stake bar updating animation (smooth width transition, not instant jump), and the wallet connection flow (three states: disconnected, connecting, connected with truncated address + balance).

**Empty states:** Design empty states for: no pools in a category filter, no positions in Portfolio, and the "pool just settled, no more active pools here" state. These should be human, not just "No data found" with a sad icon.

---

## Constraints

- Web3 wallet connection, not email login. The connected state shows a truncated address (0xA1…b2) and USDC balance, not a username.
- USDC is the only currency shown. Format all amounts as "$X.XX USDC" or just "$X.XX" where space is tight — never show ETH or gas costs to the user.
- The app must feel usable by someone who has never used a prediction market before. Every technical term (session key, oracle, relay) is hidden from the main UI flow.
- Dark mode and light mode both need to look intentional — not just color-inverted.

---

## Deliverables

1. Full-page mockup of every screen listed above (light mode, desktop unless specified)
2. Mobile mockups for Pool Detail and My Portfolio
3. Dark mode versions of Home and Pool Detail
4. Design system specification: color tokens, type scale, spacing scale, component states (default, hover, active, disabled, loading), and the status badge system
5. A brief annotation for each screen calling out one key design decision and why you made it
