import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import Decimal from 'decimal.js';
import { JupiterClient, SwapResponse } from '../api/jupiter';
import { getMintDecimals } from '../api/solana';
import { SOL_MINT_ADDRESS, MBC_MINT_ADDRESS, USDC_MINT_ADDRESS } from '../constants/constants';
import { fromNumberToLamports } from '../utils/convert';
import { sleep } from '../utils/sleep';

export interface Token {
    address: string;
    symbol: string;
    decimals: number;
}

export interface TradePair {
    token0: Token;
    token1: Token;
}

export interface MarketMakerConfig {
    /** Milliseconds between rebalance checks. Default: 60000 (1 minute). */
    waitTime?: number;
    /** Maximum slippage in basis points. Default: 50 (0.5%). */
    slippageBps?: number;
    /** Portfolio imbalance, as a fraction of total value, required to trigger a rebalance. Default: 0.02 (2%). */
    priceTolerance?: number;
    /** Target share of total value held in token0. Default: 0.5 (50/50). */
    rebalancePercentage?: number;
    /** Minimum token amount for a trade to be worth executing. Default: 0.01. */
    minimumTradeAmount?: number;
}

/**
 * Class for market making basic strategy
 */
export class MarketMaker {
    mbcToken: Token;
    solToken: Token;
    usdcToken: Token;
    waitTime: number;
    slippageBps: number;
    priceTolerance: number;
    rebalancePercentage: number;
    minimumTradeAmount: Decimal;

    /**
     * Initializes a new instance of the MarketMaker class.
     * @param config Optional overrides for the strategy parameters.
     */
    constructor(config: MarketMakerConfig = {}) {
        this.mbcToken = { address: MBC_MINT_ADDRESS, symbol: 'MBC', decimals: 9 };
        this.solToken = { address: SOL_MINT_ADDRESS, symbol: 'SOL', decimals: 9 };
        this.usdcToken = { address: USDC_MINT_ADDRESS, symbol: 'USDC', decimals: 6 };
        this.waitTime = config.waitTime ?? 60000; // 1 minute
        this.slippageBps = config.slippageBps ?? 50; // 0.5%
        this.priceTolerance = config.priceTolerance ?? 0.02; // 2%
        this.rebalancePercentage = config.rebalancePercentage ?? 0.5; // 50%
        this.minimumTradeAmount = new Decimal(config.minimumTradeAmount ?? 0.01);
    }

    /**
     * Run market making strategy
     * @param {JupiterClient} jupiterClient - JupiterClient object
     * @param {boolean} enableTrading - Enable trading
     * @returns {Promise<void>} - Promise object
     */
    async runMM(jupiterClient: JupiterClient, enableTrading: boolean = false): Promise<void> {
        const tradePairs: TradePair[] = [{ token0: this.solToken, token1: this.mbcToken }];
        await this.syncTokenDecimals(jupiterClient.getConnection());

        while (true) {
            for (const pair of tradePairs) {
                try {
                    await this.evaluateAndExecuteTrade(jupiterClient, pair, enableTrading);
                } catch (err) {
                    // A transient RPC/API failure must not kill the bot; retry on the next cycle.
                    console.error(`Rebalance iteration for ${pair.token0.symbol}/${pair.token1.symbol} failed:`, err);
                }
            }

            console.log(`Waiting for ${this.waitTime / 1000} seconds...`);
            await sleep(this.waitTime);
        }
    }

    /**
     * Read SPL token decimals from the chain so the hardcoded defaults cannot drift
     * from the actual mint configuration.
     * @param connection Solana connection object.
     */
    async syncTokenDecimals(connection: Connection): Promise<void> {
        for (const token of [this.mbcToken, this.usdcToken]) {
            try {
                const decimals = await getMintDecimals(connection, token.address);
                if (decimals !== token.decimals) {
                    console.warn(`Correcting ${token.symbol} decimals from ${token.decimals} to on-chain value ${decimals}`);
                    token.decimals = decimals;
                }
            } catch (err) {
                console.warn(`Could not verify ${token.symbol} decimals on-chain, keeping ${token.decimals}:`, err);
            }
        }
    }

    /**
     * Evaluate and execute trade
     * @param {JupiterClient} jupiterClient - JupiterClient object
     * @param {TradePair} pair - Pair object
     * @param {boolean} enableTrading - Enable trading
     * @returns {Promise<void>} - Promise object
     */
    async evaluateAndExecuteTrade(jupiterClient: JupiterClient, pair: TradePair, enableTrading: boolean): Promise<void> {
        const token0Balance = await this.fetchTokenBalance(jupiterClient, pair.token0);
        const token1Balance = await this.fetchTokenBalance(jupiterClient, pair.token1);

        console.log(`Token0 balance (in ${pair.token0.symbol}): ${token0Balance.toString()}`);
        console.log(`Token1 balance (in ${pair.token1.symbol}): ${token1Balance.toString()}`);

        const { tradeNeeded, solAmountToTrade, mbcAmountToTrade } =
            await this.determineTradeNecessity(jupiterClient, pair, token0Balance, token1Balance);

        if (!tradeNeeded) {
            console.log('No trade needed');
            return;
        }

        console.log('Trade needed');
        if (solAmountToTrade.gt(0)) {
            await this.executeTrade(jupiterClient, pair.token0, pair.token1, solAmountToTrade, enableTrading);
        } else if (mbcAmountToTrade.gt(0)) {
            await this.executeTrade(jupiterClient, pair.token1, pair.token0, mbcAmountToTrade, enableTrading);
        }
    }

