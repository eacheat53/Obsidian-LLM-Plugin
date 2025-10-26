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
