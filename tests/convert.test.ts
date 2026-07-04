import { describe, expect, it } from 'vitest';
import { fromNumberToLamports, fromLamportsToNumber } from '../src/utils/convert';

describe('fromNumberToLamports', () => {
    it('converts whole and fractional amounts to minor units', () => {
        expect(fromNumberToLamports(1.5, 9)).toBe('1500000000');
        expect(fromNumberToLamports(1, 6)).toBe('1000000');
    });

    it('handles the smallest representable unit', () => {
        expect(fromNumberToLamports(0.000000001, 9)).toBe('1');
    });

    it('does not lose precision on large amounts (would fail with float math)', () => {
        expect(fromNumberToLamports('123456789.123456789', 9)).toBe('123456789123456789');
    });
});

describe('fromLamportsToNumber', () => {
    it('preserves the fractional part (previous implementation truncated to integer)', () => {
        expect(fromLamportsToNumber(1500000000, 9).toNumber()).toBe(1.5);
    });

    it('round-trips with fromNumberToLamports', () => {
        const lamports = fromNumberToLamports(42.123456, 6);
        expect(fromLamportsToNumber(lamports, 6).toNumber()).toBe(42.123456);
    });
});
