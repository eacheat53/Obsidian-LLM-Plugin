/**
 * API service for external HTTP requests (Jina embeddings and LLM APIs)
 * Uses Obsidian's requestUrl() to avoid CORS issues
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
 * Service for making external API calls
 */
export class APIService {
  private settings: PluginSettings;

  constructor(settings: PluginSettings) {
    this.settings = settings;
  }

  /**
   * Call Jina AI embeddings API
   * Handles batching, error classification, and retries
   *
   * @param request - Batch embedding request
   * @returns Embedding response with vectors
   */
  async callJinaAPI(request: JinaBatchEmbeddingRequest): Promise<JinaEmbeddingResponse> {
    if (!this.settings.jina_api_key) {
      throw new Error('Jina API key not configured. Please set it in plugin settings.');
    }

    // Truncate inputs to max_chars limit
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
      console.log(`[API Service] Calling Jina API with ${request.input.length} texts`);
    }

    const response = await this.makeRequestWithRetry(params);
    const data = JSON.parse(response.text) as JinaEmbeddingResponse;

    if (this.settings.enable_debug_logging) {
      console.log(`[API Service] Jina API returned ${data.data.length} embeddings`);
    }

    return data;
  }

  /**
   * Call LLM API for batch scoring
   * Uses provider adapter pattern (Gemini, OpenAI, etc.)
   *
   * @param request - Batch scoring request
   * @returns Scoring response with AI scores
   */
  async callLLMAPI(request: ScoringBatchRequest): Promise<ScoringBatchResponse> {
    const adapter = this.getLLMAdapter();
    return await adapter.scoreBatch(request);
  }

  /**
   * Call LLM API for batch tag generation
   *
   * @param request - Batch tagging request
   * @returns Tagging response with generated tags
   */
  async callLLMTaggingAPI(request: TaggingBatchRequest): Promise<TaggingBatchResponse> {
    const adapter = this.getLLMAdapter();
    return await adapter.generateTagsBatch(request);
  }

  /**
   * Make HTTP request with retry logic for transient errors
   *
   * @param params - Request parameters
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @returns Response object
   */
  private async makeRequestWithRetry(
    params: RequestUrlParam,
    maxRetries: number = 3
  ): Promise<RequestUrlResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await requestUrl(params);

        // Check for HTTP errors
        if (response.status >= 400) {
          throw classifyAPIError(response.status, response.text);
        }

        return response;
      } catch (error) {
        lastError = error as Error;

        // Only retry transient errors
        if (error instanceof TransientError && attempt < maxRetries - 1) {
          const delay = getRetryDelay(attempt);
          if (this.settings.enable_debug_logging) {
            console.log(`[API Service] Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          }
          await this.sleep(delay);
          continue;
        }

        // Don't retry configuration or content errors
        throw error;
      }
    }

    throw lastError || new Error('Request failed');
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get LLM adapter for configured provider
   */
  private getLLMAdapter(): LLMAdapter {
    switch (this.settings.ai_provider) {
      case 'gemini':
        return new GeminiAdapter(this.settings, this);
      case 'openai':
        return new OpenAIAdapter(this.settings, this);
      case 'custom':
        // Custom provider uses OpenAI-compatible format
        return new OpenAIAdapter(this.settings, this);
      default:
        throw new Error(`Unsupported LLM provider: ${this.settings.ai_provider}`);
    }
  }

  /**
   * Make raw HTTP POST request (for adapters to use)
   * Internal method exposed to adapters
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
// LLM Provider Adapters
// ============================================================================

/**
 * Google Gemini adapter
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
      throw new Error('Gemini API key not configured. Please set it in plugin settings.');
    }

    // Build prompt from note pairs
    const prompt = this.buildScoringPrompt(request);

    // Gemini API endpoint: {base_url}/{model}:generateContent
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
        responseModalities: ["TEXT"],  // Force text-only output
      }
    };

    if (this.settings.enable_debug_logging) {
      console.log(`[Gemini Adapter] Scoring ${request.pairs.length} note pairs`);
    }

    const response = await this.apiService.makePostRequest(url, {
      'Content-Type': 'application/json',
    }, body);

    const data = JSON.parse(response.text);

    if (this.settings.enable_debug_logging) {
      console.log('[Gemini Adapter] Full scoring API response:', data);
    }

    // Check for API errors
    if (data.error) {
      console.error('[Gemini Adapter] API error:', data.error);
      throw new Error(`Gemini API error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Check for truncated response (MAX_TOKENS)
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      console.error('[Gemini Adapter] Response truncated due to MAX_TOKENS. Thoughts tokens:', data.usageMetadata?.thoughtsTokenCount);
      throw new Error('Gemini response was truncated (MAX_TOKENS). The model may be in thinking mode. Try reducing batch size or using a different model.');
    }

    // Parse Gemini response
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!responseText) {
      console.error('[Gemini Adapter] Empty scoring response text. Full data structure:', JSON.stringify(data, null, 2));
      throw new Error(`Empty response from Gemini. Finish reason: ${finishReason || 'unknown'}`);
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
      throw new Error('Gemini API key not configured. Please set it in plugin settings.');
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
        responseModalities: ["TEXT"],  // Force text-only output
      }
    };

    if (this.settings.enable_debug_logging) {
      console.log(`[Gemini Adapter] Generating tags for ${request.notes.length} notes`);
    }

    const response = await this.apiService.makePostRequest(url, {
      'Content-Type': 'application/json',
    }, body);

    const data = JSON.parse(response.text);

    if (this.settings.enable_debug_logging) {
      console.log('[Gemini Adapter] Full API response:', data);
    }

    // Check for API errors
    if (data.error) {
      console.error('[Gemini Adapter] API error:', data.error);
      throw new Error(`Gemini API error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Check for truncated response (MAX_TOKENS)
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      console.error('[Gemini Adapter] Response truncated due to MAX_TOKENS. Thoughts tokens:', data.usageMetadata?.thoughtsTokenCount);
      throw new Error('Gemini response was truncated (MAX_TOKENS). The model may be in thinking mode. Try reducing batch size or using a different model.');
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!responseText) {
      console.error('[Gemini Adapter] Empty tagging response text. Full data structure:', JSON.stringify(data, null, 2));
      throw new Error(`Empty response from Gemini. Finish reason: ${finishReason || 'unknown'}`);
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

    // Build structured JSON data for pairs
    const pairsData = request.pairs.map((pair, index) => ({
      pair_id: index + 1,
      note_1: {
        id: pair.note_id_1,
        title: pair.title_1,
        content: pair.content_1.substring(0, 1000)
      },
      note_2: {
        id: pair.note_id_2,
        title: pair.title_2,
        content: pair.content_2.substring(0, 1000)
      },
      similarity_score: parseFloat(pair.similarity_score.toFixed(3))
    }));

    const dataJson = JSON.stringify({ pairs: pairsData }, null, 2);

    const prompt = `${basePrompt}

Please score the following note pairs. The data is provided in JSON format for clarity:

\`\`\`json
${dataJson}
\`\`\`

Respond with a JSON array that matches the pair_ids. Each element must include pair_id, note_id_1, note_id_2, and score (0-10):

[{"pair_id": 1, "note_id_1": "id1", "note_id_2": "id2", "score": 7}, ...]

IMPORTANT: Your response must be a valid JSON array with exactly ${request.pairs.length} elements, one for each pair_id.`;

    return prompt;
  }

  private buildTaggingPrompt(request: TaggingBatchRequest): string {
    const basePrompt = request.prompt || this.settings.custom_tagging_prompt;

    let prompt = `${basePrompt}\n\nGenerate ${request.min_tags || 3}-${request.max_tags || 5} relevant tags for each note:\n\n`;

    request.notes.forEach((note) => {
      prompt += `Note ID: ${note.note_id}\n`;
      prompt += `Title: "${note.title}"\n`;
      prompt += `Content: ${note.content.substring(0, 1000)}\n`;
      if (note.existing_tags.length > 0) {
        prompt += `Existing tags: ${note.existing_tags.join(', ')}\n`;
      }
      prompt += '\n';
    });

    prompt += '\nRespond with JSON array using the exact Note ID from input:\n';
    prompt += '[{"note_id": "<exact UUID from input>", "tags": ["tag1", "tag2"]}, ...]';

    return prompt;
  }

  private parseScoringResponse(responseText: string, pairs: NotePairForScoring[]): ScoreResult[] {
    try {
      if (this.settings.enable_debug_logging) {
        console.log('[Gemini Adapter] Raw scoring response:', responseText);
      }

      // Try to extract JSON from various formats
      let jsonText = '';

      // Method 1: Try to find JSON in markdown code blocks
      const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
        if (this.settings.enable_debug_logging) {
          console.log('[Gemini Adapter] Found JSON in code block');
        }
      } else {
        // Method 2: Try to find raw JSON array
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
          if (this.settings.enable_debug_logging) {
            console.log('[Gemini Adapter] Found raw JSON array');
          }
        }
      }

      if (!jsonText) {
        console.warn('[Gemini Adapter] No JSON found in scoring response, full text:', responseText);
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonText) as Array<{
        pair_id?: number;
        note_id_1: string;
        note_id_2: string;
        score: number;
        reasoning?: string;
      }>;

      // Validate that we got scores for all pairs
      if (parsed.length !== pairs.length) {
        console.warn(`[Gemini Adapter] Expected ${pairs.length} scores, got ${parsed.length}`);
      }

      // Sort by pair_id if present, to ensure correct order
      if (parsed[0]?.pair_id !== undefined) {
        parsed.sort((a, b) => (a.pair_id || 0) - (b.pair_id || 0));
        if (this.settings.enable_debug_logging) {
          console.log('[Gemini Adapter] Sorted scores by pair_id');
        }
      }

      // Convert to ScoreResult format (without pair_id)
      return parsed.map(item => ({
        note_id_1: item.note_id_1,
        note_id_2: item.note_id_2,
        score: item.score,
        reasoning: item.reasoning
      }));
    } catch (error) {
      console.error('[Gemini Adapter] Failed to parse scoring response:', error);
      console.error('[Gemini Adapter] Response text was:', responseText);
      // Return default scores if parsing fails
      return pairs.map(pair => ({
        note_id_1: pair.note_id_1,
        note_id_2: pair.note_id_2,
        score: 5,
        reasoning: 'Failed to parse LLM response'
      }));
    }
  }

  private parseTaggingResponse(responseText: string, notes: NoteForTagging[]): TagResult[] {
    try {
      if (this.settings.enable_debug_logging) {
        console.log('[Gemini Adapter] Raw response text:', responseText);
      }

      // Try to extract JSON from various formats
      let jsonText = '';

      // Method 1: Try to find JSON in markdown code blocks
      const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
        if (this.settings.enable_debug_logging) {
          console.log('[Gemini Adapter] Found JSON in code block');
        }
      } else {
        // Method 2: Try to find raw JSON array
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
          if (this.settings.enable_debug_logging) {
            console.log('[Gemini Adapter] Found raw JSON array');
          }
        }
      }

      if (!jsonText) {
        console.warn('[Gemini Adapter] No JSON found in response, full text:', responseText);
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonText) as TagResult[];

      if (parsed.length !== notes.length) {
        console.warn(`[Gemini Adapter] Expected ${notes.length} tag results, got ${parsed.length}`);
      }

      return parsed;
    } catch (error) {
      console.error('[Gemini Adapter] Failed to parse tagging response:', error);
      console.error('[Gemini Adapter] Response text was:', responseText);
      // Return empty tags if parsing fails
      return notes.map(note => ({
        note_id: note.note_id,
        tags: [],
        reasoning: 'Failed to parse LLM response'
      }));
    }
  }
}

