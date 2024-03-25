// solana-web3.d.ts
declare module '@solana/web3.js' {
    import { Buffer } from 'buffer';

    export class PublicKey {
        constructor(value: string | Buffer | Uint8Array | Array<number>);
        static isPublicKey(value: any): value is PublicKey;
        toBase58(): string;
        toBuffer(): Buffer;
    }

    export class Keypair {
        constructor();
        static generate(): Keypair;
        publicKey: PublicKey;
        secretKey: Uint8Array;
    }

    export type Commitment = 'processed' | 'confirmed' | 'finalized';

    export class Connection {
        constructor(endpoint: string, commitment?: Commitment);
        getBalance(publicKey: PublicKey, commitment?: Commitment): Promise<number>;
        getRecentBlockhash(commitment?: Commitment): Promise<any>;

    }

    export class Transaction {
        constructor();
        add(instruction: any): void;
        sign(...signers: Array<Keypair>): void;
        serializeMessage(): Buffer;
    }
}