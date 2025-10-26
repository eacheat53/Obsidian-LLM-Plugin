/**
 * SHA-256 content hashing utilities for incremental updates
 */

import { ContentHash } from '../types/index';

/**
 * Calculate SHA-256 hash of content using Web Crypto API
 * Used for detecting content changes in notes
 *
 * @param content - The text content to hash
 * @returns SHA-256 hash in lowercase hex format (64 characters)
 *
 * @example
 * const hash = await calculateContentHash("Hello, world!");
 * // Returns: "315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3"
 */
export async function calculateContentHash(content: string): Promise<ContentHash> {
  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(content);

  // Calculate SHA-256 hash using Web Crypto API
  // This is built-in and much faster than JavaScript implementations
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Validate if a string is a valid SHA-256 hash
 *
 * @param hash - String to validate
 * @returns True if the string is a valid SHA-256 hash format (64 hex chars)
 *
 * @example
 * isValidHash("315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3"); // true
 * isValidHash("invalid-hash"); // false
 */
export function isValidHash(hash: string): boolean {
  const hashRegex = /^[a-f0-9]{64}$/;
  return hashRegex.test(hash);
}

/**
 * Compare two hashes for equality
 *
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @returns True if hashes are equal
 */
export function hashesEqual(hash1: ContentHash, hash2: ContentHash): boolean {
  return hash1 === hash2;
}
