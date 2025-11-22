import { App, Notice, TFile } from 'obsidian';
import { PluginSettings } from '../plugin-settings';
import { CacheService } from '../storage/cache-service';
import { NoteProcessorService } from './note-processor';
import { APIService } from '../services/api-service';
import { AIService } from './ai-service';
import { LinkInjectorService } from './link-injector';
import { FailureLogService } from '../services/log-service';
import { TaskManagerService } from '../services/task-manager';
import { NotifierService } from '../services/notifier';
import { ErrorLogger } from '../utils/error-logger';
import { NoteId, NotePairScore } from '../types/index';
import { MasterIndex } from '../types/cache-types';
import { parseFrontMatter } from '../utils/frontmatter-parser';

export class WorkflowService {
    private app: App;
    private settings: PluginSettings;
    private cacheService: CacheService;
    private noteProcessorService: NoteProcessorService;
    private apiService: APIService;
    private aiService: AIService;
    private linkInjectorService: LinkInjectorService;
    private taskManagerService: TaskManagerService;
    private failureLogService: FailureLogService;
    private notifier: NotifierService;
    private errorLogger: ErrorLogger;

    constructor(
        app: App,
        settings: PluginSettings,
        cacheService: CacheService,
        noteProcessorService: NoteProcessorService,
        apiService: APIService,
        aiService: AIService,
        linkInjectorService: LinkInjectorService,
        taskManagerService: TaskManagerService,
        failureLogService: FailureLogService,
        notifier: NotifierService,
        errorLogger: ErrorLogger
    ) {
        this.app = app;
        this.settings = settings;
        this.cacheService = cacheService;
        this.noteProcessorService = noteProcessorService;
        this.apiService = apiService;
        this.aiService = aiService;
        this.linkInjectorService = linkInjectorService;
        this.taskManagerService = taskManagerService;
        this.failureLogService = failureLogService;
        this.notifier = notifier;
        this.errorLogger = errorLogger;
    }

    // ============================================================================================
    // Public Workflows (Composed Pipelines)
    // ============================================================================================

    /**
     * 生成/更新嵌入工作流
     * 流程：初始化 -> 准备文件 -> 更新嵌入 -> (可选)更新分数 -> (可选)更新链接 -> (可选)更新标签
     */
    async generateEmbeddingsWorkflow(targetPath: string, forceMode: boolean = false): Promise<void> {
        try {
            await this.taskManagerService.startTask('Generate Embeddings', async (updateProgress) => {
                this.notifier.beginProgress('notices.starting', { mode: forceMode ? '强制' : '智能' });

                // 1. 初始化
                const masterIndex = await this.initializeWorkflow(updateProgress);

                // 2. 准备文件
                const files = await this.prepareFiles(targetPath, updateProgress);
                if (files.length === 0) return;

                // 3. 更新嵌入
                const changedNoteIds = await this.updateEmbeddings(files, masterIndex, forceMode, updateProgress);

                // 4. 后续处理（如果发生变更）
                if (changedNoteIds.size > 0) {
                    // 4.1 更新分数
                    const filteredPairs = await this.updateScores(masterIndex, changedNoteIds, files, updateProgress);

                    // 4.2 更新链接
                    // 即使没有新配对，也需要运行以移除旧链接（针对已变更的笔记）
                    await this.reconcileLinks(files, masterIndex, filteredPairs, changedNoteIds, updateProgress);
                }

                // 5. 更新标签 (独立处理，不完全依赖 changedNoteIds)
                await this.updateTags(files, masterIndex, changedNoteIds, forceMode, updateProgress);

                updateProgress(100, 'Done!');
                this.notifier.endProgress();
                this.notifier.success('notices.finished');
            });
        } catch (error) {
            this.handleWorkflowError(error, 'Generate embeddings workflow failed');
        }
    }

    /**
     * 主工作流：处理笔记并插入建议的链接
     * （旧版组合工作流 - 现已重构为复用 generateEmbeddingsWorkflow 的逻辑）
     */
    async processNotesWorkflow(targetPath?: string, forceMode: boolean = false): Promise<void> {
        // 复用 generateEmbeddingsWorkflow，因为逻辑完全一致
        return this.generateEmbeddingsWorkflow(targetPath || this.settings.default_scan_path, forceMode);
    }

