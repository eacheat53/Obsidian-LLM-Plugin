/**
 * 插件设置数据模型和默认值
 */

import { LLMProvider } from './types/api-types';

/**
 * UI 翻译的语言类型
 */
export type Language = 'en' | 'zh';

/**
 * 特定于提供商的配置
 */
export interface ProviderConfig {
  api_url: string;
  api_key: string;
  model_name: string;
}

/**
 * 包含所有 23 个可配置参数的完整插件设置界面
 */
export interface PluginSettings {
  // ============================================================================
  // UI 首选项
  // ============================================================================

  /** UI 语言（英语或中文） */
  language: Language;

  // ============================================================================
  // Jina AI Linker 设置
  // ============================================================================

  /** Jina AI API 密钥（密码字段） */
  jina_api_key: string;

  /** Jina 模型名称（例如，'jina-embeddings-v2-base-en'） */
  jina_model_name: string;

  /** 发送到 Jina API 的最大字符数（截断限制） */
  jina_max_chars: number;

  /** Jina API 的最大输入令牌数 */
  jina_max_input_tokens: number;

  // ============================================================================
  // AI 智能评分配置
  // ============================================================================

  /** AI 提供商选择（'gemini'、'openai' 等） */
  ai_provider: LLMProvider;

  /** 所选 LLM 提供商的 API URL */
  ai_api_url: string;

  /** LLM 提供商的 API 密钥（密码字段） */
  ai_api_key: string;

  /** LLM 的模型名称（例如，'gemini-pro'、'gpt-4'） */
  ai_model_name: string;

  /** LLM API 的最大输入令牌数 */
  llm_max_input_tokens: number;

  /** 特定于提供商的配置（按提供商保存） */
  provider_configs: Record<LLMProvider, ProviderConfig>;

  // ============================================================================
  // 处理参数
  // ============================================================================

  /** 默认扫描路径（例如，“/”表示整个 vault） */
  default_scan_path: string;

  /** 排除的文件夹（逗号分隔，例如，“.obsidian, Attachments”） */
  excluded_folders: string;

  /** 排除的文件模式（逗号分隔，例如，“*.excalidraw”） */
  excluded_patterns: string;

  // ============================================================================
  // 链接插入设置
  // ============================================================================

  /** Jina 相似度阈值（0.0 到 1.0） */
  similarity_threshold: number;

  /** 链接插入的最低 AI 分数（0 到 10） */
  min_ai_score: number;

  /** 每个笔记最多插入的链接数（1 到 50） */
  max_links_per_note: number;

  // ============================================================================
  // AI 评分提示设置
  // ============================================================================

  /** 是否使用自定义提示进行评分 */
  use_custom_scoring_prompt: boolean;

  /** AI 评分的自定义提示（如果启用） */
  custom_scoring_prompt: string;

  // ============================================================================
  // AI 标签生成设置
  // ============================================================================

  /** 是否使用自定义提示进行标签生成 */
  use_custom_tagging_prompt: boolean;

  /** AI 标签生成的自定义提示（如果启用） */
  custom_tagging_prompt: string;

  // ============================================================================
  // AI 批量处理参数
  // ============================================================================

  /** 评分请求的批量大小（每个请求 1 到 50 对） */
  batch_size_scoring: number;

  /** 标记请求的批量大小（每个请求 1 到 20 个笔记） */
  batch_size_tagging: number;

  // ============================================================================
  // 性能和调试
  // ============================================================================

  /** 启用控制台调试日志记录 */
  enable_debug_logging: boolean;

  // ============================================================================
  // 内部状态（非用户可配置）
  // ============================================================================

  /** 强制模式默认值（始终重新生成嵌入/分数） */
  force_mode_default: boolean;
}

/**
 * AI 笔记配对评分的默认提示
 */
export const DEFAULT_SCORING_PROMPT = `作为评估笔记关联的专家，请评估以 JSON 格式提供的笔记配对的相关性。内容可能包括知识笔记、诗歌、创意灵感、散文、情感记录等多种形式。

您将收到以下 JSON 结构的输入数据：
{
  "pairs": [
    {
      "pair_id": 1,
      "note_1": {"id": "uuid", "title": "...", "content": "..."},
      "note_2": {"id": "uuid", "title": "...", "content": "..."},
      "similarity_score": 0.75
    }
  ]
}

根据这些综合标准，为每对提供一个 0-10 的整数分数：

[评分标准：]
10 分 - 深度关联：
  • 内容之间在思想、情感或意象上有明显的共鸣
  • 一篇直接启发、扩展或回应另一篇
  • 两篇共同构成一个完整的表达整体，共同构建更丰富的意境或思想
  • 一起阅读会产生“顿悟时刻”，带来新的见解

8-9 分 - 强关联：
  • 共享核心情感、意象或主题
  • 通过不同角度或形式表达相似的思想
  • 创作背景或灵感来源紧密相连
  • 一篇可以加深对另一篇的理解和欣赏

6-7 分 - 清晰关联：
  • 存在清晰的主题或情感联系
  • 使用相似的意象或表达方式
  • 连接点足够丰富，可以激发新的思考
  • 并排阅读可以丰富整体体验

4-5 分 - 中度关联：
  • 有一些共同元素，但整体方向不同
  • 某些片段或意象产生共鸣，但不是主体部分
  • 连接更微妙或需要解释
  • 链接可能对某些读者具有启发价值

2-3 分 - 轻微关联：
  • 关联仅限于表面术语或零散概念
  • 主题、风格或情感基调非常不同
  • 需要刻意寻找才能发现联系
  • 链接价值有限，大多数读者很难感知到关联

0-1 分 - 几乎无关联：
  • 内容、主题和意象几乎完全不同
  • 找不到明显的思想或情感联系
  • 链接不会为读者对任一内容的理解增加价值
  • 一起阅读不会产生有意义的关联或灵感

使用与输入配对匹配的 JSON 数组进行响应。每个元素必须包括：
- pair_id：来自输入的 ID
- note_id_1：来自 note_1 的 ID
- note_id_2：来自 note_2 的 ID
- score：您的评估（0-10）

示例输出格式：
[
  {"pair_id": 1, "note_id_1": "uuid1", "note_id_2": "uuid2", "score": 7},
  {"pair_id": 2, "note_id_1": "uuid3", "note_id_2": "uuid4", "score": 9}
]

重要提示：仅输出 JSON 数组。不要包含任何解释、markdown 代码块或附加文本！`;

