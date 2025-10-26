/**
 * 用于增量更新的 SHA-256 内容 hash 实用程序
 */

import { ContentHash } from '../types/index';

/**
 * 使用 Web Crypto API 计算内容的 SHA-256 hash
 * 用于检测笔记中的内容更改
 *
 * @param content - 要进行 hash 的文本内容
 * @returns 小写十六进制格式的 SHA-256 hash（64 个字符）
 *
 * @example
 * const hash = await calculateContentHash("Hello, world!");
 * // 返回: "315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3"
 */
export async function calculateContentHash(content: string): Promise<ContentHash> {
  // 将字符串转换为 Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(content);

  // 使用 Web Crypto API 计算 SHA-256 hash
  // 这是内置的，比 JavaScript 实现快得多
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // 将 ArrayBuffer 转换为十六进制字符串
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * 验证字符串是否为有效的 SHA-256 hash
 *
 * @param hash - 要验证的字符串
 * @returns 如果字符串是有效的 SHA-256 hash 格式（64 个十六进制字符），则为 True
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
 * 比较两个 hash 是否相等
 *
 * @param hash1 - 第一个 hash
 * @param hash2 - 第二个 hash
 * @returns 如果 hash 相等则为 True
 */
export function hashesEqual(hash1: ContentHash, hash2: ContentHash): boolean {
  return hash1 === hash2;
}
