# Prediction Pool — Full Implementation Plan
## MetaMask Smart Accounts Kit × 1Shot API × Venice AI Hackathon

---

## 1. Project Overview

A multi-sided parimutuel prediction pool where users stake on outcome options.
The winning side shares the entire losing pool proportionally to their stake.
A Venice AI oracle agent resolves outcomes autonomously. 1Shot relays all winner
payouts in a single batch transaction. MetaMask smart accounts handle gasless
staking via ERC-7715 session keys.

### Tech stack
- **Solidity ^0.8.24** — smart contracts (Hardhat)
- **MetaMask Smart Accounts Kit** — EIP-7702 upgrade + ERC-7715 session keys
- **1Shot API** — permissionless EIP-7710 relay + batch settlement
- **Venice AI** — private LLM oracle agent (text model)
- **x402 protocol** — micropayment gate for premium AI analysis reports
- **Next.js 14 (App Router)** — frontend
- **viem + wagmi v2** — onchain reads/writes
- **USDC (Base Sepolia)** — staking denomination

---

## 2. Smart Contract Architecture

### 2.1 Contracts to implement

```
contracts/
  PredictionPool.sol       # Core pool logic
  OracleVerifier.sol       # Validates Venice AI signed verdicts
  SessionKeyModule.sol     # ERC-7715 session key permission module
  FeeCollector.sol         # Protocol fee treasury
```

### 2.2 PredictionPool.sol — full spec

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * PredictionPool
 *
 * State machine: OPEN → LOCKED → RESOLVED → SETTLED
 *
 * OPEN     — stakes accepted, options visible
 * LOCKED   — stake window closed (lockTime passed), no new stakes
 * RESOLVED — oracle has submitted verdict, dispute window running
 * SETTLED  — payouts distributed, pool closed
 */

struct Pool {
    bytes32 id;
    string  question;           // plain-text question
    string[] options;           // outcome labels, index = optionId
    uint256 stakeDeadline;      // unix timestamp, stakes close here
    uint256 resolutionDeadline; // oracle must resolve before this
    uint256 disputeWindow;      // seconds after resolution before settle
    uint8   winningOption;      // set by oracle
    uint8   status;             // 0=OPEN 1=LOCKED 2=RESOLVED 3=SETTLED
    uint256 totalPool;
    uint256 protocolFee;        // basis points, e.g. 100 = 1%
    address creator;
    bytes32 verdictHash;        // keccak256(verdict JSON from Venice)
}

struct Stake {
    address staker;
    uint8   optionId;
    uint256 amount;
    uint256 timestamp;
}

// Storage
mapping(bytes32 => Pool)                         public pools;
mapping(bytes32 => Stake[])                      public poolStakes;
mapping(bytes32 => mapping(uint8 => uint256))    public optionTotals;
mapping(bytes32 => mapping(address => Stake[]))  public stakerPositions;
mapping(bytes32 => bool)                         public disputeRaised;

// Events
event PoolCreated(bytes32 indexed poolId, string question, string[] options, uint256 stakeDeadline);
event Staked(bytes32 indexed poolId, address indexed staker, uint8 optionId, uint256 amount);
event PoolLocked(bytes32 indexed poolId);
event VerdictSubmitted(bytes32 indexed poolId, uint8 winningOption, bytes32 verdictHash);
event DisputeRaised(bytes32 indexed poolId, address indexed disputer);
event Settled(bytes32 indexed poolId, uint8 winningOption, uint256 distributable);
event PayoutSent(bytes32 indexed poolId, address indexed winner, uint256 amount);
```

#### Functions to implement

**createPool()**
```
Parameters:
  string question
  string[] options          // min 2, max 10
  uint256 stakeDeadline     // must be > block.timestamp + 1 hour
  uint256 resolutionDeadline
  uint256 disputeWindowSecs // recommended: 3600 (1 hour)
  uint256 feeBps            // max 500 (5%)

Logic:
  1. Validate parameters
  2. Generate poolId = keccak256(abi.encodePacked(question, creator, block.timestamp))
  3. Store Pool struct
  4. Emit PoolCreated
