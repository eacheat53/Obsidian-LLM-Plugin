/**
 * SQLite 数据库实体类型定义
 */

import { NoteId } from './index';

// 对应 notes 表
export interface NoteEntity {
  note_id: NoteId;
  file_path: string;
  file_hash: string;
  created_at: number;
  modified_at: number;
  content_length: number;
  title: string;
  tags: string[]; // DB存JSON字符串，读取转Array
  frontmatter_hash?: string;
  embedding_updated_at?: number;
}

// 对应 embeddings 表
export interface EmbeddingEntity {
  note_id: NoteId;
  embedding_data: Float32Array; // DB存BLOB
  embedding_model: string;
  created_at: number;
}

// 对应 pair_scores 表
export interface PairScoreEntity {
  note_id_1: NoteId;
  note_id_2: NoteId;
  similarity_score: number;
  ai_score: number;
  ai_score_model?: string;
  ai_score_reason?: string;
  updated_at: number;
}

// 对应 failure_log 表
export interface FailureLogEntity {
  id: string;
  timestamp: number;
  operation_type: string;
  batch_info: string;
  error_message: string;
  resolved: number; // 0 or 1
}

// 对应 link_ledger 表
export interface LinkLedgerEntity {
  note_id: NoteId;
  target_note_id: NoteId;
  inserted_at: number;
}

// 失败操作的类型
export type FailedOperationType = 'embedding' | 'scoring' | 'tagging';

/**
 * 失败操作记录
 */
export interface FailedOperation {
  /** 唯一标识符 (timestamp + random) */
  id: string;

  /** 失败时间戳 */
  timestamp: number;

  /** 操作类型 */
  operation_type: FailedOperationType;

  /** 批次信息 */
  batch_info: {
    /** 批次编号 (从 1 开始) */
    batch_number: number;

    /** 总批次数 */
    total_batches: number;

    /** 批次中的项目 (note_ids 或 pair_keys) */
    items: string[];

    /** 人类可读的显示名称（文件路径），用于日志查看 */
    display_items?: string[];
  };

  /** 错误信息 */
  error: {
    /** 错误消息 */
    message: string;

    /** 错误类型 (ConfigurationError, TransientError, etc.) */
    type: string;

    /** 错误堆栈 (可选) */
    stack?: string;

    /** HTTP 状态码 (如果适用) */
    status?: number;
  };

  /** 已重试次数 */
  retry_count: number;

  /** 最后一次重试时间 (可选) */
  last_retry_at?: number;

  /** 是否已解决 */
  resolved: boolean;
}

/**
 * 失败日志文件结构
 */
export interface FailureLog {
  /** 日志版本 */
  version: string;

  /** 日志创建时间 */
  created_at: number;

  /** 最后更新时间 */
  last_updated: number;

  /** 失败操作列表 */
  operations: FailedOperation[];
}
