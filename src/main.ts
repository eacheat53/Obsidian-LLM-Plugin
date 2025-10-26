/**
 * Main plugin entry point for Obsidian LLM Plugin
 */

import { App, Plugin, PluginManifest, Notice, TFile } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './plugin-settings';
import { CacheService } from './services/cache-service';
import { NoteProcessorService } from './services/note-processor';
import { APIService } from './services/api-service';
import { AILogicService } from './services/ai-logic-service';
import { LinkInjectorService } from './services/link-injector-service';
import { TaskManagerService } from './services/task-manager';
import { SettingsTab } from './ui/settings-tab';
import { SidebarMenuService } from './ui/sidebar-menu';
import { NoteId } from './types/index';

/**
 * Main plugin class
 */
export default class ObsidianLLMPlugin extends Plugin {
  settings!: PluginSettings;

  // Services
  private cacheService!: CacheService;
  private noteProcessorService!: NoteProcessorService;
  private apiService!: APIService;
  private aiLogicService!: AILogicService;
  private linkInjectorService!: LinkInjectorService;
  private taskManagerService!: TaskManagerService;
  private sidebarMenuService!: SidebarMenuService;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  /**
   * Plugin initialization
   */
  async onload() {
    console.log('Loading Obsidian LLM Plugin');

    // Load settings
    await this.loadSettings();

    // Initialize services
    this.initializeServices();

    // Register settings tab
    this.addSettingTab(new SettingsTab(this.app, this));

    // Register ribbon icon and menu
    this.sidebarMenuService.registerRibbonIcon();

    // TODO: Register commands (T040-T043)
  }

  /**
   * Plugin cleanup
   */
  onunload() {
    console.log('Unloading Obsidian LLM Plugin');
  }

  /**
   * Initialize all services
   */
  private initializeServices(): void {
    const basePath = (this.app.vault.adapter as any).basePath || '';

    this.cacheService = new CacheService(this.app, basePath);
    this.noteProcessorService = new NoteProcessorService(this.app, this.settings);
    this.apiService = new APIService(this.settings);
    this.aiLogicService = new AILogicService(this.app, this.settings, this.apiService, this.cacheService);
    this.linkInjectorService = new LinkInjectorService(this.app, this.settings, this.cacheService);
    this.taskManagerService = new TaskManagerService();
    this.sidebarMenuService = new SidebarMenuService(this);
  }

  /**
   * Load plugin settings from disk
   */
  async loadSettings() {
    const loadedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

    // Ensure provider_configs exists and has all providers
    if (!this.settings.provider_configs) {
      this.settings.provider_configs = DEFAULT_SETTINGS.provider_configs;
    } else {
      // Merge with defaults to ensure all providers exist
      this.settings.provider_configs = Object.assign(
        {},
        DEFAULT_SETTINGS.provider_configs,
        this.settings.provider_configs
      );
    }

    // Sync current provider's config to top-level settings
    if (this.settings.provider_configs[this.settings.ai_provider]) {
      const currentConfig = this.settings.provider_configs[this.settings.ai_provider];
      // Only sync if not already set (preserve user's current settings)
      if (!loadedData?.ai_api_url) {
        this.settings.ai_api_url = currentConfig.api_url;
      }
      if (!loadedData?.ai_api_key) {
        this.settings.ai_api_key = currentConfig.api_key;
      }
      if (!loadedData?.ai_model_name) {
        this.settings.ai_model_name = currentConfig.model_name;
      }
    }
  }

  /**
   * Save plugin settings to disk
   */
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Get task manager service (for UI components)
   */
  getTaskManager(): TaskManagerService {
    return this.taskManagerService;
  }

  /**
   * Get cache service (for UI components)
   */
  getCacheService(): CacheService {
    return this.cacheService;
  }

