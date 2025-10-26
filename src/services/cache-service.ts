/**
 * Cache service for managing master index and sharded embeddings
 * Implements JSON-based persistence with atomic writes
 */

import { App, TFile } from 'obsidian';
import { NoteId, EmbeddingVector, UnixTimestamp, NotePairScore } from '../types/index';
import {
  MasterIndex,
  CacheStatistics,
  CachePaths,
  CacheLoadOptions,
  CacheSaveOptions,
  CacheLoadResult,
  EmbeddingLoadResult,
} from '../types/cache-types';

/**
 * Service for managing cache data (master index + sharded embeddings)
 */
export class CacheService {
  private app: App;
  private basePath: string;
  private masterIndex: MasterIndex | null = null;
  private cacheVersion = '1.0.0';

  /**
   * In-memory index for fast score lookup
   * Maps note_id -> (related_note_id -> NotePairScore)
   */
  private scoreIndex: Map<NoteId, Map<NoteId, NotePairScore>> = new Map();

  constructor(app: App, basePath: string) {
    this.app = app;
    this.basePath = basePath;
  }

  /**
   * Get cache directory paths
   */
  private getPaths(): CachePaths {
    const cache_dir = `${this.basePath}/.obsidian/plugins/obsidian-llm-plugin/cache`;
    return {
      cache_dir,
      index_file: `${cache_dir}/index.json`,
      embeddings_dir: `${cache_dir}/embeddings`,
    };
  }

  /**
   * Load the master index from disk
   * Creates a new index if it doesn't exist
   */
  async loadMasterIndex(options: CacheLoadOptions = {}): Promise<CacheLoadResult> {
    const paths = this.getPaths();
    const {
      create_if_missing = true,
      validate_schema = true,
      detect_orphans = false,
    } = options;

    try {
      // Check if index file exists
      const indexExists = await this.fileExists(paths.index_file);

      if (!indexExists) {
        if (create_if_missing) {
          // Create new empty index
          const newIndex = this.createEmptyIndex();
          this.masterIndex = newIndex;

          // Ensure cache directories exist
          await this.ensureCacheDirectories();

          // Build empty score index
          this.buildScoreIndex();

          return {
            success: true,
            index: newIndex,
            created_new: true,
            migrated: false,
          };
        } else {
          return {
            success: false,
            error: 'Index file not found',
            created_new: false,
            migrated: false,
          };
        }
      }

      // Read and parse index file
      const content = await this.readFile(paths.index_file);
      const index = JSON.parse(content) as MasterIndex;

      // Validate schema version
      if (validate_schema && index.version !== this.cacheVersion) {
        console.warn(`[Cache Service] Schema version mismatch: ${index.version} !== ${this.cacheVersion}`);
        // Could implement migration here in the future
      }

      // Detect orphaned notes if requested
      if (detect_orphans) {
        await this.updateOrphanedStats(index);
      }

      this.masterIndex = index;

      // Build in-memory score index for fast lookups
      this.buildScoreIndex();

      return {
        success: true,
        index,
        created_new: false,
        migrated: false,
      };
    } catch (error) {
      console.error('[Cache Service] Failed to load master index:', error);
      return {
        success: false,
        error: (error as Error).message,
        created_new: false,
        migrated: false,
      };
    }
  }

  /**
   * Save the master index to disk
   * Uses atomic writes (temp file + rename) for crash safety
   */
  async saveMasterIndex(
    index: MasterIndex,
    options: CacheSaveOptions = {}
  ): Promise<void> {
    const paths = this.getPaths();
    const {
      atomic = true,
      update_stats = true,
      pretty_print = false,
    } = options;

    try {
      // Ensure cache directories exist
      await this.ensureCacheDirectories();

      // Update last_updated timestamp
      index.last_updated = Date.now();

      // Update statistics if requested
      if (update_stats) {
        index.stats = this.calculateStatistics(index);
      }

      // Serialize to JSON
      const content = pretty_print
        ? JSON.stringify(index, null, 2)
        : JSON.stringify(index);

      if (atomic) {
        // Atomic write: write to temp file, then rename
        const tempFile = `${paths.index_file}.tmp`;
        await this.writeFile(tempFile, content);
        await this.renameFile(tempFile, paths.index_file);
      } else {
        // Direct write
        await this.writeFile(paths.index_file, content);
      }

      this.masterIndex = index;
    } catch (error) {
      console.error('[Cache Service] Failed to save master index:', error);
      throw error;
    }
  }

