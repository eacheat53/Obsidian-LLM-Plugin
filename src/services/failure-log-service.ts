/**
 * 基于 SQLite 的失败操作日志管理服务
 * 用于记录、查询和重试失败的批次操作
 */

import { App } from 'obsidian';
import {
  FailureLog,
  FailedOperation,
  FailedOperationType,
  FailureLogEntity,
} from '../types/cache-types';

/**
 * 基于 SQLite 的失败日志服务
 */
export class FailureLogService {
  private app: App;
  private pluginDir: string;
  private db: any = null;
  private cacheService: any = null;

  constructor(app: App, cacheService?: any) {
    this.app = app;
    // @ts-ignore - Obsidian 内部 API
    this.pluginDir = this.app.vault.adapter.basePath; // 传递给 CacheService 的基础路径
    this.cacheService = cacheService;

    // 如果没有提供 CacheService，初始化自己的数据库连接
    if (!cacheService) {
      this.initializeDatabase();
    }
  }

  /**
   * 初始化 SQLite 数据库连接（独立于 CacheService）
   */
  private initializeDatabase(): void {
    try {
      // 使用动态 require 加载 better-sqlite3
      const Database = require('better-sqlite3');
      this.db = new Database(`${this.pluginDir}/.obsidian/plugins/obsidian-llm-plugin/cache.sqlite`);

      // 启用外键约束
      this.db.exec('PRAGMA foreign_keys = ON');

      // 确保失败日志表存在
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS failure_log (
          id TEXT PRIMARY KEY,
          timestamp INTEGER,
          operation_type TEXT,
          batch_info TEXT,
          error_message TEXT,
          resolved INTEGER DEFAULT 0
        )
      `);

      this.db.exec('CREATE INDEX IF NOT EXISTS idx_failure_log_timestamp ON failure_log(timestamp)');

      console.log('[Failure Log Service] SQLite database initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Failure Log Service] Failed to initialize SQLite database:', error);
      throw new Error(`Failed to initialize SQLite: ${errorMessage}`);
    }
  }

  /**
   * 生成唯一的失败操作 ID
   */
  private generateId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${timestamp}-${random}`;
  }

  /**
   * 记录失败操作
   */
  async logFailure(operation: {
    operation_type: FailedOperationType;
    batch_info: {
      batch_number: number;
      total_batches: number;
      items: string[];
      display_items?: string[];
    };
    error: {
      message: string;
      type: string;
      stack?: string;
      status?: number;
    };
    retry_count?: number;
  }): Promise<string> {
    const id = this.generateId();
    const timestamp = Date.now();

    const batchInfoJson = JSON.stringify({
      batch_number: operation.batch_info.batch_number,
      total_batches: operation.batch_info.total_batches,
      items: operation.batch_info.items,
      display_items: operation.batch_info.display_items || []
    });

    const errorJson = JSON.stringify({
      message: operation.error.message,
      type: operation.error.type,
      stack: operation.error.stack || '',
      status: operation.error.status || 0
    });

    const fullOperation: FailedOperation = {
      id,
      timestamp,
      operation_type: operation.operation_type,
      batch_info: operation.batch_info,
      error: operation.error,
      retry_count: operation.retry_count || 0,
      resolved: false
    };

    if (this.cacheService) {
      // 使用 CacheService 的数据库连接
      this.cacheService.logFailure({
        id,
        operation_type: operation.operation_type,
        batch_info: batchInfoJson,
        error_message: errorJson
      });
    } else {
      // 使用自己的数据库连接
      const stmt = this.db!.prepare(`
        INSERT OR REPLACE INTO failure_log
        (id, timestamp, operation_type, batch_info, error_message, resolved)
        VALUES (?, ?, ?, ?, ?, 0)
      `);

      stmt.run(id, timestamp, operation.operation_type, batchInfoJson, errorJson);
    }

    return id;
  }

  /**
   * 获取所有失败日志
   */
  async getFailureLogs(limit: number = 100): Promise<FailureLog> {
    let logs: FailureLogEntity[] = [];

    if (this.cacheService) {
      // 使用 CacheService 的数据库连接
      logs = this.cacheService.getFailureLogs(limit);
    } else {
      // 使用自己的数据库连接
      const stmt = this.db!.prepare('SELECT * FROM failure_log ORDER BY timestamp DESC LIMIT ?');
      logs = stmt.all(limit) as any[];
    }

    // 转换为旧的 FailureLog 格式
    const failureLog: FailureLog = {
      version: '1.0.0',
      created_at: Date.now(),
      last_updated: Date.now(),
      operations: logs.map(log => {
        const batchInfo = JSON.parse(log.batch_info);
        const error = JSON.parse(log.error_message);

        return {
          id: log.id,
          timestamp: log.timestamp,
          operation_type: log.operation_type as FailedOperationType,
          batch_info: batchInfo,
          error: error,
          retry_count: 0, // 新结构中不存储此信息
          resolved: log.resolved === 1
        } as FailedOperation;
      })
    };

    return failureLog;
  }

  /**
   * 根据操作类型获取失败日志
   */
  async getFailuresByType(operationType: FailedOperationType, limit: number = 50): Promise<FailedOperation[]> {
    let logs: FailureLogEntity[] = [];

    if (this.cacheService) {
      // 使用 CacheService
      const allLogs = this.cacheService.getFailureLogs(limit * 2); // 获取更多以便过滤
      logs = allLogs.filter(log => log.operation_type === operationType).slice(0, limit);
    } else {
      // 使用自己的数据库连接
      const stmt = this.db!.prepare(`
        SELECT * FROM failure_log
        WHERE operation_type = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      logs = stmt.all(operationType, limit) as any[];
    }

    return logs.map(log => {
      const batchInfo = JSON.parse(log.batch_info);
      const error = JSON.parse(log.error_message);

      return {
        id: log.id,
        timestamp: log.timestamp,
        operation_type: log.operation_type as FailedOperationType,
        batch_info: batchInfo,
        error: error,
        retry_count: 0,
        resolved: log.resolved === 1
      } as FailedOperation;
    });
  }

  /**
   * 根据批次信息获取失败日志
   */
  async getFailuresByBatch(batchNumber: number): Promise<FailedOperation[]> {
    let logs: FailureLogEntity[] = [];

    if (this.cacheService) {
      // 使用 CacheService，获取所有日志并过滤
      const allLogs = this.cacheService.getFailureLogs(1000);
      logs = allLogs.filter(log => {
        const batchInfo = JSON.parse(log.batch_info);
        return batchInfo.batch_number === batchNumber;
      });
    } else {
      // 使用自己的数据库连接
      const stmt = this.db!.prepare(`
        SELECT * FROM failure_log
        WHERE JSON_EXTRACT(batch_info, '$.batch_number') = ?
        ORDER BY timestamp DESC
      `);
      logs = stmt.all(batchNumber) as any[];
    }

    return logs.map(log => {
      const batchInfo = JSON.parse(log.batch_info);
      const error = JSON.parse(log.error_message);

      return {
        id: log.id,
        timestamp: log.timestamp,
        operation_type: log.operation_type as FailedOperationType,
        batch_info: batchInfo,
        error: error,
        retry_count: 0,
        resolved: log.resolved === 1
      } as FailedOperation;
    });
  }

  /**
   * 标记失败为已解决
   */
  async resolveFailure(id: string): Promise<void> {
    if (this.cacheService) {
      // 使用 CacheService
      this.cacheService.resolveFailure(id);
    } else {
      // 使用自己的数据库连接
      const stmt = this.db!.prepare('UPDATE failure_log SET resolved = 1 WHERE id = ?');
      stmt.run(id);
    }
  }

  /**
   * 批量标记失败为已解决
   */
  async resolveFailures(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    if (this.cacheService) {
      // 使用 CacheService
      ids.forEach(id => this.cacheService.resolveFailure(id));
    } else {
      // 使用自己的数据库连接
      const placeholders = ids.map(() => '?').join(',');
      const stmt = this.db!.prepare(`UPDATE failure_log SET resolved = 1 WHERE id IN (${placeholders})`);
      stmt.run(...ids);
    }
  }

  /**
   * 获取未解决的失败数量
   */
  async getUnresolvedCount(): Promise<number> {
    let count = 0;

    if (this.cacheService) {
      // 使用 CacheService
      const stats = this.cacheService.getStats();
      count = stats.unresolved_failures;
    } else {
      // 使用自己的数据库连接
      const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM failure_log WHERE resolved = 0');
      const result = stmt.get() as { count: number };
      count = result.count;
    }

    return count;
  }

  /**
   * 清理旧的失败日志
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    if (this.cacheService) {
      // CacheService 暂不支持清理，手动实现
      console.log('[Failure Log Service] Cleanup not implemented for CacheService mode');
      return 0;
    } else {
      // 使用自己的数据库连接
      const stmt = this.db!.prepare('DELETE FROM failure_log WHERE timestamp < ? AND resolved = 1');
      const result = stmt.run(cutoffTime);
      deletedCount = result.changes;
    }

    console.log(`[Failure Log Service] Cleaned up ${deletedCount} old failure logs`);
    return deletedCount;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[Failure Log Service] Database connection closed');
    }
  }

  // ===== 兼容性方法（为了逐步迁移） =====

  /**
   * 兼容性方法：记录失败操作
   * @deprecated 使用 logFailure()
   */
  async recordFailure(operation: {
    operation_type: FailedOperationType;
    batch_info: {
      batch_number: number;
      total_batches: number;
      items: string[];
      display_items?: string[];
    };
    error: {
      message: string;
      type: string;
      stack?: string;
      status?: number;
    };
    retry_count?: number;
  }): Promise<void> {
    await this.logFailure(operation);
  }

  /**
   * 兼容性方法：获取未解决的失败
   * @deprecated 使用 getUnresolvedCount()
   */
  async getUnresolvedFailures(): Promise<FailedOperation[]> {
    const logs = await this.getFailureLogs(1000);
    return logs.operations.filter(op => !op.resolved);
  }

  /**
   * 兼容性方法：删除失败记录
   * @deprecated 使用 resolveFailure()
   */
  async deleteFailure(id: string): Promise<void> {
    await this.resolveFailure(id);
  }

  /**
   * 兼容性方法：根据类型获取失败的笔记ID
   * @deprecated 使用 getFailuresByType()
   */
  async getFailedNoteIdsByType(operationType: FailedOperationType): Promise<Set<string>> {
    const failures = await this.getFailuresByType(operationType);
    const noteIds = new Set<string>();

    failures.forEach(failure => {
      failure.batch_info.items.forEach(item => noteIds.add(item));
    });

    return noteIds;
  }
}