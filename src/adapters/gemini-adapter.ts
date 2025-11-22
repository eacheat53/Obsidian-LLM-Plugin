import { PluginSettings } from '../plugin-settings';
import { APIService } from '../services/api-service';
import { LLMAdapter } from './llm-adapter';
import {
    ScoringBatchRequest,
    ScoringBatchResponse,
    TaggingBatchRequest,
    TaggingBatchResponse,
    NotePairForScoring,
    ScoreResult,
    NoteForTagging,
    TagResult,
} from '../types/api-types';

/**
 * Google Gemini 适配器
 */
export class GeminiAdapter implements LLMAdapter {
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
            console.error('[Gemini Adapter] API 错误响应:', JSON.stringify(data, null, 2));
            throw new Error(`Gemini API 错误: ${data.error.message || JSON.stringify(data.error)}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        // 检查截断的响应 (MAX_TOKENS)
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason === 'MAX_TOKENS') {
            console.error('[Gemini Adapter] 由于 MAX_TOKENS，响应被截断。思考令牌数:', data.usageMetadata?.thoughtsTokenCount);
            console.error('[Gemini Adapter] 完整响应:', JSON.stringify(data, null, 2));
            throw new Error(`Gemini 响应被截断 (MAX_TOKENS)。模型可能处于思考模式。请尝试减小批量大小或使用不同的模型。\n思考令牌数: ${data.usageMetadata?.thoughtsTokenCount || 'unknown'}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        // 解析 Gemini 响应
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!responseText) {
            console.error('[Gemini Adapter] 空的评分响应文本。完整数据结构:', JSON.stringify(data, null, 2));
            throw new Error(`来自 Gemini 的空响应。完成原因: ${finishReason || 'unknown'}\n完整响应: ${JSON.stringify(data, null, 2)}`);
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
            console.error('[Gemini Adapter] API 错误响应:', JSON.stringify(data, null, 2));
            throw new Error(`Gemini API 错误: ${data.error.message || JSON.stringify(data.error)}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        // 检查截断的响应 (MAX_TOKENS)
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason === 'MAX_TOKENS') {
            console.error('[Gemini Adapter] 由于 MAX_TOKENS，响应被截断。思考令牌数:', data.usageMetadata?.thoughtsTokenCount);
            console.error('[Gemini Adapter] 完整响应:', JSON.stringify(data, null, 2));
            throw new Error(`Gemini 响应被截断 (MAX_TOKENS)。模型可能处于思考模式。请尝试减小批量大小或使用不同的模型。\n思考令牌数: ${data.usageMetadata?.thoughtsTokenCount || 'unknown'}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!responseText) {
            console.error('[Gemini Adapter] 空的标记响应文本。完整数据结构:', JSON.stringify(data, null, 2));
            throw new Error(`来自 Gemini 的空响应。完成原因: ${finishReason || 'unknown'}\n完整响应: ${JSON.stringify(data, null, 2)}`);
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
