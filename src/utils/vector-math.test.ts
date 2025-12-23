/**
 * vector-math.ts 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
    cosineSimilarity,
    pairwiseSimilarities,
    dotProduct,
    magnitude,
    normalize,
} from './vector-math';

describe('cosineSimilarity', () => {
    it('相同向量应返回 1', () => {
        const vector = [1, 2, 3, 4, 5];
        const result = cosineSimilarity(vector, vector);
        expect(result).toBeCloseTo(1, 5);
    });

    it('正交向量应返回 0', () => {
        const a = [1, 0, 0];
        const b = [0, 1, 0];
        const result = cosineSimilarity(a, b);
        expect(result).toBeCloseTo(0, 5);
    });

    it('相似向量应返回高分', () => {
        const a = [1, 2, 3];
        const b = [4, 5, 6];
        const result = cosineSimilarity(a, b);
        expect(result).toBeGreaterThan(0.9);
    });

    it('零向量应返回 0', () => {
        const zero = [0, 0, 0];
        const normal = [1, 2, 3];
        expect(cosineSimilarity(zero, normal)).toBe(0);
        expect(cosineSimilarity(normal, zero)).toBe(0);
    });

    it('向量长度不匹配应抛出错误', () => {
        const a = [1, 2, 3];
        const b = [1, 2];
        expect(() => cosineSimilarity(a, b)).toThrow('向量长度不匹配');
    });

    it('空向量应抛出错误', () => {
        expect(() => cosineSimilarity([], [])).toThrow('无法计算空向量的相似度');
    });

    it('结果应在 [0, 1] 范围内', () => {
        const a = [1, -2, 3, -4];
        const b = [-1, 2, -3, 4];
        const result = cosineSimilarity(a, b);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
    });
});

describe('pairwiseSimilarities', () => {
    it('对角线应全为 1', () => {
        const vectors = [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
        ];
        const result = pairwiseSimilarities(vectors);

        expect(result[0][0]).toBeCloseTo(1, 5);
        expect(result[1][1]).toBeCloseTo(1, 5);
        expect(result[2][2]).toBeCloseTo(1, 5);
    });

    it('结果矩阵应对称', () => {
        const vectors = [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
        ];
        const result = pairwiseSimilarities(vectors);

        expect(result[0][1]).toBeCloseTo(result[1][0], 5);
        expect(result[0][2]).toBeCloseTo(result[2][0], 5);
        expect(result[1][2]).toBeCloseTo(result[2][1], 5);
    });

    it('空输入应返回空数组', () => {
        const result = pairwiseSimilarities([]);
        expect(result).toEqual([]);
    });

    it('单个向量应返回 [[1]]', () => {
        const result = pairwiseSimilarities([[1, 2, 3]]);
        expect(result).toEqual([[1]]);
    });
});

describe('dotProduct', () => {
    it('应正确计算点积', () => {
        const a = [1, 2, 3];
        const b = [4, 5, 6];
        // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
        expect(dotProduct(a, b)).toBe(32);
    });

    it('正交向量点积应为 0', () => {
        const a = [1, 0, 0];
        const b = [0, 1, 0];
        expect(dotProduct(a, b)).toBe(0);
    });

    it('向量长度不匹配应抛出错误', () => {
        expect(() => dotProduct([1, 2], [1, 2, 3])).toThrow('向量长度不匹配');
    });
});

describe('magnitude', () => {
    it('应正确计算向量范数', () => {
        const vector = [3, 4]; // sqrt(9 + 16) = 5
        expect(magnitude(vector)).toBe(5);
    });

    it('单位向量范数应为 1', () => {
        const unitVector = [1, 0, 0];
        expect(magnitude(unitVector)).toBe(1);
    });

    it('零向量范数应为 0', () => {
        expect(magnitude([0, 0, 0])).toBe(0);
    });

    it('应正确处理负数', () => {
        const vector = [-3, 4]; // sqrt(9 + 16) = 5
        expect(magnitude(vector)).toBe(5);
    });
});

describe('normalize', () => {
    it('归一化后向量长度应为 1', () => {
        const vector = [3, 4, 5];
        const normalized = normalize(vector);
        expect(magnitude(normalized)).toBeCloseTo(1, 5);
    });

    it('归一化应保持方向', () => {
        const vector = [2, 0, 0];
        const normalized = normalize(vector);
        expect(normalized[0]).toBeCloseTo(1, 5);
        expect(normalized[1]).toBeCloseTo(0, 5);
        expect(normalized[2]).toBeCloseTo(0, 5);
    });

    it('零向量归一化应返回零向量', () => {
        const zero = [0, 0, 0];
        const normalized = normalize(zero);
        expect(normalized).toEqual([0, 0, 0]);
    });
});
