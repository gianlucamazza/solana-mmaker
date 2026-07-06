import { Decimal } from "decimal.js";

/**
 * Converts a readable number of tokens to the smallest unit (e.g., lamports for SOL).
 * Uses Decimal arithmetic to avoid floating-point precision loss on large amounts.
 * @param {Decimal.Value} value - The amount in readable units.
 * @param {number} decimals - The number of decimals the token uses.
 * @returns {string} - The amount in the smallest unit, as an integer string.
 */
export function fromNumberToLamports(
  value: Decimal.Value,
  decimals: number,
): string {
  return new Decimal(value).mul(new Decimal(10).pow(decimals)).toFixed(0);
}

/**
 * Converts the smallest unit of tokens (e.g., lamports for SOL) to a readable number.
 * @param {Decimal.Value} value - The amount in the smallest unit.
 * @param {number} decimals - The number of decimals the token uses.
 * @returns {Decimal} - The readable amount, fractional part included.
 */
export function fromLamportsToNumber(
  value: Decimal.Value,
  decimals: number,
): Decimal {
  return new Decimal(value).div(new Decimal(10).pow(decimals));
}
