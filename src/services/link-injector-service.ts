/**
 * Link injector service for inserting suggested links into notes
 * Handles WikiLink formatting and safe file writing
 */

import { App, TFile } from 'obsidian';
import { NoteId, NotePairScore } from '../types/index';
import { PluginSettings } from '../plugin-settings';
import { CacheService } from './cache-service';

/**
 * Service for inserting links into markdown files
 */
export class LinkInjectorService {
  private app: App;
  private settings: PluginSettings;
  private cacheService: CacheService;

  constructor(app: App, settings: PluginSettings, cacheService: CacheService) {
    this.app = app;
    this.settings = settings;
    this.cacheService = cacheService;
  }

  /**
   * Insert suggested links into a note
   * Inserts links directly after HASH_BOUNDARY marker
   *
   * @param file - Note file to update
   * @param suggestedLinks - Array of note IDs to link to
   * @returns Number of links inserted
   */
  async insertLinks(file: TFile, suggestedLinks: NoteId[]): Promise<number> {
    if (suggestedLinks.length === 0) {
      return 0;
    }

    // Read current content
    const content = await this.app.vault.read(file);

    // Find HASH_BOUNDARY marker position
    const boundaryMarker = '<!-- HASH_BOUNDARY -->';
    const boundaryIndex = content.indexOf(boundaryMarker);

    if (boundaryIndex === -1) {
      console.warn(`[Link Injector] No HASH_BOUNDARY found in ${file.path}`);
      return 0;
    }

    // Resolve note IDs to file paths
    const linkPaths: string[] = [];
    for (const noteId of suggestedLinks) {
      const path = await this.resolveNoteIdToPath(noteId);
      if (path) {
        linkPaths.push(path);
      }
    }

    if (linkPaths.length === 0) {
      return 0;
    }

    // Build link list (simple format)
    const links = linkPaths.map(path => `- ${this.formatWikiLink(path)}`).join('\n');

    // Remove everything after HASH_BOUNDARY and insert new links
    const insertPosition = boundaryIndex + boundaryMarker.length;
    const newContent =
      content.slice(0, insertPosition) +
      '\n' + links + '\n';

    // Write updated content
    await this.app.vault.modify(file, newContent);

    if (this.settings.enable_debug_logging) {
      console.log(`[Link Injector] Inserted ${linkPaths.length} links into ${file.path}`);
    }

    return linkPaths.length;
  }

  /**
   * Format a file path as a WikiLink
   * Removes .md extension and wraps in [[brackets]]
   *
   * @param filePath - File path to format
   * @returns WikiLink string (e.g., "[[Note Title]]")
   */
  formatWikiLink(filePath: string): string {
    // Get file object to access basename
    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
    if (!file) {
      // Fallback: manual extraction
      const parts = filePath.split('/');
      const fileName = parts[parts.length - 1];
      const baseName = fileName.replace(/\.md$/, '');
      return `[[${baseName}]]`;
    }

    // Use Obsidian's basename (automatically removes .md)
    return `[[${file.basename}]]`;
  }

  /**
   * Find the best links for a note from scored pairs
   * Respects max_links_per_note setting
   *
   * NOTE: Only inserts links in one direction (note_id_1 → note_id_2)
   * to avoid bidirectional redundancy. Obsidian's backlinks feature
   * will automatically show reverse connections.
   *
   * @param noteId - Note to find links for
   * @param scoredPairs - All scored note pairs
   * @returns Array of note IDs to link to (sorted by score, limited by max)
   */
  findBestLinks(noteId: NoteId, scoredPairs: NotePairScore[]): NoteId[] {
    // Only insert links where this note is note_id_1 (unidirectional)
    // This avoids creating both A→B and B→A links
    const relevantPairs = scoredPairs.filter(
      pair => pair.note_id_1 === noteId
    );

    // Sort by AI score (descending)
    relevantPairs.sort((a, b) => b.ai_score - a.ai_score);

    // Extract target note IDs (always note_id_2 since we filtered for note_id_1)
    const targetIds = relevantPairs
      .slice(0, this.settings.max_links_per_note)
      .map(pair => pair.note_id_2);

    return targetIds;
  }

  /**
   * Resolve note ID to file path
   *
   * @param noteId - Note ID to resolve
   * @returns File path or null if not found
   */
  private async resolveNoteIdToPath(noteId: NoteId): Promise<string | null> {
    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) {
      return null;
    }

    const noteMetadata = masterIndex.notes[noteId];
    if (!noteMetadata) {
      return null;
    }

    return noteMetadata.file_path;
  }
}
