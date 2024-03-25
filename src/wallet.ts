import fs from 'fs';
import { Keypair } from '@solana/web3.js';

const USER_HOME = require('os').homedir();
const USER_KEYPAIR_PATH = require('path').join(USER_HOME, '.config/solana/id.json');

function loadKeypairFromFile(filePath: string): Keypair {
    try {
        const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
        const secretKeyArray = JSON.parse(fileContent);
        return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
    } catch (error) {
        console.error(`Errore durante il caricamento della chiave privata da ${filePath}:`, error);
        process.exit(1);
    }
}

export function getUserKeypair(): Keypair {
    return loadKeypairFromFile(USER_KEYPAIR_PATH);
}
