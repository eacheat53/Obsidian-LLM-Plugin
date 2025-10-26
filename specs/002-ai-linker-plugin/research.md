# Technical Research: Obsidian AI Linker Plugin

**Branch**: `002-ai-linker-plugin`
**Date**: 2025-10-25
**Research Phase**: Technology Stack Decisions

## Executive Summary

This document provides research-backed technical decisions for the Obsidian AI Linker Plugin implementation. All recommendations prioritize compatibility with Obsidian's Electron environment, mobile support, zero external runtime dependencies, and alignment with current (2024-2025) best practices in the Obsidian plugin ecosystem.

---

## 1. UUID Generation

### Decision: Use Built-in `crypto.randomUUID()`

**Recommended Implementation**:
```typescript
// src/utils/id-generator.ts

/**
 * Generates a cryptographically secure UUID v4 for note identification
 * @returns A UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateNoteId(): string {
  return crypto.randomUUID();
}
```

### Rationale

1. **Native Performance**: `crypto.randomUUID()` is 3-12x faster than npm uuid packages (3x faster than `uuid.v4()`, 12x faster than `nanoid`)
2. **Zero Dependencies**: No external packages required, reducing bundle size and maintenance burden
3. **Cryptographically Secure**: Uses the same secure random source as npm uuid packages (`crypto.getRandomValues()`)
4. **Obsidian Compatibility**: Available in Electron (Node.js 14.17.0+) and modern browsers that Obsidian supports
5. **Mobile Support**: Works on both desktop and mobile Obsidian environments

### Alternatives Considered

| Alternative | Why Not Preferred |
|-------------|-------------------|
| **npm `uuid` package** | Adds ~12KB dependency; slower performance; unnecessary for v4 UUIDs only |
| **`crypto.randomBytes()`** | Requires manual UUID formatting; Node.js-only (not Web Crypto API standard) |
| **Manual implementation** | Reinventing the wheel; higher risk of implementation errors |

### Implementation Notes

