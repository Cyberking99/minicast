import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, toBytes, createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import httpModule from 'http';
import { gatherEvidence, buildResolutionPrompt, callVeniceOracle } from './resolvePool.js';
import type { Pool } from './resolvePool.js';
import { parseAbi } from 'viem';

export const PREDICTION_POOL_ABI = parseAbi([
  'event PoolCreated(bytes32 indexed poolId, string question, string[] options, uint256 stakeDeadline)',
  'function pools(bytes32 poolId) external view returns (bytes32 id, string question, uint256 stakeDeadline, uint256 resolutionDeadline, uint256 disputeWindow, uint256 resolvedAt, uint8 winningOption, uint8 status, uint256 totalPool, uint256 protocolFeeBps, address creator, bytes32 verdictHash, uint8 verdictCount)',
  'function getPoolOptions(bytes32 poolId) external view returns (string[])',
  'function lockPool(bytes32 poolId) external',
  'function submitVerdict(bytes32 poolId, uint8 winningOption, bytes32 verdictHash, bytes signature) external'
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY as `0x${string}`;
const PREDICTION_POOL_ADDRESS = process.env.NEXT_PUBLIC_PREDICTION_POOL_ADDRESS as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org';

if (!ORACLE_PRIVATE_KEY) {
  console.error("FATAL ERROR: ORACLE_PRIVATE_KEY is not configured in .env");
  process.exit(1);
}

if (!PREDICTION_POOL_ADDRESS) {
  console.error("FATAL ERROR: NEXT_PUBLIC_PREDICTION_POOL_ADDRESS is not configured in .env");
  process.exit(1);
}

const oracleAccount = privateKeyToAccount(ORACLE_PRIVATE_KEY);
console.log(`Oracle Worker Started. Oracle Address: ${oracleAccount.address}`);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
  account: oracleAccount,
});

// Render free tier compatibility (HTTP Health Check Web Server)
const PORT = process.env.PORT || 8080;
const server = httpModule.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Oracle Worker health check OK\n');
});
server.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

async function fetchLockedPools(): Promise<Pool[]> {
  console.log("Checking for locked pools ready for resolution on-chain...");
  try {
    const latestBlock = await publicClient.getBlockNumber();
    
    // Deployed block for PredictionPool on Base Sepolia
    const deployedBlock = 42799516n;
    const startBlock = latestBlock > deployedBlock ? deployedBlock : 0n;

    const batchSize = 2000n;
    const promises = [];

    for (let from = startBlock; from <= latestBlock; from += batchSize) {
      const to = from + batchSize - 1n > latestBlock ? latestBlock : from + batchSize - 1n;
      promises.push(
        publicClient.getContractEvents({
          address: PREDICTION_POOL_ADDRESS,
          abi: PREDICTION_POOL_ABI,
          eventName: 'PoolCreated',
          fromBlock: from,
          toBlock: to,
        }).catch(err => {
          console.warn(`Failed to fetch events from ${from} to ${to}:`, err);
          return [];
        })
      );
    }

    const results = await Promise.all(promises);
    const logs = results.flat();
    const poolIds = logs.map(log => log.args.poolId).filter(Boolean) as `0x${string}`[];
    console.log(`Found ${poolIds.length} pools on-chain in the query window. Checking statuses...`);

    const lockedPools: Pool[] = [];

    for (const poolId of poolIds) {
      // Fetch pool details
      // pools(bytes32) returns (bytes32 id, string question, uint256 stakeDeadline, uint256 resolutionDeadline, uint256 disputeWindow, uint256 feeBps, uint256 totalStaked, PoolStatus status, uint256 resolvedAt, uint8 winningOption, bytes32 verdictHash, uint8 verdictCount)
      const poolData = await publicClient.readContract({
        address: PREDICTION_POOL_ADDRESS,
        abi: PREDICTION_POOL_ABI,
        functionName: 'pools',
        args: [poolId],
      }) as unknown as any[];

      // PoolStatus enum is: 0: OPEN, 1: LOCKED, 2: RESOLVED, 3: SETTLED
      let status = poolData[7] as number;
      const question = poolData[1] as string;
      const stakeDeadline = poolData[2] as bigint;

      const nowSec = BigInt(Math.floor(Date.now() / 1000));

      if (status === 0 && nowSec >= stakeDeadline) {
        console.log(`Pool ${poolId} ("${question}") is past its staking deadline but still OPEN. Auto-locking now...`);
        try {
          const hash = await walletClient.writeContract({
            address: PREDICTION_POOL_ADDRESS,
            abi: PREDICTION_POOL_ABI,
            functionName: 'lockPool',
            args: [poolId],
          });
          console.log(`Lock transaction sent: ${hash}. Waiting for block confirmation...`);
          await publicClient.waitForTransactionReceipt({ hash });
          console.log(`Pool ${poolId} locked successfully.`);
          
          // Re-fetch pool status after locking
          status = 1;
        } catch (err) {
          console.error(`Failed to lock pool ${poolId}:`, err);
        }
      }

      if (status === 1) { // LOCKED
        console.log(`Pool ${poolId} ("${question}") is LOCKED. Fetching options...`);
        const options = await publicClient.readContract({
          address: PREDICTION_POOL_ADDRESS,
          abi: PREDICTION_POOL_ABI,
          functionName: 'getPoolOptions',
          args: [poolId],
        }) as string[];

        lockedPools.push({
          id: poolId,
          question,
          options,
        });
      }
    }

    return lockedPools;
  } catch (err) {
    console.error("Error fetching locked pools from blockchain:", err);
    return [];
  }
}

