/**
 * Vector mathematics utilities for similarity calculations
 */

import { SimilarityScore } from '../types/index';

/**
 * Calculate cosine similarity between two vectors
 * Uses manual implementation with Math.hypot() for optimal performance
 *
 * Cosine similarity formula:
 * cos(θ) = (A · B) / (||A|| × ||B||)
 * where:
 * - A · B is the dot product
 * - ||A|| and ||B|| are the magnitudes (Euclidean norms)
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score in range [0, 1], where 1 is identical
 * @throws Error if vectors have different lengths
 *
 * @example
 * const similarity = cosineSimilarity([1, 2, 3], [4, 5, 6]);
 * // Returns: 0.9746318461970762
 */
export function cosineSimilarity(a: number[], b: number[]): SimilarityScore {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} !== ${b.length}`);
  }

  if (a.length === 0) {
    throw new Error('Cannot calculate similarity of empty vectors');
  }

  // Calculate dot product (A · B) and squared magnitudes in a single pass
  // This is more efficient for high-dimensional vectors (e.g., 768-1024 dims from Jina)
  let dotProduct = 0;
  let sumSquaresA = 0;
  let sumSquaresB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    sumSquaresA += a[i] * a[i];
    sumSquaresB += b[i] * b[i];
  }

  // Calculate magnitudes from squared sums
  const magnitudeA = Math.sqrt(sumSquaresA);
  const magnitudeB = Math.sqrt(sumSquaresB);

  // Handle zero vectors
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  // Calculate cosine similarity
  const similarity = dotProduct / (magnitudeA * magnitudeB);

  // Clamp to [0, 1] range to handle floating-point errors
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Calculate pairwise cosine similarities for all combinations of vectors
 * Optimized for batch processing
 *
 * @param vectors - Array of vectors to compare
 * @returns 2D array where result[i][j] is similarity between vectors[i] and vectors[j]
 *
 * @example
 * const vectors = [[1, 2], [3, 4], [5, 6]];
 * const similarities = pairwiseSimilarities(vectors);
 * // Returns: [[1, 0.98..., 0.96...], [0.98..., 1, 0.99...], [0.96..., 0.99..., 1]]
 */
export function pairwiseSimilarities(vectors: number[][]): SimilarityScore[][] {
  const n = vectors.length;
  const result: SimilarityScore[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  // Calculate similarities for upper triangle (i < j)
  // The matrix is symmetric, so we only need to calculate half
  for (let i = 0; i < n; i++) {
    // Diagonal is always 1 (perfect similarity with self)
    result[i][i] = 1.0;

    for (let j = i + 1; j < n; j++) {
      const similarity = cosineSimilarity(vectors[i], vectors[j]);
      result[i][j] = similarity;
      result[j][i] = similarity; // Symmetric
    }
  }

  return result;
}

/**
 * Calculate dot product of two vectors
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Dot product value
 * @throws Error if vectors have different lengths
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} !== ${b.length}`);
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i] * b[i];
  }

  return result;
}

/**
 * Calculate Euclidean magnitude (L2 norm) of a vector
 * Optimized for high-dimensional vectors (avoids spread operator)
 *
 * @param vector - Input vector
 * @returns Magnitude value
 */
export function magnitude(vector: number[]): number {
  let sumOfSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    sumOfSquares += vector[i] * vector[i];
  }
  return Math.sqrt(sumOfSquares);
}

/**
 * Normalize a vector to unit length
 *
 * @param vector - Input vector
 * @returns Normalized vector
 */
export function normalize(vector: number[]): number[] {
  const mag = magnitude(vector);
  if (mag === 0) {
    return vector.map(() => 0);
  }
  return vector.map(v => v / mag);
}
