/**
 * UI 的 i18n 翻译
 * 支持英文和中文
 */

import { Language } from '../plugin-settings';

export interface Translation {
  sections: {
    main: string;
    jina: string;
    ai: string;
    processing: string;
    link: string;
    scoringPrompt: string;
    taggingPrompt: string;
    batch: string;
    performance: string;
  };
  sidebar: {
    ribbonTitle: string;
    processNotes: string;
    batchTags: string;
    generateUuid: string;
    viewFailures: string;
    syncHash: string;
  };
  settings: {
    language: { name: string; desc: string };
    jinaApiKey: { name: string; desc: string };
    jinaModelName: { name: string; desc: string };
    jinaMaxChars: { name: string; desc: string };
    jinaMaxInputTokens: { name: string; desc: string };
    aiProvider: { name: string; desc: string };
    aiApiUrl: { name: string; desc: string };
    aiApiKey: { name: string; desc: string };
    aiModelName: { name: string; desc: string };
    llmMaxInputTokens: { name: string; desc: string };
    defaultScanPath: { name: string; desc: string };
    excludedFolders: { name: string; desc: string };
    excludedPatterns: { name: string; desc: string };
    similarityThreshold: { name: string; desc: string };
    minAiScore: { name: string; desc: string };
    maxLinksPerNote: { name: string; desc: string };
    recalibrateLinks: { name: string; desc: string };
    useCustomScoringPrompt: { name: string; desc: string };
    customScoringPrompt: { name: string; desc: string };
    restoreScoringPrompt: { name: string; desc: string };
    useCustomTaggingPrompt: { name: string; desc: string };
    customTaggingPrompt: { name: string; desc: string };
    restoreTaggingPrompt: { name: string; desc: string };
    batchSizeScoring: { name: string; desc: string };
    batchSizeTagging: { name: string; desc: string };
    llmScoringMaxChars: { name: string; desc: string };
    llmTaggingMaxChars: { name: string; desc: string };
    enableDebugLogging: { name: string; desc: string };
    clearCache: { name: string; desc: string };
    showStatistics: { name: string; desc: string };
    cancelOperation: { name: string; desc: string };
    restoreDefaults: { name: string; desc: string };
    viewLogs: { name: string; desc: string };
  };
  buttons: {
    restoreDefault: string;
    clearCache: string;
    showStatistics: string;
    cancelOperation: string;
    restoreDefaults: string;
    viewLogs: string;
    confirmClearCache: string;
    recalibrate: string;
    recalibrating: string;
  };
  notices: {
    cacheClearSuccess: string;
    cacheClearFailed: string;
    cacheClearCancelled: string;
    statisticsShown: string;
    statisticsFailed: string;
    cancelSuccess: string;
    cancelFailed: string;
    restoreDefaultsSuccess: string;
    restoreDefaultsFailed: string;
    viewLogsFailed: string;
    similarityTooLow: string;
    recalibrateFailed: string;

    // 运行时提示
    starting: string;
    scanning: string;
    embeddingDone: string;
    scoringPairs: string;
    linkCalibrated: string;
    taggingDone: string;
    finished: string;

    // 进度提示（带百分比/进度条）
    progressEmbedding: string; // e.g. Embedding {percent} {bar}
    progressScoring: string;   // e.g. Scoring {percent} {bar}
    progressTagging: string;   // e.g. Tagging {percent} {bar}

    // 失败批次提示
    batchFailures: string;      // e.g. {count} batches failed
    failuresRecorded: string;   // 失败已记录到日志
  };
  dialogs: {
    clearCacheTitle: string;
    clearCacheMessage: string;
    clearCacheConfirmPlaceholder: string;
  };
  placeholders: {
    jinaApiKey: string;
    jinaModelName: string;
    aiApiUrl: string;
    aiApiKey: string;
    aiModelName: string;
    defaultScanPath: string;
    excludedFolders: string;
    excludedPatterns: string;
  };
  providers: {
    gemini: string;
    openai: string;
    anthropic: string;
    ollama: string;
    custom: string;
  };
  languages: {
    en: string;
    zh: string;
  };
}

