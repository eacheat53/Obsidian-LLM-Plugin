/**
 * hash-utils.ts 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
    calculateContentHash,
    isValidHash,
    hashesEqual,
} from './hash-utils';

describe('calculateContentHash', () => {
    it('相同内容应返回相同哈希', async () => {
        const content = 'Hello, World!';
        const hash1 = await calculateContentHash(content);
        const hash2 = await calculateContentHash(content);
        expect(hash1).toBe(hash2);
    });

    it('不同内容应返回不同哈希', async () => {
        const hash1 = await calculateContentHash('Content A');
        const hash2 = await calculateContentHash('Content B');
        expect(hash1).not.toBe(hash2);
    });

    it('哈希应为 64 字符的十六进制字符串', async () => {
        const hash = await calculateContentHash('test content');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('空内容应返回有效哈希', async () => {
        const hash = await calculateContentHash('');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('Unicode 内容应正确处理', async () => {
        const hash1 = await calculateContentHash('你好世界');
        const hash2 = await calculateContentHash('你好世界');
        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });
});

describe('isValidHash', () => {
    it('有效哈希应返回 true', () => {
        const validHash = '315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3';
        expect(isValidHash(validHash)).toBe(true);
    });

    it('无效格式应返回 false', () => {
        expect(isValidHash('invalid-hash')).toBe(false);
        expect(isValidHash('too-short')).toBe(false);
        expect(isValidHash('')).toBe(false);
    });

    it('包含非十六进制字符应返回 false', () => {
        // 'g' 不是有效的十六进制字符
        const invalidHash = 'g15f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3';
        expect(isValidHash(invalidHash)).toBe(false);
    });

    it('长度不正确应返回 false', () => {
        // 63 字符
        const shortHash = '15f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3';
        expect(isValidHash(shortHash)).toBe(false);

        // 65 字符
        const longHash = '315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd31';
        expect(isValidHash(longHash)).toBe(false);
    });

    it('大写字母应返回 false (只接受小写)', () => {
        const upperHash = '315F5BDB76D078C43B8AC0064E4A0164612B1FCE77C869345BFC94C75894EDD3';
        expect(isValidHash(upperHash)).toBe(false);
    });
});

describe('hashesEqual', () => {
    it('相等哈希应返回 true', () => {
        const hash = '315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3';
        expect(hashesEqual(hash, hash)).toBe(true);
    });

    it('不相等哈希应返回 false', () => {
        const hash1 = '315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3';
        const hash2 = '415f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3';
        expect(hashesEqual(hash1, hash2)).toBe(false);
    });
});
