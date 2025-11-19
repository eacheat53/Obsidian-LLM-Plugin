/**
 * 基于 SQLite (sql.js WASM) 的缓存服务
 * 管理笔记、嵌入向量和配对分数的数据库操作
 */

import { App, TFile, Notice } from 'obsidian';
import { NoteId, EmbeddingVector, UnixTimestamp, NotePairScore } from '../types/index';
import {
  NoteEntity,
  EmbeddingEntity,
  PairScoreEntity,
  FailureLogEntity,
  LinkLedgerEntity,
} from '../types/cache-types';
import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 基于 sql.js (WebAssembly) 的缓存服务
 */
export class CacheService {
  private app: App;
  private basePath: string;
  private pluginDir: string;
  private dbPath: string;
  private wasmPath: string;
  private db: Database | null = null;
  private cacheVersion = '1.0.0';
  private isDirty: boolean = false;

  /**
   * 用于快速分数查找的内存索引
   * 映射 note_id -> (related_note_id -> NotePairScore)
   */
  private scoreIndex: Map<NoteId, Map<NoteId, NotePairScore>> = new Map();

  constructor(app: App, basePath: string) {
    this.app = app;
    this.basePath = basePath;
    // @ts-ignore - Obsidian 内部 API
    this.pluginDir = this.app.vault.adapter.basePath + '/.obsidian/plugins/obsidian-llm-plugin';
    this.dbPath = path.join(this.pluginDir, 'cache.sqlite');
    this.wasmPath = path.join(this.pluginDir, 'sql-wasm.wasm');
  }

  /**
   * 异步初始化 sql.js 数据库
   */
  async initializeDatabase(): Promise<void> {
    try {
      console.log('[Cache Service] Initializing sql.js database...');

      // 1. 检查 WASM 文件是否存在
      if (!fs.existsSync(this.wasmPath)) {
        throw new Error(`WASM file not found at ${this.wasmPath}. Please ensure sql-wasm.wasm is in the plugin directory.`);
      }

      // 2. 加载 WASM 二进制文件
      const wasmBuffer = fs.readFileSync(this.wasmPath);
      const SQL = await initSqlJs({ wasmBinary: wasmBuffer.buffer });

      // 3. 加载现有数据库文件或创建新数据库
      if (fs.existsSync(this.dbPath)) {
        console.log('[Cache Service] Loading existing database from', this.dbPath);
        const dbBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(dbBuffer);
      } else {
        console.log('[Cache Service] Creating new database');
        this.db = new SQL.Database();
        this.createTables();
        this.saveDatabase(); // 创建初始数据库文件
      }

      console.log('[Cache Service] sql.js database initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Cache Service] Failed to initialize sql.js database:', error);
      new Notice(`数据库初始化失败: ${errorMessage}`);
      throw new Error(`Failed to initialize sql.js: ${errorMessage}`);
    }
  }

  /**
   * 创建数据库表和索引
   */
  private createTables(): void {
    const tables = [
      `CREATE TABLE IF NOT EXISTS notes (
        note_id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        file_hash TEXT NOT NULL,
        created_at INTEGER,
        modified_at INTEGER,
        content_length INTEGER,
        title TEXT,
        tags TEXT,
        embedding_updated_at INTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS embeddings (
        note_id TEXT PRIMARY KEY,
        embedding_data BLOB NOT NULL,
        embedding_model TEXT,
        created_at INTEGER,
        FOREIGN KEY (note_id) REFERENCES notes(note_id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS pair_scores (
        note_id_1 TEXT NOT NULL,
        note_id_2 TEXT NOT NULL,
        similarity_score REAL,
        ai_score INTEGER,
        ai_score_model TEXT,
        ai_score_reason TEXT,
        updated_at INTEGER,
        PRIMARY KEY (note_id_1, note_id_2),
        CHECK (note_id_1 < note_id_2)
      )`,

      `CREATE TABLE IF NOT EXISTS link_ledger (
        note_id TEXT NOT NULL,
        target_note_id TEXT NOT NULL,
        inserted_at INTEGER,
        PRIMARY KEY (note_id, target_note_id)
      )`,

      `CREATE TABLE IF NOT EXISTS failure_log (
        id TEXT PRIMARY KEY,
        timestamp INTEGER,
        operation_type TEXT,
        batch_info TEXT,
        error_message TEXT,
        resolved INTEGER DEFAULT 0
      )`
    ];

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(file_path)',
      'CREATE INDEX IF NOT EXISTS idx_scores_sim ON pair_scores(similarity_score)',
      'CREATE INDEX IF NOT EXISTS idx_scores_note1 ON pair_scores(note_id_1)',
      'CREATE INDEX IF NOT EXISTS idx_scores_note2 ON pair_scores(note_id_2)',
      'CREATE INDEX IF NOT EXISTS idx_failure_log_timestamp ON failure_log(timestamp)'
    ];

