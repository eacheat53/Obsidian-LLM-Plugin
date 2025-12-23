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
 * Anthropic Claude 适配器
 */
export class AnthropicAdapter extends BaseLLMAdapter {
    constructor(settings: PluginSettings, apiService: APIService) {
        super(settings, apiService, 'Anthropic Adapter');
    }

    async scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse> {
        if (!this.settings.ai_api_key) {
            throw new Error('Anthropic API 密钥未配置。请在插件设置中设置。');
        }

        const prompt = this.buildStructuredScoringPrompt(request);
        const config = this.getScoringConfig();
        const { url, headers, body } = this.buildAnthropicRequest(prompt, config);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 正在对 ${request.pairs.length} 个笔记配对进行评分`);
        }

        const response = await this.apiService.makePostRequest(url, headers, body);
        const data = JSON.parse(response.text);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 完整的评分 API 响应:`, data);
        }

        this.checkApiError(data);

        const responseText = data.content?.[0]?.text || '';
        if (!responseText) {
            throw new Error(`来自 Anthropic 的空响应\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const scores = this.parseScoringResponse(responseText, request.pairs);

        return {
            scores,
            model: this.settings.ai_model_name,
            usage: this.extractAnthropicUsage(data),
        };
    }

    async generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse> {
        if (!this.settings.ai_api_key) {
            throw new Error('Anthropic API 密钥未配置。请在插件设置中设置。');
        }

        const prompt = this.buildTaggingPrompt(request);
        const config = this.getTaggingConfig();
        const { url, headers, body } = this.buildAnthropicRequest(prompt, config);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 正在为 ${request.notes.length} 个笔记生成标签`);
        }

        const response = await this.apiService.makePostRequest(url, headers, body);
        const data = JSON.parse(response.text);

        if (this.settings.enable_debug_logging) {
            console.log(`[${this.adapterName}] 完整的标签 API 响应:`, data);
        }

        this.checkApiError(data);

        const responseText = data.content?.[0]?.text || '';
        if (!responseText) {
            throw new Error(`来自 Anthropic 的空响应\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const results = this.parseTaggingResponse(responseText, request.notes);

        return {
            results,
            model: this.settings.ai_model_name,
            usage: this.extractAnthropicUsage(data),
        };
    }

    // ============================================================================
    // Anthropic 特定辅助方法
    // ============================================================================

    private buildAnthropicRequest(prompt: string, config: { temperature: number; maxTokens: number }) {
        return {
            url: `${this.settings.ai_api_url}/messages`,
            headers: {
                'x-api-key': this.settings.ai_api_key,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: {
                model: this.settings.ai_model_name,
                max_tokens: config.maxTokens,
                temperature: config.temperature,
                messages: [{ role: 'user', content: prompt }],
            },
        };
    }

    private checkApiError(data: any): void {
        if (data.error) {
            console.error(`[${this.adapterName}] API 错误响应:`, JSON.stringify(data, null, 2));
            throw new Error(`Anthropic API 错误: ${data.error.message || JSON.stringify(data.error)}`);
        }
    }

    private extractAnthropicUsage(data: any) {
        return {
            total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            prompt_tokens: data.usage?.input_tokens || 0,
            completion_tokens: data.usage?.output_tokens || 0,
        };
    }
}
