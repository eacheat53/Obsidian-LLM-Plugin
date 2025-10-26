/**
 * 用于外部 HTTP 请求（Jina 嵌入和 LLM API）的 API 服务
 * 使用 Obsidian 的 requestUrl() 来避免 CORS 问题
 */

import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { PluginSettings } from '../plugin-settings';
import {
  JinaBatchEmbeddingRequest,
  JinaEmbeddingResponse,
  ScoringBatchRequest,
  ScoringBatchResponse,
  TaggingBatchRequest,
  TaggingBatchResponse,
  LLMAdapter,
  NotePairForScoring,
  ScoreResult,
  NoteForTagging,
  TagResult,
} from '../types/api-types';
import { NoteId } from '../types/index';
import { classifyAPIError, TransientError, getRetryDelay } from '../utils/error-classifier';

/**
 * 用于进行外部 API 调用的服务
 */
export class APIService {
  private settings: PluginSettings;

  constructor(settings: PluginSettings) {
    this.settings = settings;
  }

  /**
   * 调用 Jina AI 嵌入 API
   * 处理批处理、错误分类和重试
   *
   * @param request - 批量嵌入请求
   * @returns 带有向量的嵌入响应
   */
  async callJinaAPI(request: JinaBatchEmbeddingRequest): Promise<JinaEmbeddingResponse> {
    if (!this.settings.jina_api_key) {
      throw new Error('Jina API 密钥未配置。请在插件设置中设置。');
    }

    // 将输入截断到 max_chars 限制
    const truncatedInputs = request.input.map(text =>
      text.length > this.settings.jina_max_chars
        ? text.substring(0, this.settings.jina_max_chars)
        : text
    );

    const params: RequestUrlParam = {
      url: 'https://api.jina.ai/v1/embeddings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.settings.jina_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: truncatedInputs,
        model: request.model,
      }),
    };

    if (this.settings.enable_debug_logging) {
      console.log(`[API Service] 正在使用 ${request.input.length} 个文本调用 Jina API`);
    }

    const response = await this.makeRequestWithRetry(params);
    const data = JSON.parse(response.text) as JinaEmbeddingResponse;

    if (this.settings.enable_debug_logging) {
      console.log(`[API Service] Jina API 返回了 ${data.data.length} 个嵌入`);
    }

    return data;
  }

  /**
   * 调用 LLM API 进行批量评分
   * 使用提供商适配器模式（Gemini、OpenAI 等）
   *
   * @param request - 批量评分请求
   * @returns 带有 AI 分数的评分响应
   */
  async callLLMAPI(request: ScoringBatchRequest): Promise<ScoringBatchResponse> {
    const adapter = this.getLLMAdapter();
    return await adapter.scoreBatch(request);
  }

  /**
   * 调用 LLM API 进行批量标签生成
   *
   * @param request - 批量标记请求
   * @returns 带有生成标签的标记响应
   */
  async callLLMTaggingAPI(request: TaggingBatchRequest): Promise<TaggingBatchResponse> {
    const adapter = this.getLLMAdapter();
    return await adapter.generateTagsBatch(request);
  }

  /**
   * 使用针对瞬时错误的重试逻辑发出 HTTP 请求
   *
   * @param params - 请求参数
   * @param maxRetries - 最大重试次数（默认为 3）
   * @returns 响应对象
   */
  private async makeRequestWithRetry(
    params: RequestUrlParam,
    maxRetries: number = 3
  ): Promise<RequestUrlResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await requestUrl(params);

        // 检查 HTTP 错误
        if (response.status >= 400) {
          throw classifyAPIError(response.status, response.text);
        }

        return response;
      } catch (error) {
        lastError = error as Error;

        // 仅重试瞬时错误
        if (error instanceof TransientError && attempt < maxRetries - 1) {
          const delay = getRetryDelay(attempt);
          if (this.settings.enable_debug_logging) {
            console.log(`[API Service] 在 ${delay}ms 后重试（尝试 ${attempt + 1}/${maxRetries}）`);
          }
          await this.sleep(delay);
          continue;
        }

        // 不要重试配置或内容错误
        throw error;
      }
    }

    throw lastError || new Error('请求失败');
  }

  /**
   * 休眠指定的毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取已配置提供商的 LLM 适配器
   */
  private getLLMAdapter(): LLMAdapter {
    switch (this.settings.ai_provider) {
      case 'gemini':
        return new GeminiAdapter(this.settings, this);
      case 'openai':
        return new OpenAIAdapter(this.settings, this);
      case 'custom':
        // 自定义提供商使用与 OpenAI 兼容的格式
        return new OpenAIAdapter(this.settings, this);
      default:
        throw new Error(`不支持的 LLM 提供商: ${this.settings.ai_provider}`);
    }
  }

  /**
   * 发出原始 HTTP POST 请求（供适配器使用）
   * 暴露给适配器的内部方法
   */
  async makePostRequest(url: string, headers: Record<string, string>, body: unknown): Promise<RequestUrlResponse> {
    const params: RequestUrlParam = {
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };

    return await this.makeRequestWithRetry(params);
  }
}

