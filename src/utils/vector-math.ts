/**
 * 用于相似度计算的向量数学实用程序
 */

import { SimilarityScore } from '../types/index';

/**
 * 计算两个向量之间的余弦相似度
 * 使用 Math.hypot() 的手动实现以获得最佳性能
 *
 * 余弦相似度公式：
 * cos(θ) = (A · B) / (||A|| × ||B||)
 * 其中：
 * - A · B 是点积
 * - ||A|| 和 ||B|| 是幅度（欧几里得范数）
 *
 * @param a - 第一个向量
 * @param b - 第二个向量
 * @returns 相似度分数，范围在 [0, 1] 之间，其中 1 表示相同
 * @throws 如果向量长度不同则抛出错误
 *
 * @example
 * const similarity = cosineSimilarity([1, 2, 3], [4, 5, 6]);
 * // 返回: 0.9746318461970762
 */
export function cosineSimilarity(a: number[], b: number[]): SimilarityScore {
  if (a.length !== b.length) {
    throw new Error(`向量长度不匹配: ${a.length} !== ${b.length}`);
  }

  if (a.length === 0) {
    throw new Error('无法计算空向量的相似度');
  }

  // 在一次遍历中计算点积 (A · B) 和平方幅度
  // 这对于高维向量（例如，来自 Jina 的 768-1024 维）更有效
  let dotProduct = 0;
  let sumSquaresA = 0;
  let sumSquaresB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    sumSquaresA += a[i] * a[i];
    sumSquaresB += b[i] * b[i];
  }

  // 从平方和计算幅度
  const magnitudeA = Math.sqrt(sumSquaresA);
  const magnitudeB = Math.sqrt(sumSquaresB);

  // 处理零向量
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  // 计算余弦相似度
  const similarity = dotProduct / (magnitudeA * magnitudeB);

  // 将范围限制在 [0, 1] 以处理浮点错误
  return Math.max(0, Math.min(1, similarity));
}

/**
 * 计算所有向量组合的成对余弦相似度
 * 针对批量处理进行了优化
 *
 * @param vectors - 要比较的向量数组
 * @returns 2D 数组，其中 result[i][j] 是 vectors[i] 和 vectors[j] 之间的相似度
 *
 * @example
 * const vectors = [[1, 2], [3, 4], [5, 6]];
 * const similarities = pairwiseSimilarities(vectors);
 * // 返回: [[1, 0.98..., 0.96...], [0.98..., 1, 0.99...], [0.96..., 0.99..., 1]]
 */
export function pairwiseSimilarities(vectors: number[][]): SimilarityScore[][] {
  const n = vectors.length;
  const result: SimilarityScore[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  // 计算上三角的相似度 (i < j)
  // 矩阵是对称的，所以我们只需要计算一半
  for (let i = 0; i < n; i++) {
    // 对角线始终为 1.0（与自身的完美相似性）
    result[i][i] = 1.0;

    for (let j = i + 1; j < n; j++) {
      const similarity = cosineSimilarity(vectors[i], vectors[j]);
      result[i][j] = similarity;
      result[j][i] = similarity; // 对称
    }
  }

  return result;
}

/**
 * 计算两个向量的点积
 *
 * @param a - 第一个向量
 * @param b - 第二个向量
 * @returns 点积值
 * @throws 如果向量长度不同则抛出错误
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`向量长度不匹配: ${a.length} !== ${b.length}`);
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i] * b[i];
  }

  return result;
}

/**
 * 计算向量的欧几里得幅度（L2 范数）
 * 针对高维向量进行了优化（避免扩展运算符）
 *
 * @param vector - 输入向量
 * @returns 幅度值
 */
export function magnitude(vector: number[]): number {
  let sumOfSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    sumOfSquares += vector[i] * vector[i];
  }
  return Math.sqrt(sumOfSquares);
}

/**
 * 将向量归一化为单位长度
 *
 * @param vector - 输入向量
 * @returns 归一化向量
 */
export function normalize(vector: number[]): number[] {
  const mag = magnitude(vector);
  if (mag === 0) {
    return vector.map(() => 0);
  }
  return vector.map(v => v / mag);
}