    /**
     * 一键执行工作流（单线任务）
     */
    async runSinglePipelineWorkflow(targetPath: string, forceMode: boolean = false): Promise<void> {
        return this.generateEmbeddingsWorkflow(targetPath, forceMode);
    }

    /**
     * 批量插入 AI 标签工作流
     * 流程：初始化 -> 准备文件 -> 更新标签
     */
    async batchInsertTagsWorkflow(targetPath: string, forceMode: boolean): Promise<void> {
        try {
            await this.taskManagerService.startTask('Batch Insert AI Tags', async (updateProgress) => {
                // 1. 初始化
                const masterIndex = await this.initializeWorkflow(updateProgress);

                // 2. 准备文件
                const files = await this.prepareFiles(targetPath, updateProgress);
                if (files.length === 0) return;

                // 3. 更新标签
                // 注意：这里传递空的 changedNoteIds，因为我们只关心 forceMode 或缺失标签的情况
                await this.updateTags(files, masterIndex, new Set<NoteId>(), forceMode, updateProgress);

                updateProgress(100, 'Done!');
                this.notifier.endProgress();
                this.notifier.success('notices.finished');
            });
        } catch (error) {
            this.handleWorkflowError(error, 'Batch insert tags workflow failed');
        }
    }

    /**
     * 重新校准链接工作流
     * 流程：初始化 -> 准备文件 -> 校准链接（基于现有分数）
     */
    async recalibrateLinksWorkflow(targetPath: string): Promise<void> {
        try {
            await this.taskManagerService.startTask('Recalibrate Links', async (updateProgress) => {
                this.notifier.beginProgress('notices.starting', { mode: '链接校准' });

                // 1. 初始化 (不检测孤儿，不创建)
                updateProgress(0, 'Loading cache...');
                const loadResult = await this.cacheService.loadMasterIndex({
                    detect_orphans: false,
                    create_if_missing: false
                });

                if (!loadResult.success || !loadResult.index) {
                    throw new Error('Failed to load master index. Please run embedding generation first.');
                }
                const masterIndex = loadResult.index;

                // 检查是否有可用的 scores
                const scoreCount = Object.keys(masterIndex.scores || {}).length;
                if (scoreCount === 0) {
                    new Notice('No scores found. Please run the main workflow first to generate scores.');
                    return;
                }

                // 2. 准备文件
                const files = await this.prepareFiles(targetPath, updateProgress);
                if (files.length === 0) return;

                // 3. 校准链接 (使用全量 scores)
                // 传递所有文件作为 affected files
                const allNoteIds = new Set<NoteId>(); // 空集合意味着处理所有传入的 files
                await this.reconcileLinks(files, masterIndex, [], allNoteIds, updateProgress, true);

                updateProgress(100, 'Done!');
                this.notifier.endProgress();
            });
        } catch (error) {
            this.handleWorkflowError(error, 'Recalibrate links workflow failed');
        }
    }

    // ============================================================================================
    // Atomic Steps (Private Methods)
    // ============================================================================================

    /**
     * 步骤 1: 初始化工作流，加载主索引
     */
    private async initializeWorkflow(updateProgress: (progress: number, message: string) => void): Promise<MasterIndex> {
        updateProgress(0, 'Loading cache...');
        const loadResult = await this.cacheService.loadMasterIndex({
            detect_orphans: true,
            create_if_missing: true
        });

        if (!loadResult.success || !loadResult.index) {
            throw new Error('Failed to load master index');
        }

        return loadResult.index;
    }

    /**
     * 步骤 2: 扫描并准备文件 (添加 HASH_BOUNDARY)
     */
    private async prepareFiles(targetPath: string, updateProgress: (progress: number, message: string) => void): Promise<TFile[]> {
        updateProgress(5, 'Scanning vault...');
        const files = await this.noteProcessorService.scanVault(targetPath);

        if (files.length === 0) {
            new Notice('No files found to process');
            return [];
        }

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

        return files;
    }