/**
 * OpenAI adapter (GPT-4, GPT-3.5, etc.)
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
      throw new Error('OpenAI API key not configured. Please set it in plugin settings.');
    }

    const prompt = this.buildScoringPrompt(request);

    // OpenAI API endpoint: {base_url}/chat/completions
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
      console.log(`[OpenAI Adapter] Scoring ${request.pairs.length} note pairs`);
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
      throw new Error('OpenAI API key not configured. Please set it in plugin settings.');
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
      console.log(`[OpenAI Adapter] Generating tags for ${request.notes.length} notes`);
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

    let prompt = `${basePrompt}\n\nPlease score the following note pairs on a scale of 0-10 for relevance:\n\n`;

    request.pairs.forEach((pair, index) => {
      prompt += `Pair ${index + 1}:\n`;
      prompt += `Note A: "${pair.title_1}"\n${pair.content_1.substring(0, 500)}\n\n`;
      prompt += `Note B: "${pair.title_2}"\n${pair.content_2.substring(0, 500)}\n\n`;
      prompt += `Similarity Score: ${pair.similarity_score.toFixed(3)}\n\n`;
    });

    prompt += '\nRespond with JSON object containing "scores" array: {"scores": [{"note_id_1": "id1", "note_id_2": "id2", "score": 7, "reasoning": "..."}, ...]}';

    return prompt;
  }

  private buildTaggingPrompt(request: TaggingBatchRequest): string {
    const basePrompt = request.prompt || this.settings.custom_tagging_prompt;

    let prompt = `${basePrompt}\n\nGenerate ${request.min_tags || 3}-${request.max_tags || 5} relevant tags for each note:\n\n`;

    request.notes.forEach((note) => {
      prompt += `Note ID: ${note.note_id}\n`;
      prompt += `Title: "${note.title}"\n`;
      prompt += `Content: ${note.content.substring(0, 500)}\n`;
      if (note.existing_tags.length > 0) {
        prompt += `Existing tags: ${note.existing_tags.join(', ')}\n`;
      }
      prompt += '\n';
    });

    prompt += '\nRespond with JSON object using exact Note IDs from input:\n';
    prompt += '{"results": [{"note_id": "<exact UUID from input>", "tags": ["tag1", "tag2"]}, ...]}';

    return prompt;
  }

  private parseScoringResponse(responseText: string, pairs: NotePairForScoring[]): ScoreResult[] {
    try {
      const parsed = JSON.parse(responseText);
      const scores = parsed.scores || [];

      if (scores.length !== pairs.length) {
        console.warn(`[OpenAI Adapter] Expected ${pairs.length} scores, got ${scores.length}`);
      }

      return scores as ScoreResult[];
    } catch (error) {
      console.error('[OpenAI Adapter] Failed to parse scoring response:', error);
      return pairs.map(pair => ({
        note_id_1: pair.note_id_1,
        note_id_2: pair.note_id_2,
        score: 5,
        reasoning: 'Failed to parse LLM response'
      }));
    }
  }

  private parseTaggingResponse(responseText: string, notes: NoteForTagging[]): TagResult[] {
    try {
      const parsed = JSON.parse(responseText);
      const results = parsed.results || [];

      if (results.length !== notes.length) {
        console.warn(`[OpenAI Adapter] Expected ${notes.length} tag results, got ${results.length}`);
      }

      return results as TagResult[];
    } catch (error) {
      console.error('[OpenAI Adapter] Failed to parse tagging response:', error);
      return notes.map(note => ({
        note_id: note.note_id,
        tags: [],
        reasoning: 'Failed to parse LLM response'
      }));
    }
  }
}

