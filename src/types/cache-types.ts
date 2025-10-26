/**
 * Type definitions for cache data structures
 */

import { NoteId, NoteMetadata, NotePairScore, UnixTimestamp } from './index';

/**
 * Cache statistics for performance monitoring
 */
export interface CacheStatistics {
  /** Total number of notes in cache */
  total_notes: number;

  /** Total number of embedding files */
  total_embeddings: number;

  /** Total number of note pair scores */
  total_scores: number;

  /** Notes no longer in vault but still in cache */
  orphaned_notes: number;
}

/**
 * Master index cache file structure (index.json)
 */
export interface MasterIndex {
  /** Schema version (semantic versioning) */
  version: string;

  /** When the cache was last modified (Unix timestamp in ms) */
  last_updated: UnixTimestamp;

  /** Map of note_id to NoteMetadata */
  notes: Record<NoteId, NoteMetadata>;

  /**
   * Map of composite key 'noteId1:noteId2' to NotePairScore
   * Note: noteId1 must be lexicographically smaller than noteId2
   */
  scores: Record<string, NotePairScore>;

  /** Aggregate statistics */
  stats: CacheStatistics;
}

/**
 * Cache file paths configuration
 */
export interface CachePaths {
  /** Root cache directory */
  cache_dir: string;

  /** Master index file path */
  index_file: string;

  /** Embeddings directory path */
  embeddings_dir: string;
}

/**
 * Options for cache operations
 */
export interface CacheLoadOptions {
  /** Create cache if it doesn't exist */
  create_if_missing?: boolean;

  /** Validate schema version */
  validate_schema?: boolean;

  /** Perform orphaned data detection */
  detect_orphans?: boolean;
}

/**
 * Options for cache save operations
 */
export interface CacheSaveOptions {
  /** Use atomic writes (write to temp file, then rename) */
  atomic?: boolean;

  /** Update statistics before saving */
  update_stats?: boolean;

  /** Pretty-print JSON for debugging */
  pretty_print?: boolean;
}

/**
 * Result of cache load operation
 */
export interface CacheLoadResult {
  /** Whether cache was loaded successfully */
  success: boolean;

  /** The loaded master index (undefined if failed) */
  index?: MasterIndex;

  /** Error message if failed */
  error?: string;

  /** Whether a new cache was created */
  created_new: boolean;

  /** Schema migration performed */
  migrated: boolean;
}

/**
 * Result of embedding load operation
 */
export interface EmbeddingLoadResult {
  /** Whether embedding was loaded successfully */
  success: boolean;

  /** The embedding vector (undefined if failed) */
  embedding?: number[];

  /** Error message if failed */
  error?: string;

  /** Whether embedding was loaded from cache or needs generation */
  from_cache: boolean;
}