```

**stake()**
```
Parameters:
  bytes32 poolId
  uint8   optionId
  uint256 amount            // USDC, 6 decimals

Logic:
  1. Require pool.status == OPEN
  2. Require block.timestamp < pool.stakeDeadline
  3. Require optionId < pool.options.length
  4. Pull USDC from msg.sender via transferFrom (ERC-20)
     — if called via 1Shot relay, msg.sender is the session key delegate
  5. Append to poolStakes[poolId]
  6. Update optionTotals[poolId][optionId] += amount
  7. Update pool.totalPool += amount
  8. Push to stakerPositions[poolId][msg.sender]
  9. Emit Staked

Note: ERC-7715 session key should have:
  - tokenAddress: USDC contract
  - spendLimit: user-defined max stake
  - validUntil: pool.stakeDeadline
```

**lockPool()**
```
Parameters:
  bytes32 poolId

Logic:
  1. Require block.timestamp >= pool.stakeDeadline
  2. Require pool.status == OPEN
  3. Set pool.status = LOCKED
  4. Emit PoolLocked

Can be called by anyone — permissionless.
```

**submitVerdict()**
```
Parameters:
  bytes32 poolId
  uint8   winningOption
  bytes32 verdictHash       // keccak256 of full Venice AI verdict JSON
  bytes   oracleSignature   // ECDSA sig from trusted oracle address

Logic:
  1. Require pool.status == LOCKED
  2. Require block.timestamp < pool.resolutionDeadline
  3. Verify oracleSignature against OracleVerifier.sol
     — signer must be registered oracle address (set at deploy)
  4. Require winningOption < pool.options.length
  5. Set pool.winningOption = winningOption
  6. Set pool.verdictHash = verdictHash
  7. Set pool.status = RESOLVED
  8. Record resolution timestamp for dispute window
  9. Emit VerdictSubmitted
```

**raiseDispute()**
```
Parameters:
  bytes32 poolId

Logic:
  1. Require pool.status == RESOLVED
  2. Require within dispute window
  3. Require msg.sender has a stake in the pool
  4. Set disputeRaised[poolId] = true
  5. Re-trigger oracle agent via emitted event (frontend listens, re-queries Venice)
  6. Emit DisputeRaised

A second submitVerdict() call resolves the dispute. Two matching verdicts = final.
```

**settle()**
```
Parameters:
  bytes32 poolId

Logic:
  1. Require pool.status == RESOLVED
  2. Require dispute window elapsed OR disputeRaised resolved
  3. Calculate:
       fee         = pool.totalPool * pool.feeBps / 10000
       distributable = pool.totalPool - fee
       winningTotal  = optionTotals[poolId][pool.winningOption]

  4. For each stake in poolStakes[poolId] where stake.optionId == winningOption:
       payout = (stake.amount * distributable) / winningTotal
       transfer USDC to stake.staker

  5. Transfer fee to FeeCollector
  6. Set pool.status = SETTLED
  7. Emit Settled

IMPORTANT: This function will be called by the 1Shot relayer.
All USDC transfers in step 4 happen in a single transaction.
Build a batchPayout() variant that accepts address[] and uint256[]
for the 1Shot relay to submit in one call.
```

**batchPayout()** — 1Shot entry point
```
Parameters:
  bytes32   poolId
  address[] winners
  uint256[] amounts

Logic:
  1. Require caller is trusted 1Shot relay address OR pool is settled
  2. Verify winners + amounts match on-chain calculation (no trust needed, revert on mismatch)
  3. Execute all USDC transfers
  4. Emit PayoutSent for each winner

This is the function 1Shot calls. Pre-compute winners[] and amounts[]
offchain, submit via 1Shot relay. Contract re-derives and validates.
```

### 2.3 OracleVerifier.sol
```
Storage:
  address public trustedOracle;   // Venice AI agent's signing wallet

Functions:
  verifyVerdict(bytes32 verdictHash, bytes signature) → bool
    — ecrecover(verdictHash, signature) == trustedOracle

  setOracle(address newOracle) — onlyOwner