  /**
   * Load embedding vector for a specific note
   * Returns from cache or indicates generation is needed
   */
  async loadEmbedding(noteId: NoteId): Promise<EmbeddingLoadResult> {
    const paths = this.getPaths();
    const embeddingFile = `${paths.embeddings_dir}/${noteId}.json`;

    try {
      const exists = await this.fileExists(embeddingFile);

      if (!exists) {
        return {
          success: false,
          error: 'Embedding not found',
          from_cache: false,
        };
      }

      const content = await this.readFile(embeddingFile);
      const embeddingData = JSON.parse(content) as EmbeddingVector;

      return {
        success: true,
        embedding: embeddingData.embedding,
        from_cache: true,
      };
    } catch (error) {
      console.error(`[Cache Service] Failed to load embedding for ${noteId}:`, error);
      return {
        success: false,
        error: (error as Error).message,
        from_cache: false,
      };
    }
  }

  /**
   * Save embedding vector for a specific note
   * Creates sharded file: embeddings/<note_id>.json
   */
  async saveEmbedding(embedding: EmbeddingVector): Promise<void> {
    const paths = this.getPaths();
    const embeddingFile = `${paths.embeddings_dir}/${embedding.note_id}.json`;

    try {
      // Ensure embeddings directory exists
      await this.ensureCacheDirectories();

      // Serialize to JSON
      const content = JSON.stringify(embedding);

      // Write embedding file
      await this.writeFile(embeddingFile, content);
    } catch (error) {
      console.error(`[Cache Service] Failed to save embedding for ${embedding.note_id}:`, error);
      throw error;
    }
  }

