/**
 * 用于笔记标识符的 UUID 生成实用程序
 */

import { NoteId } from '../types/index';

/**
 * 为笔记生成唯一的 UUID v4 标识符
 * 使用内置的 Web Crypto API (crypto.randomUUID())
 *
 * @returns 格式为 xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx 的 UUID v4 字符串
 *
 * @example
 * const noteId = generateNoteId();
 * // 返回: "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateNoteId(): NoteId {
  // 使用原生的 crypto.randomUUID() - 比 npm 包快 3-12 倍
  // 这在所有现代浏览器和 Node.js 14.17.0+ 中都可用
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // 针对旧环境的回退方案（在 Obsidian 中应该不需要）
  // 此实现遵循 RFC 4122 版本 4 UUID 规范
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 验证字符串是否为有效的 UUID v4
 *
 * @param uuid - 要验证的字符串
 * @returns 如果字符串是有效的 UUID v4 格式，则为 True
 *
 * @example
 * isValidUUID("550e8400-e29b-41d4-a716-446655440000"); // true
 * isValidUUID("invalid-uuid"); // false
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