**Browser/Node.js Compatibility**:
- Node.js: Available since v14.17.0 (Obsidian uses Electron with recent Node.js)
- Browser: Chrome 92+, Safari 15.4+, Firefox 95+ (all covered by Obsidian's supported versions)
- Secure context only: Not an issue since Obsidian runs as `app://` protocol (secure context)

**Limitations**:
- Only generates UUID v4 (random). If you need v1, v3, or v5, use npm `uuid` package
- For this project, v4 is sufficient as we only need unique identifiers

**Testing Consideration**:
- Jest may require polyfilling in test environments (see [Testing Framework](#4-testing-framework) section)

**Example Usage in Plugin**:
```typescript
// When processing a note without a note_id
import { generateNoteId } from './utils/id-generator';

const noteId = generateNoteId();
// Update front-matter with note_id
await this.frontmatterParser.setProperty(file, 'note_id', noteId);
```

---

## 2. SHA-256 Hashing

### Decision: Use Web Crypto API's `SubtleCrypto.digest()`

**Recommended Implementation**:
```typescript
// src/utils/hash-utils.ts

/**
 * Generates a SHA-256 hash from content string
 * @param content - The text content to hash
 * @returns Promise resolving to hex-encoded hash string
 */
export async function sha256Hash(content: string): Promise<string> {
  // Encode as UTF-8 Uint8Array
  const msgUint8 = new TextEncoder().encode(content);

  // Generate hash using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);

  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return hashHex;
}

/**
 * Extracts main content for hashing (content between front-matter and HASH_BOUNDARY)
 * @param fileContent - Full markdown file content
 * @returns Content section to hash
 */
export function extractHashableContent(fileContent: string): string {
  // Remove YAML front-matter
  const withoutFrontmatter = fileContent.replace(/^---\n[\s\S]*?\n---\n/, '');

  // Extract content before HASH_BOUNDARY marker
  const hashBoundaryIndex = withoutFrontmatter.indexOf('<!-- HASH_BOUNDARY -->');

  if (hashBoundaryIndex === -1) {
    return withoutFrontmatter.trim();
  }

  return withoutFrontmatter.substring(0, hashBoundaryIndex).trim();
}
```

### Rationale

1. **Standard Web API**: Part of Web Crypto API standard, available in both browsers and Node.js
2. **Zero Dependencies**: No npm packages required
3. **Electron Compatibility**: Fully supported in Electron environments (both renderer and main process)
4. **Mobile Compatible**: Works on Obsidian mobile (iOS/Android)
5. **Asynchronous by Design**: Aligns with modern async/await patterns and non-blocking operations
6. **Performance**: Native implementation is highly optimized

### Alternatives Considered

| Alternative | Why Not Preferred |
|-------------|-------------------|
| **Node.js `crypto` module** | Desktop-only; not available in browser contexts; less portable |
| **npm `js-sha256` package** | Adds dependency; slower than native implementation; unnecessary |
| **npm `crypto-js` package** | Large bundle size (40KB+); synchronous; outdated patterns |

### Implementation Notes

**Cross-Platform Compatibility**:
- Works in both Electron (Node.js) and browser environments
- Available via `globalThis.crypto.subtle` or `crypto.subtle`
- Node.js support since v15.0.0 (Web Crypto API implementation)

**Secure Context Requirement**:
- Web Crypto API requires secure context (HTTPS)
- Not an issue: Obsidian runs on `app://` protocol (secure context)

**Output Format**:
- Returns hexadecimal string (64 characters for SHA-256)
- Example: `"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"`

**Performance Considerations**:
- Async operation: Use `await` or `.then()` patterns
- For large content (>1MB), hashing is still fast (<10ms typically)
- Consider throttling during batch operations to avoid UI blocking

**Usage in Incremental Updates**:
```typescript
// FR-002: Incremental Update Implementation
import { sha256Hash, extractHashableContent } from './utils/hash-utils';

async function shouldProcessNote(file: TFile, cachedHash: string | null): Promise<boolean> {
  const content = await this.app.vault.read(file);
  const hashableContent = extractHashableContent(content);
  const currentHash = await sha256Hash(hashableContent);

  return currentHash !== cachedHash;
}
```

**Error Handling**:
```typescript
try {
  const hash = await sha256Hash(content);
} catch (error) {
  console.error('SHA-256 hashing failed:', error);
  // Fallback: treat as new content if hashing fails
  return null;
}
```

---

## 3. Vector Math for Cosine Similarity

### Decision: Manual Implementation Using `Math.hypot()`

**Recommended Implementation**:
```typescript
// src/utils/vector-math.ts

/**
 * Calculates cosine similarity between two embedding vectors
 * Returns a value between -1 (opposite) and 1 (identical)
 * @param vecA - First embedding vector (e.g., from Jina API)
 * @param vecB - Second embedding vector
 * @returns Cosine similarity score
 * @throws Error if vectors have different dimensions
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(
      `Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`
    );
  }

  // Calculate dot product in single pass
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);

  // Calculate magnitudes using Math.hypot (optimized & numerically stable)
  const magnitudeA = Math.hypot(...vecA);
  const magnitudeB = Math.hypot(...vecB);

  // Handle zero-magnitude vectors
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Batch calculates similarities between one note and multiple candidates
 * Optimized to avoid recalculating magnitude for the source vector
 * @param sourceVec - Source note embedding
 * @param candidateVecs - Array of candidate note embeddings
 * @returns Array of similarity scores in same order as candidates
 */
export function batchCosineSimilarity(
  sourceVec: number[],
  candidateVecs: number[][]
): number[] {
  const sourceMagnitude = Math.hypot(...sourceVec);

  if (sourceMagnitude === 0) {
    return new Array(candidateVecs.length).fill(0);
  }

  return candidateVecs.map(candidateVec => {
    const dotProduct = sourceVec.reduce((sum, val, i) => sum + val * candidateVec[i], 0);
    const candidateMagnitude = Math.hypot(...candidateVec);

    if (candidateMagnitude === 0) return 0;

    return dotProduct / (sourceMagnitude * candidateMagnitude);
  });
}

/**
 * Finds top N most similar notes by cosine similarity
 * @param sourceVec - Source note embedding
 * @param candidates - Array of {noteId, embedding} objects
 * @param topN - Number of top results to return
 * @param minSimilarity - Minimum similarity threshold (e.g., 0.7)
 * @returns Top N candidates sorted by similarity (descending)
 */
export function findTopSimilar<T extends { noteId: string; embedding: number[] }>(
  sourceVec: number[],
  candidates: T[],
  topN: number,
  minSimilarity: number = 0.0
): Array<T & { similarity: number }> {
  const similarities = batchCosineSimilarity(
    sourceVec,
    candidates.map(c => c.embedding)
  );

  const candidatesWithScores = candidates.map((candidate, i) => ({
    ...candidate,
    similarity: similarities[i]
  }));

  return candidatesWithScores
    .filter(c => c.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}
```

### Rationale

1. **Simplicity**: Cosine similarity is mathematically straightforward (dot product / magnitudes)
2. **Zero Dependencies**: No external library needed for this basic operation
3. **Performance**: Modern JavaScript is fast enough for typical vault sizes (1000-10,000 notes)
4. **Control**: Full control over optimization and batching strategies
5. **Bundle Size**: Saves 5-20KB compared to importing a math library
6. **Math.hypot() Optimization**: Native function is highly optimized and numerically stable

### Alternatives Considered

| Alternative | Why Not Preferred |
|-------------|-------------------|
| **npm `fast-cosine-similarity`** | Adds dependency; minimal performance gain for typical use case |
| **npm `cosinity`** | Zero-dependency claim, but still adds to bundle; simple operation doesn't warrant package |
| **npm `compute-cosine-similarity`** | Older package; slower than manual implementation with Math.hypot() |
| **Math.js or similar** | Overkill (500KB+ bundle); only need one operation |
| **WASM/SIMD optimizations** | Too complex; JavaScript is fast enough for this use case |

### Implementation Notes

**Performance Analysis**:

For typical Jina embeddings (768 dimensions) and 1000 notes:
- Single similarity calculation: ~0.1ms
- Batch processing 1000 comparisons: ~100ms (well within 5-minute target for full scan)
- 10,000 notes: ~1 second for one-to-many comparisons

**Optimization Strategies**:

1. **Batch Processing**: Process notes in chunks to keep UI responsive
   ```typescript
   async function processInBatches<T>(
     items: T[],
     batchSize: number,
     processor: (batch: T[]) => Promise<void>
   ): Promise<void> {
     for (let i = 0; i < items.length; i += batchSize) {
       const batch = items.slice(i, i + batchSize);
       await processor(batch);
       // Yield to event loop every batch
       await new Promise(resolve => setTimeout(resolve, 0));
     }
   }
   ```

2. **Pre-filter by Threshold**: Use Jina similarity threshold before expensive AI scoring
   ```typescript
   // Settings: jina_similarity_threshold = 0.7
   const candidates = findTopSimilar(
     sourceEmbedding,
     allNoteEmbeddings,
     50, // More than final max_links_per_note
     settings.jina_similarity_threshold
   );
   ```

3. **Cache Magnitudes**: For repeated comparisons, cache vector magnitudes
   ```typescript
   interface CachedEmbedding {
     embedding: number[];
     magnitude: number; // Pre-calculated
   }
   ```

**Numerical Stability**:
- `Math.hypot()` handles overflow/underflow better than manual `Math.sqrt(sum of squares)`
- Returns accurate results even for very large or very small vector components

**TypeScript Type Safety**:
```typescript
// Type for embeddings in cache
interface NoteEmbedding {
  note_id: string;
  embedding: number[]; // Array of floats from Jina API
  magnitude?: number; // Optional cached magnitude
}

// Ensure type safety when loading from JSON
function validateEmbedding(data: unknown): number[] {
  if (!Array.isArray(data) || !data.every(x => typeof x === 'number')) {
    throw new Error('Invalid embedding format');
  }
  return data;
}
```

**Testing Consideration**:
```typescript
// test/vector-math.test.ts
describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1.0);
  });

  it('handles zero vectors gracefully', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});
```

---

## 4. Testing Framework

### Decision: Jest with `jest-environment-obsidian`

**Recommended Setup**:

1. **Install Dependencies**:
   ```bash
   npm install --save-dev jest jest-environment-obsidian @types/jest ts-jest
   ```

2. **Jest Configuration** (`jest.config.js`):
   ```javascript
   const { extend } = require('jest-environment-obsidian/jest-preset');

   module.exports = extend({
     preset: 'ts-jest',
     testEnvironment: 'jest-environment-obsidian',
     roots: ['<rootDir>/src', '<rootDir>/test'],
     testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
     collectCoverageFrom: [
       'src/**/*.ts',
       '!src/**/*.d.ts',
       '!src/types/**'
     ],
     setupFiles: ['<rootDir>/test/setup.ts'],
     globals: {
       'ts-jest': {
         tsconfig: {
           esModuleInterop: true,
           allowSyntheticDefaultImports: true
         }
       }
     }
   });
   ```

3. **Test Setup File** (`test/setup.ts`):
   ```typescript
   // Polyfill crypto.randomUUID for Jest environment
   if (!globalThis.crypto?.randomUUID) {
     const { randomUUID } = require('crypto');
     globalThis.crypto = {
       ...globalThis.crypto,
       randomUUID
     };
   }
   ```

4. **Package.json Scripts**:
   ```json
   {
     "scripts": {
       "test": "jest",
       "test:watch": "jest --watch",
       "test:coverage": "jest --coverage"
     }
   }
   ```

### Rationale

1. **Official Community Support**: `jest-environment-obsidian` maintained by Obsidian community
2. **Obsidian API Shimming**: Automatically provides Obsidian module imports without errors
3. **Industry Standard**: Jest is the most widely used JavaScript testing framework
4. **TypeScript Integration**: Works seamlessly with `ts-jest` for TypeScript projects
5. **Proven in Production**: Used successfully in Obsidian DEV Publish Plugin (2024)

### Alternatives Considered

| Alternative | Why Not Preferred |
|-------------|-------------------|
| **Vitest** | Newer, smaller community for Obsidian; requires Vite (sample plugin uses esbuild); less Obsidian-specific tooling |
| **Mocha + Chai** | Less comprehensive; requires more configuration; Jest has better TypeScript support |
| **No testing framework** | Unacceptable for production plugin; violates SC-008 quality standards |

### Implementation Notes

**jest-environment-obsidian Configuration Options**:

| Option | Values | Default | Use Case |
|--------|--------|---------|----------|
| `conformance` | "lax", "strict" | "lax" | Set to "strict" for production-like behavior |
| `version` | semver string | "1.1.16" | Match your target Obsidian version |
| `ignoreWarnings` | string[] | [] | Suppress known harmless warnings |
| `missingExports` | "warning", "error", "undef" | "warning" | Control handling of unimplemented APIs |

**Per-File Configuration Example**:
```typescript
/**
 * @jest-environment jest-environment-obsidian
 * @obsidian-conformance strict
 * @obsidian-version 1.4.16
 */

import { TFile } from 'obsidian';
import { NoteProcessor } from '../src/services/note-processor';

describe('NoteProcessor', () => {
  // Tests that interact with Obsidian API
});
```

**Testing Strategy**:

1. **Unit Tests**: Test utilities and pure functions (hash, vector math, etc.)
   - No Obsidian dependencies
   - Fast execution
   - High coverage

2. **Integration Tests**: Test services that use Obsidian API
   - Use `jest-environment-obsidian` for API mocking
   - Test file operations, front-matter parsing, etc.
   - Mock external API calls

3. **Example Test Structure**:
   ```typescript
   // test/utils/hash-utils.test.ts
   import { sha256Hash, extractHashableContent } from '../../src/utils/hash-utils';

   describe('sha256Hash', () => {
     it('generates consistent hash for same input', async () => {
       const content = 'test content';
       const hash1 = await sha256Hash(content);
       const hash2 = await sha256Hash(content);
       expect(hash1).toBe(hash2);
     });

     it('generates different hash for different input', async () => {
       const hash1 = await sha256Hash('content 1');
       const hash2 = await sha256Hash('content 2');
       expect(hash1).not.toBe(hash2);
     });
   });

   describe('extractHashableContent', () => {
     it('removes YAML front-matter', () => {
       const content = '---\ntitle: Test\n---\nMain content';
       const result = extractHashableContent(content);
       expect(result).toBe('Main content');
     });

     it('extracts content before HASH_BOUNDARY', () => {
       const content = 'Main content\n<!-- HASH_BOUNDARY -->\nLinks here';
       const result = extractHashableContent(content);
       expect(result).toBe('Main content');
     });
   });
   ```

**Mocking External APIs**:
```typescript
// test/services/api-service.test.ts
import { requestUrl } from 'obsidian';
import { JinaApiService } from '../../src/services/api-service';

jest.mock('obsidian');

describe('JinaApiService', () => {
  it('calls Jina API with correct parameters', async () => {
    const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;
    mockRequestUrl.mockResolvedValueOnce({
      status: 200,
      json: { embeddings: [[0.1, 0.2, 0.3]] }
    } as any);

    const service = new JinaApiService('test-api-key');
    const result = await service.generateEmbedding('test content');

    expect(mockRequestUrl).toHaveBeenCalledWith({
      url: expect.stringContaining('jina.ai'),
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': 'Bearer test-api-key'
      }),
      body: expect.any(String)
    });
  });
});
```

**Continuous Integration**:
```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

**Known Limitations**:
- `jest-environment-obsidian` is work-in-progress; not all Obsidian APIs are implemented
- For unimplemented APIs, use manual mocking or interface segregation pattern
- Some DOM interactions may behave differently in Jest vs real Obsidian

**TDD Pattern for Obsidian Plugins**:

From "Writing an Obsidian Plugin Driven By Tests" (2024):
- Create custom interfaces instead of depending directly on Obsidian types
- Use TypeScript generics to decouple from Obsidian's concrete types
- Implement fake/test doubles for your interfaces
- Inject real Obsidian implementations in production, test doubles in tests

Example:
```typescript
// src/interfaces/file-manager.ts
export interface IFileManager<TFile> {
  read(file: TFile): Promise<string>;
  modify(file: TFile, content: string): Promise<void>;
}

// src/services/obsidian-file-manager.ts
import { TFile, Vault } from 'obsidian';
import { IFileManager } from '../interfaces/file-manager';

export class ObsidianFileManager implements IFileManager<TFile> {
  constructor(private vault: Vault) {}

  async read(file: TFile): Promise<string> {
    return this.vault.read(file);
  }

  async modify(file: TFile, content: string): Promise<void> {
    await this.vault.modify(file, content);
  }
}

// test/mocks/fake-file-manager.ts
export class FakeFileManager implements IFileManager<{ path: string }> {
  private files = new Map<string, string>();

  async read(file: { path: string }): Promise<string> {
    return this.files.get(file.path) || '';
  }

  async modify(file: { path: string }, content: string): Promise<void> {
    this.files.set(file.path, content);
  }
}
```

---

## 5. Best Practices for Obsidian HTTP Requests

### Decision: Use Obsidian's `requestUrl()` API Exclusively

**Recommended Implementation**:
```typescript
// src/services/api-service.ts
import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';

/**
 * Base API service for making HTTP requests
 * Uses Obsidian's requestUrl to bypass CORS and ensure mobile compatibility
 */
export class ApiService {
  /**
   * Makes an HTTP request using Obsidian's requestUrl API
   * Handles errors with three-tier classification (FR-012)
   * @param params - Request parameters
   * @returns Response data
   */
  protected async makeRequest<T>(params: RequestUrlParam): Promise<T> {
    try {
      const response: RequestUrlResponse = await requestUrl(params);

      if (response.status >= 200 && response.status < 300) {
        return response.json as T;
      }

      throw new Error(`HTTP ${response.status}: ${response.text}`);
    } catch (error) {
      throw this.classifyError(error, params);
    }
  }

  /**
   * Classifies errors into three tiers per FR-012
   */
  private classifyError(error: unknown, params: RequestUrlParam): Error {
    if (error instanceof Error) {
      const message = error.message;

      // Configuration Errors (401, 404, 400)
      if (message.includes('401') || message.includes('403')) {
        return new ConfigurationError('Invalid API key. Check settings.', error);
      }
      if (message.includes('404')) {
        return new ConfigurationError('API endpoint not found. Check URL.', error);
      }
      if (message.includes('400')) {
        return new ConfigurationError('Bad request. Check API parameters.', error);
      }

      // Transient Errors (500, 503, 504, 429)
      if (message.includes('500') || message.includes('503') ||
          message.includes('504') || message.includes('429')) {
        return new TransientError('Server error. Will retry automatically.', error);
      }

      // Network errors
      if (message.includes('network') || message.includes('timeout')) {
        return new TransientError('Network error. Will retry automatically.', error);
      }
    }

    // Unknown errors treated as transient
    return new TransientError('Unknown error occurred.', error as Error);
  }
}

/**
 * Jina AI API service for embeddings generation
 */
export class JinaApiService extends ApiService {
  constructor(
    private apiKey: string,
    private modelName: string = 'jina-embeddings-v2-base-en',
    private maxChars: number = 8000
  ) {
    super();
  }

  /**
   * Generates embedding for a single text
   * @param text - Input text (automatically truncated if too long)
   * @returns Embedding vector (array of floats)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const truncatedText = text.substring(0, this.maxChars);

    const response = await this.makeRequest<JinaEmbeddingResponse>({
      url: 'https://api.jina.ai/v1/embeddings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.modelName,
        input: [truncatedText]
      })
    });

    return response.data[0].embedding;
  }

  /**
   * Batch generates embeddings for multiple texts (more efficient)
   * @param texts - Array of input texts
   * @returns Array of embedding vectors
   */
  async batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
    const truncatedTexts = texts.map(t => t.substring(0, this.maxChars));

    const response = await this.makeRequest<JinaEmbeddingResponse>({
      url: 'https://api.jina.ai/v1/embeddings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.modelName,
        input: truncatedTexts
      })
    });

    return response.data.map(item => item.embedding);
  }
}