  /**
   * Clear all cache data (index and embeddings)
   * Used by "Clear Cache" button in settings
   */
  async clearCache(): Promise<void> {
    const paths = this.getPaths();

    try {
      // Delete master index
      if (await this.fileExists(paths.index_file)) {
        await this.deleteFile(paths.index_file);
      }

      // Delete all embedding files
      if (await this.directoryExists(paths.embeddings_dir)) {
        const files = await this.listFiles(paths.embeddings_dir);
        for (const file of files) {
          await this.deleteFile(`${paths.embeddings_dir}/${file}`);
        }
      }

      // Reset in-memory index
      this.masterIndex = null;

      console.log('[Cache Service] Cache cleared successfully');
    } catch (error) {
      console.error('[Cache Service] Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Calculate and print cache statistics to console
   * Used by "Show Statistics" button in settings
   */
  async showStatistics(): Promise<CacheStatistics> {
    if (!this.masterIndex) {
      const result = await this.loadMasterIndex();
      if (!result.success || !result.index) {
        throw new Error('Failed to load cache index');
      }
    }

    const stats = this.calculateStatistics(this.masterIndex!);

    console.log('=== Jina AI Linker Cache Statistics ===');
    console.log(`Total Notes: ${stats.total_notes}`);
    console.log(`Total Embeddings: ${stats.total_embeddings}`);
    console.log(`Total Scores: ${stats.total_scores}`);
    console.log(`Orphaned Notes: ${stats.orphaned_notes}`);
    console.log('======================================');

    return stats;
  }

  /**
   * Detect orphaned notes (in cache but not in vault)
   * Updates stats.orphaned_notes field
   */
  async detectOrphans(): Promise<number> {
    if (!this.masterIndex) {
      await this.loadMasterIndex();
    }

    if (!this.masterIndex) {
      return 0;
    }

    await this.updateOrphanedStats(this.masterIndex);
    return this.masterIndex.stats.orphaned_notes;
  }

  /**
   * Get current master index (cached in memory)
   */
  getMasterIndex(): MasterIndex | null {
    return this.masterIndex;
  }

  /**
   * Set master index (for in-memory updates)
   * Rebuilds score index automatically
   */
  setMasterIndex(index: MasterIndex): void {
    this.masterIndex = index;
    this.buildScoreIndex();
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Create an empty master index
   */
  private createEmptyIndex(): MasterIndex {
    return {
      version: this.cacheVersion,
      last_updated: Date.now(),
      notes: {},
      scores: {},
      stats: {
        total_notes: 0,
        total_embeddings: 0,
        total_scores: 0,
        orphaned_notes: 0,
      },
    };
  }

  /**
   * Calculate statistics from index
   */
  private calculateStatistics(index: MasterIndex): CacheStatistics {
    return {
      total_notes: Object.keys(index.notes).length,
      total_embeddings: Object.keys(index.notes).length, // Simplified - could check actual files
      total_scores: Object.keys(index.scores).length,
      orphaned_notes: index.stats.orphaned_notes || 0,
    };
  }

  /**
   * Update orphaned notes statistics
   */
  private async updateOrphanedStats(index: MasterIndex): Promise<void> {
    const vaultFiles = this.app.vault.getMarkdownFiles();
    const vaultPaths = new Set(vaultFiles.map(f => f.path));

    let orphanedCount = 0;
    for (const noteId in index.notes) {
      const notePath = index.notes[noteId].file_path;
      if (!vaultPaths.has(notePath)) {
        orphanedCount++;
      }
    }

    index.stats.orphaned_notes = orphanedCount;
  }

  /**
   * Ensure cache directories exist
   */
  private async ensureCacheDirectories(): Promise<void> {
    const paths = this.getPaths();

    // Create cache directory
    if (!(await this.directoryExists(paths.cache_dir))) {
      await this.createDirectory(paths.cache_dir);
    }

    // Create embeddings directory
    if (!(await this.directoryExists(paths.embeddings_dir))) {
      await this.createDirectory(paths.embeddings_dir);
    }
  }

  // ============================================================================
  // File System Abstraction (uses Node.js fs for direct file access)
  // ============================================================================

  private async fileExists(path: string): Promise<boolean> {
    try {
      const fs = require('fs').promises;
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async directoryExists(path: string): Promise<boolean> {
    try {
      const fs = require('fs').promises;
      const stat = await fs.stat(path);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async readFile(path: string): Promise<string> {
    const fs = require('fs').promises;
    return await fs.readFile(path, 'utf-8');
  }

  private async writeFile(path: string, content: string): Promise<void> {
    const fs = require('fs').promises;
    await fs.writeFile(path, content, 'utf-8');
  }

  private async deleteFile(path: string): Promise<void> {
    const fs = require('fs').promises;
    await fs.unlink(path);
  }

  private async renameFile(oldPath: string, newPath: string): Promise<void> {
    const fs = require('fs').promises;
    await fs.rename(oldPath, newPath);
  }

  private async createDirectory(path: string): Promise<void> {
    const fs = require('fs').promises;
    await fs.mkdir(path, { recursive: true });
  }

  private async listFiles(path: string): Promise<string[]> {
    const fs = require('fs').promises;
    return await fs.readdir(path);
  }

  // ============================================================================
  // Score Index Management (In-Memory Optimization)
  // ============================================================================

  /**
   * Build in-memory score index from flat scores structure
   * Enables O(1) lookup of all scores for a given note
   *
   * Storage structure (disk): { "id1:id2": score, "id3:id4": score }
   * Index structure (memory): { id1: { id2: score }, id2: { id1: score }, id3: { id4: score }, id4: { id3: score } }
   */
  private buildScoreIndex(): void {
    this.scoreIndex.clear();

    if (!this.masterIndex) {
      return;
    }

    // Iterate through all score pairs
    for (const [pairKey, score] of Object.entries(this.masterIndex.scores)) {
      const [noteId1, noteId2] = pairKey.split(':') as [NoteId, NoteId];

      // Add bidirectional entries to index
      if (!this.scoreIndex.has(noteId1)) {
        this.scoreIndex.set(noteId1, new Map());
      }
      if (!this.scoreIndex.has(noteId2)) {
        this.scoreIndex.set(noteId2, new Map());
      }

      this.scoreIndex.get(noteId1)!.set(noteId2, score);
      this.scoreIndex.get(noteId2)!.set(noteId1, score);
    }
  }

  /**
   * Get all scores for a given note (O(1) lookup)
   * Returns all note pairs where the given note is involved
   *
   * @param noteId - Note ID to get scores for
   * @returns Array of scores involving this note, sorted by score (descending)
   */
  getScoresForNote(noteId: NoteId): NotePairScore[] {
    const relatedScores = this.scoreIndex.get(noteId);

    if (!relatedScores) {
      return [];
    }

    // Convert Map to array and sort by AI score
    return Array.from(relatedScores.values()).sort(
      (a, b) => b.ai_score - a.ai_score
    );
  }

  /**
   * Get top N related notes for a given note
   *
   * @param noteId - Note ID to find related notes for
   * @param limit - Maximum number of results (default: 10)
   * @returns Array of top N related note IDs, sorted by score
   */
  getTopRelatedNotes(noteId: NoteId, limit: number = 10): NoteId[] {
    const scores = this.getScoresForNote(noteId);

    return scores
      .slice(0, limit)
      .map(score =>
        score.note_id_1 === noteId ? score.note_id_2 : score.note_id_1
      );
  }
}
