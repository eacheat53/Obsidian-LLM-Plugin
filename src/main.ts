/**
 * Obsidian LLM 插件的主插件入口点
 */

import { App, Plugin, PluginManifest, Notice, TFile } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './plugin-settings';
import { CacheService } from './storage/cache-service';
import { NoteProcessorService } from './core/note-processor';
import { APIService } from './services/api-service';
import { AIService } from './core/ai-service';
import { LinkInjectorService } from './core/link-injector';
import { FailureLogService } from './services/log-service';
import { NotifierService } from './services/notifier';
import { TaskManagerService } from './services/task-manager';
import { WorkflowService } from './core/workflow-service';
import { ErrorLogger } from './utils/error-logger';
import { SettingsTab } from './ui/settings-tab';
import { SidebarMenuService } from './ui/sidebar-menu';
import { NoteId, NotePairScore } from './types/index';
import { parseFrontMatter } from './utils/frontmatter-parser';

/**
 * 主插件类
 */
export default class ObsidianLLMPlugin extends Plugin {
  settings!: PluginSettings;

  // 服务
  private cacheService!: CacheService;
  private noteProcessorService!: NoteProcessorService;
  private apiService!: APIService;
  private aiService!: AIService;
  private linkInjectorService!: LinkInjectorService;
  private taskManagerService!: TaskManagerService;
  private failureLogService!: FailureLogService;
  private errorLogger!: ErrorLogger;
  private notifier!: NotifierService;
  private sidebarMenuService!: SidebarMenuService;
  private workflowService!: WorkflowService;

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
    await this.initializeServices();

    // 注册设置选项卡
    this.addSettingTab(new SettingsTab(this.app, this));

    // 注册功能区图标和菜单
    this.sidebarMenuService.registerRibbonIcon();