/**
 * LLM API service for scoring and tag generation
 */
export class LlmApiService extends ApiService {
  constructor(
    private provider: string, // 'gemini', 'openai', etc.
    private apiUrl: string,
    private apiKey: string,
    private modelName: string
  ) {
    super();
  }

  /**
   * Scores note pairs for link relevance (batch request per FR-005)
   * @param notePairs - Array of {note_id_1, note_id_2, content_1, content_2}
   * @param prompt - Custom or default scoring prompt
   * @returns Array of {note_id_1, note_id_2, score}
   */
  async scoreNotePairs(
    notePairs: NotePair[],
    prompt: string
  ): Promise<ScoringResult[]> {
    // Format prompt with JSON structure
    const systemPrompt = `${prompt}\n\nRespond with a JSON array of objects with fields: note_id_1, note_id_2, score (1-10).`;

    const userMessage = JSON.stringify(notePairs);

    const response = await this.makeRequest<LlmResponse>({
      url: this.apiUrl,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.0, // Deterministic scoring
        response_format: { type: 'json_object' }
      })
    });

    // Parse and validate response
    const results = JSON.parse(response.choices[0].message.content);
    return this.validateScoringResults(results, notePairs);
  }

  private validateScoringResults(
    results: unknown,
    notePairs: NotePair[]
  ): ScoringResult[] {
    if (!Array.isArray(results)) {
      throw new ContentError('LLM returned non-array response');
    }

    // Verify all note_id pairs match input
    const pairMap = new Map(notePairs.map(p => [`${p.note_id_1}:${p.note_id_2}`, p]));

    return results.map((result: any) => {
      const key = `${result.note_id_1}:${result.note_id_2}`;
      if (!pairMap.has(key)) {
        throw new ContentError(`LLM returned unexpected note pair: ${key}`);
      }

      return {
        note_id_1: result.note_id_1,
        note_id_2: result.note_id_2,
        score: Math.max(0, Math.min(10, result.score)) // Clamp to 0-10
      };
    });
  }
}

