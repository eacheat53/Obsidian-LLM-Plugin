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
 * LLM 适配器抽象基类
 * 包含所有适配器共享的公共逻辑
 */
export abstract class BaseLLMAdapter implements LLMAdapter {
    protected settings: PluginSettings;
    protected apiService: APIService;
    protected adapterName: string;

    constructor(settings: PluginSettings, apiService: APIService, adapterName: string) {
        this.settings = settings;
        this.apiService = apiService;
        this.adapterName = adapterName;
    }

    // ============================================================================
    // 抽象方法（子类必须实现）
    // ============================================================================

    abstract scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse>;
    abstract generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse>;

    // ============================================================================
    // API 请求配置
    // ============================================================================

    /** 默认的评分请求配置 */
    protected getScoringConfig() {
        return {
            temperature: 0.3,
            maxTokens: 10000,
        };
    }

    /** 默认的标签生成请求配置 */
    protected getTaggingConfig() {
        return {
            temperature: 0.5,
            maxTokens: 10000,
        };
    }

    // ============================================================================
    // 公共解析方法
    // ============================================================================


    /**
     * 解析 LLM 评分响应
     * 支持多种 JSON 格式（代码块、原始数组、直接响应）
     */
    protected parseScoringResponse(responseText: string, pairs: NotePairForScoring[]): ScoreResult[] {
        try {
            if (this.settings.enable_debug_logging) {
                console.log(`[${this.adapterName}] 原始评分响应:`, responseText);
            }

            const jsonText = this.extractJsonFromResponse(responseText);

            if (!jsonText) {
                console.warn(`[${this.adapterName}] 在评分响应中未找到 JSON，全文:`, responseText);
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
                console.warn(`[${this.adapterName}] 预期 ${pairs.length} 个分数，但获得了 ${parsed.length} 个`);
            }

            // 如果存在，则按 pair_id 排序，以确保顺序正确
            if (parsed[0]?.pair_id !== undefined) {
                parsed.sort((a, b) => (a.pair_id || 0) - (b.pair_id || 0));
            }

            // 转换为 ScoreResult 格式（不含 pair_id）
            return parsed.map(item => ({
                note_id_1: item.note_id_1,
                note_id_2: item.note_id_2,
                score: item.score,
                reasoning: item.reasoning
            }));
        } catch (error) {
            console.error(`[${this.adapterName}] 解析评分响应失败:`, error);
            console.error(`[${this.adapterName}] 响应文本为:`, responseText);
            // 如果解析失败，则返回默认分数
            return pairs.map(pair => ({
                note_id_1: pair.note_id_1,
                note_id_2: pair.note_id_2,
                score: 5,
                reasoning: '解析 LLM 响应失败'
            }));
        }
    }

    /**
     * 解析 LLM 标签响应
     */
    protected parseTaggingResponse(responseText: string, notes: NoteForTagging[]): TagResult[] {
        try {
            if (this.settings.enable_debug_logging) {
                console.log(`[${this.adapterName}] 原始标签响应:`, responseText);
            }

            const jsonText = this.extractJsonFromResponse(responseText);

            if (!jsonText) {
                console.warn(`[${this.adapterName}] 在标签响应中未找到 JSON，全文:`, responseText);
                throw new Error('在响应中未找到 JSON 数组');
            }

            const parsed = JSON.parse(jsonText) as TagResult[];

            if (parsed.length !== notes.length) {
                console.warn(`[${this.adapterName}] 预期 ${notes.length} 个标签结果，但获得了 ${parsed.length} 个`);
            }

            return parsed;
        } catch (error) {
            console.error(`[${this.adapterName}] 解析标签响应失败:`, error);
            console.error(`[${this.adapterName}] 响应文本为:`, responseText);
            // 如果解析失败，则返回空标签
            return notes.map(note => ({
                note_id: note.note_id,
                tags: [],
                reasoning: '解析 LLM 响应失败'
            }));
        }
    }

    /**
     * 从 LLM 响应中提取 JSON 文本
     * 支持：markdown 代码块、原始 JSON 数组、直接 JSON
     */
    protected extractJsonFromResponse(responseText: string): string {
        // 方法 1：尝试在 markdown 代码块中查找 JSON
        const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        // 方法 2：尝试查找原始 JSON 数组
        const jsonArrayMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonArrayMatch) {
            return jsonArrayMatch[0];
        }

        // 方法 3：尝试查找 JSON 对象（包含 scores 或 results 字段）
        const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
            try {
                const obj = JSON.parse(jsonObjectMatch[0]);
                // 如果是包含 scores 数组的对象
                if (Array.isArray(obj.scores)) {
                    return JSON.stringify(obj.scores);
                }
                // 如果是包含 results 数组的对象
                if (Array.isArray(obj.results)) {
                    return JSON.stringify(obj.results);
                }
                return jsonObjectMatch[0];
            } catch {
                // 忽略解析错误
            }
        }

        // 方法 4：直接返回整个响应（可能是纯 JSON）
        return responseText.trim();
    }

    // ============================================================================
    // 公共 Prompt 构建方法
    // ============================================================================

    /**
     * 构建评分 Prompt（OpenAI 格式，大多数兼容 API 可用）
     */
    protected buildScoringPrompt(request: ScoringBatchRequest): string {
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

    /**
     * 构建标签生成 Prompt
     */
    protected buildTaggingPrompt(request: TaggingBatchRequest): string {
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

    /**
     * 构建结构化评分 Prompt（Gemini/Anthropic 风格）
     */
    protected buildStructuredScoringPrompt(request: ScoringBatchRequest): string {
        const basePrompt = request.prompt || this.settings.custom_scoring_prompt;

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
}
