import { JupiterClient } from '../api/jupiter';
import { SOL_MINT_ADDRESS, MBC_MINT_ADDRESS, USDC_MINT_ADDRESS } from '../constants/constants';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import Decimal from 'decimal.js';
import { fromNumberToLamports } from '../utils/convert';
import { Connection, PublicKey } from '@solana/web3.js';
import { sleep } from '../utils/sleep';

/**
 * Class for market making basic strategy
 */
export class MarketMaker {
    mcbToken: { address: string, symbol: string, decimals: number }
    solToken: { address: string, symbol: string, decimals: number }
    usdcToken: { address: string, symbol: string, decimals: number }
    waitTime: number
    slippageBps: number
    priceTolerance: number
    rebalancePercentage: number

    /**
     * Initializes a new instance of the MarketMaker class with default properties.
     */
    constructor() {
        // Read decimals from the token mint addresses
        this.mcbToken = { address: MBC_MINT_ADDRESS, symbol: 'MBC', decimals: 9 };
        this.solToken = { address: SOL_MINT_ADDRESS, symbol: 'SOL', decimals: 9 };
        this.usdcToken = { address: USDC_MINT_ADDRESS, symbol: 'USDC', decimals: 6 };
        this.waitTime = 60000; // 1 minute
        this.slippageBps = 50; // 0.5%
        this.priceTolerance = 0.02; // 2%
        this.rebalancePercentage = 0.5; // 50%
    }

    /**
     * Run market making strategy
     * @param {JupiterClient} jupiterClient - JupiterClient object
     * @param {boolean} enableTrading - Enable trading
     * @returns {Promise<void>} - Promise object
     */
    async runMM(jupiterClient: JupiterClient, enableTrading: Boolean = false): Promise<void> {
        const tradePairs = [{ token0: this.solToken, token1: this.mcbToken }];

        while (true) {
            for (const pair of tradePairs) {
                await this.evaluateAndExecuteTrade(jupiterClient, pair, enableTrading);
            }

            console.log(`Waiting for ${this.waitTime / 1000} seconds...`);
            await sleep(this.waitTime);
        }
    }

    /**
     * Evaluate and execute trade
     * @param {JupiterClient} jupiterClient - JupiterClient object
     * @param {any} pair - Pair object
     * @param {boolean} enableTrading - Enable trading
     * @returns {Promise<void>} - Promise object
     * 
     **/
    async evaluateAndExecuteTrade(jupiterClient: JupiterClient, pair: any, enableTrading: Boolean): Promise<void> {
        const token0Balance = await this.fetchTokenBalance(jupiterClient, pair.token0); // SOL balance
        const token1Balance = await this.fetchTokenBalance(jupiterClient, pair.token1); // MBC balance

        // Log current token balances
        console.log(`Token0 balance (in ${pair.token0.symbol}): ${token0Balance.toString()}`);
        console.log(`Token1 balance (in ${pair.token1.symbol}): ${token1Balance.toString()}`);

        // Get USD value for both tokens
        const tradeNecessity = await this.determineTradeNecessity(jupiterClient, pair, token0Balance, token1Balance);
        const { tradeNeeded, solAmountToTrade, mbcAmountToTrade } = tradeNecessity!;

        if (tradeNeeded) {
            console.log('Trade needed');
            if (solAmountToTrade.gt(0)) {
                console.log(`Trading ${solAmountToTrade.toString()} SOL for MBC...`);
                const lamportsAsString = fromNumberToLamports(solAmountToTrade.toNumber(), pair.token0.decimals).toString();
                const quote = await jupiterClient.getQuote(pair.token0.address, pair.token1.address, lamportsAsString, this.slippageBps);
                const swapTransaction = await jupiterClient.getSwapTransaction(quote);
                if (enableTrading) await jupiterClient.executeSwap(swapTransaction);
                else console.log('Trading disabled');
            } else if (mbcAmountToTrade.gt(0)) {
                console.log(`Trading ${mbcAmountToTrade.toString()} MBC for SOL...`);
                const lamportsAsString = fromNumberToLamports(mbcAmountToTrade.toNumber(), pair.token1.decimals).toString();
                const quote = await jupiterClient.getQuote(pair.token1.address, pair.token0.address, lamportsAsString, this.slippageBps);
                const swapTransaction = await jupiterClient.getSwapTransaction(quote);
                if (enableTrading) await jupiterClient.executeSwap(swapTransaction);
                else console.log('Trading disabled');
            }
        } else {
            console.log('No trade needed');
        }
    }

