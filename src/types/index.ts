/**
 * Obsidian AI Linker 插件的核心类型定义
 */

/**
 * 笔记的唯一标识符（UUID v4 格式）
 */
export type NoteId = string;

/**
 * SHA-256 hash，小写十六进制格式
 */
export type ContentHash = string;

/**
 * Unix 时间戳（毫秒）
 */
export type UnixTimestamp = number;

/**
 * 余弦相似度分数（0.0 到 1.0）
 */
export type SimilarityScore = number;

/**
 * AI 相关性分数（0 到 10）
 */
export type AIScore = number;

/**
 * 链接台账：记录每个笔记由插件插入过的目标 note_id 列表
 */
export type LinkLedger = Record<NoteId, NoteId[]>;

/**
 * 存储在缓存中的单个笔记的元数据
 */
export interface NoteMetadata {
  /** 此笔记的唯一标识符 */
  note_id: NoteId;

  /** 从 vault 根目录的相对路径（例如，“folder/note.md”） */
  file_path: string;

  /** 主要内容的 SHA-256 hash（在 HASH_BOUNDARY 标记之前） */
  content_hash: ContentHash;

  /** 此笔记上次处理的时间（Unix 时间戳，毫秒） */
  last_processed: UnixTimestamp;

  /** AI 生成的标签与用户标签合并 */
  tags: string[];

  /** AI 上次生成标签的时间（Unix 时间戳，毫秒） */
  tags_generated_at?: UnixTimestamp;

  /** 笔记是否具有有效的 YAML front-matter */
  has_frontmatter: boolean;

  /** 笔记是否包含 <!-- HASH_BOUNDARY --> 标记 */
  has_hash_boundary: boolean;

  /** 笔记是否具有 <!-- LINKS_START/END --> 块 */
  has_links_section: boolean;
}

/**
 * 一对笔记的相似度和 AI 分数
 */
export interface NotePairScore {
  /** 第一个笔记的 UUID（字典序较小） */
  note_id_1: NoteId;

  /** 第二个笔记的 UUID（字典序较大） */
  note_id_2: NoteId;

  /** 余弦相似度分数（0.0 到 1.0） */
  similarity_score: SimilarityScore;

  /** LLM 相关性分数（0 到 10） */
  ai_score: AIScore;

  /** 执行 AI 评分的时间（Unix 时间戳，毫秒） */
  last_scored: UnixTimestamp;
}

/**
 * 笔记的向量嵌入
 */
export interface EmbeddingVector {
  /** 与 MasterIndex 匹配的笔记标识符 */
  note_id: NoteId;

  /** 向量嵌入（通常为 768 或 1024 个浮点数） */
  embedding: number[];

  /** 使用的 Jina 模型（例如，'jina-embeddings-v2-base-en'） */
  model_name: string;

  /** 生成嵌入的时间（Unix 时间戳，毫秒） */
  created_at: UnixTimestamp;

  /** 用于调试的前 200 个字符的内容预览 */
  content_preview: string;
}

/**
 * 笔记处理生命周期状态
 */
export enum NoteProcessingState {
  /** 已发现但尚未处理的笔记 */
  DISCOVERED = 'discovered',

  /** 已计算 UUID 和 hash */
  INDEXED = 'indexed',

  /** 已生成嵌入 */
  EMBEDDED = 'embedded',

  /** 已计算相似度分数 */
  SCORED = 'scored',

  /** 已插入链接 */
  LINKED = 'linked',

  /** 处理失败 */
  FAILED = 'failed'
}

/**
 * 任务执行状态
 */
export enum TaskStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  CANCELLING = 'cancelling',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * 后台任务信息
 */
export interface TaskInfo {
  /** 唯一的任务标识符 */
  task_id: string;

  /** 用于显示的任务名称 */
  task_name: string;

  /** 当前状态 */
  status: TaskStatus;

  /** 进度百分比（0-100） */
  progress: number;

  /** 当前步骤描述 */
  current_step: string;

  /** 任务开始时间 */
  started_at: UnixTimestamp;

  /** 任务完成/失败时间 */
  completed_at?: UnixTimestamp;

  /** 如果失败，则为错误消息 */
  error_message?: string;
}