async function handleUnresolvable(poolId: string) {
  console.log(`Pool ${poolId} marked as UNRESOLVABLE by AI.`);
}

async function submitVerdictOnChain(params: {
  poolId: `0x${string}`;
  winningOption: number;
  verdictHash: `0x${string}`;
  signature: `0x${string}`;
}) {
  console.log(`Broadcasting submitVerdict transaction for pool ${params.poolId}...`);
  try {
    const { request } = await publicClient.simulateContract({
      address: PREDICTION_POOL_ADDRESS,
      abi: PREDICTION_POOL_ABI,
      functionName: 'submitVerdict',
      args: [params.poolId, params.winningOption, params.verdictHash, params.signature],
      account: oracleAccount,
    });

    const hash = await walletClient.writeContract(request);
    console.log(`Transaction submitted! Hash: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Verdict confirmed on-chain in block ${receipt.blockNumber}!`);
  } catch (err) {
    console.error(`Failed to submit verdict on-chain for pool ${params.poolId}:`, err);
  }
}

async function storeVerdictJson(poolId: string, verdictJson: string, verdictHash: string, winningOptionId: number) {
  console.log(`Storing verdict JSON for pool ${poolId} to off-chain storage...`);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const webhookSecret = process.env.ORACLE_WEBHOOK_SECRET || '';

  try {
    const res = await fetch(`${appUrl}/api/webhooks/oracle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { 'Authorization': `Bearer ${webhookSecret}` } : {}),
      },
      body: JSON.stringify({
        poolId,
        verdictJson,
        verdictHash,
        winningOptionId,
      }),
    });

    if (res.ok) {
      console.log(`✅ Successfully stored verdict JSON via webhook for pool ${poolId}`);
    } else {
      const text = await res.text();
      console.warn(`Failed to store verdict JSON via webhook: ${res.status} - ${text}`);
    }
  } catch (err) {
    console.error("Error calling oracle webhook:", err);
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runOracleWorker() {
  while (true) {
    try {
      const lockedPools = await fetchLockedPools();

      if (lockedPools.length === 0) {
        console.log("No locked pools found. Sleeping for 15 seconds...");
        await sleep(15000);
        continue;
      }

      for (const pool of lockedPools) {
        try {
          console.log(`Starting resolution workflow for pool: "${pool.question}" (${pool.id})`);

          // 1. Gather evidence
          const evidence = await gatherEvidence(pool.question, pool.options);

          // 2. Call Venice AI (Mocked if API key missing)
          const prompt = await buildResolutionPrompt(pool, evidence);
          let verdict;
          
          if (process.env.VENICE_API_KEY) {
            verdict = await callVeniceOracle(prompt);
          } else {
            console.log("Mocking Venice AI response (No VENICE_API_KEY)");
            verdict = {
              winningOptionId: 0,
              winningOption: pool.options[0],
              status: "RESOLVED",
              confidence: 0.85,
              reasoning: "Real Madrid won the match as per general consensus statistics.",
              sources: ["UEFA.com"],
              resolvedAt: new Date().toISOString()
            };
          }

          if (verdict.status === 'UNRESOLVABLE' || verdict.winningOptionId === null) {
            await handleUnresolvable(pool.id);
            continue;
          }

          // 3. Hash the verdict
          const verdictJson = JSON.stringify(verdict);
          const verdictHash = keccak256(toBytes(verdictJson));

          // 4. Sign with oracle wallet
          const signature = await oracleAccount.signMessage({
            message: { raw: verdictHash }
          });

          // 5. Submit to contract
          await submitVerdictOnChain({
            poolId: pool.id as `0x${string}`,
            winningOption: verdict.winningOptionId,
            verdictHash,
            signature
          });

          // 6. Store full verdict JSON off-chain
          await storeVerdictJson(pool.id, verdictJson, verdictHash, verdict.winningOptionId);

        } catch (err) {
          console.error(`Oracle failed for pool ${pool.id}:`, err);
        }
      }
    } catch (e) {
      console.error("Worker loop error:", e);
    }

    console.log("Resolution pass complete. Sleeping for 15 seconds...");
    await sleep(15000);
  }
}

// Start the worker
runOracleWorker().catch(console.error);