// Error classes for three-tier classification
export class ConfigurationError extends Error {
  constructor(message: string, public cause: Error) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class TransientError extends Error {
  constructor(message: string, public cause: Error) {
    super(message);
    this.name = 'TransientError';
  }
}

export class ContentError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'ContentError';
  }
}

// Type definitions
interface JinaEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
}

interface LlmResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface NotePair {
  note_id_1: string;
  note_id_2: string;
  content_1: string;
  content_2: string;
}

interface ScoringResult {
  note_id_1: string;
  note_id_2: string;
  score: number;
}
```

### Rationale

1. **CORS Bypass**: `requestUrl()` bypasses CORS restrictions that block standard `fetch()`
2. **Mobile Compatibility**: Works seamlessly on both desktop and mobile Obsidian
3. **Official API**: Part of Obsidian's plugin API, guaranteed to work across versions
4. **Consistent Error Handling**: Same error patterns across all platforms

### Alternatives Considered

| Alternative | Why Not Preferred |
|-------------|-------------------|
| **Standard `fetch()`** | Blocked by CORS; different origins on mobile (app:// vs capacitor://localhost) |
| **Axios library** | Adds dependency; community recommends replacing with requestUrl |
| **Node.js `https` module** | Desktop-only; doesn't work on mobile |

### Implementation Notes

**CORS Issues with fetch()**:
```typescript
// ❌ This will fail with CORS error
fetch('https://api.jina.ai/v1/embeddings', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer key' },
  body: JSON.stringify({...})
})
// Error: Access to fetch at 'https://api.jina.ai' from origin 'app://obsidian.md'
// has been blocked by CORS policy
```

**Correct Obsidian Approach**:
```typescript
// ✅ This works on desktop and mobile
import { requestUrl } from 'obsidian';

