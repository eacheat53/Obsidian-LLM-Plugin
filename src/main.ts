/**
 * Obsidian LLM 插件的主插件入口点
 */

import { App, Plugin, PluginManifest, Notice, TFile } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './plugin-settings';
import { CacheService } from './services/cache-service';
import { NoteProcessorService } from './services/note-processor';
import { APIService } from './services/api-service';
import { AILogicService } from './services/ai-logic-service';
import { LinkInjectorService } from './services/link-injector-service';
import { FailureLogService } from './services/failure-log-service';
import { NotifierService } from './services/notifier';
import { TaskManagerService } from './services/task-manager';
import { ErrorLogger } from './utils/error-logger';
import { SettingsTab } from './ui/settings-tab';
import { SidebarMenuService } from './ui/sidebar-menu';
import { NoteId, NotePairScore } from './types/index';

/**
 * 主插件类
 */
export default class ObsidianLLMPlugin extends Plugin {
  settings!: PluginSettings;

  // 服务
  private cacheService!: CacheService;
  private noteProcessorService!: NoteProcessorService;
  private apiService!: APIService;
  private aiLogicService!: AILogicService;
  private linkInjectorService!: LinkInjectorService;
  private taskManagerService!: TaskManagerService;
  private failureLogService!: FailureLogService;
  private errorLogger!: ErrorLogger;
  private notifier!: NotifierService;
  private sidebarMenuService!: SidebarMenuService;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  /**
   * 插件初始化
   */
  async onload() {
    console.log('Loading Obsidian LLM Plugin');

    // 加载设置
    await this.loadSettings();

    // 初始化服务
    this.initializeServices();

    // 注册设置选项卡
    this.addSettingTab(new SettingsTab(this.app, this));

    // 注册功能区图标和菜单
    this.sidebarMenuService.registerRibbonIcon();

    // TODO: 注册命令 (T040-T043)
  }

  /**
   * 插件清理
   */
  onunload() {
    console.log('Unloading Obsidian LLM Plugin');
  }

  /**
   * 初始化所有服务
   */
  private initializeServices(): void {
    const basePath = (this.app.vault.adapter as any).basePath || '';

    this.cacheService = new CacheService(this.app, basePath);
    this.noteProcessorService = new NoteProcessorService(this.app, this.settings);
    this.apiService = new APIService(this.settings);
    this.failureLogService = new FailureLogService(this.app);
    this.errorLogger = new ErrorLogger(basePath);
    this.aiLogicService = new AILogicService(
      this.app,
      this.settings,
      this.apiService,
      this.cacheService,
      this.failureLogService,
      this.errorLogger
    );
    this.linkInjectorService = new LinkInjectorService(this.app, this.settings, this.cacheService);
    this.taskManagerService = new TaskManagerService();
    this.sidebarMenuService = new SidebarMenuService(this);
    this.notifier = new NotifierService(this.settings.language);
  }

