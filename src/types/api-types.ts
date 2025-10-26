/**
 * Type definitions for external API requests and responses
 */

import { NoteId, SimilarityScore, AIScore } from './index';

/**
 * Supported LLM providers
 */
export type LLMProvider = 'gemini' | 'openai' | 'anthropic' | 'custom';

/**
 * Generation mode for batch operations
 */
export type GenerationMode = 'smart' | 'force';

// ============================================================================
// Jina AI Embeddings API
// ============================================================================

/**
 * Request to generate embeddings for a single note
 */
export interface JinaEmbeddingRequest {
  /** Text content to embed (truncated to max_chars) */
  input: string;

  /** Model name (e.g., 'jina-embeddings-v2-base-en') */
  model: string;

  /** Note identifier for tracking */
  note_id: NoteId;
}

/**
 * Request to generate embeddings for multiple notes (batch)
 */
export interface JinaBatchEmbeddingRequest {
  /** Array of text content to embed */
  input: string[];

  /** Model name */
  model: string;

  /** Note identifiers for tracking (same length as input array) */
  note_ids: NoteId[];
}

/**
 * Single embedding result from Jina API
 */
export interface JinaEmbeddingResult {
  /** The embedding vector */
  embedding: number[];

  /** Index in the input array */
  index: number;
}

/**
 * Response from Jina embeddings API
 */
export interface JinaEmbeddingResponse {
  /** Model used for generation */
  model: string;

  /** Array of embedding results */
  data: JinaEmbeddingResult[];

  /** Token usage information */
  usage?: {
    total_tokens: number;
    prompt_tokens: number;
  };
}

// ============================================================================
// LLM API (Generic interface for scoring and tagging)
// ============================================================================

/**
 * Single note pair for AI scoring
 */
export interface NotePairForScoring {
  /** First note identifier */
  note_id_1: NoteId;

  /** Second note identifier */
  note_id_2: NoteId;

  /** Title of first note */
  title_1: string;

  /** Title of second note */
  title_2: string;

  /** Content excerpt from first note */
  content_1: string;

  /** Content excerpt from second note */
  content_2: string;

  /** Cosine similarity score (already calculated) */
  similarity_score: SimilarityScore;
}

/**
 * Batch request for AI scoring of note pairs
 */
export interface ScoringBatchRequest {
  /** Array of note pairs to score */
  pairs: NotePairForScoring[];

  /** Custom prompt (optional, uses default if not provided) */
  prompt?: string;
}

/**
 * Single score result from LLM
 */
export interface ScoreResult {
  /** First note identifier (for verification) */
  note_id_1: NoteId;

  /** Second note identifier (for verification) */
  note_id_2: NoteId;

  /** AI relevance score (0-10) */
  score: AIScore;

  /** Optional reasoning from LLM */
  reasoning?: string;
}

/**
 * Response from LLM scoring API
 */
export interface ScoringBatchResponse {
  /** Array of score results (same order as request) */
  scores: ScoreResult[];

  /** Model used for scoring */
  model: string;

  /** Token usage information */
  usage?: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/**
 * Single note for AI tag generation
 */
export interface NoteForTagging {
  /** Note identifier */
  note_id: NoteId;

  /** Note title */
  title: string;

  /** Full note content (or excerpt if too long) */
  content: string;

  /** Existing tags (for context) */
  existing_tags: string[];
}

/**
 * Batch request for AI tag generation
 */
export interface TaggingBatchRequest {
  /** Array of notes to generate tags for */
  notes: NoteForTagging[];

  /** Custom prompt (optional, uses default if not provided) */
  prompt?: string;

  /** Minimum tags to generate per note */
  min_tags?: number;

  /** Maximum tags to generate per note */
  max_tags?: number;
}

/**
 * Single tag generation result from LLM
 */
export interface TagResult {
  /** Note identifier (for verification) */
  note_id: NoteId;

  /** Generated tags */
  tags: string[];

  /** Optional reasoning from LLM */
  reasoning?: string;
}

/**
 * Response from LLM tagging API
 */
export interface TaggingBatchResponse {
  /** Array of tag results (same order as request) */
  results: TagResult[];

  /** Model used for tagging */
  model: string;

  /** Token usage information */
  usage?: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

// ============================================================================
// LLM Provider Adapter Interface
// ============================================================================

/**
 * Generic interface for LLM provider adapters
 */
export interface LLMAdapter {
  /**
   * Score a batch of note pairs for relevance
   */
  scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse>;

  /**
   * Generate tags for a batch of notes
   */
  generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse>;
}

// ============================================================================
// Error Response Types
// ============================================================================

/**
 * API error response structure
 */
export interface APIErrorResponse {
  /** HTTP status code */
  status: number;

  /** Error message */
  message: string;

  /** Error type/code from API */
  error_code?: string;

  /** Additional error details */
  details?: unknown;
}
