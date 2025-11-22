/**
 * 用于管理主索引和分片嵌入的缓存服务
 * 实现基于 SQLite 的持久化
 */

import { App } from 'obsidian';
import { NoteId, EmbeddingVector, NotePairScore, NoteMetadata } from '../types/index';
import {
  MasterIndex,
  CacheStatistics,
  CachePaths,
  CacheLoadOptions,
  CacheSaveOptions,
  CacheLoadResult,
  EmbeddingLoadResult,
} from '../types/cache-types';
import initSqlJs, { Database } from 'sql.js';

/**
 * 用于管理缓存数据（主索引 + 分片嵌入）的服务
 * 重构为使用 SQLite 存储
 */
export class CacheService {
  private app: App;
  private basePath: string;
  private masterIndex: MasterIndex | null = null;
  private cacheVersion = '1.0.0';
  private db: Database | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private isDirty = false;

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
   * 初始化 SQLite 数据库
   */
  async initialize(): Promise<void> {
    const paths = this.getPaths();

    // 确保缓存目录存在
    await this.ensureCacheDirectories();

    try {
      // 加载 WASM
      // 在 Obsidian 插件环境中，我们需要找到 wasm 文件
      // 假设 wasm 文件被复制到了插件根目录
      const fs = require('fs');
      const path = require('path');
      // 尝试多个可能的位置
      const possibleWasmPaths = [
        path.join(this.basePath, '.obsidian', 'plugins', 'obsidian-llm-plugin', 'sql-wasm.wasm'),
        'sql-wasm.wasm' // 相对路径
      ];

      let wasmBinary: Buffer | null = null;
      for (const p of possibleWasmPaths) {
        if (fs.existsSync(p)) {
          wasmBinary = fs.readFileSync(p);
          break;
        }
      }

      // 如果找不到，尝试从 node_modules (开发环境)
      if (!wasmBinary) {
        try {
          wasmBinary = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
        } catch (e) {
          // ignore
        }
      }

      if (!wasmBinary) {
        console.warn('[Cache Service] 未找到 sql-wasm.wasm，尝试使用默认加载方式');
      }

      const SQL = await initSqlJs({
        wasmBinary: (wasmBinary as any) || undefined
      });

      // 加载数据库文件
      if (await this.fileExists(paths.db_file)) {
        const data = await this.readFileBinary(paths.db_file);
        this.db = new SQL.Database(new Uint8Array(data));
      } else {
        this.db = new SQL.Database();
        this.initTables();
        await this.saveDatabase(true); // 立即保存初始空数据库
      }

      console.log('[Cache Service] SQLite 数据库已初始化');
    } catch (error) {
      console.error('[Cache Service] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 初始化数据库表结构
   */
  private initTables(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      
      CREATE TABLE IF NOT EXISTS notes (
        note_id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        content_hash TEXT,
        last_processed INTEGER,
        tags TEXT,
        tags_generated_at INTEGER,
        has_frontmatter INTEGER,
        has_hash_boundary INTEGER,
        has_links_section INTEGER
      );

      CREATE TABLE IF NOT EXISTS scores (
        note_id_1 TEXT,
        note_id_2 TEXT,
        similarity_score REAL,
        ai_score REAL,
        last_scored INTEGER,
        PRIMARY KEY (note_id_1, note_id_2)
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        note_id TEXT PRIMARY KEY,
        embedding TEXT,
        model_name TEXT,
        created_at INTEGER,
        content_preview TEXT,
        FOREIGN KEY(note_id) REFERENCES notes(note_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS link_ledger (
        source_note_id TEXT,
        target_note_id TEXT,
        PRIMARY KEY (source_note_id, target_note_id),
        FOREIGN KEY(source_note_id) REFERENCES notes(note_id) ON DELETE CASCADE
      );
    `);

    // 设置版本
    this.db.run("INSERT OR IGNORE INTO metadata (key, value) VALUES ('version', ?)", [this.cacheVersion]);
    this.db.run("INSERT OR IGNORE INTO metadata (key, value) VALUES ('last_updated', ?)", [Date.now().toString()]);
  }

  /**
   * 获取缓存目录路径
   */
  private getPaths(): CachePaths & { db_file: string } {
    const cache_dir = `${this.basePath}/.obsidian/plugins/obsidian-llm-plugin/cache`;
    return {
      cache_dir,
      index_file: `${cache_dir}/index.json`, // 保持兼容性定义，虽然不再使用
      embeddings_dir: `${cache_dir}/embeddings`, // 保持兼容性定义
      db_file: `${cache_dir}/data.sqlite`
    };
  }

  /**
   * 从数据库加载主索引
   */
  async loadMasterIndex(options: CacheLoadOptions = {}): Promise<CacheLoadResult> {
    if (!this.db) {
      return { success: false, error: '数据库未初始化', created_new: false, migrated: false };
    }

    const { create_if_missing = true, detect_orphans = false } = options;

    try {
      // 构建 MasterIndex 对象
      const index: MasterIndex = {
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
        link_ledger: {}
      };

      // 读取元数据
      const metaStmt = this.db.prepare("SELECT key, value FROM metadata");
      while (metaStmt.step()) {
        const row = metaStmt.getAsObject();
        if (row.key === 'version') index.version = row.value as string;
        if (row.key === 'last_updated') index.last_updated = parseInt(row.value as string);
      }
      metaStmt.free();

      // 读取笔记
      const notesStmt = this.db.prepare("SELECT * FROM notes");
      while (notesStmt.step()) {
        const row = notesStmt.getAsObject();
        index.notes[row.note_id as string] = {
          note_id: row.note_id as string,
          file_path: row.file_path as string,
          content_hash: row.content_hash as string,
          last_processed: row.last_processed as number,
          tags: JSON.parse(row.tags as string || '[]'),
          tags_generated_at: row.tags_generated_at as number,
          has_frontmatter: !!row.has_frontmatter,
          has_hash_boundary: !!row.has_hash_boundary,
          has_links_section: !!row.has_links_section
        };
      }
      notesStmt.free();

      // 读取分数
      const scoresStmt = this.db.prepare("SELECT * FROM scores");
      while (scoresStmt.step()) {
        const row = scoresStmt.getAsObject();
        const key = `${row.note_id_1}:${row.note_id_2}`;
        index.scores[key] = {
          note_id_1: row.note_id_1 as string,
          note_id_2: row.note_id_2 as string,
          similarity_score: row.similarity_score as number,
          ai_score: row.ai_score as number,
          last_scored: row.last_scored as number
        };
      }
      scoresStmt.free();

      // 读取 Ledger
      const ledgerStmt = this.db.prepare("SELECT * FROM link_ledger");
      while (ledgerStmt.step()) {
        const row = ledgerStmt.getAsObject();
        const src = row.source_note_id as string;
        const tgt = row.target_note_id as string;
        if (!index.link_ledger![src]) index.link_ledger![src] = [];
        index.link_ledger![src].push(tgt);
      }
      ledgerStmt.free();

      // 更新统计
      index.stats = this.calculateStatistics(index);

      // 如果需要，检测孤立笔记
      if (detect_orphans) {
        await this.updateOrphanedStats(index);
      }

      this.masterIndex = index;
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
   * 将主索引保存到数据库
   * 这是一个全量同步操作，将内存中的 MasterIndex 状态同步到 DB 表
   */
  async saveMasterIndex(
    index: MasterIndex,
    options: CacheSaveOptions = {}
  ): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      // 开始事务
      this.db.run("BEGIN TRANSACTION");

      // 更新元数据
      index.last_updated = Date.now();
      this.db.run("UPDATE metadata SET value = ? WHERE key = 'last_updated'", [index.last_updated.toString()]);

      // 同步笔记
      // 1. 获取 DB 中所有 note_id
      const existingNoteIds = new Set<string>();
      const idStmt = this.db.prepare("SELECT note_id FROM notes");
      while (idStmt.step()) existingNoteIds.add(idStmt.getAsObject().note_id as string);
      idStmt.free();

      // 2. 更新/插入笔记
      const noteInsertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO notes (
          note_id, file_path, content_hash, last_processed, tags, tags_generated_at, 
          has_frontmatter, has_hash_boundary, has_links_section
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const noteId in index.notes) {
        const note = index.notes[noteId];
        noteInsertStmt.run([
          note.note_id,
          note.file_path,
          note.content_hash,
          note.last_processed,
          JSON.stringify(note.tags),
          note.tags_generated_at || null,
          note.has_frontmatter ? 1 : 0,
          note.has_hash_boundary ? 1 : 0,
          note.has_links_section ? 1 : 0
        ]);
        existingNoteIds.delete(noteId);
      }
      noteInsertStmt.free();

      // 3. 删除多余的笔记
      if (existingNoteIds.size > 0) {
        const placeholders = Array(existingNoteIds.size).fill('?').join(',');
        this.db.run(`DELETE FROM notes WHERE note_id IN (${placeholders})`, Array.from(existingNoteIds));
      }

      // 同步分数
      const existingScoreKeys = new Set<string>();
      const scoreIdStmt = this.db.prepare("SELECT note_id_1, note_id_2 FROM scores");
      while (scoreIdStmt.step()) {
        const row = scoreIdStmt.getAsObject();
        existingScoreKeys.add(`${row.note_id_1}:${row.note_id_2}`);
      }
      scoreIdStmt.free();

      const scoreInsertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO scores (note_id_1, note_id_2, similarity_score, ai_score, last_scored)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const key in index.scores) {
        const score = index.scores[key];
        scoreInsertStmt.run([
          score.note_id_1,
          score.note_id_2,
          score.similarity_score,
          score.ai_score,
          score.last_scored
        ]);
        existingScoreKeys.delete(key);
      }
      scoreInsertStmt.free();

      if (existingScoreKeys.size > 0) {
        const deleteScoreStmt = this.db.prepare("DELETE FROM scores WHERE note_id_1 = ? AND note_id_2 = ?");
        for (const key of existingScoreKeys) {
          const [id1, id2] = key.split(':');
          deleteScoreStmt.run([id1, id2]);
        }
        deleteScoreStmt.free();
      }

      // 同步 Ledger
      this.db.run("DELETE FROM link_ledger");
      const ledgerInsertStmt = this.db.prepare("INSERT INTO link_ledger (source_note_id, target_note_id) VALUES (?, ?)");
      if (index.link_ledger) {
        for (const src in index.link_ledger) {
          for (const tgt of index.link_ledger[src]) {
            ledgerInsertStmt.run([src, tgt]);
          }
        }
      }
      ledgerInsertStmt.free();

      this.db.run("COMMIT");

      this.masterIndex = index;

      // 触发防抖保存到磁盘
      this.triggerDebouncedSave();

    } catch (error) {
      this.db.run("ROLLBACK");
      console.error('[Cache Service] 保存主索引失败:', error);
      throw error;
    }
  }

  /**
   * 更新单个笔记的元数据（增量更新）
   * 比全量 saveMasterIndex 更高效
   */
  async updateNote(noteId: NoteId, metadata: NoteMetadata): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');
    if (!this.masterIndex) throw new Error('主索引未加载');

    try {
      // 更新内存索引
      this.masterIndex.notes[noteId] = metadata;

      // 更新数据库
      this.db.run(`
        INSERT OR REPLACE INTO notes (
          note_id, file_path, content_hash, last_processed, tags, tags_generated_at, 
          has_frontmatter, has_hash_boundary, has_links_section
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        metadata.note_id,
        metadata.file_path,
        metadata.content_hash,
        metadata.last_processed,
        JSON.stringify(metadata.tags || []),
        metadata.tags_generated_at || null,
        metadata.has_frontmatter ? 1 : 0,
        metadata.has_hash_boundary ? 1 : 0,
        metadata.has_links_section ? 1 : 0
      ]);

      // 更新最后更新时间
      this.masterIndex.last_updated = Date.now();
      this.db.run("UPDATE metadata SET value = ? WHERE key = 'last_updated'", [this.masterIndex.last_updated.toString()]);

      // 触发防抖保存到磁盘
      this.triggerDebouncedSave();
    } catch (error) {
      console.error(`[Cache Service] 更新笔记 ${noteId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 加载特定笔记的嵌入向量
   */
  async loadEmbedding(noteId: NoteId): Promise<EmbeddingLoadResult> {
    if (!this.db) return { success: false, error: '数据库未初始化', from_cache: false };

    try {
      const stmt = this.db.prepare("SELECT embedding FROM embeddings WHERE note_id = ?");
      stmt.bind([noteId]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        const embedding = JSON.parse(row.embedding as string) as number[];
        stmt.free();
        return {
          success: true,
          embedding,
          from_cache: true
        };
      }

      stmt.free();
      return {
        success: false,
        error: '未找到嵌入',
        from_cache: false
      };
    } catch (error) {
      console.error(`[Cache Service] 加载 ${noteId} 的嵌入失败:`, error);
      return {
        success: false,
        error: (error as Error).message,
        from_cache: false
      };
    }
  }

  /**
   * 保存特定笔记的嵌入向量
   */
  async saveEmbedding(embedding: EmbeddingVector): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run(`
        INSERT OR REPLACE INTO embeddings (note_id, embedding, model_name, created_at, content_preview)
        VALUES (?, ?, ?, ?, ?)
      `, [
        embedding.note_id,
        JSON.stringify(embedding.embedding),
        embedding.model_name,
        embedding.created_at,
        embedding.content_preview
      ]);

      this.triggerDebouncedSave();
    } catch (error) {
      console.error(`[Cache Service] 保存 ${embedding.note_id} 的嵌入失败:`, error);
      throw error;
    }
  }

  /**
   * 删除特定笔记的嵌入向量
   */
  async deleteEmbedding(noteId: NoteId): Promise<void> {
    if (!this.db) return;
    this.db.run("DELETE FROM embeddings WHERE note_id = ?", [noteId]);
    this.triggerDebouncedSave();
  }

  /**
   * 清除所有缓存数据
   */
  async clearCache(): Promise<void> {
    if (!this.db) return;

    try {
      this.db.run("BEGIN TRANSACTION");
      this.db.run("DELETE FROM notes");
      this.db.run("DELETE FROM scores");
      this.db.run("DELETE FROM embeddings");
      this.db.run("DELETE FROM link_ledger");
      this.db.run("UPDATE metadata SET value = ? WHERE key = 'last_updated'", [Date.now().toString()]);
      this.db.run("COMMIT");

      this.masterIndex = null;
      this.scoreIndex.clear();

      await this.saveDatabase(true); // 立即保存
      console.log('[Cache Service] 缓存已成功清除');
    } catch (error) {
      console.error('[Cache Service] 清除缓存失败:', error);
      throw error;
    }
  }

  /**
   * 触发防抖保存
   */
  private triggerDebouncedSave() {
    this.isDirty = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    // 30秒防抖，或者在 unload 时强制保存
    this.saveTimer = setTimeout(() => {
      this.saveDatabase();
    }, 30000);
  }

  /**
   * 将数据库保存到磁盘
   */
  async saveDatabase(force = false): Promise<void> {
    if (!this.db || (!this.isDirty && !force)) return;

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const paths = this.getPaths();

      // 写入临时文件然后重命名
      const tempFile = `${paths.db_file}.tmp`;
      await this.writeFileBinary(tempFile, buffer);
      await this.renameFile(tempFile, paths.db_file);

      this.isDirty = false;
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      // console.log('[Cache Service] Database saved to disk');
    } catch (error) {
      console.error('[Cache Service] Failed to save database:', error);
    }
  }

  async showStatistics(): Promise<CacheStatistics> {
    if (!this.masterIndex) {
      await this.loadMasterIndex();
    }
    if (!this.masterIndex) throw new Error('Failed to load index');

    // 重新从 DB 计算准确的嵌入数量
    if (this.db) {
      const stmt = this.db.prepare("SELECT COUNT(*) as count FROM embeddings");
      if (stmt.step()) {
        this.masterIndex.stats.total_embeddings = stmt.getAsObject().count as number;
      }
      stmt.free();
    }

    const stats = this.masterIndex.stats;
    console.log('=== Jina AI Linker 缓存统计信息 (SQLite) ===');
    console.log(`总笔记数: ${stats.total_notes}`);
    console.log(`总嵌入数: ${stats.total_embeddings}`);
    console.log(`总分数: ${stats.total_scores}`);
    console.log(`孤立笔记: ${stats.orphaned_notes}`);
    console.log('======================================');
    return stats;
  }

  async detectOrphans(): Promise<number> {
    if (!this.masterIndex) await this.loadMasterIndex();
    if (!this.masterIndex) return 0;
    await this.updateOrphanedStats(this.masterIndex);
    return this.masterIndex.stats.orphaned_notes;
  }

  getMasterIndex(): MasterIndex | null {
    return this.masterIndex;
  }

  setMasterIndex(index: MasterIndex): void {
    this.masterIndex = index;
    this.buildScoreIndex();
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  private calculateStatistics(index: MasterIndex): CacheStatistics {
    return {
      total_notes: Object.keys(index.notes).length,
      total_embeddings: 0, // 将在 showStatistics 中更新
      total_scores: Object.keys(index.scores).length,
      orphaned_notes: index.stats.orphaned_notes || 0,
    };
  }

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

  private async ensureCacheDirectories(): Promise<void> {
    const paths = this.getPaths();
    if (!(await this.directoryExists(paths.cache_dir))) {
      await this.createDirectory(paths.cache_dir);
    }
  }

  // ============================================================================
  // 文件系统抽象
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

  private async readFileBinary(path: string): Promise<Buffer> {
    const fs = require('fs').promises;
    return await fs.readFile(path);
  }

  private async writeFileBinary(path: string, content: Buffer): Promise<void> {
    const fs = require('fs').promises;
    await fs.writeFile(path, content);
  }

  private async renameFile(oldPath: string, newPath: string): Promise<void> {
    const fs = require('fs').promises;
    await fs.rename(oldPath, newPath);
  }

  private async createDirectory(path: string): Promise<void> {
    const fs = require('fs').promises;
    await fs.mkdir(path, { recursive: true });
  }

  // ============================================================================
  // 分数索引管理
  // ============================================================================

  private buildScoreIndex(): void {
    this.scoreIndex.clear();
    if (!this.masterIndex) return;

    for (const [pairKey, score] of Object.entries(this.masterIndex.scores)) {
      const [noteId1, noteId2] = pairKey.split(':') as [NoteId, NoteId];
      if (!this.scoreIndex.has(noteId1)) this.scoreIndex.set(noteId1, new Map());
      if (!this.scoreIndex.has(noteId2)) this.scoreIndex.set(noteId2, new Map());
      this.scoreIndex.get(noteId1)!.set(noteId2, score);
      this.scoreIndex.get(noteId2)!.set(noteId1, score);
    }
  }

  getScoresForNote(noteId: NoteId): NotePairScore[] {
    const relatedScores = this.scoreIndex.get(noteId);
    if (!relatedScores) return [];
    return Array.from(relatedScores.values()).sort((a, b) => b.ai_score - a.ai_score);
  }

  getTopRelatedNotes(noteId: NoteId, limit: number = 10): NoteId[] {
    const scores = this.getScoresForNote(noteId);
    return scores.slice(0, limit).map(score =>
      score.note_id_1 === noteId ? score.note_id_2 : score.note_id_1
    );
  }
}
