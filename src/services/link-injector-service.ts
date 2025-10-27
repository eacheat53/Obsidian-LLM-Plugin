/**
 * 用于将建议链接插入笔记的链接注入器服务
 * 处理 WikiLink 格式化和安全文件写入
 */

import { App, TFile } from 'obsidian';
import { NoteId, NotePairScore } from '../types/index';
import { PluginSettings } from '../plugin-settings';
import { CacheService } from './cache-service';

/**
 * 用于将链接插入 markdown 文件的服务
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
   * 将建议的链接插入笔记（简单覆盖型）
   * 在 HASH_BOUNDARY 标记后直接插入链接
   * 注意：建议使用 reconcileUsingLedger 执行“增删对账”式插链
   *
   * @param file - 要更新的笔记文件
   * @param suggestedLinks - 要链接到的笔记 ID 数组
   * @returns 插入的链接数
   */
  async insertLinks(file: TFile, suggestedLinks: NoteId[]): Promise<number> {
    if (suggestedLinks.length === 0) {
      return 0;
    }

    // 读取当前内容
    const content = await this.app.vault.read(file);

    // 查找 HASH_BOUNDARY 标记位置
    const boundaryMarker = '<!-- HASH_BOUNDARY -->';
    const boundaryIndex = content.indexOf(boundaryMarker);

    if (boundaryIndex === -1) {
      console.warn(`[Link Injector] 在 ${file.path} 中未找到 HASH_BOUNDARY`);
      return 0;
    }

    // 将笔记 ID 解析为文件路径
    // 去重：同一路径只插入一次
    const linkPathSet = new Set<string>();
    for (const noteId of suggestedLinks) {
      const path = await this.resolveNoteIdToPath(noteId);
      if (path) {
        linkPathSet.add(path);
      }
    }
    const linkPaths = Array.from(linkPathSet);

    if (linkPaths.length === 0) {
      return 0;
    }

    // 构建链接列表（简单格式）
    const links = linkPaths.map(path => `- ${this.formatWikiLink(path)}`).join('\n');

    // 删除 HASH_BOUNDARY 之后的所有内容并插入新链接
    const insertPosition = boundaryIndex + boundaryMarker.length;
    const newContent =
      content.slice(0, insertPosition) +
      '\n' + links + '\n';

    // 写入更新的内容
    await this.app.vault.modify(file, newContent);

    if (this.settings.enable_debug_logging) {
      console.log(`[Link Injector] 已将 ${linkPaths.length} 个链接插入到 ${file.path}`);
    }

    return linkPaths.length;
  }

  /**
   * 将文件路径格式化为 WikiLink
   * 删除 .md 扩展名并用 [[括号]] 括起来
   *
   * @param filePath - 要格式化的文件路径
   * @returns WikiLink 字符串（例如，“[[笔记标题]]”）
   */
  formatWikiLink(filePath: string): string {
    // 获取文件对象以访问基本名称
    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
    if (!file) {
      // 回退：手动提取
      const parts = filePath.split('/');
      const fileName = parts[parts.length - 1];
      const baseName = fileName.replace(/\.md$/, '');
      return `[[${baseName}]]`;
    }

    // 使用 Obsidian 的基本名称（自动删除 .md）
    return `[[${file.basename}]]`;
  }

  /**
   * 从评分对中为笔记找到最佳链接
   * 遵守 max_links_per_note 设置
   *
   * 注意：仅单向插入链接 (note_id_1 → note_id_2)
   * 以避免双向冗余。Obsidian 的反向链接功能
   * 将自动显示反向连接。
   *
   * @param noteId - 要为其查找链接的笔记
   * @param scoredPairs - 所有已评分的笔记配对
   * @returns 要链接到的笔记 ID 数组（按分数排序，受最大值限制）
   */
  findBestLinks(noteId: NoteId, scoredPairs: NotePairScore[]): NoteId[] {
    // 仅在此笔记为 note_id_1 时插入链接（单向）
    // 这可以避免创建 A→B 和 B→A 链接
    const relevantPairs = scoredPairs.filter(
      pair => pair.note_id_1 === noteId
    );

    // 去重：同一目标只保留一次（根据 note_id_2）
    const seenTargets = new Set<NoteId>();
    const uniquePairs: NotePairScore[] = [];
    for (const p of relevantPairs) {
      if (!seenTargets.has(p.note_id_2)) {
        seenTargets.add(p.note_id_2);
        uniquePairs.push(p);
      }
    }

    // 按 AI 分数排序（降序）
    uniquePairs.sort((a, b) => b.ai_score - a.ai_score);

    // 提取目标笔记 ID（始终为 note_id_2）
    const targetIds = uniquePairs
      .slice(0, this.settings.max_links_per_note)
      .map(pair => pair.note_id_2);

    return targetIds;
  }

  /**
   * 将笔记 ID 解析为文件路径
   *
   * @param noteId - 要解析的笔记 ID
   * @returns 文件路径，如果未找到则为 null
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

  /**
   * 基于当前评分生成某个笔记的目标集合（单向：note_id_1 -> note_id_2）
   */
  getDesiredTargetsFor(noteId: NoteId, scoredPairs: NotePairScore[]): NoteId[] {
    // 仅选择该笔记作为源的配对
    const relevant = scoredPairs.filter(p => p.note_id_1 === noteId);
    return this._listTargetsFromPairs(relevant);
  }

  /**
   * 从 masterIndex.scores 生成目标集合（全量视角）
   */
  getDesiredTargetsFromScores(noteId: NoteId, allScores: Record<string, NotePairScore>): NoteId[] {
    const relevant: NotePairScore[] = [];
    for (const key in allScores) {
      const p = allScores[key];
      if (p.note_id_1 === noteId) relevant.push(p);
    }
    return this._listTargetsFromPairs(relevant);
  }

  private _listTargetsFromPairs(relevant: NotePairScore[]): NoteId[] {
    // ✅ Filter by thresholds (consistent with AILogicService.filterByThresholds)
    const filtered = relevant.filter(p =>
      p.similarity_score >= this.settings.similarity_threshold &&
      p.ai_score >= this.settings.min_ai_score
    );

    // Debug logging for filtering results
    if (this.settings.enable_debug_logging && filtered.length < relevant.length) {
      console.log(`[Link Injector] Filtered ${relevant.length - filtered.length} pairs below threshold (${relevant.length} -> ${filtered.length})`);
    }

    // Deduplication
    const seen = new Set<NoteId>();
    const unique: NotePairScore[] = [];
    for (const p of filtered) {
      if (!seen.has(p.note_id_2)) { seen.add(p.note_id_2); unique.push(p); }
    }

    // Sort by ai_score descending and take top N
    unique.sort((a,b)=> b.ai_score - a.ai_score);
    return unique.slice(0, this.settings.max_links_per_note).map(p=>p.note_id_2);
  }

  /**
   * 使用“链接台账（ledger）+ 托管区块”进行增删对账式插链
   * 仅在 HASH_BOUNDARY 之后的托管区内进行增删，不影响用户手写内容
   */
  async reconcileUsingLedger(file: TFile, sourceNoteId: NoteId, desiredTargetIds: NoteId[]): Promise<{added:number; removed:number;}> {
    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) return {added:0, removed:0};
    if (!masterIndex.link_ledger) masterIndex.link_ledger = {} as any;

    const ledger = masterIndex.link_ledger as Record<NoteId, NoteId[]>;
    const currentTargets: NoteId[] = Array.from(new Set(ledger[sourceNoteId] || []));
    const desiredTargets: NoteId[] = Array.from(new Set(desiredTargetIds));

    // 计算差集
    const setCurrent = new Set(currentTargets);
    const setDesired = new Set(desiredTargets);
    const toRemove = currentTargets.filter(id => !setDesired.has(id));
    const toAdd = desiredTargets.filter(id => !setCurrent.has(id));

    // 读取内容并定位 HASH_BOUNDARY；没有则追加到文末
    let content = await this.app.vault.read(file);
    const boundaryMarker = '<!-- HASH_BOUNDARY -->';
    let boundaryIndex = content.indexOf(boundaryMarker);
    if (boundaryIndex === -1) {
      content = content.replace(/\n*$/, '') + `\n${boundaryMarker}`; // 仅生成 HASH_BOUNDARY
      boundaryIndex = content.indexOf(boundaryMarker);
    }

    const head = content.slice(0, boundaryIndex + boundaryMarker.length);

    // 将 desiredTargets 转为路径并去重
    const desiredPathSet = new Set<string>();
    for (const id of desiredTargets) {
      const path = await this.resolveNoteIdToPath(id);
      if (path) desiredPathSet.add(path);
    }
    const desiredPaths = Array.from(desiredPathSet);

    // 详细“链接校准”日志（可读文件名，仅在有变更时输出）
    if (this.settings.enable_debug_logging) {
      try {
        const currentPathSet = new Set<string>();
        for (const id of currentTargets) {
          const p = await this.resolveNoteIdToPath(id);
          if (p) currentPathSet.add(p);
        }
        const desiredOnly = desiredPaths.filter(p => !currentPathSet.has(p));
        const currentOnly = Array.from(currentPathSet).filter(p => !desiredPaths.includes(p));
        if (desiredOnly.length > 0 || currentOnly.length > 0) {
          console.log(`[Link Injector][Ledger] 链接校准 详情 ${file.path}\n  + ${desiredOnly.join(', ')}\n  - ${currentOnly.join(', ') || '-'}`);
        }
      } catch {}
    }

    const linksBlock = desiredPaths.map(p => `- ${this.formatWikiLink(p)}`).join('\n');
    const newContent = head + (linksBlock ? `\n${linksBlock}\n` : '\n');

    await this.app.vault.modify(file, newContent);

    // 更新 ledger
    ledger[sourceNoteId] = desiredTargets;

    if (this.settings.enable_debug_logging && (toAdd.length > 0 || toRemove.length > 0)) {
      console.log(`[Link Injector][Ledger] 链接校准 完成 ${file.path} +${toAdd.length} / -${toRemove.length}`);
    }

    return {added: toAdd.length, removed: toRemove.length};
  }
}
