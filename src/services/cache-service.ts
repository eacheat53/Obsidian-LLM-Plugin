/**
 * 用于管理主索引和分片嵌入的缓存服务
 * 实现基于 JSON 的持久化和原子写入
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
 * 用于管理缓存数据（主索引 + 分片嵌入）的服务
 */
export class CacheService {
  private app: App;
  private basePath: string;
  private masterIndex: MasterIndex | null = null;
  private cacheVersion = '1.0.0';

  /**
   * 用于快速分数查找的内存索引
   * 映射 note_id -> (related_note_id -> NotePairScore)
   */
  private scoreIndex: Map<NoteId, Map<NoteId, NotePairScore>> = new Map();

  constructor(app: App, basePath: string) {
    this.app = app;
    this.basePath = basePath;
  }

  /**
   * 获取缓存目录路径
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
   * 从磁盘加载主索引
   * 如果索引不存在则创建一个新索引
   */
  async loadMasterIndex(options: CacheLoadOptions = {}): Promise<CacheLoadResult> {
    const paths = this.getPaths();
    const {
      create_if_missing = true,
      validate_schema = true,
      detect_orphans = false,
    } = options;

    try {
      // 检查索引文件是否存在
      const indexExists = await this.fileExists(paths.index_file);

      if (!indexExists) {
        if (create_if_missing) {
          // 创建新的空索引
          const newIndex = this.createEmptyIndex();
          this.masterIndex = newIndex;

          // 确保缓存目录存在
          await this.ensureCacheDirectories();

          // 构建空的分数索引
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
            error: '索引文件未找到',
            created_new: false,
            migrated: false,
          };
        }
      }

      // 读取并解析索引文件
      const content = await this.readFile(paths.index_file);
      const index = JSON.parse(content) as MasterIndex;

      // 验证模式版本
      if (validate_schema && index.version !== this.cacheVersion) {
        console.warn(`[Cache Service] 模式版本不匹配: ${index.version} !== ${this.cacheVersion}`);
        // 将来可以在此处实现迁移
      }

      // 如果需要，检测孤立笔记
      if (detect_orphans) {
        await this.updateOrphanedStats(index);
      }

      this.masterIndex = index;

      // 构建内存中的分数索引以进行快速查找
      this.buildScoreIndex();

      return {
        success: true,
        index,
        created_new: false,
        migrated: false,
      };
    } catch (error) {
      console.error('[Cache Service] 加载主索引失败:', error);
      return {
        success: false,
        error: (error as Error).message,
        created_new: false,
        migrated: false,
      };
    }
  }

  /**
   * 将主索引保存到磁盘
   * 使用原子写入（临时文件 + 重命名）以确保崩溃安全
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
      // 确保缓存目录存在
      await this.ensureCacheDirectories();

      // 更新 last_updated 时间戳
      index.last_updated = Date.now();

      // 如果需要，更新统计信息
      if (update_stats) {
        index.stats = this.calculateStatistics(index);
      }

      // 序列化为 JSON
      const content = pretty_print
        ? JSON.stringify(index, null, 2)
        : JSON.stringify(index);

      if (atomic) {
        // 原子写入：写入临时文件，然后重命名
        const tempFile = `${paths.index_file}.tmp`;
        await this.writeFile(tempFile, content);
        await this.renameFile(tempFile, paths.index_file);
      } else {
        // 直接写入
        await this.writeFile(paths.index_file, content);
      }

      this.masterIndex = index;
    } catch (error) {
      console.error('[Cache Service] 保存主索引失败:', error);
      throw error;
    }
  }

  /**
   * 加载特定笔记的嵌入向量
   * 从缓存返回或指示需要生成
   */
  async loadEmbedding(noteId: NoteId): Promise<EmbeddingLoadResult> {
    const paths = this.getPaths();
    const embeddingFile = `${paths.embeddings_dir}/${noteId}.json`;

    try {
      const exists = await this.fileExists(embeddingFile);

      if (!exists) {
        return {
          success: false,
          error: '未找到嵌入',
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
      console.error(`[Cache Service] 加载 ${noteId} 的嵌入失败:`, error);
      return {
        success: false,
        error: (error as Error).message,
        from_cache: false,
      };
    }
  }

  /**
   * 保存特定笔记的嵌入向量
   * 创建分片文件：embeddings/<note_id>.json
   */
  async saveEmbedding(embedding: EmbeddingVector): Promise<void> {
    const paths = this.getPaths();
    const embeddingFile = `${paths.embeddings_dir}/${embedding.note_id}.json`;

    try {
      // 确保嵌入目录存在
      await this.ensureCacheDirectories();

      // 序列化为 JSON
      const content = JSON.stringify(embedding);

      // 写入嵌入文件
      await this.writeFile(embeddingFile, content);
    } catch (error) {
      console.error(`[Cache Service] 保存 ${embedding.note_id} 的嵌入失败:`, error);
      throw error;
    }
  }

  /**
   * 删除特定笔记的嵌入向量
   * 修复问题6: 孤立数据清理
   */
  async deleteEmbedding(noteId: NoteId): Promise<void> {
    const paths = this.getPaths();
    const embeddingFile = `${paths.embeddings_dir}/${noteId}.json`;

    try {
      if (await this.fileExists(embeddingFile)) {
        await this.deleteFile(embeddingFile);
      }
    } catch (error) {
      console.error(`[Cache Service] 删除 ${noteId} 的嵌入失败:`, error);
      throw error;
    }
  }

  /**
   * 清除所有缓存数据（索引和嵌入）
   * 由设置中的"清除缓存"按钮使用
   */
  async clearCache(): Promise<void> {
    const paths = this.getPaths();

    try {
      // 删除主索引
      if (await this.fileExists(paths.index_file)) {
        await this.deleteFile(paths.index_file);
      }

      // 删除所有嵌入文件
      if (await this.directoryExists(paths.embeddings_dir)) {
        const files = await this.listFiles(paths.embeddings_dir);
        for (const file of files) {
          await this.deleteFile(`${paths.embeddings_dir}/${file}`);
        }
      }

      // 重置内存中的索引
      this.masterIndex = null;

      console.log('[Cache Service] 缓存已成功清除');
    } catch (error) {
      console.error('[Cache Service] 清除缓存失败:', error);
      throw error;
    }
  }

  /**
   * 计算缓存统计信息并打印到控制台
   * 由设置中的“显示统计信息”按钮使用
   */
  async showStatistics(): Promise<CacheStatistics> {
    if (!this.masterIndex) {
      const result = await this.loadMasterIndex();
      if (!result.success || !result.index) {
        throw new Error('加载缓存索引失败');
      }
    }

    const stats = this.calculateStatistics(this.masterIndex!);

    console.log('=== Jina AI Linker 缓存统计信息 ===');
    console.log(`总笔记数: ${stats.total_notes}`);
    console.log(`总嵌入数: ${stats.total_embeddings}`);
    console.log(`总分数: ${stats.total_scores}`);
    console.log(`孤立笔记: ${stats.orphaned_notes}`);
    console.log('======================================');

    return stats;
  }

  /**
   * 检测孤立笔记（在缓存中但不在 vault 中）
   * 更新 stats.orphaned_notes 字段
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
   * 获取当前主索引（缓存在内存中）
   */
  getMasterIndex(): MasterIndex | null {
    return this.masterIndex;
  }

  /**
   * 设置主索引（用于内存更新）
   * 自动重建分数索引
   */
  setMasterIndex(index: MasterIndex): void {
    this.masterIndex = index;
    this.buildScoreIndex();
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 创建一个空的主索引
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
   * 从索引计算统计信息
   */
  private calculateStatistics(index: MasterIndex): CacheStatistics {
    return {
      total_notes: Object.keys(index.notes).length,
      total_embeddings: Object.keys(index.notes).length, // 简化 - 可以检查实际文件
      total_scores: Object.keys(index.scores).length,
      orphaned_notes: index.stats.orphaned_notes || 0,
    };
  }

  /**
   * 更新孤立笔记统计信息
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
   * 确保缓存目录存在
   */
  private async ensureCacheDirectories(): Promise<void> {
    const paths = this.getPaths();

    // 创建缓存目录
    if (!(await this.directoryExists(paths.cache_dir))) {
      await this.createDirectory(paths.cache_dir);
    }

    // 创建嵌入目录
    if (!(await this.directoryExists(paths.embeddings_dir))) {
      await this.createDirectory(paths.embeddings_dir);
    }
  }

  // ============================================================================
  // 文件系统抽象（使用 Node.js fs 进行直接文件访问）
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
  // 分数索引管理（内存优化）
  // ============================================================================

  /**
   * 从扁平的分数结构构建内存中的分数索引
   * 实现对给定笔记的所有分数的 O(1) 查找
   *
   * 存储结构（磁盘）：{ "id1:id2": score, "id3:id4": score }
   * 索引结构（内存）：{ id1: { id2: score }, id2: { id1: score }, id3: { id4: score }, id4: { id3: score } }
   */
  private buildScoreIndex(): void {
    this.scoreIndex.clear();

    if (!this.masterIndex) {
      return;
    }

    // 遍历所有分数对
    for (const [pairKey, score] of Object.entries(this.masterIndex.scores)) {
      const [noteId1, noteId2] = pairKey.split(':') as [NoteId, NoteId];

      // 将双向条目添加到索引
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
   * 获取给定笔记的所有分数（O(1) 查找）
   * 返回涉及给定笔记的所有笔记对
   *
   * @param noteId - 要获取分数的笔记 ID
   * @returns 涉及此笔记的分数数组，按分数排序（降序）
   */
  getScoresForNote(noteId: NoteId): NotePairScore[] {
    const relatedScores = this.scoreIndex.get(noteId);

    if (!relatedScores) {
      return [];
    }

    // 将 Map 转换为数组并按 AI 分数排序
    return Array.from(relatedScores.values()).sort(
      (a, b) => b.ai_score - a.ai_score
    );
  }

  /**
   * 获取给定笔记的前 N 个相关笔记
   *
   * @param noteId - 要为其查找相关笔记的笔记 ID
   * @param limit - 最大结果数（默认为 10）
   * @returns 前 N 个相关笔记 ID 的数组，按分数排序
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