```

### 2.4 SessionKeyModule.sol (ERC-7715)
```
Implements the permission module interface required by MetaMask Smart Accounts Kit.

Permission schema:
  {
    "type": "erc20-spend",
    "token": "<USDC_ADDRESS>",
    "allowance": "<MAX_STAKE_AMOUNT>",
    "validUntil": "<STAKE_DEADLINE_UNIX>",
    "allowedCalls": [
      {
        "contract": "<PREDICTION_POOL_ADDRESS>",
        "function": "stake(bytes32,uint8,uint256)"
      }
    ]
  }

The session key is scoped to a single function on a single contract with a spend cap.
Users never expose a blanket approval.
```

---

## 3. MetaMask Smart Accounts Kit Integration

### 3.1 Account upgrade (EIP-7702)
```typescript
// Use 1Shot to upgrade user's EOA to smart account
// Call this on first connect if user's account is not already upgraded

import { createWalletClient, custom } from 'viem'
import { baseSepolia } from 'viem/chains'

async function upgradeToSmartAccount(provider: any) {
  // 1Shot handles EIP-7702 upgrade transaction
  const response = await fetch('https://api.1shot.dev/v1/upgrade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ONESHOT_API_KEY}`
    },
    body: JSON.stringify({
      address: userAddress,
      chain: 'base-sepolia'
    })
  })
  // Returns txHash — wait for confirmation before proceeding
}
```

### 3.2 Grant session key (ERC-7715)
```typescript
// Call after account upgrade, before first stake
// User signs once — all future stakes are gasless

async function grantSessionKey(poolId: string, maxStakeAmount: bigint, stakeDeadline: number) {
  const permission = {
    type: 'erc20-spend',
    token: USDC_ADDRESS,
    allowance: maxStakeAmount.toString(),
    validUntil: stakeDeadline,
    allowedCalls: [{
      contract: PREDICTION_POOL_ADDRESS,
      function: 'stake(bytes32,uint8,uint256)'
    }]
  }

  // MetaMask SDK — wallet_grantPermissions
  const result = await window.ethereum.request({
    method: 'wallet_grantPermissions',
    params: [permission]
  })

  // Store session key context for use in stake()
  return result.sessionKey
}
```

### 3.3 Stake via session key
```typescript
// No popup, no signature — fully silent UX
async function stakeWithSessionKey(
  poolId: string,
  optionId: number,
  amount: bigint,
  sessionKey: SessionKey
) {
  const calldata = encodeFunctionData({
    abi: PREDICTION_POOL_ABI,
    functionName: 'stake',
    args: [poolId, optionId, amount]
  })

  // Route through 1Shot relay using session key
  const response = await fetch('https://api.1shot.dev/v1/relay', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.ONESHOT_API_KEY}` },
    body: JSON.stringify({
      to: PREDICTION_POOL_ADDRESS,
      data: calldata,
      sessionKey: sessionKey,
      chain: 'base-sepolia'
    })
  })

  const { txHash, webhookId } = await response.json()
  return { txHash, webhookId }
}
```

---

## 4. 1Shot API Integration

### 4.1 Relay setup
```typescript
// .env
ONESHOT_API_KEY=...
ONESHOT_WEBHOOK_SECRET=...
PREDICTION_POOL_ADDRESS=...
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e  // Base Sepolia USDC
```

### 4.2 Batch settlement relay
```typescript
// Called by the backend settlement worker after dispute window elapses

async function relayBatchPayout(poolId: string) {
  // 1. Read all winning stakes from contract (or index from events)
  const winners = await computeWinners(poolId)  // { address, amount }[]

  // 2. Encode batchPayout calldata
  const calldata = encodeFunctionData({
    abi: PREDICTION_POOL_ABI,
    functionName: 'batchPayout',
    args: [
      poolId,
      winners.map(w => w.address),
      winners.map(w => w.amount)
    ]
  })

  // 3. Submit via 1Shot — gas paid from protocol fee (USDC)
  const response = await fetch('https://api.1shot.dev/v1/relay', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.ONESHOT_API_KEY}` },
    body: JSON.stringify({
      to: PREDICTION_POOL_ADDRESS,
      data: calldata,
      payGasIn: 'USDC',
      gasTokenSource: 'fee-collector',  // protocol fee covers gas
      chain: 'base-sepolia',
      webhookUrl: `${process.env.APP_URL}/api/webhooks/1shot`
    })
  })

  return response.json()
}
```

### 4.3 Webhook handler
```typescript
// app/api/webhooks/1shot/route.ts