    // 执行表创建语句
    tables.forEach(sql => this.db!.exec(sql));
    indexes.forEach(sql => this.db!.exec(sql));
  }

  /**
   * 保存数据库到磁盘
   */
  saveDatabase(): void {
    if (!this.db || !this.isDirty) return;

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      this.isDirty = false;
      console.log('[Cache Service] Database saved to disk');
    } catch (error) {
      console.error('[Cache Service] Failed to save database:', error);
      throw new Error(`Failed to save database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.isDirty) {
      this.saveDatabase();
    }
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[Cache Service] Database connection closed');
    }
  }

  /**
   * 确保笔记对ID的一致性排序
   */
  private normalizeNotePair(noteId1: NoteId, noteId2: NoteId): [NoteId, NoteId] {
    return noteId1 < noteId2 ? [noteId1, noteId2] : [noteId2, noteId1];
  }

  // ===== 笔记 CRUD 操作 =====

  /**
   * 根据ID获取笔记
   */
  getNoteById(noteId: string): NoteEntity | undefined {
    const stmt = this.db!.prepare('SELECT * FROM notes WHERE note_id = :noteId');
    stmt.bind({ ':noteId': noteId });

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();

      return {
        note_id: row.note_id as string,
        file_path: row.file_path as string,
        file_hash: row.file_hash as string,
        created_at: row.created_at as number,
        modified_at: row.modified_at as number,
        content_length: row.content_length as number,
        title: row.title as string,
        tags: row.tags ? JSON.parse(row.tags as string) : [],
        frontmatter_hash: row.frontmatter_hash as string,
        embedding_updated_at: row.embedding_updated_at as number
      };
    }

    stmt.free();
    return undefined;
  }

  /**
   * 根据文件路径获取笔记
   */
  getNoteByPath(filePath: string): NoteEntity | undefined {
    const stmt = this.db!.prepare('SELECT * FROM notes WHERE file_path = :filePath');
    stmt.bind({ ':filePath': filePath });

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();

      return {
        note_id: row.note_id as string,
        file_path: row.file_path as string,
        file_hash: row.file_hash as string,
        created_at: row.created_at as number,
        modified_at: row.modified_at as number,
        content_length: row.content_length as number,
        title: row.title as string,
        tags: row.tags ? JSON.parse(row.tags as string) : [],
        frontmatter_hash: row.frontmatter_hash as string,
        embedding_updated_at: row.embedding_updated_at as number
      };
    }

    stmt.free();
    return undefined;
  }

  /**
   * 插入或更新笔记
   */
  upsertNote(note: Partial<NoteEntity>): void {
    this.db!.run(`
      INSERT OR REPLACE INTO notes
      (note_id, file_path, file_hash, created_at, modified_at, content_length, title, tags, frontmatter_hash, embedding_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      note.note_id || '',
      note.file_path || '',
      note.file_hash || '',
      note.created_at || Date.now(),
      note.modified_at || Date.now(),
      note.content_length || 0,
      note.title || '',
      JSON.stringify(note.tags || []),
      note.frontmatter_hash || '',
      note.embedding_updated_at || null
    ]);

    this.isDirty = true;
  }

  /**
   * 获取所有笔记
   */
  getAllNotes(): NoteEntity[] {
    const stmt = this.db!.prepare('SELECT * FROM notes ORDER BY modified_at DESC');
    const results: NoteEntity[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        note_id: row.note_id as string,
        file_path: row.file_path as string,
        file_hash: row.file_hash as string,
        created_at: row.created_at as number,
        modified_at: row.modified_at as number,
        content_length: row.content_length as number,
        title: row.title as string,
        tags: row.tags ? JSON.parse(row.tags as string) : [],
        frontmatter_hash: row.frontmatter_hash as string,
        embedding_updated_at: row.embedding_updated_at as number
      });
    }

    stmt.free();
    return results;
  }

  // ===== 嵌入向量操作 =====

  /**
   * 保存嵌入向量
   */
  saveEmbedding(noteId: string, vector: number[], model: string): void {
    const float32Array = new Float32Array(vector);
    const uint8Array = new Uint8Array(float32Array.buffer);

    this.db!.run(`
      INSERT OR REPLACE INTO embeddings (note_id, embedding_data, embedding_model, created_at)
      VALUES (?, ?, ?, ?)
    `, [noteId, uint8Array, model, Date.now()]);

    this.isDirty = true;
  }

  /**
   * 获取嵌入向量
   */
  getEmbedding(noteId: string): number[] | null {
    const stmt = this.db!.prepare('SELECT embedding_data FROM embeddings WHERE note_id = ?');
    stmt.bind([noteId]);

    if (stmt.step()) {
      const row = stmt.get();
      const uint8Array = row[0] as Uint8Array;
      const float32Array = new Float32Array(uint8Array.buffer);
      stmt.free();
      return Array.from(float32Array);
    }

    stmt.free();
    return null;
  }

  /**
   * 获取嵌入模型信息
   */
  getEmbeddingModel(noteId: string): string | null {
    const stmt = this.db!.prepare('SELECT embedding_model FROM embeddings WHERE note_id = ?');
    stmt.bind([noteId]);

    if (stmt.step()) {
      const row = stmt.get();
      stmt.free();
      return row[0] as string || null;
    }

    stmt.free();
    return null;
  }

  /**
   * 删除嵌入向量
   */
  deleteEmbedding(noteId: string): void {
    this.db!.run('DELETE FROM embeddings WHERE note_id = ?', [noteId]);
    this.isDirty = true;
  }

  // ===== 配对分数操作 =====

  /**
   * 保存配对分数
   */
  saveScore(score: NotePairScore): void {
    const [noteId1, noteId2] = this.normalizeNotePair(score.note_id_1, score.note_id_2);

    this.db!.run(`
      INSERT OR REPLACE INTO pair_scores
      (note_id_1, note_id_2, similarity_score, ai_score, ai_score_model, ai_score_reason, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      noteId1,
      noteId2,
      score.similarity_score,
      score.ai_score,
      '', // ai_score_model - Not in original interface
      '', // ai_score_reason - Not in original interface
      Date.now()
    ]);

    this.isDirty = true;
  }

  /**
   * 获取指定笔记的配对分数
   */
  getScoresForNote(noteId: string, limit: number = 100): NotePairScore[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM pair_scores
      WHERE note_id_1 = ? OR note_id_2 = ?
      ORDER BY similarity_score DESC
      LIMIT ?
    `);
    stmt.bind([noteId, noteId, limit]);

    const results: NotePairScore[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        note_id_1: row.note_id_1 as string,
        note_id_2: row.note_id_2 as string,
        similarity_score: row.similarity_score as number,
        ai_score: row.ai_score as number,
        last_scored: (row.updated_at as number) || Date.now()
      });
    }

    stmt.free();
    return results;
  }

  /**
   * 获取高质量分数（相似度和AI评分都高于阈值）
   */
  getTopScoresForNote(noteId: string, similarityThreshold: number = 0.7, aiScoreThreshold: number = 5, limit: number = 50): NotePairScore[] {
    const stmt = this.db!.prepare(`
      SELECT * FROM pair_scores
      WHERE (note_id_1 = ? OR note_id_2 = ?)
        AND similarity_score >= ?
        AND ai_score >= ?
      ORDER BY similarity_score DESC, ai_score DESC
      LIMIT ?
    `);
    stmt.bind([noteId, noteId, similarityThreshold, aiScoreThreshold, limit]);

    const results: NotePairScore[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        note_id_1: row.note_id_1 as string,
        note_id_2: row.note_id_2 as string,
        similarity_score: row.similarity_score as number,
        ai_score: row.ai_score as number,
        last_scored: (row.updated_at as number) || Date.now()
      });
    }

    stmt.free();
    return results;
  }

  /**
   * 批量保存分数
   */
  batchSaveScores(scores: NotePairScore[]): void {
    scores.forEach(score => this.saveScore(score));
    // sql.js doesn't have transactions like better-sqlite3, but operations are atomic
    // We'll mark dirty as part of individual saveScore calls
  }

  // ===== 链接台账操作 =====

  /**
   * 添加链接记录
   */
  addLinkEntry(noteId: string, targetNoteId: string): void {
    this.db!.run(`
      INSERT OR IGNORE INTO link_ledger (note_id, target_note_id, inserted_at)
      VALUES (?, ?, ?)
    `, [noteId, targetNoteId, Date.now()]);

    this.isDirty = true;
  }

  /**
   * 获取笔记的链接记录
   */
  getLinkEntries(noteId: string): string[] {
    const stmt = this.db!.prepare('SELECT target_note_id FROM link_ledger WHERE note_id = ?');
    stmt.bind([noteId]);

    const results: string[] = [];
    while (stmt.step()) {
      const row = stmt.get();
      results.push(row[0] as string);
    }

    stmt.free();
    return results;
  }

  // ===== 失败日志操作 =====

  /**
   * 记录失败操作
   */
  logFailure(operation: {
    id: string;
    operation_type: string;
    batch_info: string;
    error_message: string;
  }): void {
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO failure_log
      (id, timestamp, operation_type, batch_info, error_message, resolved)
      VALUES (?, ?, ?, ?, ?, 0)
    ``);

    this.db!.run(`
      INSERT OR REPLACE INTO failure_log
      (id, timestamp, operation_type, batch_info, error_message, resolved)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [operation.id, Date.now(), operation.operation_type, operation.batch_info, operation.error_message]);

    this.isDirty = true;
  }

  /**
   * 获取失败日志
   */
  getFailureLogs(limit: number = 100): FailureLogEntity[] {
    const stmt = this.db!.prepare('SELECT * FROM failure_log ORDER BY timestamp DESC LIMIT ?');
    stmt.bind([limit]);

    const results: FailureLogEntity[] = [];
    let count = 0;
    while (stmt.step() && count < limit) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as string,
        timestamp: row.timestamp as number,
        operation_type: row.operation_type as string,
        batch_info: row.batch_info as string,
        error_message: row.error_message as string,
        resolved: row.resolved as number
      });
      count++;
    }

    stmt.free();
    return results;
  }

  /**
   * 标记失败为已解决
   */
  resolveFailure(id: string): void {
    const stmt = this.db!.prepare('UPDATE failure_log SET resolved = 1 WHERE id = ?');
    stmt.run(id);
  }

  // ===== 统计和维护操作 =====

  /**
   * 获取数据库统计信息
   */
  getStats(): {
    total_notes: number;
    total_embeddings: number;
    total_scores: number;
    total_failures: number;
    unresolved_failures: number;
  } {
    const getSingleCount = (sql: string): number => {
      const stmt = this.db!.prepare(sql);
      if (stmt.step()) {
        const result = stmt.get();
        stmt.free();
        return result[0] as number;
      }
      stmt.free();
      return 0;
    };

    const noteCount = getSingleCount('SELECT COUNT(*) FROM notes');
    const embeddingCount = getSingleCount('SELECT COUNT(*) FROM embeddings');
    const scoreCount = getSingleCount('SELECT COUNT(*) FROM pair_scores');
    const failureCount = getSingleCount('SELECT COUNT(*) FROM failure_log');
    const unresolvedFailureCount = getSingleCount('SELECT COUNT(*) FROM failure_log WHERE resolved = 0');

    return {
      total_notes: noteCount,
      total_embeddings: embeddingCount,
      total_scores: scoreCount,
      total_failures: failureCount,
      unresolved_failures: unresolvedFailureCount
    };
  }

  /**
   * 清理孤立数据
   */
  cleanup(): void {
    // 删除没有对应笔记的嵌入
    this.db!.exec(`
      DELETE FROM embeddings
      WHERE note_id NOT IN (SELECT note_id FROM notes)
    `);

    // 删除没有对应笔记的分数
    this.db!.exec(`
      DELETE FROM pair_scores
      WHERE note_id_1 NOT IN (SELECT note_id FROM notes)
         OR note_id_2 NOT IN (SELECT note_id FROM notes)
    `);

    console.log('[Cache Service] Cleanup completed');
  }

  /**
   * 重建内存分数索引
   */
  buildScoreIndex(): void {
    this.scoreIndex.clear();

    const stmt = this.db!.prepare('SELECT * FROM pair_scores');
    let count = 0;

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const score: NotePairScore = {
        note_id_1: row.note_id_1 as string,
        note_id_2: row.note_id_2 as string,
        similarity_score: row.similarity_score as number,
        ai_score: row.ai_score as number,
        last_scored: (row.updated_at as number) || Date.now()
      };

      // 添加到双向索引
      if (!this.scoreIndex.has(score.note_id_1)) {
        this.scoreIndex.set(score.note_id_1, new Map());
      }
      this.scoreIndex.get(score.note_id_1)!.set(score.note_id_2, score);

      if (!this.scoreIndex.has(score.note_id_2)) {
        this.scoreIndex.set(score.note_id_2, new Map());
      }
      this.scoreIndex.get(score.note_id_2)!.set(score.note_id_1, score);

      count++;
    }

    stmt.free();
    console.log('[Cache Service] Score index rebuilt with', count, 'scores');
  }

  // ===== 兼容性方法（为了逐步迁移） =====

  /**
   * 兼容性方法：加载主索引（现在返回空实现）
   * @deprecated 使用新的数据库方法
   */
  async loadMasterIndex(): Promise<{ success: boolean; created_new: boolean; index?: any }> {
    // 新实现不需要主索引，直接返回成功
    return { success: true, created_new: false, index: this.getMasterIndex() };
  }

  /**
   * 兼容性方法：保存主索引（空实现）
   * @deprecated 数据库自动保存
   */
  async saveMasterIndex(masterIndex?: any): Promise<void> {
    // 新实现不需要手动保存主索引
    console.log('[Cache Service] saveMasterIndex called (no-op in SQLite implementation)');
  }

  /**
   * 兼容性方法：设置主索引（空实现）
   * @deprecated 数据库自动管理
   */
  setMasterIndex(): void {
    console.log('[Cache Service] setMasterIndex called (no-op in SQLite implementation)');
  }

  /**
   * 兼容性方法：获取主索引（返回空对象）
   * @deprecated 使用 getAllNotes() 和 getScoresForNote()
   */
  getMasterIndex(): {
    notes: Record<NoteId, any>;
    scores: Record<string, any>;
    stats: any;
    link_ledger: Record<NoteId, NoteId[]>;
  } {
    // 构建 link_ledger
    const stmt = this.db!.prepare('SELECT * FROM link_ledger');
    const linkLedger: Record<NoteId, NoteId[]> = {};

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const noteId = row.note_id as string;
      const targetNoteId = row.target_note_id as string;

      if (!linkLedger[noteId]) {
        linkLedger[noteId] = [];
      }
      linkLedger[noteId].push(targetNoteId);
    }

    stmt.free();

    return {
      notes: {},
      scores: {},
      stats: this.getStats(),
      link_ledger: linkLedger
    };
  }

  /**
   * 兼容性方法：加载嵌入
   * @deprecated 使用 getEmbedding()
   */
  async loadEmbedding(noteId: string): Promise<{ success: boolean; embedding?: number[]; from_cache: boolean }> {
    const embedding = this.getEmbedding(noteId);
    return {
      success: embedding !== null,
      embedding: embedding || undefined,
      from_cache: embedding !== null
    };
  }

  /**
   * 兼容性方法：清除缓存
   * @deprecated 使用 cleanup() 方法
   */
  async clearCache(): Promise<void> {
    this.cleanup();
  }

  /**
   * 兼容性方法：显示统计信息
   * @deprecated 使用 getStats() 方法
   */
  async showStatistics(): Promise<void> {
    const stats = this.getStats();
    console.log('[Cache Service] Statistics:', stats);
  }
}