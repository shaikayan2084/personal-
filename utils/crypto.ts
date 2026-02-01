
import { TransactionShare } from '../types';

/**
 * Simulated Symmetric Encryption (Base64 + Rot13 for demo visualization)
 */
export const encryptValue = (val: number | string): string => {
  const str = String(val);
  return btoa(str).replace(/[a-zA-Z]/g, (c) => {
    // Fix: Avoid reassigning the string parameter 'c' with a number to resolve TS type errors
    const code = c.charCodeAt(0);
    const limit = (c <= "Z" ? 90 : 122);
    const shifted = code + 13;
    const finalCode = limit >= shifted ? shifted : shifted - 26;
    return String.fromCharCode(finalCode);
  });
};

/**
 * SMPC: Additive Secret Sharing
 * Splits a value into N shares such that sum(shares) = value
 */
export const splitIntoShares = (value: number, numParties: number = 3): TransactionShare[] => {
  const shares: TransactionShare[] = [];
  let remaining = value;
  
  for (let i = 0; i < numParties - 1; i++) {
    const share = Math.random() * value * 0.5;
    shares.push({ partyId: `Node-${i + 1}`, shareValue: share });
    remaining -= share;
  }
  
  shares.push({ partyId: `Node-${numParties}`, shareValue: remaining });
  return shares;
};

/**
 * SMPC: Reconstruct value from shares
 */
export const reconstructFromShares = (shares: TransactionShare[]): number => {
  return shares.reduce((acc, curr) => acc + curr.shareValue, 0);
};
