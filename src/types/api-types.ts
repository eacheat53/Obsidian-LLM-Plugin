/**
 * 外部 API 请求和响应的类型定义
 */

import { NoteId, SimilarityScore, AIScore } from './index';

/**
 * 支持的 LLM 提供商
 */
export type LLMProvider = 'gemini' | 'openai' | 'anthropic' | 'custom';

/**
 * 批量操作的生成模式
 */
export type GenerationMode = 'smart' | 'force';

// ============================================================================
// Jina AI Embeddings API
// ============================================================================

/**
 * 为单个笔记生成嵌入的请求
 */
export interface JinaEmbeddingRequest {
  /** 要嵌入的文本内容（截断为 max_chars） */
  input: string;

  /** 模型名称（例如，'jina-embeddings-v2-base-en'） */
  model: string;

  /** 用于跟踪的笔记标识符 */
  note_id: NoteId;
}

/**
 * 为多个笔记（批量）生成嵌入的请求
 */
export interface JinaBatchEmbeddingRequest {
  /** 要嵌入的文本内容数组 */
  input: string[];

  /** 模型名称 */
  model: string;

  /** 用于跟踪的笔记标识符（与输入数组长度相同） */
  note_ids: NoteId[];
}

/**
 * 来自 Jina API 的单个嵌入结果
 */
export interface JinaEmbeddingResult {
  /** 嵌入向量 */
  embedding: number[];

  /** 输入数组中的索引 */
  index: number;
}

/**
 * 来自 Jina 嵌入 API 的响应
 */
export interface JinaEmbeddingResponse {
  /** 用于生成的模型 */
  model: string;

  /** 嵌入结果数组 */
  data: JinaEmbeddingResult[];

  /** 令牌使用信息 */
  usage?: {
    total_tokens: number;
    prompt_tokens: number;
  };
}

// ============================================================================
// LLM API（用于评分和标记的通用接口）
// ============================================================================

/**
 * 用于 AI 评分的单个笔记配对
 */
export interface NotePairForScoring {
  /** 第一个笔记标识符 */
  note_id_1: NoteId;

  /** 第二个笔记标识符 */
  note_id_2: NoteId;

  /** 第一个笔记的标题 */
  title_1: string;

  /** 第二个笔记的标题 */
  title_2: string;

  /** 第一个笔记的内容摘录 */
  content_1: string;

  /** 第二个笔记的内容摘录 */
  content_2: string;

  /** 余弦相似度分数（已计算） */
  similarity_score: SimilarityScore;
}

/**
 * 笔记配对的 AI 评分批量请求
 */
export interface ScoringBatchRequest {
  /** 要评分的笔记配对数组 */
  pairs: NotePairForScoring[];

  /** 自定义提示（可选，如果未提供则使用默认值） */
  prompt?: string;
}

/**
 * 来自 LLM 的单个分数结果
 */
export interface ScoreResult {
  /** 第一个笔记标识符（用于验证） */
  note_id_1: NoteId;

  /** 第二个笔记标识符（用于验证） */
  note_id_2: NoteId;

  /** AI 相关性分数（0-10） */
  score: AIScore;

  /** 来自 LLM 的可选推理 */
  reasoning?: string;
}

/**
 * 来自 LLM 评分 API 的响应
 */
export interface ScoringBatchResponse {
  /** 分数结果数组（与请求顺序相同） */
  scores: ScoreResult[];

  /** 用于评分的模型 */
  model: string;

  /** 令牌使用信息 */
  usage?: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/**
 * 用于 AI 标签生成的单个笔记
 */
export interface NoteForTagging {
  /** 笔记标识符 */
  note_id: NoteId;

  /** 笔记标题 */
  title: string;

  /** 完整的笔记内容（如果太长则为摘录） */
  content: string;

  /** 现有标签（用于上下文） */
  existing_tags: string[];
}

/**
 * AI 标签生成的批量请求
 */
export interface TaggingBatchRequest {
  /** 要为其生成标签的笔记数组 */
  notes: NoteForTagging[];

  /** 自定义提示（可选，如果未提供则使用默认值） */
  prompt?: string;

  /** 每个笔记最少生成的标签数 */
  min_tags?: number;

  /** 每个笔记最多生成的标签数 */
  max_tags?: number;
}

/**
 * 来自 LLM 的单个标签生成结果
 */
export interface TagResult {
  /** 笔记标识符（用于验证） */
  note_id: NoteId;

  /** 生成的标签 */
  tags: string[];

  /** 来自 LLM 的可选推理 */
  reasoning?: string;
}

/**
 * 来自 LLM 标记 API 的响应
 */
export interface TaggingBatchResponse {
  /** 标签结果数组（与请求顺序相同） */
  results: TagResult[];

  /** 用于标记的模型 */
  model: string;

  /** 令牌使用信息 */
  usage?: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

// ============================================================================
// LLM 提供商适配器接口
// ============================================================================

/**
 * LLM 提供商适配器的通用接口
 */
export interface LLMAdapter {
  /**
   * 对一批笔记配对进行相关性评分
   */
  scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse>;

  /**
   * 为一批笔记生成标签
   */
  generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse>;
}

// ============================================================================
// 错误响应类型
// ============================================================================

/**
 * API 错误响应结构
 */
export interface APIErrorResponse {
  /** HTTP 状态代码 */
  status: number;

  /** 错误消息 */
  message: string;

  /** 来自 API 的错误类型/代码 */
  error_code?: string;

  /** 其他错误详细信息 */
  details?: unknown;
}
