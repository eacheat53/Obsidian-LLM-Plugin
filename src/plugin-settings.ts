/**
 * Plugin settings data model and defaults
 */

import { LLMProvider } from './types/api-types';

/**
 * Language type for UI translations
 */
export type Language = 'en' | 'zh';

/**
 * Provider-specific configuration
 */
export interface ProviderConfig {
  api_url: string;
  api_key: string;
  model_name: string;
}

/**
 * Complete plugin settings interface with all 23 configurable parameters
 */
export interface PluginSettings {
  // ============================================================================
  // UI Preferences
  // ============================================================================

  /** UI language (English or Chinese) */
  language: Language;

  // ============================================================================
  // Jina AI Linker Settings
  // ============================================================================

  /** Jina AI API key (password field) */
  jina_api_key: string;

  /** Jina model name (e.g., 'jina-embeddings-v2-base-en') */
  jina_model_name: string;

  /** Maximum characters to send to Jina API (truncation limit) */
  jina_max_chars: number;

  /** Maximum input tokens for Jina API */
  jina_max_input_tokens: number;

  // ============================================================================
  // AI Smart Scoring Configuration
  // ============================================================================

  /** AI provider selection ('gemini', 'openai', etc.) */
  ai_provider: LLMProvider;

  /** API URL for the selected LLM provider */
  ai_api_url: string;

  /** API key for the LLM provider (password field) */
  ai_api_key: string;

  /** Model name for LLM (e.g., 'gemini-pro', 'gpt-4') */
  ai_model_name: string;

  /** Maximum input tokens for LLM API */
  llm_max_input_tokens: number;

  /** Provider-specific configurations (saved per provider) */
  provider_configs: Record<LLMProvider, ProviderConfig>;

  // ============================================================================
  // Processing Parameters
  // ============================================================================

  /** Default scan path (e.g., "/" for entire vault) */
  default_scan_path: string;

  /** Excluded folders (comma-separated, e.g., ".obsidian, Attachments") */
  excluded_folders: string;

  /** Excluded file patterns (comma-separated, e.g., "*.excalidraw") */
  excluded_patterns: string;

  // ============================================================================
  // Link Insertion Settings
  // ============================================================================

  /** Jina similarity threshold (0.0 to 1.0) */
  similarity_threshold: number;

  /** Minimum AI score for link insertion (0 to 10) */
  min_ai_score: number;

  /** Maximum links to insert per note (1 to 50) */
  max_links_per_note: number;

  // ============================================================================
  // AI Scoring Prompt Settings
  // ============================================================================

  /** Whether to use custom prompt for scoring */
  use_custom_scoring_prompt: boolean;

  /** Custom prompt for AI scoring (if enabled) */
  custom_scoring_prompt: string;

  // ============================================================================
  // AI Tag Generation Settings
  // ============================================================================

  /** Whether to use custom prompt for tag generation */
  use_custom_tagging_prompt: boolean;

  /** Custom prompt for tag generation (if enabled) */
  custom_tagging_prompt: string;

  // ============================================================================
  // AI Batch Processing Parameters
  // ============================================================================

  /** Batch size for scoring requests (1 to 50 pairs per request) */
  batch_size_scoring: number;

  /** Batch size for tagging requests (1 to 20 notes per request) */
  batch_size_tagging: number;

  // ============================================================================
  // Performance and Debugging
  // ============================================================================

  /** Enable debug logging to console */
  enable_debug_logging: boolean;

  // ============================================================================
  // Internal State (not user-configurable)
  // ============================================================================

  /** Force mode default (always regenerate embeddings/scores) */
  force_mode_default: boolean;
}

/**
 * Default prompt for AI scoring of note pairs
 */