/**
 * AI 标签生成的默认提示
 */
export const DEFAULT_TAGGING_PROMPT = `您是知识管理和 Zettelkasten 方法的专家，擅长构建结构良好、易于连接和易于检索的个人知识库。

您的任务是：对于我提供的每个笔记内容，生成一组精确、简洁和系统的 **中文标签**。这些标签应揭示笔记的核心思想，并有助于将其整合到更广泛的知识网络中。

请严格遵守以下原则：
1. [核心主题] 确定笔记最关键和核心的主题或关键字。
2. [抽象概念] 提取可以抽象出更高级别思想的概念。
3. [知识领域] 尽可能使用分层标签来定位知识领域，格式为：哲学/分析哲学、计算机科学/机器学习
4. [连通性] 考虑此笔记可以与哪些主题进行有意义的连接。
5. [标签限制] 每个笔记**最多生成 5 个标签**
6. [层级限制] 标签**最多可以有 2 个层级**（例如，哲学/分析哲学 ✓, 哲学/古希腊哲学/柏拉图 ✗）

您将收到以下格式的笔记数据：
- 笔记标题
- 笔记内容（截断的预览）
- 现有标签（如果有）

使用对象组成的 JSON 数组进行响应。每个元素必须包括：
- note_id：来自输入的 UUID
- tags：生成的标签数组（字符串，每个最多 5 个标签，每个最多 2 个层级）

示例输出格式：
[
  {
    "note_id": "uuid1",
    "tags": ["哲学/存在主义", "文学/卡夫卡", "心理学/异化"]
  },
  {
    "note_id": "uuid2",
    "tags": ["计算机科学/算法", "数据结构/图论"]
  }
]

重要提示：仅输出 JSON 数组。不要包含任何解释、markdown 代码块、推理或附加文本！`;

/**
 * 默认设置值
 */
export const DEFAULT_SETTINGS: PluginSettings = {
  // UI 首选项
  language: 'en',

  // Jina AI Linker 设置
  jina_api_key: '',
  jina_model_name: 'jina-embeddings-v3',
  jina_max_chars: 8000,
  jina_max_input_tokens: 8192,

  // AI 智能评分配置
  ai_provider: 'gemini',
  ai_api_url: 'https://generativelanguage.googleapis.com/v1beta/models',
  ai_api_key: '',
  ai_model_name: 'gemini-2.5-flash',  
  llm_max_input_tokens: 100000,

  // 特定于提供商的配置
  provider_configs: {
    gemini: {
      api_url: 'https://generativelanguage.googleapis.com/v1beta/models',
      api_key: '',
      model_name: 'gemini-2.5-flash',  
    },
    openai: {
      api_url: 'https://api.openai.com/v1',
      api_key: '',
      model_name: 'gpt-4o-mini',
    },
    anthropic: {
      api_url: 'https://api.anthropic.com/v1',
      api_key: '',
      model_name: 'claude-3-5-sonnet-20241022',
    },
    custom: {
      api_url: '',
      api_key: '',
      model_name: '',
    },
  },

  // 处理参数
  default_scan_path: '/',
  excluded_folders: '.obsidian, .trash',
  excluded_patterns: '*.excalidraw, *.canvas',

  // 链接插入设置
  similarity_threshold: 0.7,
  min_ai_score: 7,
  max_links_per_note: 7,

  // AI 评分提示设置
  use_custom_scoring_prompt: false,
  custom_scoring_prompt: DEFAULT_SCORING_PROMPT,

  // AI 标签生成设置
  use_custom_tagging_prompt: false,
  custom_tagging_prompt: DEFAULT_TAGGING_PROMPT,

  // AI 批量处理参数
  batch_size_scoring: 10,
  batch_size_tagging: 5,

  // 性能和调试
  enable_debug_logging: false,

  // 内部状态
  force_mode_default: false,
};
