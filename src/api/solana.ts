import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Setup connection to Solana RPC endpoint
 * @param {string} endpoint - RPC endpoint
 * @returns {Connection} - Connection object
 */
export function setupSolanaConnection(endpoint: string): Connection {
    return new Connection(endpoint, 'confirmed');
}

/**
 * Read the decimals of an SPL token mint from the chain.
 * @param connection Solana connection object.
 * @param mintAddress Token mint address.
 * @returns The mint's decimals.
 */
export async function getMintDecimals(connection: Connection, mintAddress: string): Promise<number> {
    const info = await connection.getParsedAccountInfo(new PublicKey(mintAddress));
    const data = info.value?.data;
    if (!data || typeof data !== 'object' || !('parsed' in data)) {
        throw new Error(`Unable to read mint account ${mintAddress}`);
    }
    const decimals = data.parsed?.info?.decimals;
    if (typeof decimals !== 'number') {
        throw new Error(`Mint account ${mintAddress} has no decimals field`);
    }
    return decimals;
}