    /**
     * 步骤 3: 更新嵌入 (Embeddings)
     * 返回已更改的 NoteId 集合
     */
    private async updateEmbeddings(
        files: TFile[],
        masterIndex: MasterIndex,
        forceMode: boolean,
        updateProgress: (progress: number, message: string) => void
    ): Promise<Set<NoteId>> {
        updateProgress(15, 'Generating embeddings...');
        let newEmbeddingsCount = 0;
        let skippedCount = 0;
        const changedNoteIds = new Set<NoteId>();

        // 获取失败的笔记 ID (智能重试)
        const failedNoteIds = this.failureLogService
            ? await this.failureLogService.getFailedNoteIdsByType('embedding')
            : new Set<NoteId>();

        if (failedNoteIds.size > 0 && this.settings.enable_debug_logging) {
            console.log(`[Workflow] 发现 ${failedNoteIds.size} 个失败的嵌入操作，将强制重试`);
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const noteId = await this.noteProcessorService.ensureNoteHasId(file);
            const mainContent = await this.noteProcessorService.extractMainContent(file);
            const contentHash = await this.noteProcessorService.calculateContentHash(file);

            const existingNote = masterIndex.notes[noteId];
            let needsUpdate = forceMode || !existingNote || existingNote.content_hash !== contentHash;

            // 强制重试失败笔记
            if (failedNoteIds.has(noteId) && !needsUpdate) {
                needsUpdate = true;
                if (this.settings.enable_debug_logging) console.log(`[Workflow] 强制重试失败笔记: ${file.basename}`);
            }

            if (!needsUpdate && existingNote) {
                skippedCount++;
                if (this.settings.enable_debug_logging) console.log(`[Workflow] Skipped ${file.basename} (unchanged)`);
            }

            if (needsUpdate || !existingNote) {
                if (this.settings.enable_debug_logging) console.log(`[Workflow] Processing ${file.basename} (${needsUpdate ? 'changed' : 'new'})`);

                try {
                    const response = await this.apiService.callJinaAPI({
                        input: [mainContent],
                        model: this.settings.jina_model_name,
                        note_ids: [noteId],
                    });

                    if (response.data.length > 0) {
                        const embedding = response.data[0].embedding;
                        newEmbeddingsCount++;

                        await this.cacheService.saveEmbedding({
                            note_id: noteId,
                            embedding,
                            model_name: this.settings.jina_model_name,
                            created_at: Date.now(),
                            content_preview: mainContent.substring(0, 200),
                        });

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

                        this.invalidateScoresForNote(masterIndex, noteId);
                        await this.cacheService.saveMasterIndex(masterIndex);
                        this.cacheService.setMasterIndex(masterIndex);

                        // 清除失败记录
                        if (this.failureLogService) {
                            const failedOps = await this.failureLogService.getUnresolvedFailures();
                            for (const op of failedOps) {
                                if (op.operation_type === 'embedding' && op.batch_info.items.includes(noteId)) {
                                    await this.failureLogService.deleteFailure(op.id);
                                }
                            }
                        }

                        changedNoteIds.add(noteId);
                    }
                } catch (error) {
                    const err = error as Error;
                    console.error(`[Workflow] Failed to generate embedding for ${file.basename}:`, err.message);
                    this.recordFailure('embedding', i, files.length, [noteId], [file.path], err);
                    continue;
                }
            }

            updateProgress(15 + (i / files.length) * 75, `Processed ${i + 1}/${files.length} (${newEmbeddingsCount} new, ${skippedCount} skipped)`);

            if (this.taskManagerService.isCancellationRequested()) {
                throw new Error('Task cancelled by user');
            }
        }

        await this.cacheService.saveMasterIndex(masterIndex);
        this.cacheService.setMasterIndex(masterIndex);

        if (this.settings.enable_debug_logging) {
            console.log(`[Workflow] Embedding 统计: 总数=${files.length}, 新增=${newEmbeddingsCount}, 跳过=${skippedCount}, 变更=${changedNoteIds.size}`);
        }

        return changedNoteIds;
    }

