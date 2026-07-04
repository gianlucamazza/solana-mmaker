import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { MarketMaker, MarketMakerConfig, TradePair } from '../src/strategies/basicMM';
import { JupiterClient } from '../src/api/jupiter';
import { SOL_MINT_ADDRESS, MBC_MINT_ADDRESS } from '../src/constants/constants';

/**
 * Fake Jupiter client returning fixed USD prices (USDC has 6 decimals):
 * SOL = $100, MBC = $1.
 */
function fakeJupiterClient(prices: Record<string, number>): JupiterClient {
    return {
        getQuote: async (inputMint: string) => ({
            outAmount: new Decimal(prices[inputMint]).mul(1e6).toFixed(0),
        }),
    } as unknown as JupiterClient;
}

const PRICES = { [SOL_MINT_ADDRESS]: 100, [MBC_MINT_ADDRESS]: 1 };

function makeMarketMaker(config: MarketMakerConfig = {}): { mm: MarketMaker; pair: TradePair } {
    const mm = new MarketMaker(config);
    return { mm, pair: { token0: mm.solToken, token1: mm.mbcToken } };
}

describe('MarketMaker config validation', () => {
    it('rejects a rebalance percentage outside (0,1)', () => {
        expect(() => new MarketMaker({ rebalancePercentage: 1.5 })).toThrow(/rebalancePercentage/);
        expect(() => new MarketMaker({ rebalancePercentage: 0 })).toThrow(/rebalancePercentage/);
    });

    it('rejects a non-integer or out-of-range slippage', () => {
        expect(() => new MarketMaker({ slippageBps: -1 })).toThrow(/slippageBps/);
        expect(() => new MarketMaker({ slippageBps: 2000 })).toThrow(/slippageBps/);
        expect(() => new MarketMaker({ slippageBps: 10.5 })).toThrow(/slippageBps/);
    });

    it('rejects a non-positive price tolerance and minimum trade amount', () => {
        expect(() => new MarketMaker({ priceTolerance: 0 })).toThrow(/priceTolerance/);
        expect(() => new MarketMaker({ minimumTradeValueUsd: 0 })).toThrow(/minimumTradeValueUsd/);
    });

    it('rejects a wait time below 1000ms', () => {
        expect(() => new MarketMaker({ waitTime: 500 })).toThrow(/waitTime/);
    });

    it('accepts valid overrides', () => {
        expect(() => new MarketMaker({ rebalancePercentage: 0.75, slippageBps: 50 })).not.toThrow();
    });
});

describe('getSPLTokenBalance', () => {
    function fakeConnectionWithAccounts(entries: { mint: string; amount: string }[]): Connection {
        return {
            getParsedTokenAccountsByOwner: async () => ({
                value: entries.map((e) => ({
                    account: { data: { parsed: { info: { mint: e.mint, tokenAmount: { amount: e.amount } } } } },
                })),
            }),
        } as unknown as Connection;
    }

    it('sums every token account that matches the mint', async () => {
        const mm = new MarketMaker();
        const wallet = new PublicKey(SOL_MINT_ADDRESS);
        const connection = fakeConnectionWithAccounts([
            { mint: MBC_MINT_ADDRESS, amount: '100' },
            { mint: MBC_MINT_ADDRESS, amount: '250' },
            { mint: SOL_MINT_ADDRESS, amount: '999' }, // different mint, must be ignored
        ]);
        const balance = await mm.getSPLTokenBalance(connection, wallet, new PublicKey(MBC_MINT_ADDRESS));
        expect(balance.toString()).toBe('350');
    });

    it('returns 0 when no account matches the mint', async () => {
        const mm = new MarketMaker();
        const wallet = new PublicKey(SOL_MINT_ADDRESS);
        const connection = fakeConnectionWithAccounts([{ mint: SOL_MINT_ADDRESS, amount: '10' }]);
        const balance = await mm.getSPLTokenBalance(connection, wallet, new PublicKey(MBC_MINT_ADDRESS));
        expect(balance.toString()).toBe('0');
    });
});

