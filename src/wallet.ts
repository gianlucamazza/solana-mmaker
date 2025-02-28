import fs from 'fs';
import { Keypair } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import * as bip39 from 'bip39';
import * as nacl from 'tweetnacl';
import { homedir } from 'os';
import * as path from 'path';

const USER_HOME = homedir();
const USER_KEYPAIR_PATH = path.join(USER_HOME, '.config/solana/id.json');

// Load keypair from file
function loadKeypairFromFile(filePath: string): Keypair {
    try {
        const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
        const secretKeyArray = JSON.parse(fileContent);
        return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
    } catch (error) {
        console.error(`Error loading private key from ${filePath}:`, error);
        process.exit(1);
    }
}

// Derive keypair from seed and derivation path
function deriveKeypairFromSeed(seed: Buffer, derivationPath: string): Keypair {
    // Removed sensitive information logging for security
    const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
    const keypair = nacl.sign.keyPair.fromSeed(derivedSeed);
    return Keypair.fromSecretKey(new Uint8Array([...keypair.secretKey]));
}

// Load keypair from mnemonic
function loadKeypairFromMnemonic(mnemonic: string, derivationPath: string = "m/44'/501'/0'/0'"): Keypair {
    // Removed mnemonic logging for security
    console.log('Loading keypair from mnemonic with derivation path:', derivationPath);
    // Using async function with promise handling for newer bip39 versions
    const seed = Buffer.from(bip39.mnemonicToEntropy(mnemonic), 'hex');
    return deriveKeypairFromSeed(seed, derivationPath);
}

// Get user keypair, optionally using a derivation path
export function getUserKeypair(derivationPath?: string): Keypair {
    const keypair = loadKeypairFromFile(USER_KEYPAIR_PATH);
    if (derivationPath) {
        const seed = keypair.secretKey.slice(0, 32); // Assume the seed is the first 32 bytes of the secret key
        return deriveKeypairFromSeed(Buffer.from(seed), derivationPath);
    }
    return keypair;
}

// Main function to load keypair
export function loadKeypair(): Keypair {
    if (process.env.SOLANA_MNEMONIC) {
        return loadKeypairFromMnemonic(process.env.SOLANA_MNEMONIC);
    } else if (fs.existsSync(USER_KEYPAIR_PATH)) {
        return getUserKeypair();
    } else {
        console.error('Private key file or mnemonic not found');
        console.error('Please set SOLANA_MNEMONIC environment variable or create a private key file at', USER_KEYPAIR_PATH);
        process.exit(1);
    }
}