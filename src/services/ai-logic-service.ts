/**
 * AI 逻辑服务（核心工作流）
 * 负责相似度计算、AI 打分与标签生成的编排
 */

import { App, TFile } from 'obsidian';
import { PluginSettings } from '../plugin-settings';
import { NoteId, NotePairScore, SimilarityScore } from '../types/index';
import { NotePairForScoring, NoteForTagging } from '../types/api-types';
import { APIService } from './api-service';
import { CacheService } from './cache-service';
import { FailureLogService } from './failure-log-service';
import { cosineSimilarity } from '../utils/vector-math';
import { extractMainContent } from '../utils/frontmatter-parser';
import { ErrorLogger } from '../utils/error-logger';

/**
 * 面向笔记分析的 AI 能力服务
 */
export class AILogicService {
  private app: App;
  private settings: PluginSettings;
  private apiService: APIService;
  private cacheService: CacheService;
  private failureLogService: FailureLogService | null;
  private errorLogger: ErrorLogger | null;

  constructor(
    app: App,
    settings: PluginSettings,
    apiService: APIService,
    cacheService: CacheService,
    failureLogService?: FailureLogService,
    errorLogger?: ErrorLogger
  ) {
    this.app = app;
    this.settings = settings;
    this.apiService = apiService;
    this.cacheService = cacheService;
    this.failureLogService = failureLogService || null;
    this.errorLogger = errorLogger || null;
  }

