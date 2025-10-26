/**
 * UUID generation utilities for note identifiers
 */

import { NoteId } from '../types/index';

/**
 * Generate a unique UUID v4 identifier for a note
 * Uses the built-in Web Crypto API (crypto.randomUUID())
 *
 * @returns A UUID v4 string in the format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 *
 * @example
 * const noteId = generateNoteId();
 * // Returns: "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateNoteId(): NoteId {
  // Use the native crypto.randomUUID() - 3-12x faster than npm packages
  // This is available in all modern browsers and Node.js 14.17.0+
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older environments (should not be needed in Obsidian)
  // This implementation follows RFC 4122 version 4 UUID specification
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Validate if a string is a valid UUID v4
 *
 * @param uuid - String to validate
 * @returns True if the string is a valid UUID v4 format
 *
 * @example
 * isValidUUID("550e8400-e29b-41d4-a716-446655440000"); // true
 * isValidUUID("invalid-uuid"); // false
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
