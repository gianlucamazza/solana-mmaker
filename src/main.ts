import dotenv from 'dotenv';
import { JupiterClient } from './api/jupiter';
import { setupSolanaConnection } from './api/solana';
import { MarketMaker, MarketMakerConfig } from './strategies/basicMM';
import { loadKeypair } from './wallet';

/**
 * Parse an optional numeric environment variable, throwing on malformed values.
 */
function parseNumberEnv(name: string): number | undefined {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return undefined;
    const value = Number(raw);
    if (Number.isNaN(value)) {
        throw new Error(`${name} must be a number, got "${raw}"`);
    }
    return value;
}

async function main() {
    dotenv.config();

    if (!process.env.SOLANA_RPC_ENDPOINT) {
        throw new Error('SOLANA_RPC_ENDPOINT is not set');
    }

    if (!process.env.USER_KEYPAIR && !process.env.SOLANA_MNEMONIC) {
        console.warn('Neither USER_KEYPAIR nor SOLANA_MNEMONIC is set; falling back to ~/.config/solana/id.json');
    }

    if (!process.env.ENABLE_TRADING) {
        console.warn('ENABLE_TRADING is not set. Defaulting to false');
    }

    const connection = setupSolanaConnection(process.env.SOLANA_RPC_ENDPOINT);
    console.log(`Network: ${connection.rpcEndpoint}`);
    const userKeypair = loadKeypair();
    console.log('MarketMaker PubKey:', userKeypair.publicKey.toBase58());
    const jupiterClient = new JupiterClient(connection, userKeypair, process.env.JUPITER_API_BASE_URL);

    const enabled = process.env.ENABLE_TRADING === 'true';
    const config: MarketMakerConfig = {
        waitTime: parseNumberEnv('MM_WAIT_TIME_MS'),
        slippageBps: parseNumberEnv('MM_SLIPPAGE_BPS'),
        priceTolerance: parseNumberEnv('MM_PRICE_TOLERANCE'),
        rebalancePercentage: parseNumberEnv('MM_REBALANCE_PERCENTAGE'),
        minimumTradeAmount: parseNumberEnv('MM_MINIMUM_TRADE_AMOUNT'),
    };
    const marketMaker = new MarketMaker(config);
    await marketMaker.runMM(jupiterClient, enabled);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