    /**
     * Determines the necessity of a trade based on the current balance of two tokens and their USD values.
     * The goal is to maintain a 50/50 ratio of the total USD value of each token.
     * 
     * @param jupiterClient An instance of JupiterClient used to fetch USD values of tokens.
     * @param pair An object representing the token pair to be evaluated, containing `token0` and `token1` properties.
     * @param token0Balance The current balance of `token0`.
     * @param token1Balance The current balance of `token1`.
     * @returns A promise that resolves to an object indicating whether a trade is needed and the amount of each token to trade.
     */
    async determineTradeNecessity(jupiterClient: JupiterClient, pair: any, token0Balance: Decimal, token1Balance: Decimal) {
        const token0Price = await this.getUSDValue(jupiterClient, pair.token0);
        const token1Price = await this.getUSDValue(jupiterClient, pair.token1);

        const token0Value = token0Balance.mul(token0Price);
        const token1Value = token1Balance.mul(token1Price);

        const totalValue = token0Value.add(token1Value);
        const targetValuePerToken = totalValue.div(2);

        // keep the ratio of the two tokens in the pool at 50/50 (in terms of USD value)
        const minRebalanceValue = targetValuePerToken.mul(new Decimal(1).minus(this.rebalancePercentage));
        const maxRebalanceValue = targetValuePerToken.mul(new Decimal(1).plus(this.rebalancePercentage));

        let solAmountToTrade = new Decimal(0);
        let mbcAmountToTrade = new Decimal(0);
        let tradeNeeded = false;

        console.log(`${pair.token0.symbol} value: ${token0Value.toString()}`);
        console.log(`${pair.token1.symbol} value: ${token1Value.toString()}`);

        if (token0Value.gt(maxRebalanceValue)) {
            // If token0's value exceeds the maximum tolerated value, trade some of it for token1
            const excessValue = token0Value.sub(targetValuePerToken);
            solAmountToTrade = excessValue.div(token0Price);
            tradeNeeded = true;
        } else if (token0Value.lt(minRebalanceValue)) {
            // If token0's value is below the minimum tolerated value, trade some token1 for it
            const deficitValue = targetValuePerToken.sub(token0Value);
            mbcAmountToTrade = deficitValue.div(token1Price);
            tradeNeeded = true;
        } else if (token1Value.gt(maxRebalanceValue)) {
            // If token1's value exceeds the maximum tolerated value, trade some of it for token0
            const excessValue = token1Value.sub(targetValuePerToken);
            mbcAmountToTrade = excessValue.div(token1Price);
            tradeNeeded = true;
        } else if (token1Value.lt(minRebalanceValue)) {
            // If token1's value is below the minimum tolerated value, trade some token0 for it
            const deficitValue = targetValuePerToken.sub(token1Value);
            solAmountToTrade = deficitValue.div(token0Price);
            tradeNeeded = true;
        }

        return { tradeNeeded, solAmountToTrade, mbcAmountToTrade };
    }

    /**
     * Fetch token balance
     * @param {JupiterClient} jupiterClient - JupiterClient object
     * @param {any} token - Token object
     * @returns {Promise<Decimal>} - Token balance
     */
    async fetchTokenBalance(jupiterClient: JupiterClient, token: { address: string; symbol: string; decimals: number; }): Promise<Decimal> {
        const connection = jupiterClient.getConnection();
        const publicKey = jupiterClient.getUserKeypair().publicKey;

        let balance = token.address === SOL_MINT_ADDRESS
            ? await connection.getBalance(publicKey)
            : await this.getSPLTokenBalance(connection, publicKey, new PublicKey(token.address));

        return new Decimal(balance).div(new Decimal(10).pow(token.decimals));
    }

    /**
     * Get SPL token balance.
     * @param connection Solana connection object.
     * @param walletAddress Wallet public key.
     * @param tokenMintAddress Token mint public key.
     * @returns Token balance as a Decimal.
     */
    async getSPLTokenBalance(connection: Connection, walletAddress: PublicKey, tokenMintAddress: PublicKey): Promise<Decimal> {
        const accounts = await connection.getParsedTokenAccountsByOwner(walletAddress, { programId: TOKEN_PROGRAM_ID });
        const accountInfo = accounts.value.find((account: any) => account.account.data.parsed.info.mint === tokenMintAddress.toBase58());
        return accountInfo ? new Decimal(accountInfo.account.data.parsed.info.tokenAmount.amount) : new Decimal(0);
    }

    /**
     * Get USD value of a token.
     * @param jupiterClient JupiterClient object.
     * @param token Token object.
     * @returns USD value of the token as a Decimal.
     */
    async getUSDValue(jupiterClient: JupiterClient, token: any): Promise<Decimal> {
        const quote = await jupiterClient.getQuote(token.address, this.usdcToken.address, fromNumberToLamports(1, token.decimals).toString(), this.slippageBps);
        return new Decimal(quote.outAmount).div(new Decimal(10).pow(this.usdcToken.decimals));
    }
}
