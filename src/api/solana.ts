import { address, createSolanaRpc } from "@solana/kit";

/**
 * A Solana JSON-RPC client, as produced by {@link createSolanaRpc}.
 * The @solana/kit RPC is a functional client: each method returns a request
 * object whose `.send()` performs the call.
 */
export type SolanaRpc = ReturnType<typeof createSolanaRpc>;

/**
 * Create an RPC client for a Solana endpoint.
 * @param endpoint HTTP RPC endpoint URL.
 * @returns An RPC client.
 */
export function setupSolanaConnection(endpoint: string): SolanaRpc {
  return createSolanaRpc(endpoint);
}

/**
 * Read the decimals of an SPL token mint from the chain.
 * @param rpc Solana RPC client.
 * @param mintAddress Token mint address.
 * @returns The mint's decimals.
 */
export async function getMintDecimals(
  rpc: SolanaRpc,
  mintAddress: string,
): Promise<number> {
  const info = await rpc
    .getAccountInfo(address(mintAddress), { encoding: "jsonParsed" })
    .send();
  const data = info.value?.data;
  if (!data || typeof data !== "object" || !("parsed" in data)) {
    throw new Error(`Unable to read mint account ${mintAddress}`);
  }
  const decimals = (data as { parsed?: { info?: { decimals?: unknown } } })
    .parsed?.info?.decimals;
  if (typeof decimals !== "number") {
    throw new Error(`Mint account ${mintAddress} has no decimals field`);
  }
  return decimals;
}
