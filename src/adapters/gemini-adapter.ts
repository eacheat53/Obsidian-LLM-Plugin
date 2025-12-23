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
 * Google Gemini 适配器
 */
export class GeminiAdapter extends BaseLLMAdapter {
    constructor(settings: PluginSettings, apiService: APIService) {
        super(settings, apiService, 'Gemini Adapter');
    }

    async scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse> {
        if (!this.settings.ai_api_key) {
            throw new Error('Gemini API 密钥未配置。请在插件设置中设置。');
        }

        const prompt = this.buildStructuredScoringPrompt(request);
        const config = this.getScoringConfig();
        const { url, body } = this.buildGeminiRequest(prompt, config);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 正在对 ${request.pairs.length} 个笔记配对进行评分`);
        }

        const response = await this.apiService.makePostRequest(url, {
            'Content-Type': 'application/json',
        }, body);

        const data = JSON.parse(response.text);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 完整的评分 API 响应:`, data);
        }

        this.checkApiError(data);
        this.checkTruncation(data);

        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!responseText) {
            const finishReason = data.candidates?.[0]?.finishReason;
            throw new Error(`来自 Gemini 的空响应。完成原因: ${finishReason || 'unknown'}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const scores = this.parseScoringResponse(responseText, request.pairs);

        return {
            scores,
            model: this.settings.ai_model_name,
            usage: this.extractGeminiUsage(data),
        };
    }

    async generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse> {
        if (!this.settings.ai_api_key) {
            throw new Error('Gemini API 密钥未配置。请在插件设置中设置。');
        }

        const prompt = this.buildTaggingPrompt(request);
        const config = this.getTaggingConfig();
        const { url, body } = this.buildGeminiRequest(prompt, config);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 正在为 ${request.notes.length} 个笔记生成标签`);
        }

        const response = await this.apiService.makePostRequest(url, {
            'Content-Type': 'application/json',
        }, body);

        const data = JSON.parse(response.text);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 完整的 API 响应:`, data);
        }

        this.checkApiError(data);
        this.checkTruncation(data);

        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!responseText) {
            const finishReason = data.candidates?.[0]?.finishReason;
            throw new Error(`来自 Gemini 的空响应。完成原因: ${finishReason || 'unknown'}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const results = this.parseTaggingResponse(responseText, request.notes);

        return {
            results,
            model: this.settings.ai_model_name,
            usage: this.extractGeminiUsage(data),
        };
    }

    // ============================================================================
    // Gemini 特定辅助方法
    // ============================================================================

    private buildGeminiRequest(prompt: string, config: { temperature: number; maxTokens: number }) {
        return {
            url: `${this.settings.ai_api_url}/${this.settings.ai_model_name}:generateContent?key=${this.settings.ai_api_key}`,
            body: {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: config.temperature,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: config.maxTokens,
                    responseModalities: ["TEXT"],
                },
            },
        };
    }

    private checkApiError(data: any): void {
        if (data.error) {
            console.error(`[${this.adapterName}] API 错误响应:`, JSON.stringify(data, null, 2));
            throw new Error(`Gemini API 错误: ${data.error.message || JSON.stringify(data.error)}`);
        }
    }

    private checkTruncation(data: any): void {
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason === 'MAX_TOKENS') {
            console.error(`[${this.adapterName}] 由于 MAX_TOKENS，响应被截断`);
            throw new Error(`Gemini 响应被截断 (MAX_TOKENS)。请尝试减小批量大小。`);
        }
    }

    private extractGeminiUsage(data: any) {
        return {
            total_tokens: data.usageMetadata?.totalTokenCount || 0,
            prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
            completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        };
    }
}