export const DEFAULT_SCORING_PROMPT = `As an expert in evaluating note associations, please assess the relevance of note pairs provided in JSON format. The content may include diverse forms such as knowledge notes, poetry, creative inspiration, prose, emotional records, etc.

You will receive input data in this JSON structure:
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

Provide an integer score from 0-10 for each pair based on these comprehensive criteria:

[Scoring Criteria:]
10 points - Deep Association:
  • Clear resonance in thought, emotion, or imagery between the contents
  • One piece directly inspires, extends, or responds to the other
  • Both pieces form a complete expressive whole, jointly constructing a richer artistic conception or idea
  • Reading them together produces an "aha moment" bringing new insights

8-9 points - Strong Association:
  • Share core emotions, imagery, or themes
  • Express similar ideas but through different angles or forms
  • Creative context or sources of inspiration are closely connected
  • One piece can deepen understanding and appreciation of the other

6-7 points - Clear Association:
  • Clear thematic or emotional connections exist
  • Use similar imagery or expressions
  • Connection points are rich enough to spark new thinking
  • Reading them side by side enriches the overall experience

4-5 points - Moderate Association:
  • Some common elements, but overall directions differ
  • Certain fragments or imagery resonate, but not the main body
  • Connection is more subtle or requires interpretation
  • Link may have inspirational value for some readers

2-3 points - Slight Association:
  • Association limited to surface terminology or scattered concepts
  • Themes, styles, or emotional tones are very different
  • Connections need to be deliberately sought to be discovered
  • Link value is limited, most readers will have difficulty perceiving the association

0-1 points - Almost No Association:
  • Content, themes, and imagery are almost completely different
  • Cannot find obvious thought or emotional connections
  • Link will not add value to reader's understanding of either content
  • Reading them together does not produce meaningful associations or inspiration

Respond with a JSON array matching the input pairs. Each element must include:
- pair_id: the ID from input
- note_id_1: the ID from note_1
- note_id_2: the ID from note_2
- score: your assessment (0-10)

Example output format:
[
  {"pair_id": 1, "note_id_1": "uuid1", "note_id_2": "uuid2", "score": 7},
  {"pair_id": 2, "note_id_1": "uuid3", "note_id_2": "uuid4", "score": 9}
]

IMPORTANT: Output ONLY the JSON array. Do not include any explanations, markdown code blocks, or additional text!`;

/**
 * Default prompt for AI tag generation
 */
export const DEFAULT_TAGGING_PROMPT = `You are an expert in knowledge management and the Zettelkasten method, skilled at building personal knowledge bases that are well-structured, easy to connect, and easy to retrieve.

Your task is: For each note content I provide, generate a set of precise, concise, and systematic **Chinese tags**. These tags should reveal the core ideas of the note and help integrate it into a broader knowledge network.

Please strictly follow these principles:
1. [Core Theme] Identify the most critical and core theme or keywords of the note.
2. [Abstract Concepts] Extract concepts that can abstract higher-level thoughts.
3. [Knowledge Domain] Use hierarchical tags to locate knowledge domains when possible, in the format: 哲学/分析哲学、计算机科学/机器学习
4. [Connectivity] Consider which topics this note can meaningfully connect with.
5. [Tag Limits] Generate **at most 5 tags** per note
6. [Hierarchy Limit] Tags can have **at most 2 levels** (e.g., 哲学/分析哲学 ✓, 哲学/古希腊哲学/柏拉图 ✗)

You will receive note data in this format:
- Note title
- Note content (truncated preview)
- Existing tags (if any)

Respond with a JSON array of objects. Each element must include:
- note_id: the UUID from input
- tags: array of generated tags (strings, max 5 tags, max 2 levels each)

Example output format:
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

IMPORTANT: Output ONLY the JSON array. Do not include any explanations, markdown code blocks, reasoning, or additional text!`;

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: PluginSettings = {
  // UI Preferences
  language: 'en',

  // Jina AI Linker Settings
  jina_api_key: '',
  jina_model_name: 'jina-embeddings-v3',
  jina_max_chars: 8000,
  jina_max_input_tokens: 8192,

  // AI Smart Scoring Configuration
  ai_provider: 'gemini',
  ai_api_url: 'https://generativelanguage.googleapis.com/v1beta/models',
  ai_api_key: '',
  ai_model_name: 'gemini-2.5-flash',  // Using 2.5 with thinkingBudget to limit thinking tokens
  llm_max_input_tokens: 100000,

  // Provider-specific configurations
  provider_configs: {
    gemini: {
      api_url: 'https://generativelanguage.googleapis.com/v1beta/models',
      api_key: '',
      model_name: 'gemini-2.5-flash',  // Using 2.5 with thinkingBudget to limit thinking tokens
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

  // Processing Parameters
  default_scan_path: '/',
  excluded_folders: '.obsidian, .trash',
  excluded_patterns: '*.excalidraw, *.canvas',

  // Link Insertion Settings
  similarity_threshold: 0.7,
  min_ai_score: 7,
  max_links_per_note: 7,

  // AI Scoring Prompt Settings
  use_custom_scoring_prompt: false,
  custom_scoring_prompt: DEFAULT_SCORING_PROMPT,

  // AI Tag Generation Settings
  use_custom_tagging_prompt: false,
  custom_tagging_prompt: DEFAULT_TAGGING_PROMPT,

  // AI Batch Processing Parameters
  batch_size_scoring: 10,
  batch_size_tagging: 5,

  // Performance and Debugging
  enable_debug_logging: false,

  // Internal State
  force_mode_default: false,
};