const response = await requestUrl({
  url: 'https://api.jina.ai/v1/embeddings',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({...})
});

const data = response.json;
```

**Mobile CORS Origins**:
- Desktop: `app://obsidian.md`
- Mobile (iOS/Android): `capacitor://localhost` or `http://localhost`
- `requestUrl()` handles these differences automatically

**Request/Response Interface**:
```typescript
interface RequestUrlParam {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
  contentType?: string;
}

interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: any;
  arrayBuffer: ArrayBuffer;
}
```

**Error Handling Pattern** (FR-012: Three-Tier Classification):
```typescript
async function makeRequestWithRetry<T>(
  params: RequestUrlParam,
  maxRetries: number = 3
): Promise<T> {
  const delays = [1000, 2000, 4000]; // Exponential backoff

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await makeRequest<T>(params);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        // No retry for configuration errors
        new Notice(error.message, 10000);
        throw error;
      }

      if (error instanceof TransientError && attempt < maxRetries) {
        // Retry with backoff
        console.log(`Retry attempt ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        continue;
      }

      if (error instanceof ContentError) {
        // Skip this item, continue processing
        console.warn('Content error:', error.message);
        return null as T; // Or handle appropriately
      }

      // Final failure
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}
```

**Timeout Handling**:
```typescript
// requestUrl doesn't support timeout parameter directly
// Implement using Promise.race pattern
async function makeRequestWithTimeout<T>(
  params: RequestUrlParam,
  timeoutMs: number = 30000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new TransientError('Request timeout', new Error())), timeoutMs);
  });

  return Promise.race([
    makeRequest<T>(params),
    timeoutPromise
  ]);
}
```

**Streaming Limitation**:
- As of 2024, `requestUrl()` does NOT support streaming responses
- The entire response body must be received before parsing
- For large responses, consider chunking requests or using pagination

**Testing requestUrl**:
```typescript
// test/services/api-service.test.ts
import { requestUrl } from 'obsidian';
import { JinaApiService } from '../../src/services/api-service';

