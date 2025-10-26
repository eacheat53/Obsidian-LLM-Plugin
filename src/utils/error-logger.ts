/**
 * 详细错误日志记录器
 * 将错误信息记录到日志文件中，便于调试和分析
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 日志级别
 */
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

/**
 * 日志条目
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * 错误日志记录器
 */
export class ErrorLogger {
  private logDir: string;
  private maxLogSizeBytes: number = 5 * 1024 * 1024; // 5MB
  private maxLogFiles: number = 7; // 保留 7 天

  constructor(basePath: string) {
    this.logDir = path.join(basePath, '.obsidian', 'plugins', 'obsidian-llm-plugin', 'logs');
  }

  /**
   * 确保日志目录存在
   */
  private async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      // 忽略目录已存在的错误
    }
  }

  /**
   * 获取当前日志文件路径
   */
  private getCurrentLogFile(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `error-${date}.log`);
  }

  /**
   * 格式化日志条目
   */
  private formatLogEntry(entry: LogEntry): string {
    let logLine = `[${entry.timestamp}] ${entry.level} - ${entry.category}\n`;
    logLine += `Message: ${entry.message}\n`;

    if (entry.details) {
      for (const [key, value] of Object.entries(entry.details)) {
        if (value !== undefined && value !== null) {
          const valueStr = typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value);
          logLine += `${key}: ${valueStr}\n`;
        }
      }
    }

    logLine += '---\n';
    return logLine;
  }

  /**
   * 记录日志条目
   */
  private async log(entry: LogEntry): Promise<void> {
    try {
      await this.ensureLogDir();
      const logFile = this.getCurrentLogFile();
      const logLine = this.formatLogEntry(entry);

      await fs.appendFile(logFile, logLine, 'utf-8');

      // 检查并轮转日志
      await this.rotateLogsIfNeeded();
    } catch (error) {
      console.error('[Error Logger] 无法写入日志:', error);
    }
  }

  /**
   * 记录错误
   */
  async error(category: string, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      category,
      message,
      details,
    });
  }

  /**
   * 记录警告
   */
  async warn(category: string, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      category,
      message,
      details,
    });
  }

  /**
   * 记录信息
   */
  async info(category: string, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category,
      message,
      details,
    });
  }

  /**
   * 记录批次失败详情
   */
  async logBatchFailure(params: {
    operation_type: string;
    batch_number: number;
    total_batches: number;
    items: string[];
    error: Error;
    provider?: string;
    model?: string;
    retry_count?: number;
  }): Promise<void> {
    const details: Record<string, unknown> = {
      'Operation': params.operation_type,
      'Batch': `${params.batch_number}/${params.total_batches}`,
      'Items Count': params.items.length,
      'Items': params.items.slice(0, 5).join(', ') + (params.items.length > 5 ? '...' : ''),
      'Error Type': params.error.name,
      'Error Message': params.error.message,
      'Stack': params.error.stack,
    };

    if (params.provider) {
      details['Provider'] = params.provider;
    }

    if (params.model) {
      details['Model'] = params.model;
    }

    if (params.retry_count !== undefined) {
      details['Retry Count'] = params.retry_count;
    }

    // 如果错误有 status 属性（HTTP 错误）
    if ('status' in params.error) {
      details['HTTP Status'] = (params.error as any).status;
    }

    await this.error('Batch Processing Failed', `${params.operation_type} batch ${params.batch_number} failed`, details);
  }

  /**
   * 轮转日志文件
   * 删除超过保留期限的旧日志
   */
  private async rotateLogsIfNeeded(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(f => f.startsWith('error-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
        }));

      // 按文件名排序（日期降序）
      logFiles.sort((a, b) => b.name.localeCompare(a.name));

      // 删除超过保留数量的日志
      if (logFiles.length > this.maxLogFiles) {
        const filesToDelete = logFiles.slice(this.maxLogFiles);
        for (const file of filesToDelete) {
          try {
            await fs.unlink(file.path);
            console.log(`[Error Logger] 删除旧日志: ${file.name}`);
          } catch (error) {
            // 忽略删除错误
          }
        }
      }

      // 检查当前日志文件大小
      const currentLogFile = this.getCurrentLogFile();
      try {
        const stats = await fs.stat(currentLogFile);
        if (stats.size > this.maxLogSizeBytes) {
          // 如果日志文件过大，重命名为带时间戳的文件
          const timestamp = new Date().toISOString().replace(/:/g, '-');
          const archivedName = currentLogFile.replace('.log', `-${timestamp}.log`);
          await fs.rename(currentLogFile, archivedName);
          console.log(`[Error Logger] 归档日志: ${path.basename(archivedName)}`);
        }
      } catch (error) {
        // 文件不存在或无法访问，忽略
      }
    } catch (error) {
      console.error('[Error Logger] 日志轮转失败:', error);
    }
  }

  /**
   * 清理所有日志文件
   */
  async clearAllLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter(f => f.startsWith('error-') && f.endsWith('.log'));

      for (const file of logFiles) {
        await fs.unlink(path.join(this.logDir, file));
      }

      console.log('[Error Logger] 已清理所有日志文件');
    } catch (error) {
      console.error('[Error Logger] 清理日志失败:', error);
    }
  }

  /**
   * 获取日志目录路径
   */
  getLogDir(): string {
    return this.logDir;
  }
}