  /**
   * Main workflow: Process notes and insert suggested links
   *
   * @param targetPath - Path to scan (defaults to settings.default_scan_path)
   * @param forceMode - If true, reprocess all notes regardless of content hash
   */
  async processNotesWorkflow(targetPath?: string, forceMode: boolean = false): Promise<void> {
    try {
      await this.taskManagerService.startTask('Process Notes and Insert Links', async (updateProgress) => {
        // Step 1: Load master index
        updateProgress(0, 'Loading cache...');
        const loadResult = await this.cacheService.loadMasterIndex({
          detect_orphans: true,
          create_if_missing: true
        });

        if (!loadResult.success || !loadResult.index) {
          throw new Error('Failed to load master index');
        }

        const masterIndex = loadResult.index;

        // Step 2: Scan vault for notes
        updateProgress(5, 'Scanning vault...');
        const scanPath = targetPath || this.settings.default_scan_path;
        const files = await this.noteProcessorService.scanVault(scanPath);

        if (files.length === 0) {
          new Notice('No files found to process');
          return;
        }

        // Step 3: Ensure all notes have HASH_BOUNDARY
        updateProgress(10, 'Checking hash boundaries...');
        let filesWithoutBoundary = 0;

        for (const file of files) {
          const content = await this.app.vault.read(file);
          if (!content.includes('<!-- HASH_BOUNDARY -->')) {
            filesWithoutBoundary++;
          }
        }

        if (filesWithoutBoundary > 0) {
          new Notice(`Adding HASH_BOUNDARY to ${filesWithoutBoundary} notes...`);
          await this.noteProcessorService.addHashBoundaryToNotes(files);
        }

        // Step 4: Process each note with incremental updates
        updateProgress(15, 'Processing notes...');
        const embeddings = new Map<string, number[]>();
        let newEmbeddingsCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          // Ensure UUID
          const noteId = await this.noteProcessorService.ensureNoteHasId(file);

          // Extract main content (YAML之后，HASH_BOUNDARY之前)
          const mainContent = await this.noteProcessorService.extractMainContent(file);

          // Calculate content hash
          const contentHash = await this.noteProcessorService.calculateContentHash(file);

          // Check if content changed (incremental update)
          // In force mode, always update regardless of hash
          const existingNote = masterIndex.notes[noteId];
          let needsUpdate = forceMode || !existingNote || existingNote.content_hash !== contentHash;

          if (!needsUpdate && existingNote) {
            // Content unchanged, load existing embedding
            const embeddingResult = await this.cacheService.loadEmbedding(noteId);
            if (embeddingResult.success && embeddingResult.embedding) {
              embeddings.set(noteId, embeddingResult.embedding);
              skippedCount++;

              if (this.settings.enable_debug_logging) {
                console.log(`[Main] Skipped ${file.basename} (unchanged)`);
              }
            } else {
              // Embedding missing, force update
              needsUpdate = true;
            }
          }

          if (needsUpdate || !existingNote) {
            // Content changed or new note, generate embedding
            if (this.settings.enable_debug_logging) {
              console.log(`[Main] Processing ${file.basename} (${needsUpdate ? 'changed' : 'new'})`);
            }

            // Call Jina API
            const response = await this.apiService.callJinaAPI({
              input: [mainContent],
              model: this.settings.jina_model_name,
              note_ids: [noteId],
            });

            if (response.data.length > 0) {
              const embedding = response.data[0].embedding;
              embeddings.set(noteId, embedding);
              newEmbeddingsCount++;

              // 立即保存 embedding
              await this.cacheService.saveEmbedding({
                note_id: noteId,
                embedding,
                model_name: this.settings.jina_model_name,
                created_at: Date.now(),
                content_preview: mainContent.substring(0, 200),
              });

              // 更新 master index 中的笔记元数据
              const content = await this.app.vault.read(file);
              masterIndex.notes[noteId] = {
                note_id: noteId,
                file_path: file.path,
                content_hash: contentHash,
                last_processed: Date.now(),
                tags: [],
                has_frontmatter: content.startsWith('---'),
                has_hash_boundary: content.includes('<!-- HASH_BOUNDARY -->'),
                has_links_section: content.includes('<!-- LINKS_START -->'),
              };

              // 立即保存 master index (增量保存)
              await this.cacheService.saveMasterIndex(masterIndex);
            }
          }

          updateProgress(15 + (i / files.length) * 30, `Processed ${i + 1}/${files.length} (${newEmbeddingsCount} new, ${skippedCount} skipped)`);

          // Check for cancellation
          if (this.taskManagerService.isCancellationRequested()) {
            throw new Error('Task cancelled by user');
          }
        }

        // Update cache service with populated index
        this.cacheService.setMasterIndex(masterIndex);

        new Notice(`Processed ${files.length} notes (${newEmbeddingsCount} updated, ${skippedCount} skipped)`);

        // Step 5: Calculate similarities
        updateProgress(50, 'Calculating similarities...');
        const pairs = await this.aiLogicService.calculateSimilarities(embeddings);

        if (pairs.length === 0) {
          new Notice('No similar note pairs found above threshold');
          return;
        }

        // Step 6: Score pairs using LLM
        updateProgress(60, 'Scoring pairs with AI...');
        const scoredPairs = await this.aiLogicService.scorePairs(pairs);

        // Step 7: Filter by thresholds
        updateProgress(80, 'Filtering pairs...');
        const filteredPairs = this.aiLogicService.filterByThresholds(scoredPairs);

        if (filteredPairs.length === 0) {
          new Notice('No pairs met the minimum score threshold');
          return;
        }

        // Step 8: Insert links into notes (在HASH_BOUNDARY之后)
        updateProgress(85, 'Inserting links...');
        let totalLinksInserted = 0;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const noteId = await this.noteProcessorService.ensureNoteHasId(file);

          // Find best links for this note
          const suggestedLinks = this.linkInjectorService.findBestLinks(noteId, filteredPairs);

          if (suggestedLinks.length > 0) {
            const count = await this.linkInjectorService.insertLinks(file, suggestedLinks);
            totalLinksInserted += count;
          }

          updateProgress(85 + (i / files.length) * 10, `Inserting links ${i + 1}/${files.length}...`);

          // Check for cancellation
          if (this.taskManagerService.isCancellationRequested()) {
            throw new Error('Task cancelled by user');
          }
        }

        // Step 9: Save final scores
        updateProgress(95, 'Saving scores...');
        for (const pair of filteredPairs) {
          const pairKey = `${pair.note_id_1}:${pair.note_id_2}`;
          masterIndex.scores[pairKey] = pair;
        }

        await this.cacheService.saveMasterIndex(masterIndex);

        updateProgress(100, 'Done!');
        new Notice(`✅ Inserted ${totalLinksInserted} links across ${files.length} notes`);
      });
    } catch (error) {
      const err = error as Error;
      new Notice(`❌ Error: ${err.message}`);
      console.error('[Main] Process notes workflow failed:', error);
      throw error;
    }
  }

  /**
   * Batch insert AI tags workflow
   */
  async batchInsertTagsWorkflow(targetPath: string, forceMode: boolean): Promise<void> {
    try {
      await this.taskManagerService.startTask('Batch Insert AI Tags', async (updateProgress) => {
        // Step 1: Load master index
        updateProgress(0, 'Loading cache...');
        const loadResult = await this.cacheService.loadMasterIndex({ create_if_missing: true });

        if (!loadResult.success || !loadResult.index) {
          throw new Error('Failed to load master index');
        }

        const masterIndex = loadResult.index;

        // Step 2: Scan for notes in target path
        updateProgress(10, 'Scanning vault...');
        const files = await this.noteProcessorService.scanVault(targetPath);

        if (files.length === 0) {
          new Notice('No files found to process');
          return;
        }

        // Step 3: Prepare all notes and collect note IDs
        updateProgress(20, 'Preparing notes...');
        const noteIds: NoteId[] = [];
        const fileMap = new Map<NoteId, TFile>();
        let skippedCount = 0;

        for (const file of files) {
          // Ensure note has UUID
          const noteId = await this.noteProcessorService.ensureNoteHasId(file);

          // Read content to check for existing tags
          const content = await this.app.vault.read(file);
          const hasFrontMatter = content.startsWith('---');
          const hasHashBoundary = content.includes('<!-- HASH_BOUNDARY -->');

          // In smart mode, skip notes that already have tags
          if (!forceMode && hasFrontMatter) {
            const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
            const match = content.match(frontMatterRegex);
            if (match && match[1].includes('tags:')) {
              // Note already has tags, skip in smart mode
              skippedCount++;
              continue;
            }
          }

          // Add/update note metadata in master index
          const contentHash = await this.noteProcessorService.calculateContentHash(file);

          masterIndex.notes[noteId] = {
            note_id: noteId,
            file_path: file.path,
            content_hash: contentHash,
            last_processed: Date.now(),
            tags: [], // Will be updated after generation
            has_frontmatter: hasFrontMatter,
            has_hash_boundary: hasHashBoundary,
            has_links_section: content.includes('<!-- LINKS_START -->'),
          };

          noteIds.push(noteId);
          fileMap.set(noteId, file);
        }

        if (noteIds.length === 0) {
          new Notice(`All ${files.length} notes already have tags (use Force mode to regenerate)`);
          return;
        }

        if (skippedCount > 0) {
          new Notice(`Processing ${noteIds.length} notes (${skippedCount} skipped with existing tags)`);
        }

        // Update cache service with latest index
        this.cacheService.setMasterIndex(masterIndex);

        // Step 4: Generate tags in batches
        updateProgress(30, 'Generating tags in batches...');
        let totalTagsGenerated = 0;
        const batchSize = this.settings.batch_size_tagging;
        const allGeneratedTags = new Map<NoteId, string[]>();

        for (let i = 0; i < noteIds.length; i += batchSize) {
          const batch = noteIds.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(noteIds.length / batchSize);

          updateProgress(
            30 + ((i / noteIds.length) * 50),
            `Generating tags batch ${batchNum}/${totalBatches} (${batch.length} notes)...`
          );

          try {
            const tagsMap = await this.aiLogicService.generateTagsBatch(batch);

            // Store results
            for (const [noteId, tags] of tagsMap.entries()) {
              allGeneratedTags.set(noteId, tags);
              totalTagsGenerated += tags.length;

              // Update master index
              if (masterIndex.notes[noteId]) {
                masterIndex.notes[noteId].tags = tags;
              }
            }
          } catch (error) {
            console.error(`[Main] Failed to generate tags for batch ${batchNum}:`, error);
            // Continue with next batch
          }

          // Check for cancellation
          if (this.taskManagerService.isCancellationRequested()) {
            throw new Error('Task cancelled by user');
          }
        }

        // Step 5: Update front-matter for all notes
        updateProgress(80, 'Updating note front-matter...');

        for (let i = 0; i < noteIds.length; i++) {
          const noteId = noteIds[i];
          const tags = allGeneratedTags.get(noteId);

          if (!tags || tags.length === 0) {
            continue;
          }

          const file = fileMap.get(noteId);
          if (!file) {
            continue;
          }

          try {
            // Read current content
            const content = await this.app.vault.read(file);

            // Parse front-matter
            const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
            const match = content.match(frontMatterRegex);

            let newContent = content;

            if (match) {
              // Update existing front-matter
              const existingFM = match[1];
              const tagsLine = `tags: [${tags.map(t => `"${t}"`).join(', ')}]`;

              // Check if tags field exists
              if (existingFM.includes('tags:')) {
                // Replace existing tags
                const updatedFM = existingFM.replace(/tags:.*/, tagsLine);
                newContent = content.replace(frontMatterRegex, `---\n${updatedFM}\n---`);
              } else {
                // Add tags to front-matter
                const updatedFM = `${existingFM}\n${tagsLine}`;
                newContent = content.replace(frontMatterRegex, `---\n${updatedFM}\n---`);
              }
            } else {
              // Create new front-matter with tags
              const tagsLine = `tags: [${tags.map(t => `"${t}"`).join(', ')}]`;
              newContent = `---\n${tagsLine}\n---\n\n${content}`;
            }

            // Write updated content
            await this.app.vault.modify(file, newContent);
          } catch (error) {
            console.error(`[Main] Failed to update front-matter for ${file.path}:`, error);
            // Continue with next file
          }

          updateProgress(80 + ((i / noteIds.length) * 15), `Updating note ${i + 1}/${noteIds.length}...`);

          // Check for cancellation
          if (this.taskManagerService.isCancellationRequested()) {
            throw new Error('Task cancelled by user');
          }
        }

        // Step 6: Save updated cache
        updateProgress(95, 'Saving cache...');
        await this.cacheService.saveMasterIndex(masterIndex);

        updateProgress(100, 'Done!');
        new Notice(`✅ Generated ${totalTagsGenerated} tags across ${files.length} notes`);
      });
    } catch (error) {
      const err = error as Error;
      new Notice(`❌ Error: ${err.message}`);
      console.error('[Main] Batch insert tags workflow failed:', error);
      throw error;
    }
  }

  /**
   * Add hash boundary markers to notes
   */
  async addHashBoundaryWorkflow(): Promise<void> {
    try {
      // Scan vault for all markdown files
      const files = await this.noteProcessorService.scanVault(this.settings.default_scan_path);

      if (files.length === 0) {
        new Notice('No files found to process');
        return;
      }

      // Add markers
      const modifiedCount = await this.noteProcessorService.addHashBoundaryToNotes(files);

      new Notice(`✅ Added HASH_BOUNDARY to ${modifiedCount} notes`);
    } catch (error) {
      const err = error as Error;
      new Notice(`❌ Error: ${err.message}`);
      console.error('[Main] Add hash boundary failed:', error);
      throw error;
    }
  }

  /**
   * Add UUID to current note
   */
  async addUuidToCurrentNoteWorkflow(): Promise<void> {
    try {
      const noteId = await this.noteProcessorService.addUuidToCurrentNote();
      new Notice(`✅ Generated UUID: ${noteId}`);
    } catch (error) {
      const err = error as Error;
      new Notice(`❌ Error: ${err.message}`);
      console.error('[Main] Add UUID failed:', error);
      throw error;
    }
  }
}
