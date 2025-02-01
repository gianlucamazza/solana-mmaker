import { Connection, Keypair, VersionedTransaction, BlockhashWithExpiryBlockHeight } from '@solana/web3.js';
import fetch from 'cross-fetch';
import { transactionSenderAndConfirmationWaiter } from '../utils/transactionSender';

/**
 * Class for interacting with the Jupiter API to perform token swaps on the Solana blockchain.
 */
export class JupiterClient {
    baseUri: string;

    /**
     * Constructs a JupiterClient instance.
     * @param connection The Solana connection object.
     * @param userKeypair The user's Solana Keypair.
     */
    constructor(private connection: Connection, private userKeypair: Keypair) {
        this.baseUri = 'https://quote-api.jup.ag/v6';
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
     * @param amount The amount of input tokens to swap.
     * @param slippageBps The maximum slippage allowed, in basis points.
     * @returns A promise that resolves to the swap quote.
     */
    async getQuote(inputMint: string, outputMint: string, amount: string, slippageBps: number): Promise<any> {
        console.log(`Getting quote for ${amount} ${inputMint} -> ${outputMint}`);
        const response = await fetch(
            `${this.baseUri}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`
        );
        const quoteResponse = await response.json();
        if (!response.ok) {
            console.error('Failed to get quote:', quoteResponse.error);
            throw new Error(`Failed to get quote: ${quoteResponse.error}`);
        }
        return quoteResponse;
    }

    /**
     * Retrieves a swap transaction from the Jupiter API.
     * @param quoteResponse The response from the getQuote method.
     * @param wrapAndUnwrapSol Whether to wrap and unwrap SOL if necessary.
     * @param feeAccount An optional fee account address.
     * @param priorityFees An optional priority fee amount in lamports (default in Solana : 100000).
     * @returns A promise that resolves to the swap transaction.
     */
    async getSwapTransaction(quoteResponse: any, wrapAndUnwrapSol: boolean = true, priorityFees = 200000, feeAccount?: string): Promise<any> {
        const body = {
            quoteResponse,
            userPublicKey: this.userKeypair.publicKey.toString(),
            wrapAndUnwrapSol,
            ...(feeAccount && { feeAccount }),
            ...(priorityFees !== undefined && { prioritizationFeeLamports: priorityFees }),
            ...(priorityFees !== undefined && { dynamicComputeUnitLimit: true })
        };

        const response = await fetch(`${this.baseUri}/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error('Failed to get swap transaction');
        }

        const { swapTransaction } = await response.json();
        return swapTransaction;
    }

    /**
     * Executes a swap transaction on the Solana blockchain.
     * @param swapTransaction The swap transaction obtained from getSwapTransaction, encoded in base64.
     * @returns A promise that resolves to a boolean indicating whether the transaction was successfully confirmed.
     */
    async executeSwap(swapTransaction: any): Promise<boolean> {
        try {
            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            let transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([this.userKeypair]);

            const connection = this.getConnection();

            // Retrieving the necessary data for `transactionSenderAndConfirmationWaiter`
            const latestBlockhash = await connection.getLatestBlockhash();
            const blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight = {
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            };

            const serializedTransaction = Buffer.from(transaction.serialize());

            // Sending the transaction using `transactionSenderAndConfirmationWaiter`
            const confirmation = await transactionSenderAndConfirmationWaiter({
                connection,
                serializedTransaction,
                blockhashWithExpiryBlockHeight,
            });

            if (!confirmation) {
                console.error("Swap transaction expired or failed.");
                return false;
            } else if (confirmation.meta && confirmation.meta.err) {
                console.error("Swap transaction failed with error:", confirmation.meta.err);
                return false;
            }

            console.log('Swap transaction confirmed');
            return true;
        } catch (err) {
            console.error('Failed to send swap transaction:', err);
            return false;
        }
    }

    /**
     * Waits for a transaction to be confirmed on the Solana blockchain.
     * @param txId The ID of the transaction to wait for.
     * @param timeout The maximum time to wait for confirmation, in milliseconds. Defaults to 60000 ms.
     * @returns A promise that resolves to a boolean indicating whether the transaction was confirmed within the timeout period.
     */
    async waitForTransactionConfirmation(txId: string, timeout = 60000): Promise<boolean> {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const status = await this.connection.getSignatureStatus(txId);
            if (status && status.value && status.value.confirmationStatus === 'finalized') {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return false;
    }
}