    /**
     * Quote and execute a single swap, surfacing failures instead of ignoring them.
     */
    private async executeTrade(jupiterClient: JupiterClient, inputToken: Token, outputToken: Token, amount: Decimal, enableTrading: boolean): Promise<void> {
        console.log(`Trading ${amount.toString()} ${inputToken.symbol} for ${outputToken.symbol}...`);
        const lamports = fromNumberToLamports(amount, inputToken.decimals);
        const quote = await jupiterClient.getQuote(inputToken.address, outputToken.address, lamports, this.slippageBps);
        const swapResponse: SwapResponse = await jupiterClient.getSwapTransaction(quote);

        if (!enableTrading) {
            console.log('Trading disabled');
            return;
        }

        const success = await jupiterClient.executeSwap(swapResponse);
        if (!success) {
            console.error(`Swap of ${amount.toString()} ${inputToken.symbol} -> ${outputToken.symbol} failed; balances will be re-evaluated on the next cycle`);
        }
    }

    /**
     * Determines the necessity of a trade based on the current balance of two tokens and their USD values.
     * The goal is to keep token0 at `rebalancePercentage` of the total portfolio value, trading only when
     * the imbalance exceeds `priceTolerance` of the total value and the resulting amount is above
     * `minimumTradeAmount`.
     *
     * @param jupiterClient An instance of JupiterClient used to fetch USD values of tokens.
     * @param pair An object representing the token pair to be evaluated, containing `token0` and `token1` properties.
     * @param token0Balance The current balance of `token0`.
     * @param token1Balance The current balance of `token1`.
     * @returns A promise that resolves to an object indicating whether a trade is needed and the amount of each token to trade.
     */
    async determineTradeNecessity(jupiterClient: JupiterClient, pair: TradePair, token0Balance: Decimal, token1Balance: Decimal) {
        const token0Price = await this.getUSDValue(jupiterClient, pair.token0);
        const token1Price = await this.getUSDValue(jupiterClient, pair.token1);

        const token0Value = token0Balance.mul(token0Price);
        const token1Value = token1Balance.mul(token1Price);

        const totalPortfolioValue = token0Value.add(token1Value);
        const targetToken0Value = totalPortfolioValue.mul(this.rebalancePercentage);
        const targetToken1Value = totalPortfolioValue.sub(targetToken0Value);
        const toleranceValue = totalPortfolioValue.mul(this.priceTolerance);

        let solAmountToTrade = new Decimal(0);
        let mbcAmountToTrade = new Decimal(0);
        let tradeNeeded = false;

        console.log(`${pair.token0.symbol} value: ${token0Value.toString()}`);
        console.log(`${pair.token1.symbol} value: ${token1Value.toString()}`);

        if (token0Value.sub(targetToken0Value).gt(toleranceValue)) {
            // token0 is overweight beyond the tolerance: sell the surplus for token1
            const valueDiff = token0Value.sub(targetToken0Value);
            solAmountToTrade = valueDiff.div(token0Price);
            tradeNeeded = true;
        } else if (token1Value.sub(targetToken1Value).gt(toleranceValue)) {
            // token1 is overweight beyond the tolerance: sell the surplus for token0
            const valueDiff = token1Value.sub(targetToken1Value);
            mbcAmountToTrade = valueDiff.div(token1Price);
            tradeNeeded = true;
        }

        if (solAmountToTrade.lt(this.minimumTradeAmount) && mbcAmountToTrade.lt(this.minimumTradeAmount)) {
            tradeNeeded = false;
        }

        return { tradeNeeded, solAmountToTrade, mbcAmountToTrade };
    }

    /**
     * Fetch token balance
     * @param {JupiterClient} jupiterClient - JupiterClient object
     * @param {Token} token - Token object
     * @returns {Promise<Decimal>} - Token balance
     */
    async fetchTokenBalance(jupiterClient: JupiterClient, token: Token): Promise<Decimal> {
        const connection = jupiterClient.getConnection();
        const publicKey = jupiterClient.getUserKeypair().publicKey;

        const balance = token.address === SOL_MINT_ADDRESS
            ? new Decimal(await connection.getBalance(publicKey))
            : await this.getSPLTokenBalance(connection, publicKey, new PublicKey(token.address));

        return balance.div(new Decimal(10).pow(token.decimals));
    }

    /**
     * Get SPL token balance in minor units.
     * @param connection Solana connection object.
     * @param walletAddress Wallet public key.
     * @param tokenMintAddress Token mint public key.
     * @returns Token balance as a Decimal.
     */
    async getSPLTokenBalance(connection: Connection, walletAddress: PublicKey, tokenMintAddress: PublicKey): Promise<Decimal> {
        const accounts = await connection.getParsedTokenAccountsByOwner(walletAddress, { programId: TOKEN_PROGRAM_ID });
        const accountInfo = accounts.value.find((account) => account.account.data.parsed.info.mint === tokenMintAddress.toBase58());
        return accountInfo ? new Decimal(accountInfo.account.data.parsed.info.tokenAmount.amount) : new Decimal(0);
    }

    /**
     * Get USD value of a token.
     * @param jupiterClient JupiterClient object.
     * @param token Token object.
     * @returns USD value of one token unit as a Decimal.
     */
    async getUSDValue(jupiterClient: JupiterClient, token: Token): Promise<Decimal> {
        const quote = await jupiterClient.getQuote(token.address, this.usdcToken.address, fromNumberToLamports(1, token.decimals), this.slippageBps);
        return new Decimal(quote.outAmount).div(new Decimal(10).pow(this.usdcToken.decimals));
    }
}