// ============================================================================
// LLM 提供商适配器
// ============================================================================

/**
 * Google Gemini 适配器
 */
class GeminiAdapter implements LLMAdapter {
  private settings: PluginSettings;
  private apiService: APIService;

  constructor(settings: PluginSettings, apiService: APIService) {
    this.settings = settings;
    this.apiService = apiService;
  }

  async scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse> {
    if (!this.settings.ai_api_key) {
      throw new Error('Gemini API 密钥未配置。请在插件设置中设置。');
    }

    // 从笔记配对构建提示
    const prompt = this.buildScoringPrompt(request);

    // Gemini API 端点: {base_url}/{model}:generateContent
    const url = `${this.settings.ai_api_url}/${this.settings.ai_model_name}:generateContent?key=${this.settings.ai_api_key}`;

    const body = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 20000,  
        responseModalities: ["TEXT"],  // 强制纯文本输出
      }
    };

    if (this.settings.enable_debug_logging) {
      console.log(`[Gemini Adapter] 正在对 ${request.pairs.length} 个笔记配对进行评分`);
    }

    const response = await this.apiService.makePostRequest(url, {
      'Content-Type': 'application/json',
    }, body);

    const data = JSON.parse(response.text);

    if (this.settings.enable_debug_logging) {
      console.log('[Gemini Adapter] 完整的评分 API 响应:', data);
    }

    // 检查 API 错误
    if (data.error) {
      console.error('[Gemini Adapter] API 错误:', data.error);
      throw new Error(`Gemini API 错误: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // 检查截断的响应 (MAX_TOKENS)
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      console.error('[Gemini Adapter] 由于 MAX_TOKENS，响应被截断。思考令牌数:', data.usageMetadata?.thoughtsTokenCount);
      throw new Error('Gemini 响应被截断 (MAX_TOKENS)。模型可能处于思考模式。请尝试减小批量大小或使用不同的模型。');
    }

    // 解析 Gemini 响应
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!responseText) {
      console.error('[Gemini Adapter] 空的评分响应文本。完整数据结构:', JSON.stringify(data, null, 2));
      throw new Error(`来自 Gemini 的空响应。完成原因: ${finishReason || 'unknown'}`);
    }

    const scores = this.parseScoringResponse(responseText, request.pairs);

    return {
      scores,
      model: this.settings.ai_model_name,
      usage: {
        total_tokens: data.usageMetadata?.totalTokenCount || 0,
        prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      }
    };
  }

  async generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse> {
    if (!this.settings.ai_api_key) {
      throw new Error('Gemini API 密钥未配置。请在插件设置中设置。');
    }

    const prompt = this.buildTaggingPrompt(request);

    const url = `${this.settings.ai_api_url}/${this.settings.ai_model_name}:generateContent?key=${this.settings.ai_api_key}`;

    const body = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.5,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 20000,  
        responseModalities: ["TEXT"],  // 强制纯文本输出
      }
    };

    if (this.settings.enable_debug_logging) {
      console.log(`[Gemini Adapter] 正在为 ${request.notes.length} 个笔记生成标签`);
    }

    const response = await this.apiService.makePostRequest(url, {
      'Content-Type': 'application/json',
    }, body);

    const data = JSON.parse(response.text);

    if (this.settings.enable_debug_logging) {
      console.log('[Gemini Adapter] 完整的 API 响应:', data);
    }

    // 检查 API 错误
    if (data.error) {
      console.error('[Gemini Adapter] API 错误:', data.error);
      throw new Error(`Gemini API 错误: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // 检查截断的响应 (MAX_TOKENS)
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      console.error('[Gemini Adapter] 由于 MAX_TOKENS，响应被截断。思考令牌数:', data.usageMetadata?.thoughtsTokenCount);
      throw new Error('Gemini 响应被截断 (MAX_TOKENS)。模型可能处于思考模式。请尝试减小批量大小或使用不同的模型。');
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!responseText) {
      console.error('[Gemini Adapter] 空的标记响应文本。完整数据结构:', JSON.stringify(data, null, 2));
      throw new Error(`来自 Gemini 的空响应。完成原因: ${finishReason || 'unknown'}`);
    }

    const results = this.parseTaggingResponse(responseText, request.notes);

    return {
      results,
      model: this.settings.ai_model_name,
      usage: {
        total_tokens: data.usageMetadata?.totalTokenCount || 0,
        prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      }
    };
  }

  private buildScoringPrompt(request: ScoringBatchRequest): string {
    const basePrompt = request.prompt || this.settings.custom_scoring_prompt;

    // 为配对构建结构化 JSON 数据
    const pairsData = request.pairs.map((pair, index) => ({
      pair_id: index + 1,
      note_1: {
        id: pair.note_id_1,
        title: pair.title_1,
        content: pair.content_1.substring(0, this.settings.llm_scoring_max_chars)
      },
      note_2: {
        id: pair.note_id_2,
        title: pair.title_2,
        content: pair.content_2.substring(0, this.settings.llm_scoring_max_chars)
      },
      similarity_score: parseFloat(pair.similarity_score.toFixed(3))
    }));

    const dataJson = JSON.stringify({ pairs: pairsData }, null, 2);

    const prompt = `${basePrompt}\n\n请对以下笔记配对进行评分。为清晰起见，数据以 JSON 格式提供:\n\n\`\`\`json\n${dataJson}\n\`\`\`\n\n请使用与 pair_ids 匹配的 JSON 数组进行响应。每个元素必须包含 pair_id、note_id_1、note_id_2 和 score (0-10):\n\n[{"pair_id": 1, "note_id_1": "id1", "note_id_2": "id2", "score": 7}, ...]\n\n重要提示：您的响应必须是有效的 JSON 数组，其中包含 ${request.pairs.length} 个元素，每个 pair_id 一个。`;

    return prompt;
  }

  private buildTaggingPrompt(request: TaggingBatchRequest): string {
    const basePrompt = request.prompt || this.settings.custom_tagging_prompt;

    let prompt = `${basePrompt}\n\n为每个笔记生成 ${request.min_tags || 3}-${request.max_tags || 5} 个相关标签:\n\n`;

    request.notes.forEach((note) => {
      prompt += `笔记 ID: ${note.note_id}\n`;
      prompt += `标题: "${note.title}"\n`;
      prompt += `内容: ${note.content.substring(0, this.settings.llm_tagging_max_chars)}\n`;
      if (note.existing_tags.length > 0) {
        prompt += `现有标签: ${note.existing_tags.join(', ')}\n`;
      }
      prompt += '\n';
    });

    prompt += '\n使用输入中的确切笔记 ID 以 JSON 数组响应:\n';
    prompt += '[{"note_id": "<输入中的确切 UUID>", "tags": ["tag1", "tag2"]}, ...]';

    return prompt;
  }

  private parseScoringResponse(responseText: string, pairs: NotePairForScoring[]): ScoreResult[] {
    try {
      if (this.settings.enable_debug_logging) {
        console.log('[Gemini Adapter] 原始评分响应:', responseText);
      }

      // 尝试从各种格式中提取 JSON
      let jsonText = '';

      // 方法 1：尝试在 markdown 代码块中查找 JSON
      const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
        if (this.settings.enable_debug_logging) {
          console.log('[Gemini Adapter] 在代码块中找到 JSON');
        }
      } else {
        // 方法 2：尝试查找原始 JSON 数组
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
          if (this.settings.enable_debug_logging) {
            console.log('[Gemini Adapter] 找到原始 JSON 数组');
          }
        }
      }

      if (!jsonText) {
        console.warn('[Gemini Adapter] 在评分响应中未找到 JSON，全文:', responseText);
        throw new Error('在响应中未找到 JSON 数组');
      }

      const parsed = JSON.parse(jsonText) as Array<{
        pair_id?: number;
        note_id_1: string;
        note_id_2: string;
        score: number;
        reasoning?: string;
      }>;

      // 验证我们是否获得了所有配对的分数
      if (parsed.length !== pairs.length) {
        console.warn(`[Gemini Adapter] 预期 ${pairs.length} 个分数，但获得了 ${parsed.length} 个`);
      }

      // 如果存在，则按 pair_id 排序，以确保顺序正确
      if (parsed[0]?.pair_id !== undefined) {
        parsed.sort((a, b) => (a.pair_id || 0) - (b.pair_id || 0));
        if (this.settings.enable_debug_logging) {
          console.log('[Gemini Adapter] 已按 pair_id 对分数进行排序');
        }
      }

      // 转换为 ScoreResult 格式（不含 pair_id）
      return parsed.map(item => ({
        note_id_1: item.note_id_1,
        note_id_2: item.note_id_2,
        score: item.score,
        reasoning: item.reasoning
      }));
    } catch (error) {
      console.error('[Gemini Adapter] 解析评分响应失败:', error);
      console.error('[Gemini Adapter] 响应文本为:', responseText);
      // 如果解析失败，则返回默认分数
      return pairs.map(pair => ({
        note_id_1: pair.note_id_1,
        note_id_2: pair.note_id_2,
        score: 5,
        reasoning: '解析 LLM 响应失败'
      }));
    }
  }

  private parseTaggingResponse(responseText: string, notes: NoteForTagging[]): TagResult[] {
    try {
      if (this.settings.enable_debug_logging) {
        console.log('[Gemini Adapter] 原始响应文本:', responseText);
      }

      // 尝试从各种格式中提取 JSON
      let jsonText = '';

      // 方法 1：尝试在 markdown 代码块中查找 JSON
      const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
        if (this.settings.enable_debug_logging) {
          console.log('[Gemini Adapter] 在代码块中找到 JSON');
        }
      } else {
        // 方法 2：尝试查找原始 JSON 数组
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
          if (this.settings.enable_debug_logging) {
            console.log('[Gemini Adapter] 找到原始 JSON 数组');
          }
        }
      }

      if (!jsonText) {
        console.warn('[Gemini Adapter] 在响应中未找到 JSON，全文:', responseText);
        throw new Error('在响应中未找到 JSON 数组');
      }

      const parsed = JSON.parse(jsonText) as TagResult[];

      if (parsed.length !== notes.length) {
        console.warn(`[Gemini Adapter] 预期 ${notes.length} 个标签结果，但获得了 ${parsed.length} 个`);
      }

      return parsed;
    } catch (error) {
      console.error('[Gemini Adapter] 解析标记响应失败:', error);
      console.error('[Gemini Adapter] 响应文本为:', responseText);
      // 如果解析失败，则返回空标签
      return notes.map(note => ({
        note_id: note.note_id,
        tags: [],
        reasoning: '解析 LLM 响应失败'
      }));
    }
  }
}