  /**
   * 从磁盘加载插件设置
   */
  async loadSettings() {
    const loadedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

    // 确保 provider_configs 存在并且包含所有提供商
    if (!this.settings.provider_configs) {
      this.settings.provider_configs = DEFAULT_SETTINGS.provider_configs;
    } else {
      // 与默认值合并以确保所有提供商都存在
      this.settings.provider_configs = Object.assign(
        {},
        DEFAULT_SETTINGS.provider_configs,
        this.settings.provider_configs
      );
    }

    // 将当前提供商的配置同步到顶级设置
    if (this.settings.provider_configs[this.settings.ai_provider]) {
      const currentConfig = this.settings.provider_configs[this.settings.ai_provider];
      // 仅在尚未设置时同步（保留用户当前设置）
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
   * 将插件设置保存到磁盘
   */
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * 获取任务管理器服务（用于UI组件）
   */
  getTaskManager(): TaskManagerService {
    return this.taskManagerService;
  }

  /**
   * 获取缓存服务（用于UI组件）
   */
  getCacheService(): CacheService {
    return this.cacheService;
  }

  /**
   * 生成/更新嵌入工作流
   * 仅生成嵌入，不进行评分或链接插入
   *
   * @param targetPath - 要扫描的路径
   * @param forceMode - 如果为 true，则无论内容 hash 如何都重新生成所有嵌入
   */
  async generateEmbeddingsWorkflow(targetPath: string, forceMode: boolean = false): Promise<void> {
    try {
      await this.taskManagerService.startTask('Generate Embeddings', async (updateProgress) => {
        this.notifier.beginProgress('notices.starting', { mode: forceMode ? '强制' : '智能' });
        // 步骤 1：加载主索引
        updateProgress(0, 'Loading cache...');
        const loadResult = await this.cacheService.loadMasterIndex({
          detect_orphans: true,
          create_if_missing: true
        });

        if (!loadResult.success || !loadResult.index) {
          throw new Error('Failed to load master index');
        }

        const masterIndex = loadResult.index;

        // 步骤 2：扫描保险库中的笔记
        updateProgress(5, 'Scanning vault...');
        const files = await this.noteProcessorService.scanVault(targetPath);

        if (files.length === 0) {
          new Notice('No files found to process');
          return;
        }

        // 步骤 3：确保所有笔记都有 HASH_BOUNDARY
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

        // 步骤 4：处理每个笔记 - 仅生成嵌入
        updateProgress(15, 'Generating embeddings...');
        let newEmbeddingsCount = 0;
        let skippedCount = 0;
        const changedNoteIds = new Set<NoteId>();

        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          // 确保 UUID
          const noteId = await this.noteProcessorService.ensureNoteHasId(file);

          // Extract main content (YAML之后，HASH_BOUNDARY之前)
          const mainContent = await this.noteProcessorService.extractMainContent(file);

          // 计算内容 hash
          const contentHash = await this.noteProcessorService.calculateContentHash(file);

          // 检查内容是否已更改（增量更新）
          const existingNote = masterIndex.notes[noteId];
          let needsUpdate = forceMode || !existingNote || existingNote.content_hash !== contentHash;

          if (!needsUpdate && existingNote) {
            // 内容未更改，跳过
            skippedCount++;

            if (this.settings.enable_debug_logging) {
              console.log(`[Main] Skipped ${file.basename} (unchanged)`);
            }
          }

          if (needsUpdate || !existingNote) {
            // 内容已更改或新笔记，生成嵌入
            if (this.settings.enable_debug_logging) {
              console.log(`[Main] Processing ${file.basename} (${needsUpdate ? 'changed' : 'new'})`);
            }

            // 标记为已更改以使缓存无效
            changedNoteIds.add(noteId);

            // 调用 Jina API
            const response = await this.apiService.callJinaAPI({
              input: [mainContent],
              model: this.settings.jina_model_name,
              note_ids: [noteId],
            });

            if (response.data.length > 0) {
              const embedding = response.data[0].embedding;
              newEmbeddingsCount++;

              // 保存嵌入
              await this.cacheService.saveEmbedding({
                note_id: noteId,
                embedding,
                model_name: this.settings.jina_model_name,
                created_at: Date.now(),
                content_preview: mainContent.substring(0, 200),
              });

              // 使用笔记元数据更新主索引
              const content = await this.app.vault.read(file);
              masterIndex.notes[noteId] = {
                note_id: noteId,
                file_path: file.path,
                content_hash: contentHash,
                last_processed: Date.now(),
                tags: existingNote?.tags || [],
                has_frontmatter: content.startsWith('---'),
                has_hash_boundary: content.includes('<!-- HASH_BOUNDARY -->'),
                has_links_section: content.includes('<!-- LINKS_START -->'),
              };

              // 使此笔记的分数无效（清除相关配对）
              this.invalidateScoresForNote(masterIndex, noteId);
            }
          }

          updateProgress(15 + (i / files.length) * 80, `Processed ${i + 1}/${files.length} (${newEmbeddingsCount} new, ${skippedCount} skipped)`);

          // 检查是否取消
          if (this.taskManagerService.isCancellationRequested()) {
            throw new Error('Task cancelled by user');
          }
        }

        // 使用更新的元数据保存主索引
        await this.cacheService.saveMasterIndex(masterIndex);
        this.cacheService.setMasterIndex(masterIndex);

        // 可选的后续操作：对于已更改的笔记，计算配对、评分并插入链接
        if (changedNoteIds.size > 0) {
          updateProgress(90, 'Scoring changed notes and inserting links...');

          // 为所有笔记构建嵌入图（使用最新缓存）
          const embeddings = new Map<string, number[]>();
          for (const [noteId, meta] of Object.entries(masterIndex.notes)) {
            const emb = await this.cacheService.loadEmbedding(noteId as NoteId);
            if (emb.success && emb.embedding) {
              embeddings.set(noteId, emb.embedding);
            }
          }

          // 仅计算已更改笔记的相似性
          let pairs = await this.aiLogicService.calculateSimilaritiesForNotes(
            embeddings,
            changedNoteIds
          );
          // 去重（双保险）
          pairs = this.dedupePairs(pairs);

          if (pairs.length > 0) {
            this.notifier.info('notices.scoringPairs', { count: pairs.length });
            // 通过 LLM 对配对进行评分
            const scoredPairs = await this.aiLogicService.scorePairs(pairs);
            // 人类可读日志：使用文件名而非 note_id 展示（原始评分）
            
            const filteredPairs = this.aiLogicService.filterByThresholds(scoredPairs);
            // 人类可读日志：使用文件名而非 note_id 展示（阈值过滤后）
            this.logPairsReadable(masterIndex, filteredPairs, '过滤后评分响应');

            // 合并回 masterIndex.scores（仅我们刚刚计算的配对）
            for (const pair of filteredPairs) {
              const pairKey = `${pair.note_id_1}:${pair.note_id_2}`;
              masterIndex.scores[pairKey] = pair;
            }

            await this.cacheService.saveMasterIndex(masterIndex);

            // 反向邻居：任何 ledger[source] 包含 changedNote 之一的 source，都需要对账（用于删除过期链接）
            const reverseAffected = new Set<NoteId>();
            const ledger = masterIndex.link_ledger || {} as Record<NoteId, NoteId[]>;
            for (const srcId in ledger) {
              const targets = ledger[srcId] || [];
              for (const changedId of changedNoteIds) {
                if (targets.includes(changedId)) { reverseAffected.add(srcId as NoteId); break; }
              }
            }

            // 受影响集合 = 变更笔记 + 新邻居 + 反向邻居
            const affected = new Set<NoteId>([...Array.from(changedNoteIds)]);
            for (const p of filteredPairs) { affected.add(p.note_id_1); affected.add(p.note_id_2); }
            for (const id of Array.from(reverseAffected)) affected.add(id);

            // 将受影响 noteId 映射到 TFile
            const fileMap: Record<string, TFile> = {};
            for (const file of files) {
              const nid = await this.noteProcessorService.ensureNoteHasId(file);
              if (affected.has(nid)) fileMap[nid] = file;
            }

            let totalReconciled = 0;
            for (const nid of affected) {
              const f = fileMap[nid];
              if (!f) continue;
              // 使用全量 masterIndex.scores 计算最终目标集，保证删除过期链接
              const desired = this.linkInjectorService.getDesiredTargetsFromScores(nid, masterIndex.scores);
              const res = await this.linkInjectorService.reconcileUsingLedger(f, nid, desired);
              totalReconciled += res.added + res.removed;
            }

            if (this.settings.enable_debug_logging) {
              console.log(`[Main] 链接校准完成, 受影响笔记:  ${affected.size}, changes: ${totalReconciled}`);
            }

            // 为更改的笔记生成/更新标签并写入 YAML
            updateProgress(95, 'Generating tags for changed notes...');
            const changedList = Array.from(changedNoteIds);

            // generateTagsBatch 现在内部按批次处理，并自动保存到 masterIndex
            const allGeneratedTags = await this.aiLogicService.generateTagsBatch(
              changedList,
              () => this.taskManagerService.isCancellationRequested()
            );

            // 将标签写入 YAML front-matter
            updateProgress(96, 'Updating YAML with tags...');
            this.notifier.info('notices.taggingDone', { count: changedList.length }, true);
            for (const nid of changedList) {
              const file = fileMap[nid];
              const tags = allGeneratedTags.get(nid);
              if (!file || !tags || tags.length === 0) continue;

              try {
                const content = await this.app.vault.read(file);
                const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
                const match = content.match(frontMatterRegex);
                let newContent = content;
                const tagsLine = `tags: [${tags.map(t => `"${t}"`).join(', ')}]`;

                if (match) {
                  const existingFM = match[1];
                  if (existingFM.includes('tags:')) {
                    const updatedFM = existingFM.replace(/tags:.*/, tagsLine);
                    newContent = content.replace(frontMatterRegex, `---\n${updatedFM}\n---`);
                  } else {
                    const updatedFM = `${existingFM}\n${tagsLine}`;
                    newContent = content.replace(frontMatterRegex, `---\n${updatedFM}\n---`);
                  }
                } else {
                  newContent = `---\n${tagsLine}\n---\n\n${content}`;
                }

                await this.app.vault.modify(file, newContent);
              } catch (err) {
                console.error(`[Main] Failed to update YAML for ${file.path}:`, err);
              }
            }

            // 标签更新后持久化索引
            await this.cacheService.saveMasterIndex(masterIndex);
          }
        }

        updateProgress(100, 'Done!');
        this.notifier.endProgress();
        this.notifier.success('notices.finished');
      });
    } catch (error) {
      const err = error as Error;
      new Notice(`❌ Error: ${err.message}`);
      console.error('[Main] Generate embeddings workflow failed:', error);
      throw error;
    }
  }

  /* 已移除：独立的评分工作流，改为一键流程内联 */
  /*
    try {
      await this.taskManagerService.startTask('Score Note Relationships', async (updateProgress) => {
        // 步骤 1：加载主索引
        updateProgress(0, 'Loading cache...');
        const loadResult = await this.cacheService.loadMasterIndex({
          detect_orphans: true,
          create_if_missing: true
        });

        if (!loadResult.success || !loadResult.index) {
          throw new Error('Failed to load master index');
        }

        const masterIndex = loadResult.index;

        // 步骤 2：扫描保险库中的笔记
        updateProgress(5, 'Scanning vault...');
        const files = await this.noteProcessorService.scanVault(targetPath);

        if (files.length === 0) {
          new Notice('No files found to process');
          return;
        }

        // 步骤 3：确定哪些笔记需要重新评分
        updateProgress(10, 'Identifying changed notes...');
        const changedNoteIds = new Set<NoteId>();
        const allNoteIds: NoteId[] = [];
        const embeddings = new Map<string, number[]>();

        for (const file of files) {
          const noteId = await this.noteProcessorService.ensureNoteHasId(file);
          allNoteIds.push(noteId);

          const contentHash = await this.noteProcessorService.calculateContentHash(file);
          const existingNote = masterIndex.notes[noteId];

          // 检查笔记是否已更改（用于智能模式）
          if (!forceMode && existingNote && existingNote.content_hash !== contentHash) {
            changedNoteIds.add(noteId);
            
            if (this.settings.enable_debug_logging) {
              console.log(`[Main] Note changed: ${file.basename}`);
            }
          }

          // 加载嵌入
          const embeddingResult = await this.cacheService.loadEmbedding(noteId);
          if (embeddingResult.success && embeddingResult.embedding) {
            embeddings.set(noteId, embeddingResult.embedding);
          } else {
            // 缺少嵌入，需要先生成
            new Notice(`⚠️ Note ${file.basename} is missing embedding. Please run "Generate Embeddings" first.`);
            console.warn(`[Main] Missing embedding for note: ${noteId}`);
          }
        }

        if (embeddings.size === 0) {
          new Notice('No embeddings found. Please run "Generate Embeddings" first.');
          return;
        }

        // 步骤 4：对于已更改的笔记，首先重新生成嵌入（智能模式）
        if (!forceMode && changedNoteIds.size > 0) {
          updateProgress(15, 'Updating embeddings for changed notes...');

          for (const file of files) {
            const noteId = await this.noteProcessorService.ensureNoteHasId(file);
            if (!changedNoteIds.has(noteId)) continue;

            // 提取主要内容并调用 Jina API 重新生成嵌入
            const mainContent = await this.noteProcessorService.extractMainContent(file);
            const response = await this.apiService.callJinaAPI({
              input: [mainContent],
              model: this.settings.jina_model_name,
              note_ids: [noteId],
            });

            if (response.data.length > 0) {
              const embedding = response.data[0].embedding;

              // 保存嵌入
              await this.cacheService.saveEmbedding({
                note_id: noteId,
                embedding,
                model_name: this.settings.jina_model_name,
                created_at: Date.now(),
                content_preview: mainContent.substring(0, 200),
              });

              // 更新用于相似性的内存中映射
              embeddings.set(noteId, embedding);

              // 更新主索引笔记元数据（content_hash 和 last_processed）
              const contentHash = await this.noteProcessorService.calculateContentHash(file);
              const content = await this.app.vault.read(file);
              const existingNote = masterIndex.notes[noteId] || { note_id: noteId, file_path: file.path };
              masterIndex.notes[noteId] = {
                ...existingNote,
                note_id: noteId,
                file_path: file.path,
                content_hash: contentHash,
                last_processed: Date.now(),
                has_frontmatter: content.startsWith('---'),
                has_hash_boundary: content.includes('<!-- HASH_BOUNDARY -->'),
                has_links_section: content.includes('<!-- LINKS_START -->'),
              };

              // 使此笔记的旧分数无效
              this.invalidateScoresForNote(masterIndex, noteId);
            }
          }
        }

        // 步骤 5：计算相似性
        updateProgress(20, 'Calculating similarities...');
        let pairs: NotePairScore[];

        if (forceMode) {
          // 强制模式：计算所有配对
          pairs = await this.aiLogicService.calculateSimilarities(embeddings);
          pairs = this.dedupePairs(pairs);
        } else {
          // 智能模式：仅计算涉及已更改笔记的配对
          if (changedNoteIds.size === 0) {
            new Notice('No notes have changed. All scores are up to date.');
            return;
          }

          pairs = await this.aiLogicService.calculateSimilaritiesForNotes(
            embeddings,
            changedNoteIds
          );
        }

        if (pairs.length === 0) {
          new Notice('No similar note pairs found above threshold');
          return;
        }

        new Notice(`Found ${pairs.length} pairs to score (${forceMode ? 'all' : changedNoteIds.size + ' changed notes'})`);

        // 步骤 5：使用 LLM 对配对进行评分
        updateProgress(50, 'Scoring pairs with AI...');
        const scoredPairs = await this.aiLogicService.scorePairs(pairs);
        // 保留单次可读日志（过滤后），避免重复输出

        // 步骤 6：按阈值筛选
        updateProgress(80, 'Filtering pairs...');
        const filteredPairs = this.aiLogicService.filterByThresholds(scoredPairs);
        // 人类可读日志：使用文件名而非 note_id 展示（阈值过滤后）
        this.logPairsReadable(masterIndex, filteredPairs, '过滤后评分响应');

        // 步骤 7：将分数保存到缓存
        updateProgress(90, 'Saving scores...');
        
        // 在智能模式下，仅更新我们刚刚计算的配对的分数
        // 在强制模式下，替换所有分数
        if (forceMode) {
          masterIndex.scores = {};
        }

        for (const pair of filteredPairs) {
          const pairKey = `${pair.note_id_1}:${pair.note_id_2}`;
          masterIndex.scores[pairKey] = pair;
        }

        await this.cacheService.saveMasterIndex(masterIndex);
        this.cacheService.setMasterIndex(masterIndex);

        updateProgress(100, 'Done!');
        new Notice(`✅ Scored ${filteredPairs.length} note pairs`);
      });
    } catch (error) {
      const err = error as Error;
      new Notice(`❌ Error: ${err.message}`);
      console.error('[Main] Score notes workflow failed:', error);
      throw error;
    }
  }

  /**
   * 用于使特定笔记的分数无效的辅助方法
   * 删除涉及此笔记的所有分数配对
   */
  private invalidateScoresForNote(masterIndex: any, noteId: NoteId): void {
    const keysToDelete: string[] = [];
    
    for (const pairKey in masterIndex.scores) {
      const [id1, id2] = pairKey.split(':');
      if (id1 === noteId || id2 === noteId) {
        keysToDelete.push(pairKey);
      }
    }

    for (const key of keysToDelete) {
      delete masterIndex.scores[key];
    }

    if (this.settings.enable_debug_logging && keysToDelete.length > 0) {
      console.log(`[Main] Invalidated ${keysToDelete.length} score pairs for note ${noteId}`);
    }
  }

  /**
   * 将配对以人类可读（文件名）形式输出到日志
   */
  private logPairsReadable(masterIndex: any, pairs: NotePairScore[], title: string): void {
    if (!this.settings.enable_debug_logging) return;
    try {
      const seen = new Set<string>();
      const lines: string[] = [];
      let count = 0;
      for (const p of pairs) {
        const key = p.note_id_1 < p.note_id_2 ? `${p.note_id_1}:${p.note_id_2}` : `${p.note_id_2}:${p.note_id_1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const meta1 = masterIndex.notes[p.note_id_1];
        const meta2 = masterIndex.notes[p.note_id_2];
        const name1 = meta1?.file_path || `<missing ${p.note_id_1}>`;
        const name2 = meta2?.file_path || `<missing ${p.note_id_2}>`;
        const ai = typeof p.ai_score === 'number' ? p.ai_score.toString() : 'n/a';
        lines.push(`${name1} <-> ${name2} | 评分=${ai}`);
        count++;
        if (count >= 50) break;
      }
      console.log(`[AI Scores][${title}] 共 ${seen.size} 对\n` + lines.join('\n'));
    } catch (e) {
      console.warn('[Main] 可读化评分日志输出失败：', e);
    }
  }

  /**
   * 一键执行工作流（单线任务）：检测→嵌入→打分→插链→打标签
   * 智能模式：仅处理新建或 HASH_BOUNDARY 上方内容有变化的笔记
   * 强制模式：全量处理
   */
  private dedupePairs(pairs: NotePairScore[]): NotePairScore[] {
    const seen = new Set<string>();
    const result: NotePairScore[] = [];
    for (const p of pairs) {
      const key = p.note_id_1 < p.note_id_2 ? `${p.note_id_1}:${p.note_id_2}` : `${p.note_id_2}:${p.note_id_1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(p);
    }
    return result;
  }

  async runSinglePipelineWorkflow(targetPath: string, forceMode: boolean = false): Promise<void> {
    // 复用 generateEmbeddingsWorkflow，其已在完成嵌入后执行了：相似度→AI 打分→插链→打标签
    await this.generateEmbeddingsWorkflow(targetPath, forceMode);
  }

  /**
   * 主工作流：处理笔记并插入建议的链接
   * （旧版组合工作流 - 为兼容性而保留）
   *
   * @param targetPath - 要扫描的路径（默认为 settings.default_scan_path）
   * @param forceMode - 如果为 true，则无论内容 hash 如何都重新处理所有笔记
   */
  async processNotesWorkflow(targetPath?: string, forceMode: boolean = false): Promise<void> {
    try {
      await this.taskManagerService.startTask('Process Notes and Insert Links', async (updateProgress) => {
        // 步骤 1：加载主索引
        updateProgress(0, 'Loading cache...');
        const loadResult = await this.cacheService.loadMasterIndex({
          detect_orphans: true,
          create_if_missing: true
        });

        if (!loadResult.success || !loadResult.index) {
          throw new Error('Failed to load master index');
        }

        const masterIndex = loadResult.index;

        // 步骤 2：扫描保险库中的笔记
        updateProgress(5, 'Scanning vault...');
        const scanPath = targetPath || this.settings.default_scan_path;
        const files = await this.noteProcessorService.scanVault(scanPath);

        if (files.length === 0) {
          new Notice('No files found to process');
          return;
        }

        // 步骤 3：确保所有笔记都有 HASH_BOUNDARY
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

        // 步骤 4：通过增量更新处理每个笔记
        updateProgress(15, 'Processing notes...');
        const embeddings = new Map<string, number[]>();
        let newEmbeddingsCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          // 确保 UUID
          const noteId = await this.noteProcessorService.ensureNoteHasId(file);

          // Extract main content (YAML之后，HASH_BOUNDARY之前)
          const mainContent = await this.noteProcessorService.extractMainContent(file);

          // 计算内容 hash
          const contentHash = await this.noteProcessorService.calculateContentHash(file);

          // 检查内容是否已更改（增量更新）
          // 在强制模式下，无论 hash 如何始终更新
          const existingNote = masterIndex.notes[noteId];
          let needsUpdate = forceMode || !existingNote || existingNote.content_hash !== contentHash;

          if (!needsUpdate && existingNote) {
            // 内容未更改，加载现有嵌入
            const embeddingResult = await this.cacheService.loadEmbedding(noteId);
            if (embeddingResult.success && embeddingResult.embedding) {
              embeddings.set(noteId, embeddingResult.embedding);
              skippedCount++;

              if (this.settings.enable_debug_logging) {
                console.log(`[Main] Skipped ${file.basename} (unchanged)`);
              }
            } else {
              // 缺少嵌入，强制更新
              needsUpdate = true;
            }
          }

          if (needsUpdate || !existingNote) {
            // 内容已更改或新笔记，生成嵌入
            if (this.settings.enable_debug_logging) {
              console.log(`[Main] Processing ${file.basename} (${needsUpdate ? 'changed' : 'new'})`);
            }

            // 调用 Jina API
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

          // 检查是否取消
          if (this.taskManagerService.isCancellationRequested()) {
            throw new Error('Task cancelled by user');
          }
        }

        // 使用填充的索引更新缓存服务
        this.cacheService.setMasterIndex(masterIndex);

        new Notice(`Processed ${files.length} notes (${newEmbeddingsCount} updated, ${skippedCount} skipped)`);

        // 步骤 5：计算相似性
        updateProgress(50, 'Calculating similarities...');
        const pairs = await this.aiLogicService.calculateSimilarities(embeddings);

        if (pairs.length === 0) {
          new Notice('No similar note pairs found above threshold');
          return;
        }

        // 步骤 6：使用 LLM 对配对进行评分
        updateProgress(60, 'Scoring pairs with AI...');
        const scoredPairs = await this.aiLogicService.scorePairs(pairs);

        // 步骤 7：按阈值筛选
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

          // 查找此笔记的最佳链接
          const suggestedLinks = this.linkInjectorService.findBestLinks(noteId, filteredPairs);

          if (suggestedLinks.length > 0) {
            const count = await this.linkInjectorService.insertLinks(file, suggestedLinks);
            totalLinksInserted += count;
          }

          updateProgress(85 + (i / files.length) * 10, `Inserting links ${i + 1}/${files.length}...`);

          // 检查是否取消
          if (this.taskManagerService.isCancellationRequested()) {
            throw new Error('Task cancelled by user');
          }
        }

        // 步骤 9：保存最终分数
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
   * 批量插入 AI 标签工作流
   */
  async batchInsertTagsWorkflow(targetPath: string, forceMode: boolean): Promise<void> {
    try {
      await this.taskManagerService.startTask('Batch Insert AI Tags', async (updateProgress) => {
        // 步骤 1：加载主索引
        updateProgress(0, 'Loading cache...');
        const loadResult = await this.cacheService.loadMasterIndex({ create_if_missing: true });

        if (!loadResult.success || !loadResult.index) {
          throw new Error('Failed to load master index');
        }

        const masterIndex = loadResult.index;

        // 步骤 2：在目标路径中扫描笔记
        updateProgress(10, 'Scanning vault...');
        const files = await this.noteProcessorService.scanVault(targetPath);

        if (files.length === 0) {
          new Notice('No files found to process');
          return;
        }

        // 步骤 3：准备所有笔记并收集笔记 ID
        updateProgress(20, 'Preparing notes...');
        const noteIds: NoteId[] = [];
        const fileMap = new Map<NoteId, TFile>();
        let skippedCount = 0;

        for (const file of files) {
          // 确保笔记具有 UUID
          const noteId = await this.noteProcessorService.ensureNoteHasId(file);

          // 读取内容并检测元数据
          const content = await this.app.vault.read(file);
          const hasFrontMatter = content.startsWith('---');
          const hasHashBoundary = content.includes('<!-- HASH_BOUNDARY -->');
          const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
          const match = content.match(frontMatterRegex);
          const hasFrontMatterTags = !!(match && match[1].includes('tags:'));

          // 计算当前内容 hash
          const contentHash = await this.noteProcessorService.calculateContentHash(file);
          const existing = masterIndex.notes[noteId];

          // 智能模式决策：当以下任一情况为 true 时处理
          // - forceMode 为 true（稍后通过跳过检查来处理）
          // - 没有现有元数据（新笔记）
          // - 内容 hash 已更改
          // - 以前没有生成过标签（没有 tags_generated_at）
          // - front-matter 没有标签
          const isNew = !existing;
          const hashChanged = !!existing && existing.content_hash !== contentHash;
          const tagsNeverGenerated = !existing?.tags_generated_at;
          const shouldProcessSmart = isNew || hashChanged || tagsNeverGenerated || !hasFrontMatterTags;

          if (!forceMode && !shouldProcessSmart) {
            // 在智能模式下跳过
            skippedCount++;
            continue;
          }

          // 在主索引中添加/更新笔记元数据（不要删除现有的 tags/tags_generated_at）
          masterIndex.notes[noteId] = {
            note_id: noteId,
            file_path: file.path,
            content_hash: contentHash,
            last_processed: Date.now(),
            tags: existing?.tags || [],
            tags_generated_at: existing?.tags_generated_at,
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

        // 使用最新索引更新缓存服务
        this.cacheService.setMasterIndex(masterIndex);

        // 步骤 4：生成标签（内部按批次处理并自动保存）
        updateProgress(30, 'Generating tags...');

        // generateTagsBatch 现在内部按批次处理，并自动保存到 masterIndex
        const allGeneratedTags = await this.aiLogicService.generateTagsBatch(
          noteIds,
          () => this.taskManagerService.isCancellationRequested()
        );

        let totalTagsGenerated = 0;
        for (const tags of allGeneratedTags.values()) {
          totalTagsGenerated += tags.length;
        }

        // 步骤 5：更新所有笔记的 front-matter
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
            // 读取当前内容
            const content = await this.app.vault.read(file);

            // 解析 front-matter
            const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
            const match = content.match(frontMatterRegex);

            let newContent = content;

            if (match) {
              // 更新现有的 front-matter
              const existingFM = match[1];
              const tagsLine = `tags: [${tags.map(t => `"${t}"`).join(', ')}]`;

              // 检查标签字段是否存在
              if (existingFM.includes('tags:')) {
                // 替换现有标签
                const updatedFM = existingFM.replace(/tags:.*/, tagsLine);
                newContent = content.replace(frontMatterRegex, `---\n${updatedFM}\n---`);
              } else {
                // 将标签添加到 front-matter
                const updatedFM = `${existingFM}\n${tagsLine}`;
                newContent = content.replace(frontMatterRegex, `---\n${updatedFM}\n---`);
              }
            } else {
              // 使用标签创建新的 front-matter
              const tagsLine = `tags: [${tags.map(t => `"${t}"`).join(', ')}]`;
              newContent = `---\n${tagsLine}\n---\n\n${content}`;
            }

            // 写入更新的内容
            await this.app.vault.modify(file, newContent);
          } catch (error) {
            console.error(`[Main] Failed to update front-matter for ${file.path}:`, error);
            // 继续处理下一个文件
          }

          updateProgress(80 + ((i / noteIds.length) * 15), `Updating note ${i + 1}/${noteIds.length}...`);

          // 检查是否取消
          if (this.taskManagerService.isCancellationRequested()) {
            throw new Error('Task cancelled by user');
          }
        }

        // 步骤 6：保存更新的缓存
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
   * 向笔记添加 hash 边界标记
   */
  async addHashBoundaryWorkflow(): Promise<void> {
    try {
      // 扫描保险库中的所有 markdown 文件
      const files = await this.noteProcessorService.scanVault(this.settings.default_scan_path);

      if (files.length === 0) {
        new Notice('No files found to process');
        return;
      }

      // 添加标记
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
   * 将 UUID 添加到当前笔记
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