import { verifyWebhookSignature } from '@1shot/sdk'

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('x-1shot-signature')

  if (!verifyWebhookSignature(body, sig, process.env.ONESHOT_WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const event = JSON.parse(body)

  switch (event.type) {
    case 'relay.confirmed':
      await db.pool.update({
        where: { id: event.metadata.poolId },
        data: { status: 'SETTLED', settleTxHash: event.txHash }
      })
      // Push real-time update to connected clients via SSE or WebSocket
      await broadcastSettlement(event.metadata.poolId, event.txHash)
      break

    case 'relay.failed':
      await alertOpsTeam(event)
      // Retry logic here
      break
  }

  return new Response('OK')
}
```

---

## 5. Venice AI Oracle Agent

### 5.1 Agent architecture
```
The oracle is a Node.js worker process that:
  1. Polls for pools in LOCKED status past resolutionDeadline
  2. Calls Venice AI text model with structured resolution prompt
  3. Signs the verdict with the oracle's private key
  4. Submits verdict to PredictionPool.submitVerdict()
  5. Handles re-queries if a dispute is raised
```

### 5.2 Venice AI resolution prompt
```typescript
// oracle/resolvePool.ts

async function buildResolutionPrompt(pool: Pool, evidence: Evidence[]): string {
  return `
You are a neutral prediction market resolution oracle.
Your job is to determine the correct outcome of a prediction.
You must reason carefully, cite your evidence, and return ONLY valid JSON.

PREDICTION: "${pool.question}"

OPTIONS:
${pool.options.map((o, i) => `  ${i}: "${o}"`).join('\n')}

EVIDENCE:
${evidence.map(e => `[${e.source}] ${e.content}`).join('\n\n')}

RESOLUTION RULES:
- Choose the option that most accurately reflects verified facts
- If evidence is insufficient or contradictory, set status to "UNRESOLVABLE"
- Do not choose based on market sentiment or stake distribution
- Cite at least 2 independent sources for your decision

Return ONLY this JSON object, no preamble, no markdown:
{
  "winningOptionId": <number or null>,
  "winningOption": "<string or null>",
  "status": "RESOLVED" | "UNRESOLVABLE",
  "confidence": <0.0–1.0>,
  "reasoning": "<2–3 sentences>",
  "sources": ["<url or description>"],
  "resolvedAt": "<ISO 8601 timestamp>"
}
`
}

async function callVeniceOracle(prompt: string): Promise<VerdictJSON> {
  const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VENICE_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b',   // or venice-uncensored
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,          // low temp for deterministic resolution
      max_tokens: 512
    })
  })

  const data = await response.json()
  const raw = data.choices[0].message.content
  return JSON.parse(raw)
}
```

### 5.3 Oracle worker loop
```typescript
// oracle/worker.ts

import { privateKeyToAccount } from 'viem/accounts'
import { keccak256, toBytes } from 'viem'

const oracleAccount = privateKeyToAccount(process.env.ORACLE_PRIVATE_KEY)