describe('determineTradeNecessity', () => {
    it('does not trade a balanced portfolio', async () => {
        const { mm, pair } = makeMarketMaker();
        const result = await mm.determineTradeNecessity(
            fakeJupiterClient(PRICES), pair, new Decimal(1), new Decimal(100)
        );
        expect(result.tradeNeeded).toBe(false);
    });

    it('sells the SOL surplus when SOL is overweight', async () => {
        const { mm, pair } = makeMarketMaker();
        // SOL: 2 * $100 = $200, MBC: 100 * $1 = $100 -> surplus $50 -> 0.5 SOL
        const result = await mm.determineTradeNecessity(
            fakeJupiterClient(PRICES), pair, new Decimal(2), new Decimal(100)
        );
        expect(result.tradeNeeded).toBe(true);
        expect(result.solAmountToTrade.toNumber()).toBeCloseTo(0.5);
        expect(result.mbcAmountToTrade.toNumber()).toBe(0);
    });

    it('sells the MBC surplus when MBC is overweight', async () => {
        const { mm, pair } = makeMarketMaker();
        // SOL: $100, MBC: $300 -> surplus $100 -> 100 MBC
        const result = await mm.determineTradeNecessity(
            fakeJupiterClient(PRICES), pair, new Decimal(1), new Decimal(300)
        );
        expect(result.tradeNeeded).toBe(true);
        expect(result.mbcAmountToTrade.toNumber()).toBeCloseTo(100);
        expect(result.solAmountToTrade.toNumber()).toBe(0);
    });

    it('does not trade when the imbalance is within the price tolerance', async () => {
        const { mm, pair } = makeMarketMaker();
        // SOL: $102, MBC: $100 -> imbalance $1 vs tolerance 2% of $202 = $4.04
        const result = await mm.determineTradeNecessity(
            fakeJupiterClient(PRICES), pair, new Decimal(1.02), new Decimal(100)
        );
        expect(result.tradeNeeded).toBe(false);
    });

    it('does not trade below the minimum trade value', async () => {
        const { mm, pair } = makeMarketMaker({ minimumTradeValueUsd: 100 });
        // Surplus is 0.5 SOL = $50, below the configured minimum of $100
        const result = await mm.determineTradeNecessity(
            fakeJupiterClient(PRICES), pair, new Decimal(2), new Decimal(100)
        );
        expect(result.tradeNeeded).toBe(false);
    });

    it('does not trade (and does not throw) when a token has no price/route', async () => {
        const { mm, pair } = makeMarketMaker();
        // MBC priced at 0 -> missing route; must skip without dividing by zero
        const result = await mm.determineTradeNecessity(
            fakeJupiterClient({ [SOL_MINT_ADDRESS]: 100, [MBC_MINT_ADDRESS]: 0 }),
            pair, new Decimal(2), new Decimal(100)
        );
        expect(result.tradeNeeded).toBe(false);
    });

    it('honours a custom rebalance percentage', async () => {
        const { mm, pair } = makeMarketMaker({ rebalancePercentage: 0.75 });
        // Target: SOL 75% / MBC 25%. SOL $100, MBC $100 -> MBC overweight by $50
        const result = await mm.determineTradeNecessity(
            fakeJupiterClient(PRICES), pair, new Decimal(1), new Decimal(100)
        );
        expect(result.tradeNeeded).toBe(true);
        expect(result.mbcAmountToTrade.toNumber()).toBeCloseTo(50);
    });

    it('does not trade an empty portfolio', async () => {
        const { mm, pair } = makeMarketMaker();
        const result = await mm.determineTradeNecessity(
            fakeJupiterClient(PRICES), pair, new Decimal(0), new Decimal(0)
        );
        expect(result.tradeNeeded).toBe(false);
    });
});
