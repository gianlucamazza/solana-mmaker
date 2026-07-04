import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
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
        expect(() => new MarketMaker({ minimumTradeAmount: 0 })).toThrow(/minimumTradeAmount/);
    });

    it('rejects a wait time below 1000ms', () => {
        expect(() => new MarketMaker({ waitTime: 500 })).toThrow(/waitTime/);
    });

    it('accepts valid overrides', () => {
        expect(() => new MarketMaker({ rebalancePercentage: 0.75, slippageBps: 50 })).not.toThrow();
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

    it('does not trade below the minimum trade amount', async () => {
        const { mm, pair } = makeMarketMaker({ minimumTradeAmount: 1 });
        // Surplus is 0.5 SOL, below the configured minimum of 1
        const result = await mm.determineTradeNecessity(
            fakeJupiterClient(PRICES), pair, new Decimal(2), new Decimal(100)
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
