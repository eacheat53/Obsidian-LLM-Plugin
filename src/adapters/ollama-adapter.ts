import { PluginSettings } from '../plugin-settings';
import { APIService } from '../services/api-service';
import { BaseLLMAdapter } from './base-adapter';
import {
    ScoringBatchRequest,
    ScoringBatchResponse,
    TaggingBatchRequest,
    TaggingBatchResponse,
} from '../types/api-types';

/**
 * Ollama 适配器（本地 LLM）
 * 使用 OpenAI 兼容 API 格式
 * 默认端点: http://localhost:11434/v1
 */
export class OllamaAdapter extends BaseLLMAdapter {
    constructor(settings: PluginSettings, apiService: APIService) {
        super(settings, apiService, 'Ollama Adapter');
    }

    async scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse> {
        const prompt = this.buildScoringPrompt(request);
        const config = this.getScoringConfig();
        const { url, headers, body } = this.buildOllamaRequest(prompt, config);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 正在对 ${request.pairs.length} 个笔记配对进行评分`);
        }

        const response = await this.apiService.makePostRequest(url, headers, body);
        const data = JSON.parse(response.text);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 完整的评分 API 响应:`, data);
        }

        this.checkApiError(data);

        const responseText = data.choices?.[0]?.message?.content || '';
        if (!responseText) {
            throw new Error(`来自 Ollama 的空响应\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const scores = this.parseScoringResponse(responseText, request.pairs);

        return {
            scores,
            model: this.settings.ai_model_name,
            usage: this.extractUsage(data),
        };
    }

    async generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse> {
        const prompt = this.buildTaggingPrompt(request);
        const config = this.getTaggingConfig();
        const { url, headers, body } = this.buildOllamaRequest(prompt, config);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 正在为 ${request.notes.length} 个笔记生成标签`);
        }

        const response = await this.apiService.makePostRequest(url, headers, body);
        const data = JSON.parse(response.text);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 完整的标签 API 响应:`, data);
        }

        this.checkApiError(data);

        const responseText = data.choices?.[0]?.message?.content || '';
        if (!responseText) {
            throw new Error(`来自 Ollama 的空响应\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const results = this.parseTaggingResponse(responseText, request.notes);

        return {
            results,
            model: this.settings.ai_model_name,
            usage: this.extractUsage(data),
        };
    }

    // ============================================================================
    // Ollama 特定辅助方法
    // ============================================================================

    private buildOllamaRequest(prompt: string, config: { temperature: number; maxTokens: number }) {
        // Ollama 使用 OpenAI 兼容格式，但不需要 Bearer token
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        // 如果配置了 API Key（某些代理服务需要），则添加
        if (this.settings.ai_api_key) {
            headers['Authorization'] = `Bearer ${this.settings.ai_api_key}`;
        }

        return {
            url: `${this.settings.ai_api_url}/chat/completions`,
            headers,
            body: {
                model: this.settings.ai_model_name,
                messages: [{ role: 'user', content: prompt }],
                temperature: config.temperature,
                // Ollama 使用 num_predict 而不是 max_tokens，但也支持 max_tokens
                options: {
                    num_predict: config.maxTokens,
                },
                stream: false,
            },
        };
    }

    private checkApiError(data: any): void {
        if (data.error) {
            console.error(`[${this.adapterName}] API 错误响应:`, JSON.stringify(data, null, 2));
            throw new Error(`Ollama API 错误: ${data.error.message || data.error}`);
        }
    }

    private extractUsage(data: any) {
        return {
            total_tokens: data.usage?.total_tokens || 0,
            prompt_tokens: data.usage?.prompt_tokens || 0,
            completion_tokens: data.usage?.completion_tokens || 0,
        };
    }
}
