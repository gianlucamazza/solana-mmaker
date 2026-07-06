import promiseRetry from "promise-retry";
import type { Base64EncodedWireTransaction, Signature } from "@solana/kit";
import type { SolanaRpc } from "../api/solana.js";
import { sleep } from "./sleep.js";

type TransactionSenderAndConfirmationWaiterArgs = {
  rpc: SolanaRpc;
  /** The signed transaction, base64-encoded (kit wire format). */
  base64Transaction: Base64EncodedWireTransaction;
  /** Its signature, used to poll for confirmation. */
  signature: Signature;
  /** Last block height at which the transaction's blockhash is still valid. */
  lastValidBlockHeight: bigint;
  /** Skip RPC preflight simulation. Default false = simulate before broadcast. */
  skipPreflight?: boolean;
};

// 'finalized' can take 30s+ and regularly overruns the process timeout,
// producing false "expired" results for transactions that actually landed.
const CONFIRMATION_COMMITMENT = "confirmed" as const;
const MAX_PROCESS_DURATION_MS = 60000;
const RESEND_INTERVAL_MS = 2000;
const STATUS_POLL_INTERVAL_MS = 5000;

/**
 * Sends a signed transaction, keeps re-broadcasting it until it is confirmed or
 * its blockhash expires, and returns the confirmed transaction (or null when the
 * transaction expired / could not be found in time).
 *
 * HTTP-only: confirmation is polled via getSignatureStatuses and expiry is
 * detected by comparing the current block height with the transaction's last
 * valid block height — no RPC WebSocket subscription is required.
 */
export async function transactionSenderAndConfirmationWaiter({
  rpc,
  base64Transaction,
  signature,
  lastValidBlockHeight,
  skipPreflight = false,
}: TransactionSenderAndConfirmationWaiterArgs) {
  const sendConfig = {
    encoding: "base64" as const,
    skipPreflight,
    preflightCommitment: CONFIRMATION_COMMITMENT,
    // Disable node-side retries; we re-broadcast ourselves below.
    maxRetries: 0n,
  };

  await rpc.sendTransaction(base64Transaction, sendConfig).send();

  const controller = new AbortController();
  const startTime = Date.now();

  // Periodically re-broadcast until confirmed or aborted; RPC nodes drop
  // transactions under load, so a single send is not reliable.
  const resender = (async () => {
    while (!controller.signal.aborted) {
      await sleep(RESEND_INTERVAL_MS);
      if (controller.signal.aborted) return;
      try {
        await rpc.sendTransaction(base64Transaction, sendConfig).send();
      } catch (e) {
        console.warn(`Failed to resend transaction: ${e}`);
      }
    }
  })();
  resender.catch((e) => console.warn(`Transaction resender stopped: ${e}`));

  try {
    while (!controller.signal.aborted) {
      await sleep(STATUS_POLL_INTERVAL_MS);

      const { value } = await rpc
        .getSignatureStatuses([signature], { searchTransactionHistory: false })
        .send();
      const confirmationStatus = value[0]?.confirmationStatus;
      if (
        confirmationStatus === "confirmed" ||
        confirmationStatus === "finalized"
      ) {
        break;
      }

      // Expiry: once the network is past the blockhash's last valid height and the
      // transaction still is not confirmed, it can never land — give up.
      const blockHeight = await rpc.getBlockHeight().send();
      if (blockHeight > lastValidBlockHeight) {
        console.warn(
          "Transaction expired (block height exceeded last valid block height)",
        );
        return null;
      }

      if (Date.now() - startTime > MAX_PROCESS_DURATION_MS) {
        // Timed out waiting for confirmation; fall through and try to fetch the
        // transaction anyway — it may have landed between polls.
        console.warn("Transaction confirmation timed out");
        break;
      }
    }
  } finally {
    controller.abort();
  }

  // getTransaction can lag confirmation, so retry a few times before giving up.
  const response = await promiseRetry(
    async (retry) => {
      const tx = await rpc
        .getTransaction(signature, {
          commitment: CONFIRMATION_COMMITMENT,
          maxSupportedTransactionVersion: 0,
          encoding: "base64",
        })
        .send();
      if (!tx) {
        retry(new Error(`Transaction ${signature} not found yet`));
      }
      return tx;
    },
    {
      retries: 5,
      minTimeout: 3e3,
    },
  ).catch(() => null);

  return response;
}