    /**
     * 步骤 4.1: 更新分数 (Scores)
     * 仅计算变更笔记的相似度并评分
     */
    private async updateScores(
        masterIndex: MasterIndex,
        changedNoteIds: Set<NoteId>,
        files: TFile[],
        updateProgress: (progress: number, message: string) => void
    ): Promise<NotePairScore[]> {
        updateProgress(90, 'Scoring changed notes...');

        const embeddings = new Map<string, number[]>();
        for (const [noteId, meta] of Object.entries(masterIndex.notes)) {
            const emb = await this.cacheService.loadEmbedding(noteId as NoteId);
            if (emb.success && emb.embedding) {
                embeddings.set(noteId, emb.embedding);
            }
        }

        let pairs = await this.aiService.calculateSimilaritiesForNotes(embeddings, changedNoteIds);
        pairs = this.dedupePairs(pairs);

        if (pairs.length === 0) return [];

        this.notifier.info('notices.scoringPairs', { count: pairs.length });
        const scoredPairs = await this.aiService.scorePairs(pairs);
        const filteredPairs = this.aiService.filterByThresholds(scoredPairs);
        this.logPairsReadable(masterIndex, filteredPairs, '过滤后评分响应');

        for (const pair of filteredPairs) {
            const pairKey = `${pair.note_id_1}:${pair.note_id_2}`;
            masterIndex.scores[pairKey] = pair;
        }

        await this.cacheService.saveMasterIndex(masterIndex);
        return filteredPairs;
    }

    /**
     * 步骤 4.2: 校准链接 (Reconcile Links)
     * 根据分数插入或删除链接
     */
    private async reconcileLinks(
        files: TFile[],
        masterIndex: MasterIndex,
        newPairs: NotePairScore[],
        changedNoteIds: Set<NoteId>,
        updateProgress: (progress: number, message: string) => void,
        fullRecalibration: boolean = false
    ): Promise<void> {
        updateProgress(92, 'Inserting/Recalibrating links...');

        // 计算受影响的笔记集合
        let affected = new Set<NoteId>();

        if (fullRecalibration) {
            // 全量模式：所有传入的文件都视为受影响
            // 我们需要将 files 转换为 noteIds
            for (const file of files) {
                // 这里假设 prepareFiles 已经确保了 noteId 存在，或者我们再次确保
                // 为了性能，我们尝试从 masterIndex 获取，如果不行再读取文件
                // 但由于 files 是 TFile[]，我们最好再次 ensureNoteHasId (它是幂等的且很快)
                const nid = await this.noteProcessorService.ensureNoteHasId(file);
                affected.add(nid);
            }
        } else {
            // 增量模式：变更 + 新配对 + 反向邻居
            affected = new Set<NoteId>([...Array.from(changedNoteIds)]);
            for (const p of newPairs) { affected.add(p.note_id_1); affected.add(p.note_id_2); }

            // 反向邻居
            const reverseAffected = new Set<NoteId>();
            const ledger = masterIndex.link_ledger || {} as Record<NoteId, NoteId[]>;
            for (const srcId in ledger) {
                const targets = ledger[srcId] || [];
                for (const changedId of changedNoteIds) {
                    if (targets.includes(changedId)) { reverseAffected.add(srcId as NoteId); break; }
                }
            }
            for (const id of Array.from(reverseAffected)) affected.add(id);
        }

        // 映射 NoteId -> TFile
        const fileMap: Record<string, TFile> = {};
        for (const file of files) {
            const nid = await this.noteProcessorService.ensureNoteHasId(file);
            if (affected.has(nid)) fileMap[nid] = file;
        }

        let totalReconciled = 0;
        let processedCount = 0;
        const affectedList = Array.from(affected);

        for (let i = 0; i < affectedList.length; i++) {
            const nid = affectedList[i];
            const f = fileMap[nid];
            if (!f) continue;

            const desired = this.linkInjectorService.getDesiredTargetsFromScores(nid, masterIndex.scores);
            const res = await this.linkInjectorService.reconcileUsingLedger(f, nid, desired);
            totalReconciled += res.added + res.removed;
            processedCount++;

            if (fullRecalibration) {
                updateProgress(20 + (i / affectedList.length) * 75, `Processed ${i + 1}/${affectedList.length} notes`);
            }
        }

        await this.cacheService.saveMasterIndex(masterIndex); // 保存 ledger 更新

        if (this.settings.enable_debug_logging) {
            console.log(`[Workflow] 链接校准完成: 受影响=${affected.size}, 变更=${totalReconciled}`);
        }

        if (fullRecalibration) {
            if (processedCount === 0) {
                new Notice('✅ All links already match current thresholds. No changes needed.');
            } else {
                new Notice(`✅ Recalibrated ${processedCount} notes: changed ${totalReconciled} links`);
            }
        }
    }

