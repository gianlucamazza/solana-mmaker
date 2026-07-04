import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import fetch from 'cross-fetch';
import promiseRetry from 'promise-retry';
import { transactionSenderAndConfirmationWaiter } from '../utils/transactionSender';

const DEFAULT_BASE_URI = 'https://quote-api.jup.ag/v6';

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

/**
 * fetch with exponential backoff on transient failures (network errors, HTTP
 * 429 and 5xx). The public Jupiter endpoint rate-limits under load, so a single
 * attempt is not reliable. 4xx (other than 429) are returned as-is to the caller.
 */
async function fetchWithRetry(url: string, init?: Parameters<typeof fetch>[1]): Promise<FetchResponse> {
    return promiseRetry(
        async (retry) => {
            let response: FetchResponse;
            try {
                response = await fetch(url, init);
            } catch (err) {
                return retry(err);
            }
            if (response.status === 429 || response.status >= 500) {
                return retry(new Error(`Jupiter API transient error (HTTP ${response.status})`));
            }
            return response;
        },
        { retries: 4, minTimeout: 500, factor: 2 }
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
 * Class for interacting with the Jupiter API to perform token swaps on the Solana blockchain.
 */
/**
 * Optional execution parameters for the Jupiter client.
 */
export interface JupiterClientOptions {
    /** Priority fee in lamports attached to swap transactions. Default: 200000. */
    priorityFees?: number;
    /** Skip RPC preflight simulation when sending swaps. Default: false. */
    skipPreflight?: boolean;
}

export class JupiterClient {
    baseUri: string;
    priorityFees: number;
    skipPreflight: boolean;

    /**
     * Constructs a JupiterClient instance.
     * @param connection The Solana connection object.
     * @param userKeypair The user's Solana Keypair.
     * @param baseUri Optional Jupiter API base URL (defaults to the public v6 endpoint).
     * @param options Optional execution parameters (priority fees, preflight).
     */
    constructor(private connection: Connection, private userKeypair: Keypair, baseUri?: string, options: JupiterClientOptions = {}) {
        this.baseUri = baseUri || DEFAULT_BASE_URI;
        this.priorityFees = options.priorityFees ?? 200000;
        this.skipPreflight = options.skipPreflight ?? false;
    }

    /**
     * Get the Solana connection.
     * @returns The Solana connection.
     */
    public getConnection(): Connection {
        return this.connection;
    }

    /**
     * Get the user keypair.
     * @returns The user keypair.
     */
    getUserKeypair(): Keypair {
        return this.userKeypair;
    }

    /**
     * Retrieves a swap quote from the Jupiter API.
     * @param inputMint The address of the input token mint.
     * @param outputMint The address of the output token mint.
     * @param amount The amount of input tokens to swap, in minor units.
     * @param slippageBps The maximum slippage allowed, in basis points.
     * @returns A promise that resolves to the swap quote.
     */
    async getQuote(inputMint: string, outputMint: string, amount: string, slippageBps: number): Promise<QuoteResponse> {
        console.log(`Getting quote for ${amount} ${inputMint} -> ${outputMint}`);
        const response = await fetchWithRetry(
            `${this.baseUri}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`
        );
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to get quote (HTTP ${response.status}): ${errorBody}`);
        }
        return await response.json() as QuoteResponse;
    }

    /**
     * Retrieves a swap transaction from the Jupiter API.
     * @param quoteResponse The response from the getQuote method.
     * @param wrapAndUnwrapSol Whether to wrap and unwrap SOL if necessary.
     * @param priorityFees An optional priority fee amount in lamports.
     * @param feeAccount An optional fee account address.
     * @returns A promise that resolves to the swap response (serialized transaction plus expiry metadata).
     */
    async getSwapTransaction(quoteResponse: QuoteResponse, wrapAndUnwrapSol: boolean = true, priorityFees: number = this.priorityFees, feeAccount?: string): Promise<SwapResponse> {
        const body = {
            quoteResponse,
            userPublicKey: this.userKeypair.publicKey.toString(),
            wrapAndUnwrapSol,
            ...(feeAccount && { feeAccount }),
            prioritizationFeeLamports: priorityFees,
            dynamicComputeUnitLimit: true,
        };

        const response = await fetchWithRetry(`${this.baseUri}/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to get swap transaction (HTTP ${response.status}): ${errorBody}`);
        }

        const swapResponse = await response.json() as SwapResponse;
        if (!swapResponse.swapTransaction) {
            throw new Error('Jupiter /swap response did not contain a swapTransaction');
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
            const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([this.userKeypair]);

            const connection = this.getConnection();

            // Track expiry against the blockhash embedded in the Jupiter transaction;
            // a freshly fetched blockhash would make expiry detection unreliable.
            const blockhash = transaction.message.recentBlockhash;
            const lastValidBlockHeight = swapResponse.lastValidBlockHeight
                ?? (await connection.getLatestBlockhash()).lastValidBlockHeight;

            const serializedTransaction = Buffer.from(transaction.serialize());

            const confirmation = await transactionSenderAndConfirmationWaiter({
                connection,
                serializedTransaction,
                blockhashWithExpiryBlockHeight: { blockhash, lastValidBlockHeight },
                skipPreflight: this.skipPreflight,
            });

            if (!confirmation) {
                console.error('Swap transaction expired or failed.');
                return false;
            }
            if (confirmation.meta && confirmation.meta.err) {
                console.error('Swap transaction failed with error:', confirmation.meta.err);
                return false;
            }

            console.log('Swap transaction confirmed');
            return true;
        } catch (err) {
            console.error('Failed to send swap transaction:', err);
            return false;
        }
    }
}