/**
 * OpenAI 适配器 (GPT-4, GPT-3.5 等)
 */
class OpenAIAdapter implements LLMAdapter {
  private settings: PluginSettings;
  private apiService: APIService;

  constructor(settings: PluginSettings, apiService: APIService) {
    this.settings = settings;
    this.apiService = apiService;
  }

  async scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse> {
    if (!this.settings.ai_api_key) {
      throw new Error('OpenAI API 密钥未配置。请在插件设置中设置。');
    }

    const prompt = this.buildScoringPrompt(request);

    // OpenAI API 端点: {base_url}/chat/completions
    const url = `${this.settings.ai_api_url}/chat/completions`;

    const body = {
      model: this.settings.ai_model_name,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: 'json_object' }
    };

    if (this.settings.enable_debug_logging) {
      console.log(`[OpenAI Adapter] 正在对 ${request.pairs.length} 个笔记配对进行评分`);
    }

    const response = await this.apiService.makePostRequest(url, {
      'Authorization': `Bearer ${this.settings.ai_api_key}`,
      'Content-Type': 'application/json',
    }, body);

    const data = JSON.parse(response.text);
    const responseText = data.choices?.[0]?.message?.content || '';
    const scores = this.parseScoringResponse(responseText, request.pairs);

    return {
      scores,
      model: this.settings.ai_model_name,
      usage: {
        total_tokens: data.usage?.total_tokens || 0,
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
      }
    };
  }

  async generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse> {
    if (!this.settings.ai_api_key) {
      throw new Error('OpenAI API 密钥未配置。请在插件设置中设置。');
    }

    const prompt = this.buildTaggingPrompt(request);

    const url = `${this.settings.ai_api_url}/chat/completions`;

    const body = {
      model: this.settings.ai_model_name,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 1024,
      response_format: { type: 'json_object' }
    };

    if (this.settings.enable_debug_logging) {
      console.log(`[OpenAI Adapter] 正在为 ${request.notes.length} 个笔记生成标签`);
    }

    const response = await this.apiService.makePostRequest(url, {
      'Authorization': `Bearer ${this.settings.ai_api_key}`,
      'Content-Type': 'application/json',
    }, body);

    const data = JSON.parse(response.text);
    const responseText = data.choices?.[0]?.message?.content || '';
    const results = this.parseTaggingResponse(responseText, request.notes);

    return {
      results,
      model: this.settings.ai_model_name,
      usage: {
        total_tokens: data.usage?.total_tokens || 0,
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
      }
    };
  }

  private buildScoringPrompt(request: ScoringBatchRequest): string {
    const basePrompt = request.prompt || this.settings.custom_scoring_prompt;

    let prompt = `${basePrompt}\n\n请按 0-10 的等级对以下笔记配对的相关性进行评分:\n\n`;

    request.pairs.forEach((pair, index) => {
      prompt += `配对 ${index + 1}:\n`;
      prompt += `笔记 A: "${pair.title_1}"\n${pair.content_1.substring(0, this.settings.llm_scoring_max_chars)}\n\n`;
      prompt += `笔记 B: "${pair.title_2}"\n${pair.content_2.substring(0, this.settings.llm_scoring_max_chars)}\n\n`;
      prompt += `相似度分数: ${pair.similarity_score.toFixed(3)}\n\n`;
    });

    prompt += '\n以包含 "scores" 数组的 JSON 对象响应: {"scores": [{"note_id_1": "id1", "note_id_2": "id2", "score": 7, "reasoning": "..."}, ...]}';

    return prompt;
  }

  private buildTaggingPrompt(request: TaggingBatchRequest): string {
    const basePrompt = request.prompt || this.settings.custom_tagging_prompt;

    let prompt = `${basePrompt}\n\n为每个笔记生成 ${request.min_tags || 3}-${request.max_tags || 5} 个相关标签:\n\n`;

    request.notes.forEach((note) => {
      prompt += `笔记 ID: ${note.note_id}\n`;
      prompt += `标题: "${note.title}"\n`;
      prompt += `内容: ${note.content.substring(0, this.settings.llm_tagging_max_chars)}\n`;
      if (note.existing_tags.length > 0) {
        prompt += `现有标签: ${note.existing_tags.join(', ')}\n`;
      }
      prompt += '\n';
    });

    prompt += '\n使用输入中的确切笔记 ID 以 JSON 对象响应:\n';
    prompt += '{"results": [{"note_id": "<输入中的确切 UUID>", "tags": ["tag1", "tag2"]}, ...]}';

    return prompt;
  }

  private parseScoringResponse(responseText: string, pairs: NotePairForScoring[]): ScoreResult[] {
    try {
      const parsed = JSON.parse(responseText);
      const scores = parsed.scores || [];

      if (scores.length !== pairs.length) {
        console.warn(`[OpenAI Adapter] 预期 ${pairs.length} 个分数，但获得了 ${scores.length} 个`);
      }

      return scores as ScoreResult[];
    } catch (error) {
      console.error('[OpenAI Adapter] 解析评分响应失败:', error);
      return pairs.map(pair => ({
        note_id_1: pair.note_id_1,
        note_id_2: pair.note_id_2,
        score: 5,
        reasoning: '解析 LLM 响应失败'
      }));
    }
  }

  private parseTaggingResponse(responseText: string, notes: NoteForTagging[]): TagResult[] {
    try {
      const parsed = JSON.parse(responseText);
      const results = parsed.results || [];

      if (results.length !== notes.length) {
        console.warn(`[OpenAI Adapter] 预期 ${notes.length} 个标签结果，但获得了 ${results.length} 个`);
      }

      return results as TagResult[];
    } catch (error) {
      console.error('[OpenAI Adapter] 解析标记响应失败:', error);
      return notes.map(note => ({
        note_id: note.note_id,
        tags: [],
        reasoning: '解析 LLM 响应失败'
      }));
    }
  }
}

