# LLM API Contract (Generic)

**API Providers**: Gemini, OpenAI, Anthropic, others
**Purpose**: AI scoring for note pairs and tag generation
**Integration**: Configurable provider via plugin settings

---

## Overview

This contract defines the generic interface for LLM interactions. The plugin supports multiple providers through a unified adapter pattern. Each provider adapter translates between the plugin's generic format and the provider-specific API.

---

## Use Case 1: Batch Note Pair Scoring

### Purpose
Evaluate semantic relevance between note pairs to determine which links should be inserted.

### Request Format (Plugin → LLM)

**Generic Structure** (before provider adaptation):
```typescript
interface ScoringBatchRequest {
  task_type: "scoring";
  items: Array<{
    item_id: string;           // Composite key: "noteId1:noteId2"
    note_1: {
      title: string;           // Note filename without .md
      content_preview: string; // First 500 chars or full content
    };
    note_2: {
      title: string;
      content_preview: string;
    };
  }>;
  prompt_template: string;     // User custom or default prompt
}
```

**Example**:
```json
{
  "task_type": "scoring",
  "items": [
    {
      "item_id": "uuid1:uuid2",
      "note_1": {
        "title": "Machine Learning Basics",
        "content_preview": "Machine learning is a subset of AI..."
      },
      "note_2": {
        "title": "Neural Networks Overview",
        "content_preview": "Neural networks are computing systems..."
      }
    },
    {
      "item_id": "uuid1:uuid3",
      "note_1": {
        "title": "Machine Learning Basics",
        "content_preview": "Machine learning is a subset of AI..."
      },
      "note_2": {
        "title": "Cooking Recipes",
        "content_preview": "Here are my favorite pasta dishes..."
      }
    }
  ],
  "prompt_template": "Rate the semantic relevance between these notes on a scale of 0-10..."
}
```

### Default Scoring Prompt

```
You are an expert knowledge management assistant. Your task is to evaluate the semantic relevance between pairs of notes in an Obsidian vault.

For each note pair provided, assign a relevance score from 0 to 10:
- 0-2: Completely unrelated topics
- 3-4: Tangentially related, different domains
- 5-6: Related concepts, may share some terminology
- 7-8: Closely related, linking would add value
- 9-10: Highly related, essential cross-reference

Respond with a JSON array of scores in the same order as the input pairs.

Input pairs:
{{BATCH_ITEMS}}

Response format:
[
  {"item_id": "uuid1:uuid2", "score": 8, "reason": "Brief explanation"},
  {"item_id": "uuid1:uuid3", "score": 2, "reason": "Brief explanation"}
]
```

### Response Format (LLM → Plugin)

```typescript
interface ScoringBatchResponse {
  results: Array<{
    item_id: string;           // Must match request item_id
    score: number;             // Integer 0-10
    reason?: string;           // Optional explanation
  }>;
}
```

**Example**:
```json
{
  "results": [
    {
      "item_id": "uuid1:uuid2",
      "score": 8,
      "reason": "Both notes discuss neural networks and machine learning fundamentals"
    },
    {
      "item_id": "uuid1:uuid3",
      "score": 1,
      "reason": "Unrelated topics: ML vs cooking"
    }
  ]
}
```

---

## Use Case 2: Batch Tag Generation

### Purpose
Generate relevant tags for notes based on their content.

### Request Format (Plugin → LLM)

```typescript
interface TaggingBatchRequest {
  task_type: "tagging";
  items: Array<{
    item_id: string;           // note_id
    note_title: string;
    note_content: string;      // Full or truncated content
  }>;
  prompt_template: string;
  existing_vault_tags?: string[]; // All tags currently in use (for consistency)
}
```

**Example**:
```json
{
  "task_type": "tagging",
  "items": [
    {
      "item_id": "uuid1",
      "note_title": "Machine Learning Basics",
      "note_content": "Machine learning is a subset of artificial intelligence..."
    },
    {
      "item_id": "uuid2",
      "note_title": "React Hooks Tutorial",
      "note_content": "React Hooks are functions that let you use state..."
    }
  ],
  "prompt_template": "Generate 3-5 relevant tags for each note...",
  "existing_vault_tags": ["ai", "web-dev", "tutorial", "python"]
}
```

### Default Tagging Prompt

```
You are an expert knowledge management assistant. Your task is to generate relevant, concise tags for notes in an Obsidian vault.

For each note provided:
1. Generate 3-5 tags that accurately describe the note's topic
2. Use lowercase-with-hyphens format (e.g., "machine-learning", "web-dev")
3. Prefer existing vault tags when applicable to maintain consistency
4. Create new tags only when existing tags are insufficient

Existing vault tags: {{EXISTING_TAGS}}

Input notes:
{{BATCH_ITEMS}}

Response format (JSON array):
[
  {"item_id": "uuid1", "tags": ["machine-learning", "ai", "tutorial"]},
  {"item_id": "uuid2", "tags": ["react", "web-dev", "javascript"]}
]
```

### Response Format (LLM → Plugin)

```typescript
interface TaggingBatchResponse {
  results: Array<{
    item_id: string;           // Must match request item_id
    tags: string[];            // 3-5 tags
  }>;
}
```

**Example**:
```json
{
  "results": [
    {
      "item_id": "uuid1",
      "tags": ["machine-learning", "ai", "tutorial"]
    },
    {
      "item_id": "uuid2",
      "tags": ["react", "web-dev", "javascript", "hooks"]
    }
  ]
}
```

