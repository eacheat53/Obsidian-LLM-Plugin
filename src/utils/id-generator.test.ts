/**
 * id-generator.ts 单元测试
 */

import { describe, it, expect } from 'vitest';
import { generateNoteId, isValidUUID } from './id-generator';

describe('generateNoteId', () => {
    it('应返回有效的 UUID v4 格式', () => {
        const id = generateNoteId();
        expect(isValidUUID(id)).toBe(true);
    });

    it('多次调用应返回不同值', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) {
            ids.add(generateNoteId());
        }
        expect(ids.size).toBe(100);
    });

    it('UUID 格式应正确', () => {
        const id = generateNoteId();
        // UUID v4 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
});

describe('isValidUUID', () => {
    it('有效 UUID v4 应返回 true', () => {
        expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    });

    it('无效格式应返回 false', () => {
        expect(isValidUUID('invalid-uuid')).toBe(false);
        expect(isValidUUID('')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false); // 太短
    });

    it('非 v4 版本应返回 false', () => {
        // UUID v1 (版本位是 1 而不是 4)
        expect(isValidUUID('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
    });

    it('变体位不正确应返回 false', () => {
        // 变体位应该是 8, 9, a, 或 b
        expect(isValidUUID('550e8400-e29b-41d4-0716-446655440000')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-c716-446655440000')).toBe(false);
    });
});
