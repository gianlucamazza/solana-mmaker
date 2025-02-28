import dotenv from 'dotenv';
import { JupiterClient } from './api/jupiter';
import { setupSolanaConnection } from './api/solana';
import { MarketMaker } from './strategies/basicMM';
import { loadKeypair } from './wallet';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

async function main() {
    dotenv.config();

    if (!process.env.SOLANA_RPC_ENDPOINT) {
        throw new Error('SOLANA_RPC_ENDPOINT is not set');
    }

    // Either SOLANA_MNEMONIC or a Solana keypair file at ~/.config/solana/id.json is required
    if (!process.env.SOLANA_MNEMONIC && !fs.existsSync(path.join(homedir(), '.config/solana/id.json'))) {
        throw new Error('Neither SOLANA_MNEMONIC is set nor Solana keypair file exists at ~/.config/solana/id.json');
    }

    if (!process.env.ENABLE_TRADING) {
        console.warn('ENABLE_TRADING is not set. Defaulting to false');
    }

    const connection = setupSolanaConnection(process.env.SOLANA_RPC_ENDPOINT);
    console.log(`Network: ${connection.rpcEndpoint}`);
    const userKeypair = loadKeypair();
    console.log('MarketMaker PubKey:', userKeypair.publicKey.toBase58());
    const jupiterClient = new JupiterClient(connection, userKeypair);

    const enabled = process.env.ENABLE_TRADING === 'true';
    const marketMaker = new MarketMaker();
    await marketMaker.runMM(jupiterClient, enabled);
}


main().catch((err) => {
    console.error('Application error:', err);
    process.exit(1);
})