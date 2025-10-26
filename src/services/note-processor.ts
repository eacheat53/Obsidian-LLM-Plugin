/**
 * Note processing service for scanning vault, extracting content, and managing UUIDs
 */

import { App, TFile, Notice } from 'obsidian';
import { NoteId, ContentHash } from '../types/index';
import { PluginSettings } from '../plugin-settings';
import { generateNoteId } from '../utils/id-generator';
import { calculateContentHash } from '../utils/hash-utils';
import { parseFrontMatter, updateFrontMatter, ensureNoteId, extractMainContent } from '../utils/frontmatter-parser';

/**
 * Service for note scanning and content processing
 */
export class NoteProcessorService {
  private app: App;
  private settings: PluginSettings;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Scan vault for markdown files
   * Respects excluded folders and file patterns
   *
   * @param scanPath - Path to scan (e.g., "/" for entire vault)
   * @returns Array of TFile objects for markdown files
   */
  async scanVault(scanPath: string = '/'): Promise<TFile[]> {
    const allFiles = this.app.vault.getMarkdownFiles();

    // Filter by scan path and exclusions
    const filteredFiles = allFiles.filter(file => {
      // Check if file is within scan path
      if (scanPath !== '/' && !file.path.startsWith(scanPath.replace(/^\//, ''))) {
        return false;
      }

      // Check exclusions
      if (this.shouldExcludeFile(file)) {
        return false;
      }

      return true;
    });

    if (this.settings.enable_debug_logging) {
      console.log(`[Note Processor] Scanned ${filteredFiles.length} files from ${allFiles.length} total`);
    }

    return filteredFiles;
  }

  /**
   * Extract main content from a note (before HASH_BOUNDARY marker)
   * This is the content that gets hashed for change detection
   *
   * @param file - Note file to process
   * @returns Main content string
   */
  async extractMainContent(file: TFile): Promise<string> {
    const content = await this.app.vault.read(file);
    return extractMainContent(content);
  }

  /**
   * Ensure a note has a unique UUID in its front-matter
   * Generates and writes UUID if missing
   *
   * @param file - Note file to process
   * @returns Note ID (existing or newly generated)
   */
  async ensureNoteHasId(file: TFile): Promise<NoteId> {
    const content = await this.app.vault.read(file);
    const [newContent, noteId, wasAdded] = ensureNoteId(content, generateNoteId);

    if (wasAdded) {
      await this.app.vault.modify(file, newContent);
      if (this.settings.enable_debug_logging) {
        console.log(`[Note Processor] Added UUID to ${file.path}: ${noteId}`);
      }
    }

    return noteId;
  }

  /**
   * Calculate content hash for a note
   * Uses SHA-256 of main content (before HASH_BOUNDARY)
   *
   * @param file - Note file to hash
   * @returns SHA-256 hash string
   */
  async calculateContentHash(file: TFile): Promise<ContentHash> {
    const mainContent = await this.extractMainContent(file);
    return await calculateContentHash(mainContent);
  }

  /**
   * Add HASH_BOUNDARY marker to notes that don't have it
   * Inserts "<!-- HASH_BOUNDARY -->" at the END of the file
   * This separates user content (above marker) from plugin-generated content (below marker)
   *
   * @param files - Array of note files to process
   * @returns Number of files modified
   */
  async addHashBoundaryToNotes(files: TFile[]): Promise<number> {
    let modifiedCount = 0;

    for (const file of files) {
      const content = await this.app.vault.read(file);

      // Check if marker already exists
      if (content.includes('<!-- HASH_BOUNDARY -->')) {
        continue;
      }

      // Add marker at the END of the file
      const needsNewline = content.length > 0 && !content.endsWith('\n');
      const newContent = content + (needsNewline ? '\n\n' : '\n') + '<!-- HASH_BOUNDARY -->\n';

      await this.app.vault.modify(file, newContent);
      modifiedCount++;

      if (this.settings.enable_debug_logging) {
        console.log(`[Note Processor] Added HASH_BOUNDARY to end of ${file.path}`);
      }
    }

    return modifiedCount;
  }

  /**
   * Add UUID to current active note's front-matter
   * Used by "Generate Unique ID for Current Note" menu item
   *
   * @returns Note ID (existing or newly generated)
   */
  async addUuidToCurrentNote(): Promise<NoteId> {
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile) {
      throw new Error('No active file');
    }

    if (activeFile.extension !== 'md') {
      throw new Error('Active file is not a markdown file');
    }

    return await this.ensureNoteHasId(activeFile);
  }

  /**
   * Check if a file should be excluded based on settings
   *
   * @param file - File to check
   * @returns True if file should be excluded
   */
  private shouldExcludeFile(file: TFile): boolean {
    // Parse excluded folders
    const excludedFolders = this.settings.excluded_folders
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    // Parse excluded patterns
    const excludedPatterns = this.settings.excluded_patterns
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // Check if file is in excluded folder
    for (const folder of excludedFolders) {
      if (file.path.startsWith(folder.replace(/^\//, ''))) {
        return true;
      }
    }

    // Check if file matches excluded pattern
    for (const pattern of excludedPatterns) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      if (regex.test(file.path)) {
        return true;
      }
    }

    return false;
  }
}
