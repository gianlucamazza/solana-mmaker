import {
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionDecoder,
  signTransaction,
  type KeyPairSigner,
} from "@solana/kit";
import promiseRetry from "promise-retry";
import { transactionSenderAndConfirmationWaiter } from "../utils/transactionSender.js";
import type { SolanaRpc } from "./solana.js";

// Jupiter deprecated the legacy `quote-api.jup.ag/v6` host; the current free
// endpoint is `lite-api.jup.ag/swap/v1` (paid tier: `api.jup.ag/swap/v1`).
// The `/quote` and `/swap` paths are unchanged.
const DEFAULT_BASE_URI = "https://lite-api.jup.ag/swap/v1";

/**
 * fetch with exponential backoff on transient failures (network errors, HTTP
 * 429 and 5xx). The public Jupiter endpoint rate-limits under load, so a single
 * attempt is not reliable. 4xx (other than 429) are returned as-is to the caller.
 */
async function fetchWithRetry(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return promiseRetry(
    async (retry) => {
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (err) {
        return retry(err);
      }
      if (response.status === 429 || response.status >= 500) {
        return retry(
          new Error(`Jupiter API transient error (HTTP ${response.status})`),
        );
      }
      return response;
    },
    { retries: 4, minTimeout: 500, factor: 2 },
  );
}

/**
 * Relevant subset of the Jupiter /quote response.
 */
export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  [key: string]: unknown;
}

/**
 * Relevant subset of the Jupiter /swap response.
 */
export interface SwapResponse {
  swapTransaction: string;
  lastValidBlockHeight?: number;
  [key: string]: unknown;
}

/**
 * Optional execution parameters for the Jupiter client.
 */
export interface JupiterClientOptions {
  /** Priority fee in lamports attached to swap transactions. Default: 200000. */
  priorityFees?: number;
  /** Skip RPC preflight simulation when sending swaps. Default: false. */
  skipPreflight?: boolean;
}

/**
 * Class for interacting with the Jupiter API to perform token swaps on the Solana blockchain.
 */
export class JupiterClient {
  baseUri: string;
  priorityFees: number;
  skipPreflight: boolean;

  /**
   * Constructs a JupiterClient instance.
   * @param rpc The Solana RPC client.
   * @param signer The user's Solana signer.
   * @param baseUri Optional Jupiter API base URL (defaults to the public v6 endpoint).
   * @param options Optional execution parameters (priority fees, preflight).
   */
  constructor(
    private rpc: SolanaRpc,
    private signer: KeyPairSigner,
    baseUri?: string,
    options: JupiterClientOptions = {},
  ) {
    this.baseUri = baseUri || DEFAULT_BASE_URI;
    this.priorityFees = options.priorityFees ?? 200000;
    this.skipPreflight = options.skipPreflight ?? false;
  }

  /**
   * Get the Solana RPC client.
   * @returns The Solana RPC client.
   */
  public getRpc(): SolanaRpc {
    return this.rpc;
  }

  /**
   * Get the user signer.
   * @returns The user signer.
   */
  getSigner(): KeyPairSigner {
    return this.signer;
  }

  /**
   * Retrieves a swap quote from the Jupiter API.
   * @param inputMint The address of the input token mint.
   * @param outputMint The address of the output token mint.
   * @param amount The amount of input tokens to swap, in minor units.
   * @param slippageBps The maximum slippage allowed, in basis points.
   * @returns A promise that resolves to the swap quote.
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number,
  ): Promise<QuoteResponse> {
    console.log(`Getting quote for ${amount} ${inputMint} -> ${outputMint}`);
    const response = await fetchWithRetry(
      `${this.baseUri}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`,
    );
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to get quote (HTTP ${response.status}): ${errorBody}`,
      );
    }
    return (await response.json()) as QuoteResponse;
  }

  /**
   * Retrieves a swap transaction from the Jupiter API.
   * @param quoteResponse The response from the getQuote method.
   * @param wrapAndUnwrapSol Whether to wrap and unwrap SOL if necessary.
   * @param priorityFees An optional priority fee amount in lamports.
   * @param feeAccount An optional fee account address.
   * @returns A promise that resolves to the swap response (serialized transaction plus expiry metadata).
   */
  async getSwapTransaction(
    quoteResponse: QuoteResponse,
    wrapAndUnwrapSol: boolean = true,
    priorityFees: number = this.priorityFees,
    feeAccount?: string,
  ): Promise<SwapResponse> {
    const body = {
      quoteResponse,
      userPublicKey: this.signer.address,
      wrapAndUnwrapSol,
      ...(feeAccount && { feeAccount }),
      prioritizationFeeLamports: priorityFees,
      dynamicComputeUnitLimit: true,
    };

    const response = await fetchWithRetry(`${this.baseUri}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to get swap transaction (HTTP ${response.status}): ${errorBody}`,
      );
    }

    const swapResponse = (await response.json()) as SwapResponse;
    if (!swapResponse.swapTransaction) {
      throw new Error(
        "Jupiter /swap response did not contain a swapTransaction",
      );
    }
    return swapResponse;
  }

  /**
   * Executes a swap transaction on the Solana blockchain.
   * @param swapResponse The swap response obtained from getSwapTransaction.
   * @returns A promise that resolves to a boolean indicating whether the transaction was successfully confirmed.
   */
  async executeSwap(swapResponse: SwapResponse): Promise<boolean> {
    try {
      // Jupiter returns a fully-built, unsigned transaction as base64. Decode it,
      // sign it with the user's key, and re-encode it to the base64 wire format.
      const transactionBytes = getBase64Encoder().encode(
        swapResponse.swapTransaction,
      );
      const decodedTransaction =
        getTransactionDecoder().decode(transactionBytes);
      const signedTransaction = await signTransaction(
        [this.signer.keyPair],
        decodedTransaction,
      );
      const signature = getSignatureFromTransaction(signedTransaction);
      const base64Transaction =
        getBase64EncodedWireTransaction(signedTransaction);

      // Track expiry against the blockhash embedded in the Jupiter transaction;
      // a freshly fetched blockhash would make expiry detection unreliable.
      const lastValidBlockHeight =
        swapResponse.lastValidBlockHeight !== undefined
          ? BigInt(swapResponse.lastValidBlockHeight)
          : (await this.rpc.getLatestBlockhash().send()).value
              .lastValidBlockHeight;

      const confirmation = await transactionSenderAndConfirmationWaiter({
        rpc: this.rpc,
        base64Transaction,
        signature,
        lastValidBlockHeight,
        skipPreflight: this.skipPreflight,
      });

      if (!confirmation) {
        console.error("Swap transaction expired or failed.");
        return false;
      }
      if (confirmation.meta && confirmation.meta.err) {
        console.error(
          "Swap transaction failed with error:",
          confirmation.meta.err,
        );
        return false;
      }

      console.log("Swap transaction confirmed");
      return true;
    } catch (err) {
      console.error("Failed to send swap transaction:", err);
      return false;
    }
  }
}
