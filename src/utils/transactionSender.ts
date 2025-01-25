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
};

const SEND_OPTIONS = {
  skipPreflight: true,
};

const MAX_PROCESS_DURATION_MS = 60000; // 60 seconds

export async function transactionSenderAndConfirmationWaiter({
  connection,
  serializedTransaction,
  blockhashWithExpiryBlockHeight,
}: TransactionSenderAndConfirmationWaiterArgs): Promise<VersionedTransactionResponse | null> {
  const txid = await connection.sendRawTransaction(
    serializedTransaction,
    SEND_OPTIONS
  );

  const controller = new AbortController();
  const abortSignal = controller.signal;

  const startTime = Date.now(); // Start the global process timer

  try {
    // Check if the transaction is immediately confirmed
    const immediateConfirmation = await connection.confirmTransaction(
      {
        ...blockhashWithExpiryBlockHeight,
        signature: txid,
      },
      "finalized"
    );

    if (immediateConfirmation.value.err) {
      console.error("Transaction failed immediately:", immediateConfirmation.value.err);
      return null;
    }

    // If the transaction is immediately confirmed, return the response
    const response = await connection.getTransaction(txid, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });

    if (response) {
      return response;
    }

    // If the transaction is not immediately confirmed, start retrying
    const abortableResender = async () => {
      while (true) {
        await sleep(2_000);
        if (abortSignal.aborted) return;
        try {
          await connection.sendRawTransaction(serializedTransaction, SEND_OPTIONS);
        } catch (e) {
          console.warn(`Failed to resend transaction: ${e}`);
        }
      }
    };

    abortableResender();

    const lastValidBlockHeight =
      blockhashWithExpiryBlockHeight.lastValidBlockHeight - 150;

    await Promise.race([
      connection.confirmTransaction(
        {
          ...blockhashWithExpiryBlockHeight,
          lastValidBlockHeight,
          signature: txid,
          abortSignal,
        },
        "finalized"
      ),
      new Promise(async (resolve) => {
        while (!abortSignal.aborted) {
          await sleep(5_000);
          const elapsedTime = Date.now() - startTime;
          if (elapsedTime > MAX_PROCESS_DURATION_MS) {
            console.warn("Total process time exceeded");
            break; // Stop the loop if the maximum duration is reached
          }
          const tx = await connection.getSignatureStatus(txid, {
            searchTransactionHistory: false,
          });
          if (tx?.value?.confirmationStatus === "finalized") {
            resolve(tx);
            break; // Stop the loop if the transaction is finalized
          }
        }
      }),
    ]);
  } catch (e) {
    if (e instanceof TransactionExpiredBlockheightExceededError) {
      return null; // Return null if the transaction has expired
    } else {
      throw e; // Throw an exception for other errors
    }
  } finally {
    controller.abort();
  }

  // Retrieve the final response after confirmation
  const response = await promiseRetry(
    async (retry) => {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_PROCESS_DURATION_MS) {
        throw new Error("Maximum process duration exceeded during retry");
      }
      const response = await connection.getTransaction(txid, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      });
      if (!response) {
        retry(response);
      }
      return response;
    },
    {
      retries: 5,
      minTimeout: 3e3,
    }
  );

  return response;
}