jest.mock('obsidian');

describe('JinaApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles successful response', async () => {
    (requestUrl as jest.Mock).mockResolvedValueOnce({
      status: 200,
      json: {
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      }
    });

    const service = new JinaApiService('test-key');
    const result = await service.generateEmbedding('test');

    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('throws ConfigurationError on 401', async () => {
    (requestUrl as jest.Mock).mockRejectedValueOnce(
      new Error('HTTP 401: Unauthorized')
    );

    const service = new JinaApiService('invalid-key');

    await expect(service.generateEmbedding('test'))
      .rejects
      .toThrow(ConfigurationError);
  });
});
```

---

## Additional Best Practices

### Bundle Size Optimization

**Current Stack Adds Zero Dependencies**:
- UUID: `crypto.randomUUID()` - native
- SHA-256: `crypto.subtle.digest()` - native
- Vector math: Manual implementation
- HTTP: `requestUrl()` - Obsidian API
- Testing: Jest (dev-only)

**Total additional bundle size**: ~0 bytes (excluding TypeScript definitions)

### TypeScript Configuration

**Recommended `tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node", "jest"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "**/*.test.ts"]
}
```

### Build Configuration

**Recommended `esbuild.config.mjs`**:
```javascript
import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
Source: https://github.com/your-username/obsidian-ai-linker
*/
`;

const prod = process.argv[2] === 'production';

esbuild.build({
  banner: { js: banner },
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/*',
    ...builtins
  ],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  minify: prod,
  outfile: 'main.js',
}).catch(() => process.exit(1));
```

