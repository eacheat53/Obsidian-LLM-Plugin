# Jina AI Embeddings API Contract

**API Provider**: Jina AI
**Base URL**: `https://api.jina.ai/v1/embeddings`
**Documentation**: https://jina.ai/embeddings/
**Purpose**: Generate vector embeddings for note content

---

## Authentication

**Method**: Bearer Token in Authorization header

```typescript
headers: {
  'Authorization': `Bearer ${settings.jina_api_key}`,
  'Content-Type': 'application/json'
}
```

---

## Request: Generate Embeddings

### Endpoint
```
POST https://api.jina.ai/v1/embeddings
```

### Request Body

```typescript
interface JinaEmbeddingRequest {
  input: string | string[];    // Single text or array of texts
  model: string;                // e.g., "jina-embeddings-v2-base-en"
  encoding_format?: string;     // Optional: "float" (default) or "base64"
}
```

**Example**:
```json
{
  "input": "This is a note about machine learning and neural networks.",
  "model": "jina-embeddings-v2-base-en"
}
```

**Batch Example** (multiple notes):
```json
{
  "input": [
    "First note content...",
    "Second note content...",
    "Third note content..."
  ],
  "model": "jina-embeddings-v2-base-en"
}
```

### Request Constraints
- **Max input length**: 8000 characters per text (configurable via `jina_embedding_max_chars`)
- **Max batch size**: 100 inputs per request (plugin may use smaller batches)
- **Content preparation**:
  - Extract content between YAML front-matter and `<!-- HASH_BOUNDARY -->` marker
  - Truncate to `jina_embedding_max_chars` if exceeds limit
  - Strip markdown formatting? (DECISION: Keep markdown for better semantic understanding)

---

## Response: Embeddings

### Success Response (200 OK)

```typescript
interface JinaEmbeddingResponse {
  object: "list";
  data: Array<{
    object: "embedding";
    index: number;              // Position in input array (0-indexed)
    embedding: number[];        // Float array (768-dim for base model, 1024 for large)
  }>;
  model: string;                // Echo of requested model
  usage: {
    total_tokens: number;       // Total tokens processed
    prompt_tokens: number;      // Same as total_tokens for embeddings
  };
}
```