    /**
     * 步骤 5: 更新标签 (Tags)
     */
    private async updateTags(
        files: TFile[],
        masterIndex: MasterIndex,
        changedNoteIds: Set<NoteId>,
        forceMode: boolean,
        updateProgress: (progress: number, message: string) => void
    ): Promise<void> {
        updateProgress(95, 'Generating tags...');

        const notesNeedingTags = new Set<NoteId>([...changedNoteIds]);

        // 检查未完成标签的笔记
        for (const [noteId, metadata] of Object.entries(masterIndex.notes)) {
            // 智能检查：如果 forceMode 或 (没有生成过标签 且 有 embedding)
            // 注意：这里我们主要依赖 changedNoteIds，但也要补漏
            const shouldCheck = forceMode || !metadata.tags_generated_at;
            if (shouldCheck) {
                const embResult = await this.cacheService.loadEmbedding(noteId as NoteId);
                if (embResult.success && embResult.embedding) {
                    notesNeedingTags.add(noteId as NoteId);
                }
            }
        }

        // 过滤出实际在 files 列表中的笔记 (避免处理不在本次扫描范围内的笔记)
        // 但如果是 batchInsertTagsWorkflow，files 就是全部，所以没问题
        // 这里做一个交集检查比较安全，或者我们假设 files 包含了所有需要处理的
        // 为了简单起见，我们只处理 notesNeedingTags 中存在于 masterIndex 的 (且文件存在)

        if (notesNeedingTags.size === 0) return;

        const notesList = Array.from(notesNeedingTags);
        if (this.settings.enable_debug_logging) {
            console.log(`[Workflow] 需要生成标签: ${notesList.length}`);
            console.log(`[Workflow] 待处理笔记 ID:`, notesList);
        }

        // 构建 fileMap
        const fileMap: Record<string, TFile> = {};
        for (const nid of notesList) {
            const metadata = masterIndex.notes[nid];
            if (metadata) {
                const file = this.app.vault.getAbstractFileByPath(metadata.file_path) as TFile;
                if (file) fileMap[nid] = file;
            }
        }

        await this.aiService.generateTagsBatch(
            notesList,
            () => this.taskManagerService.isCancellationRequested(),
            async (batchResults: Map<NoteId, string[]>) => {
                for (const [nid, tags] of batchResults) {
                    const file = fileMap[nid];
                    if (!file || !tags || tags.length === 0) continue;

                    try {
                        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                            frontmatter['tags'] = tags;
                        });

                        if (masterIndex.notes[nid]) {
                            masterIndex.notes[nid].tags_generated_at = Date.now();
                            // 使用增量更新保存 tags_generated_at
                            await this.cacheService.updateNote(nid, masterIndex.notes[nid]);
                        }
                    } catch (err) {
                        console.error(`[Workflow] Failed to update YAML for ${file.path}:`, err);
                    }
                }
                // 不需要全量保存了
                // await this.cacheService.saveMasterIndex(masterIndex);
            }
        );

        this.notifier.info('notices.taggingDone', { count: notesList.length }, true);
    }

    // ============================================================================================
    // Utility Workflows (Standalone)
    // ============================================================================================

    async syncHashWorkflow(targetPath: string): Promise<void> {
        try {
            await this.taskManagerService.startTask('Sync Hash', async (updateProgress) => {
                const masterIndex = await this.initializeWorkflow(updateProgress);
                const files = await this.noteProcessorService.scanVault(targetPath);

                if (files.length === 0) {
                    new Notice('未找到需要处理的文件');
                    return;
                }

                let syncedCount = 0;
                let skippedCount = 0;
                const yamlErrors: string[] = [];

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    updateProgress(10 + (i / files.length) * 80, `Syncing hash ${i + 1}/${files.length}`);

                    const content = await this.app.vault.read(file);
                    const fm = parseFrontMatter(content);

                    if (fm.parseError) {
                        yamlErrors.push(`${file.path}: ${fm.parseError}`);
                        skippedCount++;
                        continue;
                    }

                    if (!fm.data.note_id || typeof fm.data.note_id !== 'string') {
                        skippedCount++;
                        continue;
                    }

                    const noteId = fm.data.note_id as NoteId;
                    const contentHash = await this.noteProcessorService.calculateContentHash(file);

                    const existingNote = masterIndex.notes[noteId];
                    if (existingNote) {
                        existingNote.content_hash = contentHash;
                        existingNote.last_processed = Date.now();
                    } else {
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
                    }
                    syncedCount++;
                }

                await this.cacheService.saveMasterIndex(masterIndex);
                this.cacheService.setMasterIndex(masterIndex);

                updateProgress(100, 'Done');
                if (yamlErrors.length > 0) {
                    new Notice(`⚠️ ${yamlErrors.length} 个笔记因 YAML 错误被跳过`, 10000);
                    console.error('[Workflow] YAML 解析错误汇总:\n' + yamlErrors.join('\n'));
                }
                new Notice(`✅ 已同步 ${syncedCount} 个笔记的 Hash`);
            });
        } catch (error) {
            this.handleWorkflowError(error, 'Sync hash workflow failed');
        }
    }

    async addHashBoundaryWorkflow(): Promise<void> {
        try {
            const files = await this.noteProcessorService.scanVault(this.settings.default_scan_path);
            if (files.length === 0) {
                new Notice('No files found to process');
                return;
            }
            const modifiedCount = await this.noteProcessorService.addHashBoundaryToNotes(files);
            new Notice(`✅ Added HASH_BOUNDARY to ${modifiedCount} notes`);
        } catch (error) {
            this.handleWorkflowError(error, 'Add hash boundary failed');
        }
    }

    async addUuidToCurrentNoteWorkflow(): Promise<void> {
        try {
            const noteId = await this.noteProcessorService.addUuidToCurrentNote();
            new Notice(`✅ Generated UUID: ${noteId}`);
        } catch (error) {
            this.handleWorkflowError(error, 'Add UUID failed');
        }
    }

    async cleanOrphanedDataWorkflow(): Promise<void> {
        try {
            await this.taskManagerService.startTask('Clean Orphaned Data', async (updateProgress) => {
                updateProgress(0, 'Loading cache...');
                const masterIndex = this.cacheService.getMasterIndex();
                if (!masterIndex) {
                    new Notice('❌ 无法加载缓存');
                    return;
                }

                updateProgress(10, 'Scanning vault...');
                const vaultFiles = this.app.vault.getMarkdownFiles();
                const vaultPaths = new Set(vaultFiles.map(f => f.path));

                updateProgress(20, 'Detecting orphaned notes...');
                const orphanedNoteIds: NoteId[] = [];
                for (const [noteId, meta] of Object.entries(masterIndex.notes)) {
                    if (!vaultPaths.has(meta.file_path)) {
                        orphanedNoteIds.push(noteId as NoteId);
                    }
                }

                if (orphanedNoteIds.length === 0) {
                    new Notice('✅ 未发现孤立数据');
                    return;
                }

                updateProgress(40, `Cleaning ${orphanedNoteIds.length} orphaned notes...`);
                let embeddingsDeleted = 0;
                for (const noteId of orphanedNoteIds) {
                    delete masterIndex.notes[noteId];
                    const keysToDelete: string[] = [];
                    for (const key in masterIndex.scores) {
                        if (key.includes(noteId)) keysToDelete.push(key);
                    }
                    for (const key of keysToDelete) {
                        delete masterIndex.scores[key];
                    }
                    try {
                        await this.cacheService.deleteEmbedding(noteId);
                        embeddingsDeleted++;
                    } catch (error) { /* ignore */ }
                }

                updateProgress(70, 'Cleaning broken links...');
                let brokenLinksRemoved = 0;
                if (masterIndex.link_ledger) {
                    const ledger = masterIndex.link_ledger as Record<NoteId, NoteId[]>;
                    const orphanedSet = new Set(orphanedNoteIds);
                    for (const noteId of orphanedNoteIds) delete ledger[noteId];
                    for (const [sourceId, targets] of Object.entries(ledger)) {
                        const filtered = targets.filter(id => !orphanedSet.has(id));
                        if (filtered.length < targets.length) {
                            ledger[sourceId as NoteId] = filtered;
                            brokenLinksRemoved += (targets.length - filtered.length);
                        }
                    }
                }

                await this.cacheService.saveMasterIndex(masterIndex);
                this.cacheService.setMasterIndex(masterIndex);

                updateProgress(100, 'Done');
                new Notice(`✅ 清理完成: ${orphanedNoteIds.length} 孤立笔记, ${embeddingsDeleted} 嵌入, ${brokenLinksRemoved} 断链`);
            });
        } catch (error) {
            this.handleWorkflowError(error, 'Clean orphaned data failed');
        }
    }

    async cacheHealthCheckWorkflow(): Promise<void> {
        try {
            await this.taskManagerService.startTask('Cache Health Check', async (updateProgress) => {
                const masterIndex = this.cacheService.getMasterIndex();
                if (!masterIndex) {
                    new Notice('❌ 无法加载缓存');
                    return;
                }

                const issues: string[] = [];
                const vaultFiles = this.app.vault.getMarkdownFiles();
                const vaultPaths = new Set(vaultFiles.map(f => f.path));

                let orphanedCount = 0;
                for (const [noteId, meta] of Object.entries(masterIndex.notes)) {
                    if (!vaultPaths.has(meta.file_path)) orphanedCount++;
                }
                if (orphanedCount > 0) issues.push(`🔸 ${orphanedCount} 个孤立笔记`);

                let missingUuidCount = 0;
                let missingBoundaryCount = 0;
                for (const file of vaultFiles) {
                    try {
                        const content = await this.app.vault.read(file);
                        const fm = parseFrontMatter(content);
                        if (!fm.data.note_id) missingUuidCount++;
                        if (!content.includes('<!-- HASH_BOUNDARY -->')) missingBoundaryCount++;
                    } catch (e) { /* ignore */ }
                }
                if (missingUuidCount > 0) issues.push(`🔸 ${missingUuidCount} 个笔记缺少 note_id`);
                if (missingBoundaryCount > 0) issues.push(`🔸 ${missingBoundaryCount} 个笔记缺少 HASH_BOUNDARY`);

                updateProgress(100, 'Done');
                if (issues.length === 0) {
                    new Notice('✅ 缓存健康状况良好');
                } else {
                    new Notice(`⚠️ 发现问题:\n${issues.join('\n')}`, 10000);
                    console.log('[Workflow] Health Check:\n' + issues.join('\n'));
                }
            });
        } catch (error) {
            this.handleWorkflowError(error, 'Cache health check failed');
        }
    }

    // ============================================================================================
    // Helpers
    // ============================================================================================

    private handleWorkflowError(error: unknown, context: string) {
        const err = error as Error;
        new Notice(`❌ Error: ${err.message}`);
        console.error(`[Workflow] ${context}:`, error);
        throw error;
    }

    private async recordFailure(type: 'embedding', batchNum: number, totalBatches: number, items: string[], displayItems: string[], error: Error) {
        if (this.failureLogService) {
            await this.failureLogService.recordFailure({
                operation_type: type,
                batch_info: {
                    batch_number: batchNum,
                    total_batches: totalBatches,
                    items: items,
                    display_items: displayItems,
                },
                error: {
                    message: error.message,
                    type: error.name,
                    stack: error.stack,
                    status: 'status' in error ? (error as any).status : undefined,
                },
            });
        }
        if (this.errorLogger) {
            await this.errorLogger.logBatchFailure({
                operation_type: type,
                batch_number: batchNum,
                total_batches: totalBatches,
                items: items,
                error: error,
                provider: this.settings.ai_provider,
                model: this.settings.jina_model_name,
            });
        }
    }

    private invalidateScoresForNote(masterIndex: any, noteId: NoteId): void {
        const keysToDelete: string[] = [];
        for (const pairKey in masterIndex.scores) {
            const [id1, id2] = pairKey.split(':');
            if (id1 === noteId || id2 === noteId) {
                keysToDelete.push(pairKey);
            }
        }

        if (this.settings.enable_debug_logging && keysToDelete.length > 0) {
            console.log(`[Workflow] Invalidating ${keysToDelete.length} scores for ${noteId}`);
        }

        for (const key of keysToDelete) {
            delete masterIndex.scores[key];
        }
    }

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
            console.warn('[Workflow] 可读化评分日志输出失败：', e);
        }
    }

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
}