  /**
   * 仅计算“涉及特定笔记”的余弦相似度（智能模式用）
   * 只为发生变化的笔记与全量笔记生成组合并计算相似度
   *
   * @param embeddings - 全量笔记的向量 Map（note_id -> 向量）
   * @param targetNoteIds - 发生变化、需要重算的笔记集合
   * @returns 涉及目标笔记且相似度超过阈值的配对列表
   */
  async calculateSimilaritiesForNotes(
    embeddings: Map<NoteId, number[]>,
    targetNoteIds: Set<NoteId>
  ): Promise<NotePairScore[]> {
    const pairs: NotePairScore[] = [];
    const pairKeySet = new Set<string>();
    const noteIds = Array.from(embeddings.keys());

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Calculating similarities for ${targetNoteIds.size} changed notes against ${noteIds.length} total notes`);
    }

    // 对每个变化的笔记，与所有其它笔记计算相似度
    for (const targetId of targetNoteIds) {
      const targetEmbedding = embeddings.get(targetId);
      if (!targetEmbedding) continue;

      for (const otherId of noteIds) {
        // 跳过与自身比较
        if (targetId === otherId) continue;

        const otherEmbedding = embeddings.get(otherId);
        if (!otherEmbedding) continue;

        // Calculate cosine similarity
        const similarity = cosineSimilarity(targetEmbedding, otherEmbedding);

        // Only keep pairs above threshold
        if (similarity >= this.settings.similarity_threshold) {
          // 固定配对顺序（字典序较小的 ID 在前）
          const [noteId1, noteId2] = targetId < otherId ? [targetId, otherId] : [otherId, targetId];

          pairs.push({
            note_id_1: noteId1,
            note_id_2: noteId2,
            similarity_score: similarity,
            ai_score: 0, // Will be filled by scorePairs()
            last_scored: Date.now(),
          });
        }
      }
    }

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Found ${pairs.length} pairs involving changed notes above threshold ${this.settings.similarity_threshold}`);
    }

    return pairs;
  }

  /**
   * 计算全量笔记两两之间的余弦相似度
   * 使用向量化处理以提升性能
   *
   * @param embeddings - 笔记向量映射（note_id -> 向量）
   * @returns 超过阈值的配对列表
   */
  async calculateSimilarities(
    embeddings: Map<NoteId, number[]>
  ): Promise<NotePairScore[]> {
    const pairs: NotePairScore[] = [];
    const pairKeySet = new Set<string>();
    const noteIds = Array.from(embeddings.keys());

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Calculating similarities for ${noteIds.length} notes`);

      // 调试：检查所有向量是否异常一致
      const firstEmbedding = embeddings.get(noteIds[0]);
      let allIdentical = true;
      let sampleDifferences = 0;

      for (let i = 1; i < noteIds.length && allIdentical; i++) {
        const emb = embeddings.get(noteIds[i]);
        if (emb && firstEmbedding) {
          for (let j = 0; j < Math.min(10, emb.length); j++) {
            if (Math.abs(emb[j] - firstEmbedding[j]) > 0.0001) {
              allIdentical = false;
              sampleDifferences++;
              break;
            }
          }
        }
      }

      if (allIdentical) {
        console.warn('[AI Logic] ⚠️ WARNING: All embeddings appear to be identical! Check Jina API response.');
      } else {
        console.log('[AI Logic] Embeddings are different (good)');
      }

      // 打印向量统计信息
      if (firstEmbedding) {
        console.log('[AI Logic] Embedding dimension:', firstEmbedding.length);
        console.log('[AI Logic] Sample values:', firstEmbedding.slice(0, 5));
      }
    }

    // 调试：统计相似度分布
    const similarityBuckets = new Map<string, number>([
      ['0.0-0.5', 0],
      ['0.5-0.6', 0],
      ['0.6-0.7', 0],
      ['0.7-0.8', 0],
      ['0.8-0.9', 0],
      ['0.9-1.0', 0],
    ]);

    // 计算两两相似度
    for (let i = 0; i < noteIds.length; i++) {
      for (let j = i + 1; j < noteIds.length; j++) {
        const noteId1 = noteIds[i];
        const noteId2 = noteIds[j];
        const embedding1 = embeddings.get(noteId1)!;
        const embedding2 = embeddings.get(noteId2)!;

        // Calculate cosine similarity
        const similarity = cosineSimilarity(embedding1, embedding2);

        // Update distribution buckets for debugging
        if (this.settings.enable_debug_logging) {
          if (similarity < 0.5) similarityBuckets.set('0.0-0.5', similarityBuckets.get('0.0-0.5')! + 1);
          else if (similarity < 0.6) similarityBuckets.set('0.5-0.6', similarityBuckets.get('0.5-0.6')! + 1);
          else if (similarity < 0.7) similarityBuckets.set('0.6-0.7', similarityBuckets.get('0.6-0.7')! + 1);
          else if (similarity < 0.8) similarityBuckets.set('0.7-0.8', similarityBuckets.get('0.7-0.8')! + 1);
          else if (similarity < 0.9) similarityBuckets.set('0.8-0.9', similarityBuckets.get('0.8-0.9')! + 1);
          else similarityBuckets.set('0.9-1.0', similarityBuckets.get('0.9-1.0')! + 1);
        }

        // 仅保留超过阈值的配对，且去重
        if (similarity >= this.settings.similarity_threshold) {
          const key = noteId1 < noteId2 ? `${noteId1}:${noteId2}` : `${noteId2}:${noteId1}`;
          if (!pairKeySet.has(key)) {
            pairKeySet.add(key);
            pairs.push({
              note_id_1: noteId1,
              note_id_2: noteId2,
              similarity_score: similarity,
              ai_score: 0,
              last_scored: Date.now(),
            });
          }
        }
      }
    }

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Similarity distribution (out of ${noteIds.length * (noteIds.length - 1) / 2} total pairs):`);
      console.log('  0.0-0.5:', similarityBuckets.get('0.0-0.5'));
      console.log('  0.5-0.6:', similarityBuckets.get('0.5-0.6'));
      console.log('  0.6-0.7:', similarityBuckets.get('0.6-0.7'));
      console.log('  0.7-0.8:', similarityBuckets.get('0.7-0.8'));
      console.log('  0.8-0.9:', similarityBuckets.get('0.8-0.9'));
      console.log('  0.9-1.0:', similarityBuckets.get('0.9-1.0'));
      console.log(`[AI Logic] Found ${pairs.length} pairs above threshold ${this.settings.similarity_threshold}`);
    }

    return pairs;
  }

  /**
   * 使用 LLM 对配对进行相关性打分
   * 按批次调用 API 以提高效率
   *
   * @param pairs - 待打分的配对
   * @returns 带有 AI 分数的配对结果
   */
  async scorePairs(pairs: NotePairScore[], shouldCancel?: () => boolean): Promise<NotePairScore[]> {
    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Scoring ${pairs.length} pairs in batches of ${this.settings.batch_size_scoring}`);
    }

    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) {
      throw new Error('Master index not loaded');
    }

    // ✅ 获取失败集合中的评分失败操作，强制重新评分
    let pairsToScore = [...pairs];
    if (this.failureLogService) {
      const failedOps = await this.failureLogService.getUnresolvedFailures();
      const scoringFailures = failedOps.filter(op => op.operation_type === 'scoring');

      if (scoringFailures.length > 0) {
        console.log(`[AI Logic] 发现 ${scoringFailures.length} 个失败的评分操作，将强制重新评分`);

        // 从失败操作中提取笔记对
        const failedPairKeys = new Set<string>();
        for (const op of scoringFailures) {
          for (const item of op.batch_info.items) {
            failedPairKeys.add(item); // item格式: "uuid1:uuid2"
          }
        }

        // 将失败的笔记对添加到待评分列表（即使它们已经有分数）
        for (const pairKey of failedPairKeys) {
          const [noteId1, noteId2] = pairKey.split(':');

          // 检查是否已经在待评分列表中
          const alreadyIncluded = pairsToScore.some(
            p => (p.note_id_1 === noteId1 && p.note_id_2 === noteId2) ||
                 (p.note_id_1 === noteId2 && p.note_id_2 === noteId1)
          );

          if (!alreadyIncluded) {
            // 从masterIndex获取现有分数（可能是旧的/失败的）
            const existingScore = masterIndex.scores[pairKey];
            if (existingScore) {
              pairsToScore.push(existingScore);
            } else {
              // 如果masterIndex中没有，创建一个基本的配对
              pairsToScore.push({
                note_id_1: noteId1,
                note_id_2: noteId2,
                similarity_score: 0.5, // 默认值，会被重新计算
                ai_score: 0,
                last_scored: 0,
              });
            }
          }
        }

        console.log(`[AI Logic] 总共需要评分 ${pairsToScore.length} 个笔记对（包含 ${failedPairKeys.size} 个失败重试）`);
      }
    }

    if (pairsToScore.length === 0) {
      return [];
    }

    // 按批次处理
    const batchSize = this.settings.batch_size_scoring;
    const scoredPairs: NotePairScore[] = [];
    const totalBatches = Math.ceil(pairsToScore.length / batchSize);
    let failedBatchCount = 0;

    for (let i = 0; i < pairsToScore.length; i += batchSize) {
      if (shouldCancel && shouldCancel()) {
        console.warn('[AI Logic] 评分已被取消');
        throw new Error('Task cancelled by user');
      }

      const batch = pairsToScore.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      try {
        // 构建供 API 使用的配对数据
        const pairsForScoring: NotePairForScoring[] = await Promise.all(
          batch.map(async pair => {
            const note1 = masterIndex.notes[pair.note_id_1];
            const note2 = masterIndex.notes[pair.note_id_2];

            // 获取文件对象
            const file1 = this.app.vault.getAbstractFileByPath(note1.file_path) as TFile;
            const file2 = this.app.vault.getAbstractFileByPath(note2.file_path) as TFile;

            // Get content and extract main content (YAML之后，HASH_BOUNDARY之前)
            const fullContent1 = file1 ? await this.app.vault.read(file1) : '';
            const fullContent2 = file2 ? await this.app.vault.read(file2) : '';
            const mainContent1 = extractMainContent(fullContent1);
            const mainContent2 = extractMainContent(fullContent2);

            return {
              note_id_1: pair.note_id_1,
              note_id_2: pair.note_id_2,
              title_1: file1?.basename || 'Unknown',
              title_2: file2?.basename || 'Unknown',
              content_1: mainContent1.substring(0, this.settings.llm_scoring_max_chars), // Only main content, limit for API
              content_2: mainContent2.substring(0, this.settings.llm_scoring_max_chars), // Only main content, limit for API
              similarity_score: pair.similarity_score,
            };
          })
        );

        // 调用 LLM API 进行打分
        const response = await this.apiService.callLLMAPI({ pairs: pairsForScoring });

        // 已移除此处的人类可读日志，避免与主流程重复输出
        if (this.settings.enable_debug_logging) {
          try {
            // no-op
          } catch (e) {
            console.warn('[AI Logic] 可读评分日志输出失败：', e);
          }
        }

        // 合并 AI 分数到配对结果中，并立即保存到 masterIndex
        for (let j = 0; j < batch.length; j++) {
          const pair = batch[j];
          const scoreResult = response.scores[j];

          const scoredPair: NotePairScore = {
            ...pair,
            ai_score: scoreResult?.score || 0,
            last_scored: Date.now(),
          };

          scoredPairs.push(scoredPair);

          // ✅ 立即保存到 masterIndex.scores
          const pairKey = `${scoredPair.note_id_1}:${scoredPair.note_id_2}`;
          masterIndex.scores[pairKey] = scoredPair;
        }

        // ✅ 立即持久化到磁盘（增量保存）
        await this.cacheService.saveMasterIndex(masterIndex);
        this.cacheService.setMasterIndex(masterIndex);

        // ✅ 成功后删除失败集合中的相关记录
        if (this.failureLogService) {
          const batchPairKeys = batch.map(p => `${p.note_id_1}:${p.note_id_2}`);
          const failedOps = await this.failureLogService.getUnresolvedFailures();

          for (const op of failedOps) {
            if (op.operation_type === 'scoring') {
              // 检查这个失败操作中的笔记对是否在当前成功的批次中
              const hasSuccessfulPairs = op.batch_info.items.some(item =>
                batchPairKeys.includes(item)
              );

              if (hasSuccessfulPairs) {
                await this.failureLogService.deleteFailure(op.id);
                if (this.settings.enable_debug_logging) {
                  console.log(`[AI Logic] 已从失败集合中删除评分操作: ${op.id}`);
                }
              }
            }
          }
        }

        if (this.settings.enable_debug_logging) {
          console.log(`[AI Logic] Scored batch ${batchNumber}/${totalBatches} (saved to disk)`);
        }

      } catch (error) {
        failedBatchCount++;
        const err = error as Error;
        const errorMessage = err.message || String(error);

        // 检查是否是连接关闭错误
        const isConnectionClosed = errorMessage.includes('ERR_CONNECTION_CLOSED') ||
                                   errorMessage.includes('connection closed') ||
                                   errorMessage.includes('socket hang up');

        if (isConnectionClosed) {
          console.error(`[AI Logic] Batch ${batchNumber}/${totalBatches} 失败：连接被关闭`);
          console.error(`[AI Logic] 这通常是由于请求体过大或请求超时导致的`);
          console.error(`[AI Logic] 建议：`);
          console.error(`  1. 减小批处理大小（当前: ${this.settings.batch_size_scoring}，建议: ${Math.max(1, Math.floor(this.settings.batch_size_scoring / 2))}）`);
          console.error(`  2. 减小 llm_scoring_max_chars（当前: ${this.settings.llm_scoring_max_chars}，建议: ${Math.max(500, Math.floor(this.settings.llm_scoring_max_chars / 2))}）`);
          console.error(`  3. 检查网络连接是否稳定`);
        } else {
          console.error(`[AI Logic] Batch ${batchNumber}/${totalBatches} failed:`, errorMessage);
        }

        // ✅ 记录失败批次到日志
        if (this.failureLogService) {
          const pairKeys = batch.map(p => `${p.note_id_1}:${p.note_id_2}`);

          // 获取文件路径用于可读日志
          const masterIndex = this.cacheService.getMasterIndex();
          const displayItems = batch.map(p => {
            const path1 = masterIndex?.notes[p.note_id_1]?.file_path || p.note_id_1;
            const path2 = masterIndex?.notes[p.note_id_2]?.file_path || p.note_id_2;
            return `${path1} <-> ${path2}`;
          });

          await this.failureLogService.recordFailure({
            operation_type: 'scoring',
            batch_info: {
              batch_number: batchNumber,
              total_batches: totalBatches,
              items: pairKeys,
              display_items: displayItems,
            },
            error: {
              message: err.message,
              type: err.name,
              stack: err.stack,
              status: 'status' in err ? (err as any).status : undefined,
            },
          });
        }

        // ✅ 记录详细错误日志
        if (this.errorLogger) {
          const pairKeys = batch.map(p => `${p.note_id_1}:${p.note_id_2}`);
          await this.errorLogger.logBatchFailure({
            operation_type: 'scoring',
            batch_number: batchNumber,
            total_batches: totalBatches,
            items: pairKeys,
            error: err,
            provider: this.settings.ai_provider,
            model: this.settings.ai_model_name,
          });
        }

        // ⚠️ 继续处理下一批次（不中断整个流程）
        continue;
      }
    }

    if (failedBatchCount > 0) {
      console.warn(`[AI Logic] ${failedBatchCount}/${totalBatches} batches failed. Check logs for details.`);
    }

    return scoredPairs;
  }

  /**
   * 批量为多个笔记生成 AI 标签
   * 按 batch_size_tagging 分批处理，支持增量保存和错误恢复
   *
   * @param noteIds - 需要生成标签的笔记 ID 列表
   * @param shouldCancel - 取消检查函数
   * @param onBatchComplete - 批次完成回调，用于立即写入YAML（可选）
   * @returns note_id -> 生成标签 的映射
   */
  async generateTagsBatch(
    noteIds: NoteId[],
    shouldCancel?: () => boolean,
    onBatchComplete?: (batchResults: Map<NoteId, string[]>) => Promise<void>
  ): Promise<Map<NoteId, string[]>> {
    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) {
      throw new Error('Master index not loaded');
    }

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Generating tags for ${noteIds.length} notes`);
    }

    // ✅ 获取失败集合中的标签失败操作，强制重新生成
    let noteIdsToTag = [...noteIds];
    if (this.failureLogService) {
      const failedOps = await this.failureLogService.getUnresolvedFailures();
      const taggingFailures = failedOps.filter(op => op.operation_type === 'tagging');

      if (taggingFailures.length > 0) {
        console.log(`[AI Logic] 发现 ${taggingFailures.length} 个失败的标签操作，将强制重新生成`);

        // 从失败操作中提取笔记ID
        const failedNoteIds = new Set<string>();
        for (const op of taggingFailures) {
          for (const item of op.batch_info.items) {
            failedNoteIds.add(item); // item就是note_id
          }
        }

        // 将失败的笔记ID添加到待标签列表（即使它们已经有标签）
        for (const noteId of failedNoteIds) {
          if (!noteIdsToTag.includes(noteId)) {
            noteIdsToTag.push(noteId);
          }
        }

        console.log(`[AI Logic] 总共需要生成标签的笔记 ${noteIdsToTag.length} 个（包含 ${failedNoteIds.size} 个失败重试）`);
      }
    }

    const resultMap = new Map<NoteId, string[]>();
    const batchSize = this.settings.batch_size_tagging;
    const totalBatches = Math.ceil(noteIdsToTag.length / batchSize);
    let failedBatchCount = 0;

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Processing ${noteIdsToTag.length} notes in ${totalBatches} batches`);
    }

    // 按批次处理
    for (let i = 0; i < noteIdsToTag.length; i += batchSize) {
      if (shouldCancel && shouldCancel()) {
        console.warn('[AI Logic] 标签生成已被取消');
        throw new Error('Task cancelled by user');
      }

      const batch = noteIdsToTag.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      try {
        // 准备当前批次的笔记数据
        const notesForTagging: NoteForTagging[] = [];

        for (const noteId of batch) {
          const noteMetadata = masterIndex.notes[noteId];
          if (!noteMetadata) {
            console.warn(`[AI Logic] Note not found in index: ${noteId}`);
            continue;
          }

          // Get file object
          const file = this.app.vault.getAbstractFileByPath(noteMetadata.file_path) as TFile;
          if (!file) {
            console.warn(`[AI Logic] File not found: ${noteMetadata.file_path}`);
            continue;
          }

          // Get content and extract main content (YAML之后，HASH_BOUNDARY之前)
          const fullContent = await this.app.vault.read(file);
          const mainContent = extractMainContent(fullContent);

          notesForTagging.push({
            note_id: noteId,
            title: file.basename,
            content: mainContent.substring(0, this.settings.llm_tagging_max_chars), // Only main content, limit for API
            existing_tags: noteMetadata.tags || [],
          });
        }

        if (notesForTagging.length === 0) {
          if (this.settings.enable_debug_logging) {
            console.log(`[AI Logic] Batch ${batchNumber}/${totalBatches} skipped (no valid notes)`);
          }
          continue;
        }

        // 调用 LLM API 进行标签生成
        const response = await this.apiService.callLLMTaggingAPI({
          notes: notesForTagging,
          min_tags: 3,
          max_tags: 5,
        });

        // 立即保存生成的标签到 masterIndex
        for (const result of response.results) {
          resultMap.set(result.note_id, result.tags);

          // ✅ 立即更新 masterIndex（但不设置 tags_generated_at）
          // tags_generated_at 只有在成功写入 front-matter 后才设置
          if (masterIndex.notes[result.note_id]) {
            masterIndex.notes[result.note_id].tags = result.tags;
            // 注意：不在这里设置 tags_generated_at，因为还没写入文件
            // tags_generated_at 将在 batchInsertTagsWorkflow 写入 front-matter 后设置
          }
        }

        // ✅ 立即持久化到磁盘（增量保存）
        await this.cacheService.saveMasterIndex(masterIndex);
        this.cacheService.setMasterIndex(masterIndex);

        // ✅ 成功后删除失败集合中的相关记录
        if (this.failureLogService) {
          const failedOps = await this.failureLogService.getUnresolvedFailures();

          for (const op of failedOps) {
            if (op.operation_type === 'tagging') {
              // 检查这个失败操作中的笔记ID是否在当前成功的批次中
              const hasSuccessfulNotes = op.batch_info.items.some(item =>
                batch.includes(item)
              );

              if (hasSuccessfulNotes) {
                await this.failureLogService.deleteFailure(op.id);
                if (this.settings.enable_debug_logging) {
                  console.log(`[AI Logic] 已从失败集合中删除标签操作: ${op.id}`);
                }
              }
            }
          }
        }

        if (this.settings.enable_debug_logging) {
          console.log(`[AI Logic] Tagged batch ${batchNumber}/${totalBatches} (${response.results.length} notes, saved to disk)`);
        }

        // ✅ 调用批次完成回调（用于立即写入YAML）
        if (onBatchComplete) {
          const batchResults = new Map<NoteId, string[]>();
          for (const result of response.results) {
            batchResults.set(result.note_id, result.tags);
          }
          await onBatchComplete(batchResults);
        }

      } catch (error) {
        failedBatchCount++;
        const err = error as Error;
        const errorMessage = err.message || String(error);

        // 检查是否是连接关闭错误
        const isConnectionClosed = errorMessage.includes('ERR_CONNECTION_CLOSED') ||
                                   errorMessage.includes('connection closed') ||
                                   errorMessage.includes('socket hang up');

        if (isConnectionClosed) {
          console.error(`[AI Logic] Tag batch ${batchNumber}/${totalBatches} 失败：连接被关闭`);
          console.error(`[AI Logic] 这通常是由于请求体过大或请求超时导致的`);
          console.error(`[AI Logic] 建议：`);
          console.error(`  1. 减小批处理大小（当前: ${this.settings.batch_size_tagging}，建议: ${Math.max(1, Math.floor(this.settings.batch_size_tagging / 2))}）`);
          console.error(`  2. 减小 llm_tagging_max_chars（当前: ${this.settings.llm_tagging_max_chars}，建议: ${Math.max(500, Math.floor(this.settings.llm_tagging_max_chars / 2))}）`);
          console.error(`  3. 检查网络连接是否稳定`);
        } else {
          console.error(`[AI Logic] Tag batch ${batchNumber}/${totalBatches} failed:`, errorMessage);
        }

        // ✅ 记录失败批次到日志
        if (this.failureLogService) {
          // 获取文件路径用于可读日志
          const masterIndex = this.cacheService.getMasterIndex();
          const displayItems = batch.map(noteId => {
            return masterIndex?.notes[noteId]?.file_path || noteId;
          });

          await this.failureLogService.recordFailure({
            operation_type: 'tagging',
            batch_info: {
              batch_number: batchNumber,
              total_batches: totalBatches,
              items: batch,
              display_items: displayItems,
            },
            error: {
              message: err.message,
              type: err.name,
              stack: err.stack,
              status: 'status' in err ? (err as any).status : undefined,
            },
          });
        }

        // ✅ 记录详细错误日志
        if (this.errorLogger) {
          await this.errorLogger.logBatchFailure({
            operation_type: 'tagging',
            batch_number: batchNumber,
            total_batches: totalBatches,
            items: batch,
            error: err,
            provider: this.settings.ai_provider,
            model: this.settings.ai_model_name,
          });
        }

        // ⚠️ 继续处理下一批次（不中断整个流程）
        continue;
      }
    }

    if (failedBatchCount > 0) {
      console.warn(`[AI Logic] ${failedBatchCount}/${totalBatches} tag batches failed. Check logs for details.`);
    }

    return resultMap;
  }

  /**
   * 为单个笔记生成 AI 标签
   * 复用 LLM 批量打标接口
   *
   * @param noteId - 目标笔记 ID
   * @returns 生成的标签数组
   */
  async generateTags(noteId: NoteId): Promise<string[]> {
    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) {
      throw new Error('Master index not loaded');
    }

    const noteMetadata = masterIndex.notes[noteId];
    if (!noteMetadata) {
      throw new Error(`Note not found in index: ${noteId}`);
    }

    // Get file object
    const file = this.app.vault.getAbstractFileByPath(noteMetadata.file_path) as TFile;
    if (!file) {
      throw new Error(`File not found: ${noteMetadata.file_path}`);
    }

    // Get content and extract main content (YAML之后，HASH_BOUNDARY之前)
    const fullContent = await this.app.vault.read(file);
    const mainContent = extractMainContent(fullContent);

    // 组装打标请求
    const noteForTagging: NoteForTagging = {
      note_id: noteId,
      title: file.basename,
      content: mainContent.substring(0, this.settings.llm_tagging_max_chars), // Only main content, limit for API
      existing_tags: noteMetadata.tags || [],
    };

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Generating tags for note: ${file.basename}`);
    }

    // 调用 LLM API
    const response = await this.apiService.callLLMTaggingAPI({
      notes: [noteForTagging],
      min_tags: 3,
      max_tags: 5,  // Updated to match new prompt limit
    });

    const tags = response.results[0]?.tags || [];

    if (this.settings.enable_debug_logging) {
      console.log(`[AI Logic] Generated ${tags.length} tags: ${tags.join(', ')}`);
    }

    return tags;
  }

  /**
   * 按配置阈值过滤配对
   * 同时应用 similarity_threshold 与 min_ai_score
   *
   * @param pairs - 已打分的配对
   * @returns 满足阈值条件的配对
   */
  filterByThresholds(pairs: NotePairScore[]): NotePairScore[] {
    return pairs.filter(pair =>
      pair.similarity_score >= this.settings.similarity_threshold &&
      pair.ai_score >= this.settings.min_ai_score
    );
  }

  /**
   * 判断配对是否可跳过（智能模式）
   * 通过缓存中已有分数的时效判断
   *
   * @param noteId1 - 笔记 1 的 ID
   * @param noteId2 - 笔记 2 的 ID
   * @param forceMode - 强制模式下不跳过
   * @returns 是否跳过该配对
   */
  shouldSkipPair(noteId1: NoteId, noteId2: NoteId, forceMode: boolean): boolean {
    if (forceMode) {
      return false;
    }

    const masterIndex = this.cacheService.getMasterIndex();
    if (!masterIndex) {
      return false;
    }

    // 查询缓存中是否已有该配对
    const pairKey = this.createPairKey(noteId1, noteId2);
    const existingScore = masterIndex.scores[pairKey];

    // 若评分较新则跳过
    if (existingScore) {
      const ageInDays = (Date.now() - existingScore.last_scored) / (1000 * 60 * 60 * 24);
      // Skip if scored within last 7 days
      return ageInDays < 7;
    }

    return false;
  }

  /**
   * 生成打分配对的复合键
   * 保证顺序一致（字典序较小的 ID 在前）
   *
   * @param noteId1 - 笔记 1 的 ID
   * @param noteId2 - 笔记 2 的 ID
   * @returns 复合键字符串
   */
  private createPairKey(noteId1: NoteId, noteId2: NoteId): string {
    return noteId1 < noteId2 ? `${noteId1}:${noteId2}` : `${noteId2}:${noteId1}`;
  }
}