export const translations: Record<Language, Translation> = {
  en: {
    sections: {
      main: 'Obsidian LLM Plugin Settings',
      jina: 'Jina AI Linker Settings',
      ai: 'AI Smart Scoring Configuration',
      processing: 'Processing Parameters',
      link: 'Link Insertion Settings',
      scoringPrompt: 'AI Scoring Prompt Settings',
      taggingPrompt: 'AI Tag Generation Settings',
      batch: 'AI Batch Processing Parameters',
      performance: 'Performance and Debugging',
    },
    sidebar: {
      ribbonTitle: 'Obsidian LLM Plugin',
      processNotes: 'Process Notes and Insert Suggested Links',
      batchTags: 'Batch Insert AI Tags',
      generateUuid: 'Generate Unique ID for Current Note',
      viewFailures: 'View Failed Operations',
      syncHash: 'Sync Content Hash (No Re-embedding)',
    },
    settings: {
      language: {
        name: 'Language',
        desc: 'UI language preference (English or Chinese)',
      },
      jinaApiKey: {
        name: 'Jina API Key',
        desc: 'Your Jina AI API key (get it from https://jina.ai/)',
      },
      jinaModelName: {
        name: 'Jina Model Name',
        desc: 'Jina embeddings model to use (e.g., jina-embeddings-v3)',
      },
      jinaMaxChars: {
        name: 'Jina Embedding Max Characters',
        desc: 'Maximum characters to send to Jina API (truncation limit)',
      },
      jinaMaxInputTokens: {
        name: 'Jina Max Input Tokens',
        desc: 'Maximum input tokens for Jina API (default: 8192)',
      },
      aiProvider: {
        name: 'AI Provider',
        desc: 'LLM provider for scoring and tag generation',
      },
      aiApiUrl: {
        name: 'API URL',
        desc: 'Base URL for the LLM API endpoint',
      },
      aiApiKey: {
        name: 'API Key',
        desc: 'Your LLM provider API key',
      },
      aiModelName: {
        name: 'Model Name',
        desc: 'LLM model to use (e.g., gemini-pro, gpt-4)',
      },
      llmMaxInputTokens: {
        name: 'LLM Max Input Tokens',
        desc: 'Maximum input tokens for LLM API (default: 100000)',
      },
      defaultScanPath: {
        name: 'Default Scan Path',
        desc: 'Path to scan for notes ("/" for entire vault)',
      },
      excludedFolders: {
        name: 'Excluded Folders',
        desc: 'Comma-separated list of folders to exclude (e.g., ".obsidian, .trash, Attachments")',
      },
      excludedPatterns: {
        name: 'Excluded File Patterns',
        desc: 'Comma-separated list of file patterns to exclude (e.g., "*.excalidraw, *.canvas")',
      },
      similarityThreshold: {
        name: 'Jina Similarity Threshold',
        desc: 'Minimum cosine similarity for note pairs (minimum recommended: 0.7). Lower values significantly increase API costs by generating more candidate pairs for LLM scoring.',
      },
      minAiScore: {
        name: 'Minimum AI Score for Link Insertion',
        desc: 'Minimum LLM relevance score for inserting a link (0 to 10)',
      },
      maxLinksPerNote: {
        name: 'Maximum Links per Note',
        desc: 'Maximum number of suggested links to insert in each note (1 to 50)',
      },
      recalibrateLinks: {
        name: 'Recalibrate Links',
        desc: 'After modifying the thresholds above, click this button to apply the new configuration to all notes. Will not regenerate embeddings or re-score, only re-insert/remove links based on new thresholds.',
      },
      useCustomScoringPrompt: {
        name: 'Use Custom Prompt',
        desc: 'Enable to use your own custom prompt for AI scoring',
      },
      customScoringPrompt: {
        name: 'Custom Prompt',
        desc: 'Your custom prompt for AI scoring',
      },
      restoreScoringPrompt: {
        name: 'Restore Default Prompt',
        desc: 'Reset to the default AI scoring prompt',
      },
      useCustomTaggingPrompt: {
        name: 'Use Custom Tag Prompt',
        desc: 'Enable to use your own custom prompt for AI tag generation',
      },
      customTaggingPrompt: {
        name: 'Custom Tag Prompt',
        desc: 'Your custom prompt for AI tag generation',
      },
      restoreTaggingPrompt: {
        name: 'Restore Default Tag Prompt',
        desc: 'Reset to the default AI tag generation prompt',
      },
      batchSizeScoring: {
        name: 'Batch Size for Scoring',
        desc: 'Number of note pairs to score per AI request (1 to 50)',
      },
      batchSizeTagging: {
        name: 'Batch Size for Tagging',
        desc: 'Number of notes to tag per AI request (1 to 50)',
      },
      llmScoringMaxChars: {
        name: 'Max Characters for Scoring',
        desc: 'Maximum number of characters per note content sent to LLM for scoring (500 to 5000)',
      },
      llmTaggingMaxChars: {
        name: 'Max Characters for Tagging',
        desc: 'Maximum number of characters per note content sent to LLM for tag generation (500 to 5000)',
      },
      enableDebugLogging: {
        name: 'Enable Debug Logging',
        desc: 'Log detailed debug information to the developer console',
      },
      clearCache: {
        name: 'Clear Cache',
        desc: 'Delete all cached embeddings, scores, and index data',
      },
      showStatistics: {
        name: 'Show Statistics',
        desc: 'Print cache statistics to the developer console',
      },
      cancelOperation: {
        name: 'Cancel Current Operation',
        desc: 'Stop any currently running background task',
      },
      restoreDefaults: {
        name: 'Restore Default Settings',
        desc: 'Reset all settings to their default values (API keys will be preserved)',
      },
      viewLogs: {
        name: 'View Error Logs',
        desc: 'Open the folder containing error log files for debugging',
      },
    },
    buttons: {
      restoreDefault: 'Restore Default',
      clearCache: 'Clear Cache',
      showStatistics: 'Show Statistics',
      cancelOperation: 'Cancel Operation',
      restoreDefaults: 'Restore All Defaults',
      viewLogs: 'View Logs',
      confirmClearCache: 'Confirm',
      recalibrate: 'Recalibrate Now',
      recalibrating: 'Recalibrating...',
    },
    notices: {
      cacheClearSuccess: '✅ Cache cleared successfully',
      cacheClearFailed: '❌ Failed to clear cache',
      cacheClearCancelled: 'Cache clear operation cancelled',
      statisticsShown: '✅ Statistics printed to console (Ctrl+Shift+I)',
      statisticsFailed: '❌ Failed to show statistics',
      cancelSuccess: '✅ Cancellation requested',
      cancelFailed: '❌ Failed to cancel operation',
      restoreDefaultsSuccess: '✅ All settings restored to defaults',
      restoreDefaultsFailed: '❌ Failed to restore defaults',
      viewLogsFailed: '❌ Failed to open log folder',
      similarityTooLow: '⚠️ Values below 0.7 are not recommended: will significantly increase the number of pairs to score, wasting API tokens',
      recalibrateFailed: '❌ Link recalibration failed. Please check console for error details.',

      // Runtime notices
      starting: 'Starting process...',
      scanning: 'Scanning vault for notes...',
      embeddingDone: 'Embeddings generated',
      scoringPairs: 'Scoring note pairs...',
      linkCalibrated: 'Links inserted',
      taggingDone: 'Tags generated',
      finished: 'Process completed',

      // Progress notices (with percent/bar)
      progressEmbedding: 'Embedding {percent} {bar}',
      progressScoring: 'Scoring {percent} {bar}',
      progressTagging: 'Tagging {percent} {bar}',

      // Batch failures
      batchFailures: '⚠️ {count} batches failed',
      failuresRecorded: 'Failures have been logged. Click "View Failed Operations" to retry.',
    },
    dialogs: {
      clearCacheTitle: 'Clear Cache Confirmation',
      clearCacheMessage: 'This will delete all cached embeddings, scores, and index data. This action cannot be undone.\n\nTo confirm, please type "Clear Cache" below:',
      clearCacheConfirmPlaceholder: 'Type "Clear Cache" to confirm',
    },
    placeholders: {
      jinaApiKey: 'Enter your API key',
      jinaModelName: 'jina-embeddings-v3',
      aiApiUrl: 'https://api.example.com/v1',
      aiApiKey: 'Enter your API key',
      aiModelName: 'gemini-pro',
      defaultScanPath: '/',
      excludedFolders: '.obsidian, .trash',
      excludedPatterns: '*.excalidraw, *.canvas',
    },
    providers: {
      gemini: 'Google Gemini',
      openai: 'OpenAI',
      anthropic: 'Anthropic Claude',
      ollama: 'Ollama (Local)',
      custom: 'Custom Provider',
    },
    languages: {
      en: 'English',
      zh: '中文',
    },
  },
  zh: {
    sections: {
      main: 'Obsidian LLM 插件设置',
      jina: 'Jina AI 链接器设置',
      ai: 'AI 智能评分配置',
      processing: '处理参数',
      link: '链接插入设置',
      scoringPrompt: 'AI 评分提示词设置',
      taggingPrompt: 'AI 标签生成设置',
      batch: 'AI 批处理参数',
      performance: '性能和调试',
    },
    sidebar: {
      ribbonTitle: 'Obsidian LLM 插件',
      processNotes: '处理笔记并插入建议链接',
      batchTags: '批量插入 AI 标签',
      generateUuid: '为当前笔记生成唯一 ID',
      viewFailures: '查看失败的操作',
      syncHash: '同步内容 Hash（不重新生成 Embedding）',
    },
    settings: {
      language: {
        name: '语言',
        desc: 'UI 语言偏好（英文或中文）',
      },
      jinaApiKey: {
        name: 'Jina API 密钥',
        desc: '您的 Jina AI API 密钥（从 https://jina.ai/ 获取）',
      },
      jinaModelName: {
        name: 'Jina 模型名称',
        desc: '要使用的 Jina 嵌入模型（例如：jina-embeddings-v3）',
      },
      jinaMaxChars: {
        name: 'Jina 嵌入最大字符数',
        desc: '发送到 Jina API 的最大字符数（截断限制）',
      },
      jinaMaxInputTokens: {
        name: 'Jina 最大输入令牌数',
        desc: 'Jina API 的最大输入令牌数（默认：8192）',
      },
      aiProvider: {
        name: 'AI 提供商',
        desc: '用于评分和标签生成的 LLM 提供商',
      },
      aiApiUrl: {
        name: 'API URL',
        desc: 'LLM API 端点的基础 URL',
      },
      aiApiKey: {
        name: 'API 密钥',
        desc: '您的 LLM 提供商 API 密钥',
      },
      aiModelName: {
        name: '模型名称',
        desc: '要使用的 LLM 模型（例如：gemini-pro、gpt-4）',
      },
      llmMaxInputTokens: {
        name: 'LLM 最大输入令牌数',
        desc: 'LLM API 的最大输入令牌数（默认：100000）',
      },
      defaultScanPath: {
        name: '默认扫描路径',
        desc: '要扫描笔记的路径（"/" 表示整个仓库）',
      },
      excludedFolders: {
        name: '排除的文件夹',
        desc: '要排除的文件夹列表，用逗号分隔（例如：".obsidian, .trash, Attachments"）',
      },
      excludedPatterns: {
        name: '排除的文件模式',
        desc: '要排除的文件模式列表，用逗号分隔（例如："*.excalidraw, *.canvas"）',
      },
      similarityThreshold: {
        name: 'Jina 相似度阈值',
        desc: '笔记对的最低余弦相似度（最低建议值：0.7）。更低的值会显著增加需要 LLM 评分的候选配对数量，大幅增加 API 成本。',
      },
      minAiScore: {
        name: '链接插入的最小 AI 分数',
        desc: '插入链接的最小 LLM 相关性分数（0 到 10）',
      },
      maxLinksPerNote: {
        name: '每篇笔记的最大链接数',
        desc: '每篇笔记中插入的建议链接的最大数量（1 到 50）',
      },
      recalibrateLinks: {
        name: '重新校准链接',
        desc: '修改上述阈值后，点击此按钮应用新配置到所有笔记。不会重新生成 embedding 或重新评分，只会根据新阈值重新插入/删除链接。',
      },
      useCustomScoringPrompt: {
        name: '使用自定义提示词',
        desc: '启用以使用您自己的 AI 评分自定义提示词',
      },
      customScoringPrompt: {
        name: '自定义提示词',
        desc: '您的 AI 评分自定义提示词',
      },
      restoreScoringPrompt: {
        name: '恢复默认提示词',
        desc: '重置为默认的 AI 评分提示词',
      },
      useCustomTaggingPrompt: {
        name: '使用自定义标签提示词',
        desc: '启用以使用您自己的 AI 标签生成自定义提示词',
      },
      customTaggingPrompt: {
        name: '自定义标签提示词',
        desc: '您的 AI 标签生成自定义提示词',
      },
      restoreTaggingPrompt: {
        name: '恢复默认标签提示词',
        desc: '重置为默认的 AI 标签生成提示词',
      },
      batchSizeScoring: {
        name: '评分批处理大小',
        desc: '每次 AI 请求评分的笔记对数量（1 到 50）',
      },
      batchSizeTagging: {
        name: '标签批处理大小',
        desc: '每次 AI 请求标记的笔记数量（1 到 50）',
      },
      llmScoringMaxChars: {
        name: '评分最大字符数',
        desc: '发送给 LLM 进行评分的每个笔记内容的最大字符数（500 到 5000）',
      },
      llmTaggingMaxChars: {
        name: '标签生成最大字符数',
        desc: '发送给 LLM 生成标签的每个笔记内容的最大字符数（500 到 5000）',
      },
      enableDebugLogging: {
        name: '启用调试日志',
        desc: '将详细的调试信息记录到开发者控制台',
      },
      clearCache: {
        name: '清除缓存',
        desc: '删除所有缓存的嵌入、分数和索引数据',
      },
      showStatistics: {
        name: '显示统计信息',
        desc: '将缓存统计信息打印到开发者控制台',
      },
      cancelOperation: {
        name: '取消当前操作',
        desc: '停止任何当前正在运行的后台任务',
      },
      restoreDefaults: {
        name: '恢复默认设置',
        desc: '将所有设置重置为默认值（API 密钥将被保留）',
      },
      viewLogs: {
        name: '查看错误日志',
        desc: '打开包含错误日志文件的文件夹以进行调试',
      },
    },
    buttons: {
      restoreDefault: '恢复默认',
      clearCache: '清除缓存',
      showStatistics: '显示统计信息',
      cancelOperation: '取消操作',
      restoreDefaults: '恢复所有默认设置',
      viewLogs: '查看日志',
      confirmClearCache: '确认',
      recalibrate: '立即校准',
      recalibrating: '校准中...',
    },
    notices: {
      cacheClearSuccess: '✅ 缓存清除成功',
      cacheClearFailed: '❌ 清除缓存失败',
      cacheClearCancelled: '缓存清除操作已取消',
      statisticsShown: '✅ 统计信息已打印到控制台 (Ctrl+Shift+I)',
      statisticsFailed: '❌ 显示统计信息失败',
      cancelSuccess: '✅ 已请求取消',
      cancelFailed: '❌ 取消操作失败',
      restoreDefaultsSuccess: '✅ 所有设置已恢复为默认值',
      restoreDefaultsFailed: '❌ 恢复默认设置失败',
      viewLogsFailed: '❌ 打开日志文件夹失败',
      similarityTooLow: '⚠️ 不建议低于 0.7：会大幅增加需要评分的配对数量，浪费 API token',
      recalibrateFailed: '❌ 链接校准失败，请查看控制台错误信息',

      // 运行时提示
      starting: '开始处理...',
      scanning: '正在扫描库中的笔记...',
      embeddingDone: '嵌入已生成',
      scoringPairs: '正在评分笔记对...',
      linkCalibrated: '链接已插入',
      taggingDone: '标签已生成',
      finished: '处理完成',

      // 进度提示（带百分比/进度条）
      progressEmbedding: '嵌入 {percent} {bar}',
      progressScoring: '评分 {percent} {bar}',
      progressTagging: '标签 {percent} {bar}',

      // 失败批次提示
      batchFailures: '⚠️ {count} 个批次失败',
      failuresRecorded: '失败已记录到日志。点击"查看失败的操作"可重试。',
    },
    dialogs: {
      clearCacheTitle: '清除缓存确认',
      clearCacheMessage: '这将删除所有缓存的嵌入、分数和索引数据。此操作无法撤消。\n\n为确认操作，请在下方输入"清除缓存"：',
      clearCacheConfirmPlaceholder: '输入"清除缓存"以确认',
    },
    placeholders: {
      jinaApiKey: '请输入您的 API 密钥',
      jinaModelName: 'jina-embeddings-v3',
      aiApiUrl: 'https://api.example.com/v1',
      aiApiKey: '请输入您的 API 密钥',
      aiModelName: 'gemini-pro',
      defaultScanPath: '/',
      excludedFolders: '.obsidian, .trash',
      excludedPatterns: '*.excalidraw, *.canvas',
    },
    providers: {
      gemini: 'Google Gemini',
      openai: 'OpenAI',
      anthropic: 'Anthropic Claude',
      ollama: 'Ollama（本地）',
      custom: '自定义提供商',
    },
    languages: {
      en: 'English',
      zh: '中文',
    },
  },
};

/**
 * 获取特定键的翻译
 */
export function t(lang: Language): Translation {
  return translations[lang];
}
