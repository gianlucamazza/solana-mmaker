import fs from "fs";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import { derivePath } from "ed25519-hd-key";
import * as bip39 from "bip39";
import nacl from "tweetnacl";
import { homedir } from "os";
import * as path from "path";

const DEFAULT_KEYPAIR_PATH = path.join(homedir(), ".config/solana/id.json");
const DEFAULT_DERIVATION_PATH = "m/44'/501'/0'/0'";

/**
 * Load a signer from a JSON secret-key file (the format produced by `solana-keygen`:
 * a 64-byte secret key as a JSON array).
 * @param filePath Path to the JSON keypair file.
 * @returns The loaded signer.
 */
async function loadKeypairFromFile(filePath: string): Promise<KeyPairSigner> {
  try {
    const fileContent = fs.readFileSync(filePath, { encoding: "utf8" });
    const secretKeyArray = JSON.parse(fileContent);
    return await createKeyPairSignerFromBytes(Uint8Array.from(secretKeyArray));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load keypair from ${filePath}: ${reason}`);
  }
}

/**
 * Derive a signer from a BIP39 mnemonic using the standard Solana derivation path.
 * @param mnemonic BIP39 mnemonic phrase.
 * @param derivationPath BIP44 derivation path (defaults to Solana's m/44'/501'/0'/0').
 * @returns The derived signer.
 */
async function loadKeypairFromMnemonic(
  mnemonic: string,
  derivationPath: string = DEFAULT_DERIVATION_PATH,
): Promise<KeyPairSigner> {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const derivedSeed = derivePath(derivationPath, seed.toString("hex")).key;
  // tweetnacl produces the 64-byte secret key (32-byte seed || 32-byte public key)
  // expected by createKeyPairSignerFromBytes.
  const keypair = nacl.sign.keyPair.fromSeed(derivedSeed);
  return await createKeyPairSignerFromBytes(new Uint8Array(keypair.secretKey));
}

/**
 * Load the bot signer. Resolution order:
 * 1. USER_KEYPAIR - path to a JSON secret-key file
 * 2. SOLANA_MNEMONIC - BIP39 mnemonic phrase
 * 3. ~/.config/solana/id.json - default Solana CLI keypair
 * @returns The loaded signer.
 */
export async function loadKeypair(): Promise<KeyPairSigner> {
  if (process.env.USER_KEYPAIR) {
    return loadKeypairFromFile(process.env.USER_KEYPAIR);
  }
  if (process.env.SOLANA_MNEMONIC) {
    return loadKeypairFromMnemonic(process.env.SOLANA_MNEMONIC);
  }
  if (fs.existsSync(DEFAULT_KEYPAIR_PATH)) {
    return loadKeypairFromFile(DEFAULT_KEYPAIR_PATH);
  }
  throw new Error(
    `No keypair found. Set USER_KEYPAIR (path to a JSON keypair file), set SOLANA_MNEMONIC, or create a keypair at ${DEFAULT_KEYPAIR_PATH}`,
  );
}
