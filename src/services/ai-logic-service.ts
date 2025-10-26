/**
 * AI logic service for core workflows
 * Orchestrates similarity calculation, AI scoring, and tag generation
 */

import { App, TFile } from 'obsidian';
import { PluginSettings } from '../plugin-settings';
import { NoteId, NotePairScore, SimilarityScore } from '../types/index';
import { NotePairForScoring, NoteForTagging } from '../types/api-types';
import { APIService } from './api-service';
import { CacheService } from './cache-service';
import { cosineSimilarity } from '../utils/vector-math';
import { extractMainContent } from '../utils/frontmatter-parser';

/**
 * Service for AI-powered note analysis
 */
export class AILogicService {
  private app: App;
  private settings: PluginSettings;
  private apiService: APIService;
  private cacheService: CacheService;

  constructor(
    app: App,
    settings: PluginSettings,
    apiService: APIService,
    cacheService: CacheService
  ) {
    this.app = app;
    this.settings = settings;
    this.apiService = apiService;
    this.cacheService = cacheService;
  }

  /**
   * Calculate cosine similarities between all note pairs
   * Uses vectorized operations for performance
   *
   * @param embeddings - Map of note_id to embedding vector
   * @returns Array of note pairs with similarity scores above threshold
   */
  async calculateSimilarities(
    embeddings: Map<NoteId, number[]>
  ): Promise<NotePairScore[]> {
    const pairs: NotePairScore[] = [];
    const noteIds = Array.from(embeddings.keys());

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Calculating similarities for ${noteIds.length} notes`);

      // Check if all embeddings are identical (debugging)
      const firstEmbedding = embeddings.get(noteIds[0]);
      let allIdentical = true;
      let sampleDifferences = 0;

      for (let i = 1; i < noteIds.length && allIdentical; i++) {
        const emb = embeddings.get(noteIds[i]);
        if (emb && firstEmbedding) {
          for (let j = 0; j < Math.min(10, emb.length); j++) {
            if (Math.abs(emb[j] - firstEmbedding[j]) > 0.0001) {
              allIdentical = false;
              sampleDifferences++;
              break;
            }
          }
        }
      }

      if (allIdentical) {
        console.warn('[AI Logic] ⚠️ WARNING: All embeddings appear to be identical! Check Jina API response.');
      } else {
        console.log('[AI Logic] Embeddings are different (good)');
      }

      // Log embedding statistics
      if (firstEmbedding) {
        console.log('[AI Logic] Embedding dimension:', firstEmbedding.length);
        console.log('[AI Logic] Sample values:', firstEmbedding.slice(0, 5));
      }
    }

    // Track similarity distribution for debugging
    const similarityBuckets = new Map<string, number>([
      ['0.0-0.5', 0],
      ['0.5-0.6', 0],
      ['0.6-0.7', 0],
      ['0.7-0.8', 0],
      ['0.8-0.9', 0],
      ['0.9-1.0', 0],
    ]);

    // Calculate pairwise similarities
    for (let i = 0; i < noteIds.length; i++) {
      for (let j = i + 1; j < noteIds.length; j++) {
        const noteId1 = noteIds[i];
        const noteId2 = noteIds[j];
        const embedding1 = embeddings.get(noteId1)!;
        const embedding2 = embeddings.get(noteId2)!;

        // Calculate cosine similarity
        const similarity = cosineSimilarity(embedding1, embedding2);

        // Update distribution buckets for debugging
        if (this.settings.enable_debug_logging) {
          if (similarity < 0.5) similarityBuckets.set('0.0-0.5', similarityBuckets.get('0.0-0.5')! + 1);
          else if (similarity < 0.6) similarityBuckets.set('0.5-0.6', similarityBuckets.get('0.5-0.6')! + 1);
          else if (similarity < 0.7) similarityBuckets.set('0.6-0.7', similarityBuckets.get('0.6-0.7')! + 1);
          else if (similarity < 0.8) similarityBuckets.set('0.7-0.8', similarityBuckets.get('0.7-0.8')! + 1);
          else if (similarity < 0.9) similarityBuckets.set('0.8-0.9', similarityBuckets.get('0.8-0.9')! + 1);
          else similarityBuckets.set('0.9-1.0', similarityBuckets.get('0.9-1.0')! + 1);
        }

        // Only keep pairs above threshold
        if (similarity >= this.settings.similarity_threshold) {
          pairs.push({
            note_id_1: noteId1,
            note_id_2: noteId2,
            similarity_score: similarity,
            ai_score: 0, // Will be filled by scorePairs()
            last_scored: Date.now(),
          });
        }
      }
    }

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Similarity distribution (out of ${noteIds.length * (noteIds.length - 1) / 2} total pairs):`);
      console.log('  0.0-0.5:', similarityBuckets.get('0.0-0.5'));
      console.log('  0.5-0.6:', similarityBuckets.get('0.5-0.6'));
      console.log('  0.6-0.7:', similarityBuckets.get('0.6-0.7'));
      console.log('  0.7-0.8:', similarityBuckets.get('0.7-0.8'));
      console.log('  0.8-0.9:', similarityBuckets.get('0.8-0.9'));
      console.log('  0.9-1.0:', similarityBuckets.get('0.9-1.0'));
      console.log(`[AI Logic] Found ${pairs.length} pairs above threshold ${this.settings.similarity_threshold}`);
    }

    return pairs;
  }

  /**
   * Score note pairs using LLM for relevance
   * Batches API requests for efficiency
   *
   * @param pairs - Note pairs to score
   * @returns Scored pairs with AI scores
   */
  async scorePairs(pairs: NotePairScore[]): Promise<NotePairScore[]> {
    if (pairs.length === 0) {
      return [];
    }

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Scoring ${pairs.length} pairs in batches of ${this.settings.batch_size_scoring}`);
    }

    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) {
      throw new Error('Master index not loaded');
    }

    // Process in batches
    const batchSize = this.settings.batch_size_scoring;
    const scoredPairs: NotePairScore[] = [];

    for (let i = 0; i < pairs.length; i += batchSize) {
      const batch = pairs.slice(i, i + batchSize);

      // Build note pair data for API
      const pairsForScoring: NotePairForScoring[] = await Promise.all(
        batch.map(async pair => {
          const note1 = masterIndex.notes[pair.note_id_1];
          const note2 = masterIndex.notes[pair.note_id_2];

          // Get file objects
          const file1 = this.app.vault.getAbstractFileByPath(note1.file_path) as TFile;
          const file2 = this.app.vault.getAbstractFileByPath(note2.file_path) as TFile;

          // Get content and extract main content (YAML之后，HASH_BOUNDARY之前)
          const fullContent1 = file1 ? await this.app.vault.read(file1) : '';
          const fullContent2 = file2 ? await this.app.vault.read(file2) : '';
          const mainContent1 = extractMainContent(fullContent1);
          const mainContent2 = extractMainContent(fullContent2);

          return {
            note_id_1: pair.note_id_1,
            note_id_2: pair.note_id_2,
            title_1: file1?.basename || 'Unknown',
            title_2: file2?.basename || 'Unknown',
            content_1: mainContent1.substring(0, 1000), // Only main content, limit for API
            content_2: mainContent2.substring(0, 1000), // Only main content, limit for API
            similarity_score: pair.similarity_score,
          };
        })
      );

      // Call LLM API for scoring
      const response = await this.apiService.callLLMAPI({ pairs: pairsForScoring });

      // Merge AI scores back into pairs
      for (let j = 0; j < batch.length; j++) {
        const pair = batch[j];
        const scoreResult = response.scores[j];

        scoredPairs.push({
          ...pair,
          ai_score: scoreResult?.score || 0,
          last_scored: Date.now(),
        });
      }

      if (this.settings.enable_debug_logging) {
        console.log(`[AI Logic] Scored batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pairs.length / batchSize)}`);
      }
    }

    return scoredPairs;
  }

  /**
   * Generate AI tags for multiple notes in a single batch
   * Uses batch_size_tagging setting to optimize API calls
   *
   * @param noteIds - Array of note IDs to generate tags for
   * @returns Map of note_id -> generated tags
   */
  async generateTagsBatch(noteIds: NoteId[]): Promise<Map<NoteId, string[]>> {
    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) {
      throw new Error('Master index not loaded');
    }

    const resultMap = new Map<NoteId, string[]>();

    // Prepare all notes for tagging
    const notesForTagging: NoteForTagging[] = [];

    for (const noteId of noteIds) {
      const noteMetadata = masterIndex.notes[noteId];
      if (!noteMetadata) {
        console.warn(`[AI Logic] Note not found in index: ${noteId}`);
        continue;
      }

      // Get file object
      const file = this.app.vault.getAbstractFileByPath(noteMetadata.file_path) as TFile;
      if (!file) {
        console.warn(`[AI Logic] File not found: ${noteMetadata.file_path}`);
        continue;
      }

      // Get content and extract main content (YAML之后，HASH_BOUNDARY之前)
      const fullContent = await this.app.vault.read(file);
      const mainContent = extractMainContent(fullContent);

      notesForTagging.push({
        note_id: noteId,
        title: file.basename,
        content: mainContent.substring(0, 2000), // Only main content, limit for API
        existing_tags: noteMetadata.tags || [],
      });
    }

    if (notesForTagging.length === 0) {
      return resultMap;
    }

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Generating tags for ${notesForTagging.length} notes in batch`);
    }

    // Call LLM API with all notes at once (respecting batch_size_tagging in the calling code)
    const response = await this.apiService.callLLMTaggingAPI({
      notes: notesForTagging,
      min_tags: 3,
      max_tags: 5,  // Updated to match new prompt limit
    });

    // Build result map
    for (const result of response.results) {
      resultMap.set(result.note_id, result.tags);
    }

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Generated tags for ${resultMap.size} notes`);
    }

    return resultMap;
  }

  /**
   * Generate AI tags for a note
   * Uses LLM batch tagging endpoint
   *
   * @param noteId - Note to generate tags for
   * @returns Array of generated tags
   */
  async generateTags(noteId: NoteId): Promise<string[]> {
    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) {
      throw new Error('Master index not loaded');
    }

    const noteMetadata = masterIndex.notes[noteId];
    if (!noteMetadata) {
      throw new Error(`Note not found in index: ${noteId}`);
    }

    // Get file object
    const file = this.app.vault.getAbstractFileByPath(noteMetadata.file_path) as TFile;
    if (!file) {
      throw new Error(`File not found: ${noteMetadata.file_path}`);
    }

    // Get content and extract main content (YAML之后，HASH_BOUNDARY之前)
    const fullContent = await this.app.vault.read(file);
    const mainContent = extractMainContent(fullContent);

    // Prepare tagging request
    const noteForTagging: NoteForTagging = {
      note_id: noteId,
      title: file.basename,
      content: mainContent.substring(0, 2000), // Only main content, limit for API
      existing_tags: noteMetadata.tags || [],
    };

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Generating tags for note: ${file.basename}`);
    }

    // Call LLM API
    const response = await this.apiService.callLLMTaggingAPI({
      notes: [noteForTagging],
      min_tags: 3,
      max_tags: 5,  // Updated to match new prompt limit
    });

    const tags = response.results[0]?.tags || [];

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Generated ${tags.length} tags: ${tags.join(', ')}`);
    }

    return tags;
  }

  /**
   * Filter note pairs by configured thresholds
   * Applies similarity_threshold and min_ai_score
   *
   * @param pairs - Note pairs with scores
   * @returns Filtered pairs that meet criteria
   */
  filterByThresholds(pairs: NotePairScore[]): NotePairScore[] {
    return pairs.filter(pair =>
      pair.similarity_score >= this.settings.similarity_threshold &&
      pair.ai_score >= this.settings.min_ai_score
    );
  }

  /**
   * Check if a note pair should be skipped (smart mode)
   * Looks up existing scores in cache
   *
   * @param noteId1 - First note ID
   * @param noteId2 - Second note ID
   * @param forceMode - If true, always process (ignore cache)
   * @returns True if pair should be skipped
   */
  shouldSkipPair(noteId1: NoteId, noteId2: NoteId, forceMode: boolean): boolean {
    if (forceMode) {
      return false;
    }

    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) {
      return false;
    }

    // Check if pair exists in cache
    const pairKey = this.createPairKey(noteId1, noteId2);
    const existingScore = masterIndex.scores[pairKey];

    // Skip if we have a recent score
    if (existingScore) {
      const ageInDays = (Date.now() - existingScore.last_scored) / (1000 * 60 * 60 * 24);
      // Skip if scored within last 7 days
      return ageInDays < 7;
    }

    return false;
  }

  /**
   * Create composite key for note pair scoring
   * Ensures consistent ordering (lexicographically smaller ID first)
   *
   * @param noteId1 - First note ID
   * @param noteId2 - Second note ID
   * @returns Composite key string
   */
  private createPairKey(noteId1: NoteId, noteId2: NoteId): string {
    return noteId1 < noteId2 ? `${noteId1}:${noteId2}` : `${noteId2}:${noteId1}`;
  }
}
