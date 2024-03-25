import { Cluster } from "@solana/web3.js";

// Endpoints, connection
export const ENV: Cluster = (process.env.CLUSTER as Cluster) || "mainnet-beta";

export const MBC_MINT_ADDRESS = "4s41P39cBUsBbVzEuf6TTLsdJGniuLfjKyR4ZEBgNKba"
export const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
export const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112"