---

## Provider Adapters

### Gemini API Adapter

```typescript
import { requestUrl } from 'obsidian';

interface GeminiConfig {
  api_url: string;        // e.g., "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent"
  api_key: string;
  model_name: string;     // e.g., "gemini-1.5-flash"
}

/**
 * Adapter for Google Gemini API
 */
export class GeminiAdapter {
  async scoreBatch(request: ScoringBatchRequest, config: GeminiConfig): Promise<ScoringBatchResponse> {
    const prompt = this.buildScoringPrompt(request);

    const geminiRequest = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,  // Low temperature for consistent scoring
        response_mime_type: "application/json"
      }
    };

    const response = await requestUrl({
      url: `${config.api_url}?key=${config.api_key}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiRequest)
    });

    // Parse Gemini response
    const geminiData = response.json;
    const generatedText = geminiData.candidates[0].content.parts[0].text;
    const parsedResults = JSON.parse(generatedText);

    return { results: parsedResults };
  }

  async tagBatch(request: TaggingBatchRequest, config: GeminiConfig): Promise<TaggingBatchResponse> {
    // Similar implementation for tagging
  }

  private buildScoringPrompt(request: ScoringBatchRequest): string {
    // Replace {{BATCH_ITEMS}} placeholder with actual data
    const itemsJson = JSON.stringify(request.items, null, 2);
    return request.prompt_template.replace('{{BATCH_ITEMS}}', itemsJson);
  }
}
```

### OpenAI API Adapter

```typescript
interface OpenAIConfig {
  api_url: string;        // "https://api.openai.com/v1/chat/completions"
  api_key: string;
  model_name: string;     // "gpt-4o-mini"
}

export class OpenAIAdapter {
  async scoreBatch(request: ScoringBatchRequest, config: OpenAIConfig): Promise<ScoringBatchResponse> {
    const prompt = this.buildScoringPrompt(request);

    const openaiRequest = {
      model: config.model_name,
      messages: [
        {
          role: "system",
          content: "You are an expert knowledge management assistant."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    };

    const response = await requestUrl({
      url: config.api_url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(openaiRequest)
    });

    const data = response.json;
    const parsedResults = JSON.parse(data.choices[0].message.content);

    return { results: parsedResults.results };
  }
}
```

---

## Error Responses

### Classification by HTTP Status

#### 401/403 - Configuration Error
```json
{
  "error": {
    "message": "Invalid API key",
    "code": "invalid_authentication"
  }
}
```
**Plugin Action**: Abort, show "Check AI provider settings" notification

#### 400 - Content Error (rarely for LLM)
```json
{
  "error": {
    "message": "Request too large",
    "code": "request_too_large"
  }
}
```
**Plugin Action**: Reduce batch size, retry with smaller batches

#### 429 - Transient Error
```json
{
  "error": {
    "message": "Rate limit exceeded",
    "code": "rate_limit_error",
    "retry_after": 60
  }
}
```
**Plugin Action**: Exponential backoff retry (1s, 2s, 4s)

#### 500/503 - Transient Error
```json
{
  "error": {
    "message": "Service temporarily unavailable"
  }
}
```
**Plugin Action**: Exponential backoff retry

---

## Batch Size Recommendations

| Provider | Max Tokens | Recommended Batch Size (Scoring) | Recommended Batch Size (Tagging) |
|----------|-----------|----------------------------------|----------------------------------|
| Gemini 1.5 Flash | 1M | 20 pairs | 10 notes |
| GPT-4o-mini | 128K | 15 pairs | 8 notes |
| Claude 3.5 Sonnet | 200K | 15 pairs | 8 notes |

**Plugin Defaults**: 10 pairs for scoring, 5 notes for tagging (conservative)

---

## Response Validation

```typescript
/**
 * Validate LLM response matches expected format
 */
function validateScoringResponse(response: ScoringBatchResponse, request: ScoringBatchRequest): boolean {
  // Check all item_ids are present
  const requestIds = new Set(request.items.map(i => i.item_id));
  const responseIds = new Set(response.results.map(r => r.item_id));

  if (requestIds.size !== responseIds.size) {
    throw new Error('Response count mismatch');
  }

  // Validate scores in range [0, 10]
  for (const result of response.results) {
    if (!requestIds.has(result.item_id)) {
      throw new Error(`Unknown item_id in response: ${result.item_id}`);
    }
    if (result.score < 0 || result.score > 10 || !Number.isInteger(result.score)) {
      throw new Error(`Invalid score for ${result.item_id}: ${result.score}`);
    }
  }

  return true;
}
```

---

## Testing Strategy

### Mock Responses
```typescript
const mockScoringResponse: ScoringBatchResponse = {
  results: [
    { item_id: "uuid1:uuid2", score: 8, reason: "Highly related ML topics" },
    { item_id: "uuid1:uuid3", score: 2, reason: "Unrelated domains" }
  ]
};

describe('GeminiAdapter', () => {
  it('should correctly parse scoring response', async () => {
    // Mock requestUrl to return Gemini-formatted response
    const adapter = new GeminiAdapter();
    const result = await adapter.scoreBatch(mockRequest, mockConfig);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].score).toBe(8);
  });
});
```

---

## Changelog

**v1.0.0** (2025-10-25)
- Initial contract definition
- Support for Gemini and OpenAI adapters
- Batch scoring and tagging operations
- Three-tier error classification
