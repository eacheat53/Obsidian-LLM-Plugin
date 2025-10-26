/**
 * 缓存数据结构的类型定义
 */

import { NoteId, NoteMetadata, NotePairScore, UnixTimestamp } from './index';

/**
 * 用于性能监控的缓存统计信息
 */
export interface CacheStatistics {
  /** 缓存中的笔记总数 */
  total_notes: number;

  /** 嵌入文件总数 */
  total_embeddings: number;

  /** 笔记配对分数总数 */
  total_scores: number;

  /** 不再存在于 vault 中但仍在缓存中的笔记 */
  orphaned_notes: number;
}

/**
 * 主索引缓存文件结构 (index.json)
 */
export interface MasterIndex {
  /** 模式版本（语义化版本） */
  version: string;

  /** 缓存上次修改的时间（Unix 时间戳，毫秒） */
  last_updated: UnixTimestamp;

  /** note_id 到 NoteMetadata 的映射 */
  notes: Record<NoteId, NoteMetadata>;

  /**
   * 复合键 'noteId1:noteId2' 到 NotePairScore 的映射
   * 注意：noteId1 在字典序上必须小于 noteId2
   */
  scores: Record<string, NotePairScore>;

  /** 聚合统计信息 */
  stats: CacheStatistics;

  /** 链接台账：记录每个笔记由插件插入过的目标 note_id 列表 */
  link_ledger?: Record<NoteId, NoteId[]>;
}

/**
 * 缓存文件路径配置
 */
export interface CachePaths {
  /** 根缓存目录 */
  cache_dir: string;

  /** 主索引文件路径 */
  index_file: string;

  /** 嵌入目录路径 */
  embeddings_dir: string;
}

/**
 * 缓存操作选项
 */
export interface CacheLoadOptions {
  /** 如果缓存不存在则创建 */
  create_if_missing?: boolean;

  /** 验证模式版本 */
  validate_schema?: boolean;

  /** 执行孤立数据检测 */
  detect_orphans?: boolean;
}

/**
 * 缓存保存操作选项
 */
export interface CacheSaveOptions {
  /** 使用原子写入（写入临时文件，然后重命名） */
  atomic?: boolean;

  /** 保存前更新统计信息 */
  update_stats?: boolean;

  /** 为调试目的美化打印 JSON */
  pretty_print?: boolean;
}

/**
 * 缓存加载操作的结果
 */
export interface CacheLoadResult {
  /** 缓存是否成功加载 */
  success: boolean;

  /** 加载的主索引（如果失败则为 undefined） */
  index?: MasterIndex;

  /** 如果失败则为错误消息 */
  error?: string;

  /** 是否创建了新缓存 */
  created_new: boolean;

  /** 已执行模式迁移 */
  migrated: boolean;
}

/**
 * 嵌入加载操作的结果
 */
export interface EmbeddingLoadResult {
  /** 嵌入是否成功加载 */
  success: boolean;

  /** 嵌入向量（如果失败则为 undefined） */
  embedding?: number[];

  /** 如果失败则为错误消息 */
  error?: string;

  /** 嵌入是从缓存加载还是需要生成 */
  from_cache: boolean;
}

/**
 * 失败操作的类型
 */
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
