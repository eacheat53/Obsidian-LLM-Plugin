/**
 * Core type definitions for Obsidian AI Linker Plugin
 */

/**
 * Unique identifier for a note (UUID v4 format)
 */
export type NoteId = string;

/**
 * SHA-256 hash in lowercase hex format
 */
export type ContentHash = string;

/**
 * Unix timestamp in milliseconds
 */
export type UnixTimestamp = number;

/**
 * Cosine similarity score (0.0 to 1.0)
 */
export type SimilarityScore = number;

/**
 * AI relevance score (0 to 10)
 */
export type AIScore = number;

/**
 * Metadata for a single note stored in the cache
 */
export interface NoteMetadata {
  /** Unique identifier for this note */
  note_id: NoteId;

  /** Relative path from vault root (e.g., "folder/note.md") */
  file_path: string;

  /** SHA-256 hash of main content (before HASH_BOUNDARY marker) */
  content_hash: ContentHash;

  /** When this note was last processed (Unix timestamp in ms) */
  last_processed: UnixTimestamp;

  /** AI-generated tags merged with user tags */
  tags: string[];

  /** Whether note has valid YAML front-matter */
  has_frontmatter: boolean;

  /** Whether note contains <!-- HASH_BOUNDARY --> marker */
  has_hash_boundary: boolean;

  /** Whether note has <!-- LINKS_START/END --> block */
  has_links_section: boolean;
}

/**
 * Similarity and AI scores for a pair of notes
 */
export interface NotePairScore {
  /** First note UUID (lexicographically smaller) */
  note_id_1: NoteId;

  /** Second note UUID (lexicographically larger) */
  note_id_2: NoteId;

  /** Cosine similarity score (0.0 to 1.0) */
  similarity_score: SimilarityScore;

  /** LLM relevance score (0 to 10) */
  ai_score: AIScore;

  /** When AI scoring was performed (Unix timestamp in ms) */
  last_scored: UnixTimestamp;
}

/**
 * Vector embedding for a note
 */
export interface EmbeddingVector {
  /** Note identifier matching MasterIndex */
  note_id: NoteId;

  /** Vector embedding (typically 768 or 1024 floats) */
  embedding: number[];

  /** Jina model used (e.g., 'jina-embeddings-v2-base-en') */
  model_name: string;

  /** When the embedding was generated (Unix timestamp in ms) */
  created_at: UnixTimestamp;

  /** First 200 chars of content for debugging */
  content_preview: string;
}

/**
 * Note processing lifecycle states
 */
export enum NoteProcessingState {
  /** Note discovered but not yet processed */
  DISCOVERED = 'discovered',

  /** UUID and hash calculated */
  INDEXED = 'indexed',

  /** Embedding generated */
  EMBEDDED = 'embedded',

  /** Similarity scores calculated */
  SCORED = 'scored',

  /** Links inserted */
  LINKED = 'linked',

  /** Processing failed */
  FAILED = 'failed'
}

/**
 * Task execution status
 */
export enum TaskStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  CANCELLING = 'cancelling',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Background task information
 */
export interface TaskInfo {
  /** Unique task identifier */
  task_id: string;

  /** Task name for display */
  task_name: string;

  /** Current status */
  status: TaskStatus;

  /** Progress percentage (0-100) */
  progress: number;

  /** Current step description */
  current_step: string;

  /** When task started */
  started_at: UnixTimestamp;

  /** When task completed/failed */
  completed_at?: UnixTimestamp;

  /** Error message if failed */
  error_message?: string;
}
