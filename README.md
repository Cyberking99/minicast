# MiniCast 🔮

<p align="center">
  <img src="logo.png" alt="MiniCast Logo" width="300" />
</p>

MiniCast is a decentralized, mobile-first parimutuel prediction pool platform optimized for the **Celo Sepolia** network and **Opera MiniPay** mobile ecosystem. Users stake USDC stablecoins on different outcome options for real-world questions, and the winning side shares the losing pool proportionally to their stake.

The platform provides a native mobile-app-like experience by combining **Zero-Click Wallet Auto-Connection**, **CIP-64 Stablecoin Fee Abstraction** (network fees paid directly in USDC), **Venice AI** autonomous resolution oracle, and the **x402 Protocol** for monetized AI reports.

---

## 🚀 Deployed Contracts (Celo Sepolia)

- **USDC Address**: `0x01C5C0122039549AD1493B8220cABEdD739BC44E`
- **PredictionPool**: `0x807203F9b5bab0cd65fB94Db89728075d9E5Fe84`

---

## 🚀 Key Features & Tech Stack

- **Solidity Smart Contracts (Celo Sepolia)**: Parimutuel pool logic and oracle verification (`OracleVerifier.sol`).
- **Opera MiniPay Compatibility**: Detects the MiniPay webview environment (`window.ethereum.isMiniPay`) and auto-connects the user's browser-injected wallet instantly, bypassing manual click requirements.
- **CIP-64 Fee Currency Abstraction**: Leverages Celo's native gas abstraction. Stakers pay transaction network fees directly in **USDC** (using `feeCurrency` transaction parameters) rather than requiring native CELO.
- **Venice AI Oracle**: An autonomous oracle agent (`oracle/`) that queries locked prediction pools, retrieves web evidence, and queries Venice AI's private `llama-3.3-70b` model to submit deterministic verdicts on-chain.
- **x402 Protocol**: Micropayment gating that allows users to pay $0.50 USDC on-chain to unlock a comprehensive Venice AI confidence and risk analysis report.
- **Brutalist Mobile-First UI**: Next.js 14 frontend optimized for a native look on MiniPay's **360×640 viewport**, complete with a fixed bottom navigation bar and horizontal scroll tabs.

---

## 📁 Repository Structure

```
├── contracts/             # Hardhat smart contract workspace
│   ├── src/               # Solidity contract files (PredictionPool, OracleVerifier, etc.)
│   ├── test/              # Hardhat network unit tests
│   └── hardhat.config.ts  # Celo Sepolia & localhost network configurations
├── frontend/              # Next.js 14 App Router workspace
│   ├── src/app/           # Page routes, API handlers, and styles
│   ├── src/features/      # Staking, confidence analysis, and pool cards
│   └── src/shared/        # Shared UI components and Wagmi/Viem configuration
├── oracle/                # Venice AI Oracle worker service
│   ├── src/resolvePool.ts # Venice AI resolution prompting and API client
│   └── src/worker.ts      # Polling loops and oracle signing
├── docs/                  # Technical design specs and implementation plans
└── prototype-design/      # High-fidelity static HTML/CSS mockup gallery
```

---

## 🛠️ Getting Started

### 1. Installation

Install dependencies for all workspaces from the project root:

```bash
npm install
```

---

### 2. Environment Configuration

Create a `.env` file in the root directory (or copy `.env.example`) and fill in your variables:

```bash
# Core Networks
NEXT_PUBLIC_CHAIN_ID=11142220 # Celo Sepolia (use 31337 for local Hardhat node)
DEPLOYER_PRIVATE_KEY=your_deployer_private_key
CELO_SEPOLIA_RPC_URL=https://forno.celo-sepolia.celo-testnet.org

# Deployed Addresses (Celo Sepolia)
NEXT_PUBLIC_USDC_ADDRESS=0x01C5C0122039549AD1493B8220cABEdD739BC44E
NEXT_PUBLIC_PREDICTION_POOL_ADDRESS=0x807203F9b5bab0cd65fB94Db89728075d9E5Fe84

# Oracles & APIs
ORACLE_ADDRESS=your_oracle_signer_address
ORACLE_PRIVATE_KEY=your_oracle_private_key
VENICE_API_KEY=your_venice_api_key
DATABASE_URL=postgresql://user:pass@localhost:5432/forecaster
```

---

### 3. Deploying & Testing Smart Contracts

#### Running tests locally on Hardhat Network:
```bash
npm run test:contracts
```

#### Deploying Contracts locally (Hardhat Node):
1. **Start the Local Hardhat Node**:
   ```bash
   npx -w contracts hardhat node
   ```
2. **Deploy the Contracts** (in a new terminal):
   ```bash
   npx -w contracts hardhat run scripts/deploy.ts --network localhost
   ```

#### Deploying to Celo Sepolia:
```bash
npx -w contracts hardhat run scripts/deploy.ts --network celoSepolia
```

---

### 4. Running the Venice AI Oracle Agent

Start the oracle worker that polls for locked pools and resolves them using Venice AI:

```bash
npm run dev:oracle
```

---

### 5. Running the Frontend

Start the Next.js development server:

```bash
npm run dev
```

The web app will be accessible at [http://localhost:3000](http://localhost:3000).

---

### 6. Building for Production

Compile and build the Next.js bundle:

```bash
npm run build
```

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
