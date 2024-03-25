import dotenv from 'dotenv';
import { JupiterClient } from './api/jupiter';
import { setupSolanaConnection } from './api/solana';
import { MarketMaker } from './strategies/basicMM';
import { getUserKeypair } from './wallet';

async function main() {
    dotenv.config();

    if (!process.env.SOLANA_RPC_ENDPOINT) {
        throw new Error('SOLANA_RPC_ENDPOINT is not set');
    }

    if (!process.env.USER_KEYPAIR) {
        throw new Error('USER_KEYPAIR is not set');
    }

    if (!process.env.ENABLE_TRADING) {
        console.warn('ENABLE_TRADING is not set. Defaulting to false');
    }

    const connection = setupSolanaConnection(process.env.SOLANA_RPC_ENDPOINT);
    console.log(`Network: ${connection.rpcEndpoint}`);
    const userKeypair = getUserKeypair();
    console.log('MarketMaker PubKey:', userKeypair.publicKey.toBase58());
    const jupiterClient = new JupiterClient(connection, userKeypair);

    const enabled = process.env.ENABLE_TRADING === 'true';
    const marketMaker = new MarketMaker();
    await marketMaker.runMM(jupiterClient, enabled);
}


main().catch((err) => console.error(err))