async function runOracleWorker() {
  while (true) {
    const lockedPools = await fetchLockedPools()

    for (const pool of lockedPools) {
      try {
        // 1. Gather evidence (news APIs, price feeds, on-chain data)
        const evidence = await gatherEvidence(pool.question, pool.options)

        // 2. Call Venice AI
        const prompt = await buildResolutionPrompt(pool, evidence)
        const verdict = await callVeniceOracle(prompt)

        if (verdict.status === 'UNRESOLVABLE') {
          await handleUnresolvable(pool.id)
          continue
        }

        // 3. Hash the verdict
        const verdictJson = JSON.stringify(verdict)
        const verdictHash = keccak256(toBytes(verdictJson))

        // 4. Sign with oracle wallet
        const signature = await oracleAccount.signMessage({
          message: { raw: verdictHash }
        })

        // 5. Submit to contract via 1Shot
        await submitVerdictOnChain({
          poolId: pool.id,
          winningOption: verdict.winningOptionId,
          verdictHash,
          signature
        })

        // 6. Store full verdict JSON off-chain (IPFS or DB) for dispute reference
        await storeVerdictJson(pool.id, verdictJson)

      } catch (err) {
        console.error(`Oracle failed for pool ${pool.id}:`, err)
      }
    }

    await sleep(60_000)  // poll every 60 seconds
  }
}
```

---

## 6. x402 Premium Analysis Gate

### 6.1 What's gated
Users pay a micropayment (e.g. 0.50 USDC) to unlock a Venice AI analysis report
for any pool before they stake. The report includes:
- Implied probability per option (derived from current stake distribution)
- Venice AI sentiment analysis of the question
- Historical base rate for similar predictions
- Risk score and recommended max stake size

### 6.2 x402 payment flow
```typescript
// app/api/analysis/[poolId]/route.ts

import { createPaymentRequired, verifyPayment } from '@x402/server'

export async function GET(req: Request, { params }: { params: { poolId: string } }) {
  // 1. Check for x402 payment header
  const paymentHeader = req.headers.get('X-Payment')

  if (!paymentHeader) {
    // Return 402 with payment requirements
    return createPaymentRequired({
      price: '0.50',
      token: USDC_ADDRESS,
      payTo: FEE_COLLECTOR_ADDRESS,
      chain: 'base-sepolia',
      description: `AI analysis for pool ${params.poolId}`
    })
  }

  // 2. Verify payment on-chain via ERC-7710 delegation
  const valid = await verifyPayment(paymentHeader, {
    expectedAmount: '0.50',
    expectedToken: USDC_ADDRESS,
    expectedRecipient: FEE_COLLECTOR_ADDRESS
  })

  if (!valid) return new Response('Invalid payment', { status: 402 })

  // 3. Generate and return Venice AI report
  const pool = await getPool(params.poolId)
  const report = await generateAnalysisReport(pool)
  return Response.json(report)
}
```

### 6.3 Analysis report generation
```typescript
async function generateAnalysisReport(pool: Pool): AnalysisReport {
  const stakes = await getPoolStakes(pool.id)
  const totalStaked = stakes.reduce((s, x) => s + x.amount, 0n)

  // Implied probabilities from stake distribution
  const impliedProbs = pool.options.map((opt, i) => ({
    option: opt,
    impliedProbability: Number(optionTotals[i] * 100n / totalStaked) / 100,
    totalStaked: optionTotals[i]
  }))

  // Venice AI sentiment + base rate
  const prompt = buildAnalysisPrompt(pool, impliedProbs)
  const analysis = await callVeniceOracle(prompt)

  return {
    poolId: pool.id,
    impliedProbabilities: impliedProbs,
    veniceAnalysis: analysis,
    generatedAt: new Date().toISOString()
  }
}
```

---

## 7. Backend API Routes

```
POST   /api/pools                    Create a new pool
GET    /api/pools                    List open pools (paginated, filterable)
GET    /api/pools/:id                Get pool detail + live stake totals
POST   /api/pools/:id/stake          Relay stake via 1Shot session key
GET    /api/pools/:id/analysis       Venice AI report (x402 gated)
POST   /api/pools/:id/dispute        Raise a dispute
POST   /api/webhooks/1shot           1Shot settlement webhook
POST   /api/webhooks/oracle          Oracle verdict submission callback

GET    /api/user/:address/positions  All pools + stakes for a wallet
GET    /api/user/:address/history    Settled pools + payout history
```

---

## 8. Database Schema (Postgres + Prisma)

```prisma
model Pool {
  id                  String   @id   // bytes32 hex
  question            String
  options             String[]
  stakeDeadline       DateTime
  resolutionDeadline  DateTime
  disputeWindowSecs   Int
  feeBps              Int
  status              PoolStatus @default(OPEN)
  winningOptionId     Int?
  verdictHash         String?
  verdictJson         String?        // stored off-chain for transparency
  settleTxHash        String?
  totalPool           BigInt   @default(0)
  creatorAddress      String
  createdAt           DateTime @default(now())
  stakes              Stake[]
}

