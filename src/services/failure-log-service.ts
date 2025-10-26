/**
 * 失败操作日志管理服务
 * 用于记录、查询和重试失败的批次操作
 */

import { App } from 'obsidian';
import {
  FailureLog,
  FailedOperation,
  FailedOperationType,
} from '../types/cache-types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 失败日志服务
 */
export class FailureLogService {
  private app: App;
  private pluginDir: string;
  private logFile: string;
  private cache: FailureLog | null = null;

  constructor(app: App) {
    this.app = app;
    // @ts-ignore - Obsidian 内部 API
    this.pluginDir = path.join(this.app.vault.adapter.basePath, '.obsidian', 'plugins', 'obsidian-llm-plugin');
    this.logFile = path.join(this.pluginDir, 'failure-log.json');
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
   * 加载失败日志
   */
  private async loadLog(): Promise<FailureLog> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const content = await fs.readFile(this.logFile, 'utf-8');
      const log = JSON.parse(content) as FailureLog;
      this.cache = log;
      return log;
    } catch (error) {
      // 如果文件不存在或解析失败，返回空日志
      const emptyLog: FailureLog = {
        version: '1.0.0',
        created_at: Date.now(),
        last_updated: Date.now(),
        operations: [],
      };
      this.cache = emptyLog;
      return emptyLog;
    }
  }

  /**
   * 保存失败日志到磁盘
   * 使用原子写入（临时文件 + 重命名）
   */
  private async saveLog(log: FailureLog): Promise<void> {
    log.last_updated = Date.now();

    // 确保目录存在
    await fs.mkdir(this.pluginDir, { recursive: true });

    // 原子写入
    const tempFile = `${this.logFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(log, null, 2), 'utf-8');
    await fs.rename(tempFile, this.logFile);

    // 更新缓存
    this.cache = log;
  }

  /**
   * 记录一个失败的操作
   *
   * @param params - 失败操作参数
   * @returns 失败操作 ID
   */
  async recordFailure(params: {
    operation_type: FailedOperationType;
    batch_info: {
      batch_number: number;
      total_batches: number;
      items: string[];
    };
    error: {
      message: string;
      type: string;
      stack?: string;
      status?: number;
    };
  }): Promise<string> {
    const log = await this.loadLog();

    const operation: FailedOperation = {
      id: this.generateId(),
      timestamp: Date.now(),
      operation_type: params.operation_type,
      batch_info: params.batch_info,
      error: params.error,
      retry_count: 0,
      resolved: false,
    };

    log.operations.push(operation);
    await this.saveLog(log);

    console.warn('[Failure Log] 记录失败操作:', operation.id, operation.operation_type);

    return operation.id;
  }

  /**
   * 获取所有未解决的失败操作
   */
  async getUnresolvedFailures(): Promise<FailedOperation[]> {
    const log = await this.loadLog();
    return log.operations.filter(op => !op.resolved);
  }

  /**
   * 获取所有失败操作（包括已解决的）
   */
  async getAllFailures(): Promise<FailedOperation[]> {
    const log = await this.loadLog();
    return [...log.operations];
  }

  /**
   * 根据 ID 获取失败操作
   */
  async getFailureById(id: string): Promise<FailedOperation | undefined> {
    const log = await this.loadLog();
    return log.operations.find(op => op.id === id);
  }

  /**
   * 标记失败操作为已解决
   */
  async markAsResolved(id: string): Promise<boolean> {
    const log = await this.loadLog();
    const operation = log.operations.find(op => op.id === id);

    if (!operation) {
      return false;
    }

    operation.resolved = true;
    await this.saveLog(log);

    console.log('[Failure Log] 标记为已解决:', id);
    return true;
  }

  /**
   * 更新失败操作的重试信息
   */
  async updateRetryInfo(id: string): Promise<boolean> {
    const log = await this.loadLog();
    const operation = log.operations.find(op => op.id === id);

    if (!operation) {
      return false;
    }

    operation.retry_count++;
    operation.last_retry_at = Date.now();
    await this.saveLog(log);

    return true;
  }

  /**
   * 删除指定的失败操作
   */
  async deleteFailure(id: string): Promise<boolean> {
    const log = await this.loadLog();
    const index = log.operations.findIndex(op => op.id === id);

    if (index === -1) {
      return false;
    }

    log.operations.splice(index, 1);
    await this.saveLog(log);

    console.log('[Failure Log] 删除失败记录:', id);
    return true;
  }

  /**
   * 清理旧的失败操作记录
   *
   * @param daysOld - 保留最近多少天的记录
   */
  async clearOldFailures(daysOld: number = 30): Promise<number> {
    const log = await this.loadLog();
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    const originalCount = log.operations.length;
    log.operations = log.operations.filter(op =>
      !op.resolved && op.timestamp > cutoffTime
    );

    const removedCount = originalCount - log.operations.length;

    if (removedCount > 0) {
      await this.saveLog(log);
      console.log(`[Failure Log] 清理了 ${removedCount} 条旧记录`);
    }

    return removedCount;
  }

  /**
   * 获取失败操作统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    unresolved: number;
    by_type: Record<FailedOperationType, number>;
  }> {
    const log = await this.loadLog();

    const stats = {
      total: log.operations.length,
      unresolved: log.operations.filter(op => !op.resolved).length,
      by_type: {
        embedding: 0,
        scoring: 0,
        tagging: 0,
      } as Record<FailedOperationType, number>,
    };

    for (const op of log.operations) {
      if (!op.resolved) {
        stats.by_type[op.operation_type]++;
      }
    }

    return stats;
  }

  /**
   * 清除所有失败记录（谨慎使用）
   */
  async clearAll(): Promise<void> {
    const emptyLog: FailureLog = {
      version: '1.0.0',
      created_at: Date.now(),
      last_updated: Date.now(),
      operations: [],
    };

    await this.saveLog(emptyLog);
    console.log('[Failure Log] 已清除所有失败记录');
  }

  /**
   * 使缓存失效，强制重新加载
   */
  invalidateCache(): void {
    this.cache = null;
  }
}
