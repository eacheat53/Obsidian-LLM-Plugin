import {
    ScoringBatchRequest,
    ScoringBatchResponse,
    TaggingBatchRequest,
    TaggingBatchResponse,
} from '../types/api-types';

/**
 * LLM 提供商适配器接口
 */
export interface LLMAdapter {
    /**
     * 批量评分
     */
    scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse>;

    /**
     * 批量生成标签
     */
    generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse>;
}
