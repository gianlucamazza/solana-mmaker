import dotenv from "dotenv";
import { JupiterClient } from "./api/jupiter.js";
import { setupSolanaConnection } from "./api/solana.js";
import { MarketMaker, MarketMakerConfig } from "./strategies/basicMM.js";
import { loadKeypair } from "./wallet.js";

/**
 * Parse an optional numeric environment variable, throwing on malformed values.
 */
function parseNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`${name} must be a number, got "${raw}"`);
  }
  return value;
}

async function main() {
  dotenv.config();

  if (!process.env.SOLANA_RPC_ENDPOINT) {
    throw new Error("SOLANA_RPC_ENDPOINT is not set");
  }

  if (!process.env.USER_KEYPAIR && !process.env.SOLANA_MNEMONIC) {
    console.warn(
      "Neither USER_KEYPAIR nor SOLANA_MNEMONIC is set; falling back to ~/.config/solana/id.json",
    );
  }

  if (!process.env.ENABLE_TRADING) {
    console.warn("ENABLE_TRADING is not set. Defaulting to false");
  }

  const rpc = setupSolanaConnection(process.env.SOLANA_RPC_ENDPOINT);
  console.log(`Network: ${process.env.SOLANA_RPC_ENDPOINT}`);
  const signer = await loadKeypair();
  console.log("MarketMaker PubKey:", signer.address);

  const priorityFees = parseNumberEnv("MM_PRIORITY_FEE_LAMPORTS") ?? 200000;
  if (!Number.isInteger(priorityFees) || priorityFees < 0) {
    throw new Error(
      `MM_PRIORITY_FEE_LAMPORTS must be a non-negative integer, got ${priorityFees}`,
    );
  }
  const jupiterClient = new JupiterClient(
    rpc,
    signer,
    process.env.JUPITER_API_BASE_URL,
    {
      priorityFees,
      skipPreflight: process.env.MM_SKIP_PREFLIGHT === "true",
    },
  );

  const enabled = process.env.ENABLE_TRADING === "true";
  const config: MarketMakerConfig = {
    waitTime: parseNumberEnv("MM_WAIT_TIME_MS"),
    slippageBps: parseNumberEnv("MM_SLIPPAGE_BPS"),
    priceTolerance: parseNumberEnv("MM_PRICE_TOLERANCE"),
    rebalancePercentage: parseNumberEnv("MM_REBALANCE_PERCENTAGE"),
    minimumTradeValueUsd: parseNumberEnv("MM_MINIMUM_TRADE_VALUE_USD"),
  };
  const marketMaker = new MarketMaker(config);

  // Graceful shutdown: stop the run loop after the current cycle.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      console.log(`Received ${signal}, shutting down...`);
      marketMaker.stop();
    });
  }

  await marketMaker.runMM(jupiterClient, enabled);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