model Stake {
  id          String   @id @default(cuid())
  poolId      String
  pool        Pool     @relation(fields: [poolId], references: [id])
  staker      String   // wallet address
  optionId    Int
  amount      BigInt
  txHash      String
  createdAt   DateTime @default(now())
  payout      BigInt?
  payoutTxHash String?
}

enum PoolStatus {
  OPEN
  LOCKED
  RESOLVED
  DISPUTED
  SETTLED
  UNRESOLVABLE
}
```

---

## 9. Build Order (Hackathon Timeline)

### Hour 1–2: Scaffold
```bash
npx hardhat init
npm create next-app@latest frontend -- --app --typescript --tailwind
npm install viem wagmi @wagmi/connectors
```

### Hour 3–5: Smart contracts
1. Write PredictionPool.sol with createPool + stake + lockPool
2. Write OracleVerifier.sol
3. Deploy to Base Sepolia via Hardhat
4. Write and run unit tests for payout math
5. Add submitVerdict + batchPayout + settle

### Hour 6–8: 1Shot + MetaMask integration
1. Implement account upgrade (EIP-7702) flow
2. Implement session key grant (ERC-7715)
3. Wire stakeWithSessionKey through 1Shot relay
4. Implement webhook handler
5. Wire batchPayout relay + settlement trigger

### Hour 9–11: Venice AI oracle
1. Build oracle worker (Node.js)
2. Implement evidence gathering (price feed API + news API)
3. Write resolution prompt + test against Venice
4. Wire submitVerdict flow
5. Implement dispute re-query logic

### Hour 12–14: Frontend core
1. Wallet connect + account upgrade UI
2. Pool list page
3. Pool detail + stake UI
4. Live stake totals (event polling)
5. Payout status + history

### Hour 15–16: x402 + polish
1. Gate analysis endpoint with x402
2. Wire frontend to call and display report
3. Demo scenario: create pool → stake → lock → oracle resolve → settle

### Hour 17: Demo prep
1. Record 3-minute demo video
2. Deploy contracts to Base Sepolia (permanent)
3. Seed 2–3 real pools for judges to interact with

---

## 10. Environment Variables

```bash
# Contracts
NEXT_PUBLIC_PREDICTION_POOL_ADDRESS=
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NEXT_PUBLIC_CHAIN_ID=84532  # Base Sepolia

# 1Shot
ONESHOT_API_KEY=
ONESHOT_WEBHOOK_SECRET=

# Venice AI
VENICE_API_KEY=

# Oracle
ORACLE_PRIVATE_KEY=   # separate wallet from deployer
ORACLE_ADDRESS=       # derived from above, registered in OracleVerifier

# Database
DATABASE_URL=

# App
NEXT_PUBLIC_APP_URL=
APP_URL=
```

---

## 11. Key Edge Cases to Handle

1. **All stakers on one side** — if no one stakes the other options, the pool
   is unresolvable. Refund all stakers minus gas.

2. **Oracle timeout** — if resolutionDeadline passes with no verdict, open
   a manual resolution fallback (multisig admin) or auto-refund.

3. **Dispute loop** — cap disputes at 2 rounds. If second Venice verdict
   contradicts first, escalate to multisig.

4. **Late stake snipe** — stakeDeadline must close at least 1 hour before
   resolutionDeadline. Enforce in createPool().

5. **Rounding dust** — payout math uses integer division. Remainder goes to
   FeeCollector, never lost.

6. **1Shot relay failure** — store all settlement calls in DB, retry with
   exponential backoff. Emit PayoutPending event if relay fails so stakers
   can self-claim.

7. **Venice AI refusal** — if Venice refuses to answer (content policy),
   fall back to secondary model call with a more neutral prompt framing.
```