**Example**:
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.123, -0.456, 0.789, ...]  // 768 floats
    }
  ],
  "model": "jina-embeddings-v2-base-en",
  "usage": {
    "total_tokens": 42,
    "prompt_tokens": 42
  }
}
```

### Error Responses

#### 401 Unauthorized (Configuration Error)
```json
{
  "error": {
    "message": "Invalid authentication credentials",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```
**Plugin Action**: Classify as Configuration Error → Abort task, show actionable notification

#### 400 Bad Request (Content Error)
```json
{
  "error": {
    "message": "Input exceeds maximum length of 8000 characters",
    "type": "invalid_request_error",
    "code": "input_too_long"
  }
}
```
**Plugin Action**: Classify as Content Error → Skip note, continue queue

#### 429 Too Many Requests (Transient Error)
```json
{
  "error": {
    "message": "Rate limit exceeded. Retry after 60 seconds.",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}
```
**Plugin Action**: Classify as Transient Error → Exponential backoff retry (1s, 2s, 4s)

#### 500/503 Server Error (Transient Error)
```json
{
  "error": {
    "message": "Internal server error. Please try again later.",
    "type": "server_error",
    "code": "internal_error"
  }
}
```
**Plugin Action**: Classify as Transient Error → Exponential backoff retry

---

## TypeScript Implementation

### Request Function

```typescript
import { requestUrl } from 'obsidian';
import type { PluginSettings } from '../types';

interface JinaEmbeddingRequest {
  input: string | string[];
  model: string;
}

interface JinaEmbeddingResponse {
  object: "list";
  data: Array<{
    object: "embedding";
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
  };
}

/**
 * Generate embeddings for one or more texts using Jina AI API
 * @param texts - Single text or array of texts to embed
 * @param settings - Plugin settings containing API key and model
 * @returns Embedding vectors in same order as input texts
 * @throws {ConfigurationError} Invalid API key or endpoint
 * @throws {ContentError} Text exceeds max length
 * @throws {TransientError} Network or server issues
 */
export async function generateJinaEmbeddings(
  texts: string | string[],
  settings: PluginSettings
): Promise<number[][]> {
  const requestBody: JinaEmbeddingRequest = {
    input: texts,
    model: settings.jina_model_name,
  };

  try {
    const response = await requestUrl({
      url: 'https://api.jina.ai/v1/embeddings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.jina_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data: JinaEmbeddingResponse = response.json;

    // Extract embeddings in order
    return data.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding);

  } catch (error) {
    // Error classification happens in api-service.ts layer
    throw error;
  }
}
```

### Content Preparation

```typescript
/**
 * Prepare note content for embedding generation
 * @param fullContent - Complete note markdown content
 * @param maxChars - Maximum characters allowed (from settings)
 * @returns Processed content ready for Jina API
 */
export function prepareContentForEmbedding(
  fullContent: string,
  maxChars: number
): string {
  // Extract content between front-matter and HASH_BOUNDARY
  const hashBoundary = '<!-- HASH_BOUNDARY -->';
  const parts = fullContent.split(hashBoundary);

  let mainContent: string;
  if (parts.length > 1) {
    mainContent = parts[0];
  } else {
    mainContent = fullContent;
  }

  // Remove YAML front-matter if present
  if (mainContent.trimStart().startsWith('---')) {
    const fmEnd = mainContent.indexOf('---', 3);
    if (fmEnd !== -1) {
      mainContent = mainContent.substring(fmEnd + 3);
    }
  }

  // Trim and truncate
  mainContent = mainContent.trim();
  if (mainContent.length > maxChars) {
    mainContent = mainContent.substring(0, maxChars);
  }

  return mainContent;
}
```

---

## Rate Limits & Quotas

**Jina AI Free Tier**:
- 1,000,000 tokens/month
- ~1 token per 4 characters
- Example: 8000-char note ≈ 2000 tokens

**Plugin Recommendations**:
- Batch requests when possible (up to 100 notes)
- Implement exponential backoff on 429 errors
- Show token usage in statistics panel

---

## Model Options

| Model Name | Dimensions | Max Input | Use Case |
|------------|-----------|-----------|----------|
| `jina-embeddings-v2-base-en` | 768 | 8192 tokens | English notes (default) |
| `jina-embeddings-v2-large-en` | 1024 | 8192 tokens | Higher quality, slower |
| `jina-embeddings-v3` | 1024 | 8192 tokens | Latest, multilingual |

**Plugin Default**: `jina-embeddings-v2-base-en` (balance of quality and speed)

---

## Testing Strategy

### Unit Tests
```typescript
describe('generateJinaEmbeddings', () => {
  it('should return 768-dim vector for base model', async () => {
    const embeddings = await generateJinaEmbeddings('test', mockSettings);
    expect(embeddings[0]).toHaveLength(768);
  });

  it('should handle batch requests', async () => {
    const texts = ['note1', 'note2', 'note3'];
    const embeddings = await generateJinaEmbeddings(texts, mockSettings);
    expect(embeddings).toHaveLength(3);
  });

  it('should classify 401 as ConfigurationError', async () => {
    // Mock 401 response
    await expect(generateJinaEmbeddings('test', badSettings))
      .rejects.toThrow(ConfigurationError);
  });
});
```

### Integration Tests
- Use Jina API sandbox/test key if available
- Mock `requestUrl` for offline tests
- Validate response schema matches contract

---

## Changelog

**v1.0.0** (2025-10-25)
- Initial contract definition
- Three-tier error classification
- Batch request support
