/**
 * 用于扫描 vault、提取内容和管理 UUID 的笔记处理服务
 */

import { App, TFile, Notice } from 'obsidian';
import { NoteId, ContentHash } from '../types/index';
import { PluginSettings } from '../plugin-settings';
import { generateNoteId } from '../utils/id-generator';
import { calculateContentHash } from '../utils/hash-utils';
import { parseFrontMatter, updateFrontMatter, ensureNoteId, extractMainContent } from '../utils/frontmatter-parser';

/**
 * 用于笔记扫描和内容处理的服务
 */
export class NoteProcessorService {
  private app: App;
  private settings: PluginSettings;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * 扫描 vault 中的 markdown 文件
   * 遵守排除的文件夹和文件模式
   *
   * @param scanPath - 要扫描的路径（例如，“/”表示整个 vault）
   * @returns markdown 文件的 TFile 对象数组
   */
  async scanVault(scanPath: string = '/'): Promise<TFile[]> {
    const allFiles = this.app.vault.getMarkdownFiles();

    // 按扫描路径和排除项筛选
    const filteredFiles = allFiles.filter(file => {
      // 检查文件是否在扫描路径内
      if (scanPath !== '/' && !file.path.startsWith(scanPath.replace(/^\//, ''))) {
        return false;
      }

      // 检查排除项
      if (this.shouldExcludeFile(file)) {
        return false;
      }

      return true;
    });

    if (this.settings.enable_debug_logging) {
      console.log(`[Note Processor] 从 ${allFiles.length} 个总文件中扫描了 ${filteredFiles.length} 个文件`);
    }

    return filteredFiles;
  }

  /**
   * 从笔记中提取主要内容（在 HASH_BOUNDARY 标记之前）
   * 这是为变更检测而进行 hash 的内容
   *
   * @param file - 要处理的笔记文件
   * @returns 主要内容字符串
   */
  async extractMainContent(file: TFile): Promise<string> {
    const content = await this.app.vault.read(file);
    return extractMainContent(content);
  }

  /**
   * 确保笔记在其 front-matter 中具有唯一的 UUID
   * 如果缺少，则生成并写入 UUID
   *
   * @param file - 要处理的笔记文件
   * @returns 笔记 ID（现有的或新生成的）
   */
  async ensureNoteHasId(file: TFile): Promise<NoteId> {
    const content = await this.app.vault.read(file);
    const [newContent, noteId, wasAdded] = ensureNoteId(content, generateNoteId);

    if (wasAdded) {
      await this.app.vault.modify(file, newContent);
      if (this.settings.enable_debug_logging) {
        console.log(`[Note Processor] 已将 UUID 添加到 ${file.path}: ${noteId}`);
      }
    }

    return noteId;
  }

  /**
   * 计算笔记的内容 hash
   * 使用主要内容（HASH_BOUNDARY 之前）的 SHA-256
   *
   * @param file - 要进行 hash 的笔记文件
   * @returns SHA-256 hash 字符串
   */
  async calculateContentHash(file: TFile): Promise<ContentHash> {
    const mainContent = await this.extractMainContent(file);
    return await calculateContentHash(mainContent);
  }

  /**
   * 将 HASH_BOUNDARY 标记添加到没有它的笔记中
   * 在文件末尾插入“<!-- HASH_BOUNDARY -->”
   * 这将用户内容（标记上方）与插件生成的内容（标记下方）分开
   *
   * @param files - 要处理的笔记文件数组
   * @returns 修改的文件数
   */
  async addHashBoundaryToNotes(files: TFile[]): Promise<number> {
    let modifiedCount = 0;

    for (const file of files) {
      const content = await this.app.vault.read(file);

      // 检查标记是否已存在
      if (content.includes('<!-- HASH_BOUNDARY -->')) {
        continue;
      }

      // 在文件末尾添加标记
      const needsNewline = content.length > 0 && !content.endsWith('\n');
      const newContent = content + (needsNewline ? '\n\n' : '\n') + '<!-- HASH_BOUNDARY -->\n';

      await this.app.vault.modify(file, newContent);
      modifiedCount++;

      if (this.settings.enable_debug_logging) {
        console.log(`[Note Processor] 已将 HASH_BOUNDARY 添加到 ${file.path} 的末尾`);
      }
    }

    return modifiedCount;
  }

  /**
   * 将 UUID 添加到当前活动笔记的 front-matter
   * 由“为当前笔记生成唯一 ID”菜单项使用
   *
   * @returns 笔记 ID（现有的或新生成的）
   */
  async addUuidToCurrentNote(): Promise<NoteId> {
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile) {
      throw new Error('没有活动文件');
    }

    if (activeFile.extension !== 'md') {
      throw new Error('活动文件不是 markdown 文件');
    }

    return await this.ensureNoteHasId(activeFile);
  }

  /**
   * 根据设置检查是否应排除文件
   *
   * @param file - 要检查的文件
   * @returns 如果应排除文件，则为 True
   */
  private shouldExcludeFile(file: TFile): boolean {
    // 解析排除的文件夹
    const excludedFolders = this.settings.excluded_folders
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    // 解析排除的模式
    const excludedPatterns = this.settings.excluded_patterns
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // 检查文件是否在排除的文件夹中
    for (const folder of excludedFolders) {
      if (file.path.startsWith(folder.replace(/^\//, ''))) {
        return true;
      }
    }

    // 检查文件是否匹配排除的模式
    for (const pattern of excludedPatterns) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      if (regex.test(file.path)) {
        return true;
      }
    }

    return false;
  }
}
