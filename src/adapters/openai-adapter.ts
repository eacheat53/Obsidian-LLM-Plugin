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
 * OpenAI 适配器 (GPT-4, GPT-3.5 等)
 */
export class OpenAIAdapter implements LLMAdapter {
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

        if (this.settings.enable_debug_logging) {
            console.log('[OpenAI Adapter] 完整的评分 API 响应:', data);
        }

        // 检查 API 错误
        if (data.error) {
            console.error('[OpenAI Adapter] API 错误响应:', JSON.stringify(data, null, 2));
            throw new Error(`OpenAI API 错误: ${data.error.message || JSON.stringify(data.error)}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const responseText = data.choices?.[0]?.message?.content || '';

        if (!responseText) {
            console.error('[OpenAI Adapter] 空的响应内容。完整数据结构:', JSON.stringify(data, null, 2));
            throw new Error(`来自 OpenAI 的空响应\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

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

        if (this.settings.enable_debug_logging) {
            console.log('[OpenAI Adapter] 完整的标签 API 响应:', data);
        }

        // 检查 API 错误
        if (data.error) {
            console.error('[OpenAI Adapter] API 错误响应:', JSON.stringify(data, null, 2));
            throw new Error(`OpenAI API 错误: ${data.error.message || JSON.stringify(data.error)}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const responseText = data.choices?.[0]?.message?.content || '';

        if (!responseText) {
            console.error('[OpenAI Adapter] 空的响应内容。完整数据结构:', JSON.stringify(data, null, 2));
            throw new Error(`来自 OpenAI 的空响应\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

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
            if (this.settings.enable_debug_logging) {
                console.log('[OpenAI Adapter] 原始评分响应:', responseText);
            }

            // 尝试从各种格式中提取 JSON
            let jsonText = '';

            // 方法 1：尝试在 markdown 代码块中查找 JSON
            const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                jsonText = codeBlockMatch[1].trim();
                if (this.settings.enable_debug_logging) {
                    console.log('[OpenAI Adapter] 在代码块中找到 JSON');
                }
            } else {
                // 方法 2：尝试查找原始 JSON 数组
                const jsonMatch = responseText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    jsonText = jsonMatch[0];
                    if (this.settings.enable_debug_logging) {
                        console.log('[OpenAI Adapter] 找到原始 JSON 数组');
                    }
                } else {
                    // 方法 3：尝试直接解析整个响应
                    jsonText = responseText.trim();
                    if (this.settings.enable_debug_logging) {
                        console.log('[OpenAI Adapter] 尝试直接解析整个响应');
                    }
                }
            }

            if (!jsonText) {
                console.warn('[OpenAI Adapter] 在评分响应中未找到 JSON，全文:', responseText);
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
                console.warn(`[OpenAI Adapter] 预期 ${pairs.length} 个分数，但获得了 ${parsed.length} 个`);
            }

            // 如果存在，则按 pair_id 排序，以确保顺序正确
            if (parsed[0]?.pair_id !== undefined) {
                parsed.sort((a, b) => (a.pair_id || 0) - (b.pair_id || 0));
                if (this.settings.enable_debug_logging) {
                    console.log('[OpenAI Adapter] 已按 pair_id 对分数进行排序');
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
            console.error('[OpenAI Adapter] 解析评分响应失败:', error);
            console.error('[OpenAI Adapter] 响应文本为:', responseText);
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
                console.log('[OpenAI Adapter] 原始标签响应:', responseText);
            }

            // 尝试从各种格式中提取 JSON
            let jsonText = '';

            // 方法 1：尝试在 markdown 代码块中查找 JSON
            const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                jsonText = codeBlockMatch[1].trim();
                if (this.settings.enable_debug_logging) {
                    console.log('[OpenAI Adapter] 在代码块中找到 JSON');
                }
            } else {
                // 方法 2：尝试查找原始 JSON 数组
                const jsonMatch = responseText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    jsonText = jsonMatch[0];
                    if (this.settings.enable_debug_logging) {
                        console.log('[OpenAI Adapter] 找到原始 JSON 数组');
                    }
                } else {
                    // 方法 3：尝试直接解析整个响应
                    jsonText = responseText.trim();
                    if (this.settings.enable_debug_logging) {
                        console.log('[OpenAI Adapter] 尝试直接解析整个响应');
                    }
                }
            }

            if (!jsonText) {
                console.warn('[OpenAI Adapter] 在标签响应中未找到 JSON，全文:', responseText);
                throw new Error('在响应中未找到 JSON 数组');
            }

            const parsed = JSON.parse(jsonText) as TagResult[];

            if (parsed.length !== notes.length) {
                console.warn(`[OpenAI Adapter] 预期 ${notes.length} 个标签结果，但获得了 ${parsed.length} 个`);
            }

            return parsed;
        } catch (error) {
            console.error('[OpenAI Adapter] 解析标签响应失败:', error);
            console.error('[OpenAI Adapter] 响应文本为:', responseText);
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
 * Anthropic Claude 适配器
 */
export class AnthropicAdapter implements LLMAdapter {
    private settings: PluginSettings;
    private apiService: APIService;

    constructor(settings: PluginSettings, apiService: APIService) {
        this.settings = settings;
        this.apiService = apiService;
    }

    async scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse> {
        if (!this.settings.ai_api_key) {
            throw new Error('Anthropic API 密钥未配置。请在插件设置中设置。');
        }

        const prompt = this.buildScoringPrompt(request);

        // Anthropic API 端点: {base_url}/messages
        const url = `${this.settings.ai_api_url}/messages`;

        const body = {
            model: this.settings.ai_model_name,
            max_tokens: 4096,
            temperature: 0.3,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        };

        if (this.settings.enable_debug_logging) {
            console.log(`[Anthropic Adapter] 正在对 ${request.pairs.length} 个笔记配对进行评分`);
        }

        const response = await this.apiService.makePostRequest(url, {
            'x-api-key': this.settings.ai_api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        }, body);

        const data = JSON.parse(response.text);

        if (this.settings.enable_debug_logging) {
            console.log('[Anthropic Adapter] 完整的评分 API 响应:', data);
        }

        // 检查 API 错误
        if (data.error) {
            console.error('[Anthropic Adapter] API 错误响应:', JSON.stringify(data, null, 2));
            throw new Error(`Anthropic API 错误: ${data.error.message || JSON.stringify(data.error)}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        // Anthropic 响应格式: { content: [{ type: "text", text: "..." }] }
        const responseText = data.content?.[0]?.text || '';

        if (!responseText) {
            console.error('[Anthropic Adapter] 空的响应内容。完整数据结构:', JSON.stringify(data, null, 2));
            throw new Error(`来自 Anthropic 的空响应\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const scores = this.parseScoringResponse(responseText, request.pairs);

        return {
            scores,
            model: this.settings.ai_model_name,
            usage: {
                total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
                prompt_tokens: data.usage?.input_tokens || 0,
                completion_tokens: data.usage?.output_tokens || 0,
            }
        };
    }

    async generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse> {
        if (!this.settings.ai_api_key) {
            throw new Error('Anthropic API 密钥未配置。请在插件设置中设置。');
        }

        const prompt = this.buildTaggingPrompt(request);

        const url = `${this.settings.ai_api_url}/messages`;

        const body = {
            model: this.settings.ai_model_name,
            max_tokens: 2048,
            temperature: 0.5,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        };

        if (this.settings.enable_debug_logging) {
            console.log(`[Anthropic Adapter] 正在为 ${request.notes.length} 个笔记生成标签`);
        }

        const response = await this.apiService.makePostRequest(url, {
            'x-api-key': this.settings.ai_api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        }, body);

        const data = JSON.parse(response.text);

        if (this.settings.enable_debug_logging) {
            console.log('[Anthropic Adapter] 完整的标签 API 响应:', data);
        }

        // 检查 API 错误
        if (data.error) {
            console.error('[Anthropic Adapter] API 错误响应:', JSON.stringify(data, null, 2));
            throw new Error(`Anthropic API 错误: ${data.error.message || JSON.stringify(data.error)}\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const responseText = data.content?.[0]?.text || '';

        if (!responseText) {
            console.error('[Anthropic Adapter] 空的响应内容。完整数据结构:', JSON.stringify(data, null, 2));
            throw new Error(`来自 Anthropic 的空响应\n完整响应: ${JSON.stringify(data, null, 2)}`);
        }

        const results = this.parseTaggingResponse(responseText, request.notes);

        return {
            results,
            model: this.settings.ai_model_name,
            usage: {
                total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
                prompt_tokens: data.usage?.input_tokens || 0,
                completion_tokens: data.usage?.output_tokens || 0,
            }
        };
    }

    private buildScoringPrompt(request: ScoringBatchRequest): string {
        const basePrompt = request.prompt || this.settings.custom_scoring_prompt;

        // 为配对构建结构化 JSON 数据（与 Gemini 相同的格式）
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
                console.log('[Anthropic Adapter] 原始评分响应:', responseText);
            }

            // 尝试从各种格式中提取 JSON
            let jsonText = '';

            // 方法 1：尝试在 markdown 代码块中查找 JSON
            const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                jsonText = codeBlockMatch[1].trim();
                if (this.settings.enable_debug_logging) {
                    console.log('[Anthropic Adapter] 在代码块中找到 JSON');
                }
            } else {
                // 方法 2：尝试查找原始 JSON 数组
                const jsonMatch = responseText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    jsonText = jsonMatch[0];
                    if (this.settings.enable_debug_logging) {
                        console.log('[Anthropic Adapter] 找到原始 JSON 数组');
                    }
                }
            }

            if (!jsonText) {
                console.warn('[Anthropic Adapter] 在评分响应中未找到 JSON，全文:', responseText);
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
                console.warn(`[Anthropic Adapter] 预期 ${pairs.length} 个分数，但获得了 ${parsed.length} 个`);
            }

            // 如果存在，则按 pair_id 排序，以确保顺序正确
            if (parsed[0]?.pair_id !== undefined) {
                parsed.sort((a, b) => (a.pair_id || 0) - (b.pair_id || 0));
                if (this.settings.enable_debug_logging) {
                    console.log('[Anthropic Adapter] 已按 pair_id 对分数进行排序');
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
            console.error('[Anthropic Adapter] 解析评分响应失败:', error);
            console.error('[Anthropic Adapter] 响应文本为:', responseText);
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
                console.log('[Anthropic Adapter] 原始响应文本:', responseText);
            }

            // 尝试从各种格式中提取 JSON
            let jsonText = '';

            // 方法 1：尝试在 markdown 代码块中查找 JSON
            const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                jsonText = codeBlockMatch[1].trim();
                if (this.settings.enable_debug_logging) {
                    console.log('[Anthropic Adapter] 在代码块中找到 JSON');
                }
            } else {
                // 方法 2：尝试查找原始 JSON 数组
                const jsonMatch = responseText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    jsonText = jsonMatch[0];
                    if (this.settings.enable_debug_logging) {
                        console.log('[Anthropic Adapter] 找到原始 JSON 数组');
                    }
                }
            }

            if (!jsonText) {
                console.warn('[Anthropic Adapter] 在响应中未找到 JSON，全文:', responseText);
                throw new Error('在响应中未找到 JSON 数组');
            }

            const parsed = JSON.parse(jsonText) as TagResult[];

            if (parsed.length !== notes.length) {
                console.warn(`[Anthropic Adapter] 预期 ${notes.length} 个标签结果，但获得了 ${parsed.length} 个`);
            }

            return parsed;
        } catch (error) {
            console.error('[Anthropic Adapter] 解析标记响应失败:', error);
            console.error('[Anthropic Adapter] 响应文本为:', responseText);
            // 如果解析失败，则返回空标签
            return notes.map(note => ({
                note_id: note.note_id,
                tags: [],
                reasoning: '解析 LLM 响应失败'
            }));
        }
    }
}
