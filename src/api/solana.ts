import fs from 'fs';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
/**
 * Setup connection to Solana RPC endpoint
 * @param {string} endpoint - RPC endpoint
 * @returns {Connection} - Connection object
 */
export function setupSolanaConnection(endpoint: string): Connection {
    return new Connection(endpoint, 'confirmed');
}

/**
 * Get user keypair from private key
 * @param {string} privateKey - User private key
 * @returns {Keypair} - User keypair
 */
export function getUserKeypair(filePath: string): Keypair {
    const secretKeyString = fs.readFileSync(filePath, { encoding: 'utf8' });
    console.log(secretKeyString);
    const secretKey = bs58.decode(secretKeyString);
    return Keypair.fromSecretKey(secretKey);
}