    // 注册文件系统事件监听（修复问题5: 文件重命名/删除同步）
    this.registerFileSystemEvents();

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
  /**
   * 初始化所有服务
   */
  private async initializeServices(): Promise<void> {
    const basePath = (this.app.vault.adapter as any).basePath || '';

    this.cacheService = new CacheService(this.app, basePath);
    await this.cacheService.initialize();

    this.noteProcessorService = new NoteProcessorService(this.app, this.settings);
    this.apiService = new APIService(this.settings);
    this.failureLogService = new FailureLogService(this.app);
    this.errorLogger = new ErrorLogger(basePath);
    this.aiService = new AIService(
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

    // 连接任务管理器和通知服务
    this.taskManagerService.setProgressCallback((progress, step) => {
      this.notifier.updateProgressPercent(progress, step);
    });

    this.workflowService = new WorkflowService(
      this.app,
      this.settings,
      this.cacheService,
      this.noteProcessorService,
      this.apiService,
      this.aiService,
      this.linkInjectorService,
      this.taskManagerService,
      this.failureLogService,
      this.notifier,
      this.errorLogger
    );
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
    return this.workflowService.generateEmbeddingsWorkflow(targetPath, forceMode);
  }


  async runSinglePipelineWorkflow(targetPath: string, forceMode: boolean = false): Promise<void> {
    return this.workflowService.runSinglePipelineWorkflow(targetPath, forceMode);
  }

  /**
   * 主工作流：处理笔记并插入建议的链接
   * （旧版组合工作流 - 为兼容性而保留）
   *
   * @param targetPath - 要扫描的路径（默认为 settings.default_scan_path）
   * @param forceMode - 如果为 true，则无论内容 hash 如何都重新处理所有笔记
   */
  async processNotesWorkflow(targetPath?: string, forceMode: boolean = false): Promise<void> {
    return this.workflowService.processNotesWorkflow(targetPath, forceMode);
  }

  /**
   * 批量插入 AI 标签工作流
   */
  async batchInsertTagsWorkflow(targetPath: string, forceMode: boolean): Promise<void> {
    return this.workflowService.batchInsertTagsWorkflow(targetPath, forceMode);
  }

  /**
   * 单独 AI 打标工作流
   */
  async runTaggingOnlyWorkflow(targetPath: string, forceMode: boolean = false): Promise<void> {
    return this.workflowService.runTaggingOnlyWorkflow(targetPath, forceMode);
  }

  /**
   * 单独 AI 打分工作流
   */
  async runScoringOnlyWorkflow(forceMode: boolean = false): Promise<void> {
    return this.workflowService.runScoringOnlyWorkflow(forceMode);
  }

  /**
   * 重新校准链接工作流
   * 基于现有的 masterIndex.scores 和当前阈值设置，重新插入/删除链接
   * 不重新生成 embedding 或重新评分，适用于用户修改阈值后的快速校准
   *
   * @param targetPath - 要扫描的路径
   */
  async recalibrateLinksWorkflow(targetPath: string): Promise<void> {
    return this.workflowService.recalibrateLinksWorkflow(targetPath);
  }

  /**
   * 同步内容 Hash 工作流
   * 重新计算所有笔记的 content hash 并更新到 masterIndex，但不重新生成 embedding
   * 适用于只修改 front-matter 而正文内容未变的场景，避免不必要的 API 调用
   *
   * @param targetPath - 要扫描的路径
   */
  async syncHashWorkflow(targetPath: string): Promise<void> {
    return this.workflowService.syncHashWorkflow(targetPath);
  }

  /**
   * 向笔记添加 hash 边界标记
   */
  async addHashBoundaryWorkflow(): Promise<void> {
    return this.workflowService.addHashBoundaryWorkflow();
  }

  /**
   * 将 UUID 添加到当前笔记
   */
  async addUuidToCurrentNoteWorkflow(): Promise<void> {
    return this.workflowService.addUuidToCurrentNoteWorkflow();
  }

  /**
   * 注册文件系统事件监听
   * 修复问题5: 文件重命名/删除后同步缓存
   */
  private registerFileSystemEvents(): void {
    // 监听文件重命名
    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          await this.handleFileRename(file, oldPath);
        }
      })
    );

    // 监听文件删除
    this.registerEvent(
      this.app.vault.on('delete', async (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          await this.handleFileDelete(file);
        }
      })
    );

    if (this.settings.enable_debug_logging) {
      console.log('[Main] 已注册文件系统事件监听');
    }
  }

  /**
   * 处理文件重命名
   * 修复问题5: 更新 masterIndex 中的 file_path
   */
  private async handleFileRename(file: TFile, oldPath: string): Promise<void> {
    try {
      const masterIndex = this.cacheService.getMasterIndex();
      if (!masterIndex) return;

      // 通过 oldPath 找到 note_id
      for (const [noteId, meta] of Object.entries(masterIndex.notes)) {
        if (meta.file_path === oldPath) {
          // 更新路径
          meta.file_path = file.path;
          await this.cacheService.saveMasterIndex(masterIndex);

          if (this.settings.enable_debug_logging) {
            console.log(`[Main] 文件重命名: ${oldPath} -> ${file.path}`);
          }
          break;
        }
      }
    } catch (error) {
      console.error('[Main] 处理文件重命名失败:', error);
    }
  }

  /**
   * 处理文件删除
   * 修复问题6/7: 清理缓存中的孤立数据和断链
   */
  private async handleFileDelete(file: TFile): Promise<void> {
    try {
      const masterIndex = this.cacheService.getMasterIndex();
      if (!masterIndex) return;

      // 通过 file.path 找到 note_id
      let deletedNoteId: NoteId | null = null;
      for (const [noteId, meta] of Object.entries(masterIndex.notes)) {
        if (meta.file_path === file.path) {
          deletedNoteId = noteId as NoteId;
          break;
        }
      }

      if (!deletedNoteId) return;

      // 删除笔记记录
      delete masterIndex.notes[deletedNoteId];

      // 删除相关 scores
      const scoreKeysToDelete: string[] = [];
      for (const key in masterIndex.scores) {
        if (key.includes(deletedNoteId)) {
          scoreKeysToDelete.push(key);
        }
      }
      for (const key of scoreKeysToDelete) {
        delete masterIndex.scores[key];
      }

      // 清理 ledger 中指向该笔记的链接（修复问题7: 断链清理）
      if (masterIndex.link_ledger) {
        const ledger = masterIndex.link_ledger as Record<NoteId, NoteId[]>;

        // 删除该笔记作为 source 的记录
        delete ledger[deletedNoteId];

        // 从其他笔记的 target 列表中删除该笔记
        for (const [sourceId, targets] of Object.entries(ledger)) {
          const filtered = targets.filter(id => id !== deletedNoteId);
          if (filtered.length < targets.length) {
            ledger[sourceId as NoteId] = filtered;
          }
        }
      }

      // 删除 embedding 文件
      await this.cacheService.deleteEmbedding(deletedNoteId);

      // 保存更新
      await this.cacheService.saveMasterIndex(masterIndex);
      this.cacheService.setMasterIndex(masterIndex);

      if (this.settings.enable_debug_logging) {
        console.log(`[Main] 已清理删除文件的数据: ${file.path} (${deletedNoteId})`);
      }
    } catch (error) {
      console.error('[Main] 处理文件删除失败:', error);
    }
  }

  /**
   * 清理孤立数据工作流
   * 修复问题6: 手动清理所有孤立笔记、嵌入和断链
   */
  async cleanOrphanedDataWorkflow(): Promise<void> {
    return this.workflowService.cleanOrphanedDataWorkflow();
  }

  /**
   * 缓存健康检查工作流
   * 检测各种潜在问题但不修改数据
   */
  async cacheHealthCheckWorkflow(): Promise<void> {
    return this.workflowService.cacheHealthCheckWorkflow();
  }
}