### Performance Monitoring

**Recommended Instrumentation**:
```typescript
// src/utils/performance.ts

export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  measure<T>(label: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const duration = performance.now() - start;
      this.record(label, duration);
    }
  }

  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.record(label, duration);
    }
  }

  private record(label: string, duration: number): void {
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    this.metrics.get(label)!.push(duration);
  }

  getStats(label: string): { count: number; avg: number; min: number; max: number } | null {
    const measurements = this.metrics.get(label);
    if (!measurements || measurements.length === 0) return null;

    return {
      count: measurements.length,
      avg: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements)
    };
  }

  printStats(): void {
    console.log('=== Performance Statistics ===');
    for (const [label, _] of this.metrics) {
      const stats = this.getStats(label);
      if (stats) {
        console.log(
          `${label}: avg=${stats.avg.toFixed(2)}ms, ` +
          `min=${stats.min.toFixed(2)}ms, ` +
          `max=${stats.max.toFixed(2)}ms, ` +
          `count=${stats.count}`
        );
      }
    }
  }

  clear(): void {
    this.metrics.clear();
  }
}

// Usage in plugin
export const perfMonitor = new PerformanceMonitor();

// In settings "Show Statistics" button
this.addCommand({
  id: 'show-statistics',
  name: 'Show Statistics',
  callback: () => {
    perfMonitor.printStats();
  }
});
```

