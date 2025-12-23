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
} from '../types/api-types';
import { classifyAPIError, TransientError, getRetryDelay } from '../utils/error-classifier';
import { LLMAdapter } from '../adapters/llm-adapter';
import { GeminiAdapter } from '../adapters/gemini-adapter';
import { OpenAIAdapter } from '../adapters/openai-adapter';
import { AnthropicAdapter } from '../adapters/anthropic-adapter';
import { OllamaAdapter } from '../adapters/ollama-adapter';

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
   * @param timeoutMs - 请求超时时间（毫秒）
   * @returns 响应对象
   */
  private async makeRequestWithRetry(
    params: RequestUrlParam,
    maxRetries: number = 3,
    timeoutMs?: number
  ): Promise<RequestUrlResponse> {
    let lastError: Error | null = null;

    // 计算请求体大小（用于日志）
    const requestSize = params.body ? new Blob([params.body]).size : 0;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (this.settings.enable_debug_logging && requestSize > 0) {
          console.log(`[API Service] 请求体大小: ${(requestSize / 1024).toFixed(2)} KB`);
        }

        // 创建带超时的请求参数
        const requestParams = timeoutMs ? { ...params, timeout: timeoutMs } : params;

        const response = await requestUrl(requestParams);

        // 检查 HTTP 错误
        if (response.status >= 400) {
          throw classifyAPIError(response.status, response.text);
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message || String(error);

        // 记录详细错误信息
        if (this.settings.enable_debug_logging) {
          console.error(`[API Service] 请求失败 (尝试 ${attempt + 1}/${maxRetries}):`, errorMessage);
          console.error(`[API Service] 请求URL: ${params.url}`);
          console.error(`[API Service] 请求体大小: ${(requestSize / 1024).toFixed(2)} KB`);
        }

        // 检查是否是连接关闭错误
        const isConnectionClosed = errorMessage.includes('ERR_CONNECTION_CLOSED') ||
          errorMessage.includes('connection closed') ||
          errorMessage.includes('socket hang up');

        // 对于连接关闭错误，也尝试重试
        if ((error instanceof TransientError || isConnectionClosed) && attempt < maxRetries - 1) {
          const delay = getRetryDelay(attempt);
          if (this.settings.enable_debug_logging) {
            console.log(`[API Service] ${isConnectionClosed ? '连接已关闭' : '瞬时错误'}，在 ${delay}ms 后重试（尝试 ${attempt + 1}/${maxRetries}）`);
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
      case 'anthropic':
        return new AnthropicAdapter(this.settings, this);
      case 'ollama':
        return new OllamaAdapter(this.settings, this);
      case 'custom':
        // 自定义提供商：从 custom_providers 获取选中的配置
        return this.createCustomAdapter();
      default:
        throw new Error(`不支持的 LLM 提供商: ${this.settings.ai_provider}`);
    }
  }

  /**
   * 创建自定义提供商适配器
   * 根据 selected_custom_provider 查找配置
   */
  private createCustomAdapter(): LLMAdapter {
    const selectedId = this.settings.selected_custom_provider;

    if (!selectedId) {
      // 没有选择自定义提供商，使用旧的 provider_configs.custom
      return new OpenAIAdapter(this.settings, this);
    }

    const customProvider = this.settings.custom_providers.find(p => p.id === selectedId);

    if (!customProvider) {
      console.warn(`[API Service] 未找到自定义提供商: ${selectedId}，使用默认配置`);
      return new OpenAIAdapter(this.settings, this);
    }

    // 创建临时设置对象，替换 API 配置
    const customSettings = {
      ...this.settings,
      ai_api_url: customProvider.api_url,
      ai_api_key: customProvider.api_key,
      ai_model_name: customProvider.model_name,
    };

    return new OpenAIAdapter(customSettings, this);
  }


  /**
   * 发出原始 HTTP POST 请求（供适配器使用）
   * 暴露给适配器的内部方法
   *
   * @param url - 请求URL
   * @param headers - 请求头
   * @param body - 请求体
   * @param timeoutMs - 超时时间（毫秒），默认300000ms（5分钟）用于LLM请求
   */
  async makePostRequest(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number = 300000): Promise<RequestUrlResponse> {
    const params: RequestUrlParam = {
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };

    return await this.makeRequestWithRetry(params, 3, timeoutMs);
  }
}

