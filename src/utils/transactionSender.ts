import {
  BlockhashWithExpiryBlockHeight,
  Connection,
  TransactionExpiredBlockheightExceededError,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import promiseRetry from "promise-retry";
import { sleep } from "./sleep";

type TransactionSenderAndConfirmationWaiterArgs = {
  connection: Connection;
  serializedTransaction: Buffer;
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight;
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
 * Sends a serialized transaction, keeps re-broadcasting it until it is
 * confirmed or expires, and returns the confirmed transaction (or null when
 * the transaction expired / could not be confirmed in time).
 */
export async function transactionSenderAndConfirmationWaiter({
  connection,
  serializedTransaction,
  blockhashWithExpiryBlockHeight,
  skipPreflight = false,
}: TransactionSenderAndConfirmationWaiterArgs): Promise<VersionedTransactionResponse | null> {
  const sendOptions = { skipPreflight };
  const txid = await connection.sendRawTransaction(
    serializedTransaction,
    sendOptions
  );

  const controller = new AbortController();
  const abortSignal = controller.signal;
  const startTime = Date.now();

  try {
    // Periodically re-broadcast until confirmed or aborted; RPC nodes drop
    // transactions under load, so a single send is not reliable.
    const abortableResender = async () => {
      while (!abortSignal.aborted) {
        await sleep(RESEND_INTERVAL_MS);
        if (abortSignal.aborted) return;
        try {
          await connection.sendRawTransaction(serializedTransaction, sendOptions);
        } catch (e) {
          console.warn(`Failed to resend transaction: ${e}`);
        }
      }
    };

    abortableResender().catch((e) => console.warn(`Transaction resender stopped: ${e}`));

    await Promise.race([
      connection.confirmTransaction(
        {
          ...blockhashWithExpiryBlockHeight,
          signature: txid,
          abortSignal,
        },
        CONFIRMATION_COMMITMENT
      ),
      (async () => {
        // Backstop poller: settles the race on timeout even if
        // confirmTransaction hangs (e.g. websocket issues).
        while (!abortSignal.aborted) {
          await sleep(STATUS_POLL_INTERVAL_MS);
          if (Date.now() - startTime > MAX_PROCESS_DURATION_MS) {
            console.warn("Transaction confirmation timed out");
            return;
          }
          const status = await connection.getSignatureStatus(txid, {
            searchTransactionHistory: false,
          });
          const confirmationStatus = status?.value?.confirmationStatus;
          if (confirmationStatus === "confirmed" || confirmationStatus === "finalized") {
            return;
          }
        }
      })(),
    ]);
  } catch (e) {
    if (e instanceof TransactionExpiredBlockheightExceededError) {
      return null;
    }
    throw e;
  } finally {
    controller.abort();
  }

  // getTransaction can lag confirmation, so retry a few times before giving up.
  const response = await promiseRetry(
    async (retry) => {
      const tx = await connection.getTransaction(txid, {
        commitment: CONFIRMATION_COMMITMENT,
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) {
        retry(new Error(`Transaction ${txid} not found yet`));
      }
      return tx;
    },
    {
      retries: 5,
      minTimeout: 3e3,
    }
  ).catch(() => null);

  return response;
}