---

## Summary Table

| Technology | Decision | Rationale |
|------------|----------|-----------|
| **UUID Generation** | `crypto.randomUUID()` | Native, 3-12x faster, zero dependencies, Electron/browser compatible |
| **SHA-256 Hashing** | `crypto.subtle.digest()` | Web Crypto API standard, native, async, cross-platform |
| **Cosine Similarity** | Manual with `Math.hypot()` | Simple math, zero dependencies, fast enough, full control |
| **Testing Framework** | Jest + `jest-environment-obsidian` | Community standard, Obsidian API shimming, proven in production |
| **HTTP Requests** | Obsidian `requestUrl()` | CORS bypass, mobile compatible, official API |

**Total External Dependencies Added**: 0 runtime, 4 dev-only (jest, ts-jest, @types/jest, jest-environment-obsidian)

**Bundle Size Impact**: ~0 bytes (all native APIs)

**Platform Coverage**: Desktop (Windows/macOS/Linux) + Mobile (iOS/Android)

---

## References

### Official Documentation
- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Web Crypto API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Node.js Web Crypto API](https://nodejs.org/api/webcrypto.html)

### Community Resources
- [jest-environment-obsidian](https://github.com/obsidian-community/jest-environment-obsidian)
- [Obsidian Forum: Make HTTP Requests from Plugins](https://forum.obsidian.md/t/make-http-requests-from-plugins/15461)
- [How to Find Examples of Jest-based Plugin Tests](https://publish.obsidian.md/hub/04+-+Guides,+Workflows,+&+Courses/Guides/How+to+find+examples+of+Jest-based+plugin+tests)

### Technical Articles (2024-2025)
- [How to Implement Cosine Similarity in TypeScript](https://alexop.dev/posts/how-to-implement-a-cosine-similarity-function-in-typescript-for-vector-comparison/)
- [Writing an Obsidian Plugin Driven By Tests](https://dev.to/stroiman/writing-an-obsidian-plugin-driven-by-tests-1b35)
- [Why You Should Switch to crypto.randomUUID()](https://corner.buka.sh/why-you-should-switch-to-crypto-randomuuid-for-uuid-generation/)
- [Migrating from Node.js crypto to Web Crypto API](https://blog.logto.io/migrate-to-web-crypto)

### Example Plugins
- [obsidian-hash](https://github.com/zigahertz/obsidian-hash) - Crypto hash generation
- [obsidian-gpt-zettelkasten](https://github.com/glovguy/obsidian-gpt-zettelkasten) - Vector embeddings and semantic search
- [cryptsidian](https://github.com/triumphantomato/cryptsidian) - Vault encryption

---

## Next Steps

1. **Phase 1: Design**
   - Create `data-model.md` defining cache schemas and TypeScript interfaces
   - Create `contracts/` directory with API contracts (Jina, LLM, cache)
   - Create `quickstart.md` for developer onboarding

2. **Phase 2: Task Generation**
   - Run `/speckit.tasks` to generate `tasks.md`
   - Review and refine task breakdown

3. **Phase 3: Implementation**
   - Set up project structure with recommended build configuration
   - Implement utilities first (id-generator, hash-utils, vector-math)
   - Set up Jest testing environment
   - Implement services layer with API integrations
   - Build UI components
   - Write tests throughout development

---

**Document Status**: ✅ Complete
**Reviewed By**: AI Research Agent
**Last Updated**: 2025-10-25
