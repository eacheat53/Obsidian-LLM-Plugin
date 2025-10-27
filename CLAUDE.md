<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Obsidian LLM Plugin** is a pure TypeScript Obsidian plugin that uses AI embeddings (Jina) and LLM scoring (Gemini/OpenAI/Anthropic) to automatically create intelligent links between semantically related notes. Features incremental updates via content hashing, sharded caching architecture, and full internationalization (English/Chinese).

## Build Commands

```bash
# Development build with watch mode
npm run dev

# Production build (TypeScript type check + ESBuild bundle)
npm run build

# Lint TypeScript files
npm run lint

# Install dependencies
npm install
```

**Build outputs**: `main.js`, `manifest.json`, `styles.css` (ready for Obsidian plugin directory)

## Recent Updates (2025-10-28)

### Edge Case Fixes and Robustness Improvements

A comprehensive edge case audit was conducted, resulting in 10 critical fixes across high/medium/low priority categories. All fixes have been implemented, tested, and documented.

**High Priority (5/5 completed)**:
1. ✅ **note_id Type Tolerance** - Auto-convert numbers to strings
2. ✅ **CRLF/LF Support** - Handle both Windows and Unix line endings
3. ✅ **YAML Error Notification** - Collect and display parsing errors to users
4. ✅ **HASH_BOUNDARY Auto-completion** - Prevent infinite reprocessing loops
5. ✅ **Empty Front-matter Support** - Handle `---\n---\n` format

**Medium Priority (3/3 completed)**:
6. ✅ **File Rename Monitoring** - Auto-update cache when files are renamed
7. ✅ **File Delete Cleanup** - Auto-clean cache when files are deleted
8. ✅ **Broken Link Cleanup** - Remove ledger entries for deleted notes

**Low Priority (2/2 completed)**:
9. ✅ **Cache Health Check Tool** - Non-destructive diagnostics
10. ✅ **Manual Cleanup Tool** - Remove orphaned data on demand

**Key Improvements**:
- **Cross-platform compatibility**: Works seamlessly on Windows, Mac, Linux
- **User visibility**: YAML errors now clearly notified instead of silent failures
- **Real-time sync**: Cache automatically stays in sync with vault changes
- **Maintenance tools**: Health check and cleanup accessible from ribbon menu
- **Robustness**: Handles edge cases that previously caused silent failures

**Documentation**:
- `EDGE_CASES_AUDIT.md` - Complete edge case analysis (11KB)
- `FIXES_SUMMARY.md` - High priority fixes details (7.1KB)
- `MEDIUM_LOW_PRIORITY_FIXES.md` - Medium/low priority fixes (9.3KB)

**Testing**: All fixes verified with comprehensive test scripts. Build passes with no errors.

## Architecture Overview

### Service-Oriented Design

```
Main Plugin (src/main.ts)
├── CacheService          # Master index + sharded embeddings storage
├── NoteProcessorService  # Vault scanning, UUID/HASH_BOUNDARY management
├── APIService            # HTTP client with LLM adapter pattern (Gemini/OpenAI/Anthropic)
├── AILogicService        # Cosine similarity, LLM scoring, tag generation
├── LinkInjectorService   # WikiLink insertion after HASH_BOUNDARY marker
└── TaskManagerService    # Background task orchestration with mutex locking
```

### Cache Architecture (Critical Design)

**Master Index + Sharded Embeddings** pattern:

```
.obsidian/plugins/obsidian-llm-plugin/cache/
├── index.json                    # Master index (metadata + scores)
└── embeddings/
    ├── {uuid1}.json             # Per-note embedding vectors (768-1024 floats)
    ├── {uuid2}.json
    └── ...
```

**Master Index Structure**:
```typescript
{
  version: "1.0.0",
  notes: {
    [noteId]: {
      note_id: string,
      file_path: string,
      content_hash: string,      // SHA-256 for incremental updates
      last_processed: number,
      tags: string[],
      has_frontmatter: boolean,
      has_hash_boundary: boolean
    }
  },
  scores: {
    "uuid1:uuid2": {              // Flat storage (pair key)
      note_id_1: string,
      note_id_2: string,
      similarity_score: number,  // Cosine similarity (0-1)
      ai_score: number,          // LLM score (0-10)
      last_scored: number
    }
  },
  stats: { total_notes, total_embeddings, total_scores, orphaned_notes }
}
```

**Performance Optimization**: The `CacheService` builds a bidirectional in-memory index from flat scores for O(1) lookups:
```typescript
// Disk: { "id1:id2": score }
// Memory: Map<id1, Map<id2, score>> + Map<id2, Map<id1, score>>
```

This enables `getScoresForNote(noteId)` to return all related scores instantly without scanning.

### Main Workflow: Process Notes and Insert Links

1. **Load master index** (creates if missing)
2. **Scan vault** (respecting `excluded_folders` and `excluded_patterns`)
3. **Ensure HASH_BOUNDARY** markers exist (adds if missing)
4. **For each note**:
   - Ensure UUID in front-matter
   - Extract main content (after YAML, before `<!-- HASH_BOUNDARY -->`)
   - Calculate SHA-256 hash
   - **Skip if unchanged** (90%+ time savings on subsequent runs)
   - Generate embedding via Jina API
   - Save to sharded file `embeddings/{uuid}.json`
5. **Calculate similarities**: Cosine similarity O(n²) for all pairs
6. **Filter by threshold**: Only keep pairs above `similarity_threshold`
7. **Score with LLM**: Batch scoring (default: 10 pairs per request)
8. **Filter by score**: Only keep pairs above `min_ai_score`
9. **Insert links**: Top N links (default: 7) after HASH_BOUNDARY
10. **Save scores**: Update master index with new scores

### HASH_BOUNDARY Marker System

**Critical design decision**: The `<!-- HASH_BOUNDARY -->` marker separates user content from plugin-generated content.

```markdown
---
note_id: 550e8400-e29b-41d4-a716-446655440000
tags: [ai, knowledge]
---

# User Content

User writes here...

<!-- HASH_BOUNDARY -->
- [[Suggested Link 1]]
- [[Suggested Link 2]]
```

**Why this matters**:
- Only content **before** HASH_BOUNDARY is hashed for change detection
- Prevents infinite reprocessing loops (link changes don't affect hash)
- Placed at **end of note** (not after front-matter)

### Unidirectional Link Insertion

**Critical design decision**: Links are inserted in **one direction only** to leverage Obsidian's built-in backlinks feature.

**Problem with bidirectional links**:
- For related notes A and B, creating both A→B and B→A is redundant
- Doubles the number of links inserted
- Obsidian automatically shows backlinks in the sidebar

**Solution**: Only insert links where current note is `note_id_1` in the pair
```typescript
// In LinkInjectorService.findBestLinks()
const relevantPairs = scoredPairs.filter(
  pair => pair.note_id_1 === noteId  // Only when this note is the "first" in pair
);
```

**Result**:
- For pair (A, B): Only insert link B in note A
- Note B shows A in its backlinks panel automatically
- **50% reduction** in link insertions while maintaining full connectivity

**Important**: This relies on `NotePairScore` storing pairs in canonical order (note_id_1 < note_id_2).

### LLM Provider Adapter Pattern

```typescript
interface LLMAdapter {
  scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse>;
  generateTagsBatch(request: TaggingBatchRequest): Promise<TaggingBatchResponse>;
}
```

**Concrete adapters**:
- `GeminiAdapter` - Google Gemini API
- `OpenAIAdapter` - OpenAI/custom OpenAI-compatible APIs
- Easy to add: Anthropic Claude, local LLMs, etc.

**Adding a new provider**:
1. Create adapter class in `src/services/api-service.ts`
2. Add to `LLMProvider` type in `src/types/api-types.ts`
3. Add default config to `DEFAULT_SETTINGS.provider_configs`
4. Update translations in `src/i18n/translations.ts`

### JSON-Based AI Prompting

The plugin sends **structured JSON** to LLMs to reduce hallucination:

**Scoring input**:
```json
{
  "pairs": [
    {
      "pair_id": 1,
      "note_1": {"id": "uuid", "title": "...", "content": "..."},
      "note_2": {"id": "uuid", "title": "...", "content": "..."},
      "similarity_score": 0.85
    }
  ]
}
```

**Expected output**:
```json
[
  {"pair_id": 1, "note_id_1": "uuid1", "note_id_2": "uuid2", "score": 8}
]
```

**Important**: `pair_id` ensures correct ordering when parsing responses (LLMs may reorder).

## Critical Implementation Details

### 1. Incremental Updates (Performance)

SHA-256 content hashing enables skip-if-unchanged optimization:

```typescript
const contentHash = calculateSHA256(mainContent);
if (existingNote?.content_hash === contentHash) {
  // Skip - load cached embedding
  const cached = await loadEmbedding(noteId);
} else {
  // Regenerate embedding
  const response = await callJinaAPI({ input: [mainContent] });
}
```

**Impact**: 90%+ reduction in processing time for subsequent runs.

**Enhanced with immediate persistence**: As of the incremental persistence optimization, embeddings are now saved to disk immediately after each successful API call, ensuring no data loss on workflow interruption.

```typescript
// After successful embedding generation
await this.cacheService.saveEmbedding({ note_id, embedding, ... });
await this.cacheService.saveMasterIndex(masterIndex);  // ✅ Immediate save
```

### 2. Incremental Persistence and Failure Recovery

**Design Goal**: Preserve all completed work when workflows are interrupted or fail mid-execution.

**Implementation** (`src/main.ts:generateEmbeddingsWorkflow`):

1. **Immediate Saves After Each Embedding**:
   ```typescript
   // For each note processed:
   await cacheService.saveEmbedding({ note_id, embedding, ... });
   masterIndex.notes[noteId] = { content_hash, last_processed, ... };
   await cacheService.saveMasterIndex(masterIndex);  // ✅ Immediate save
   ```

2. **Failure Recording**:
   ```typescript
   try {
     const response = await apiService.callJinaAPI(...);
     // ... save embedding ...
   } catch (error) {
     await failureLogService.recordFailure({
       operation_type: 'embedding',
       batch_info: { items: [noteId], display_items: [filePath] },
       error: { message, type, stack }
     });
     continue;  // Continue processing remaining notes
   }
   ```

3. **Automatic Failure Cleanup**:
   ```typescript
   // After successful embedding:
   const failedOps = await failureLogService.getUnresolvedFailures();
   for (const op of failedOps) {
     if (op.operation_type === 'embedding' && op.batch_info.items.includes(noteId)) {
       await failureLogService.deleteFailure(op.id);  // ✅ Auto-cleanup
     }
   }
   ```

4. **Smart Mode Failure Retry**:
   ```typescript
   // Before processing loop:
   const failedNoteIds = await failureLogService.getFailedNoteIds();

   // In loop:
   if (failedNoteIds.has(noteId) && !needsUpdate) {
     needsUpdate = true;  // Force retry despite unchanged hash
     console.log(`[Main] 强制重试失败笔记: ${noteId}`);
   }
   ```

**Benefits**:
- **Zero data loss**: Interrupting workflow after 50/100 notes preserves all 50 completed embeddings
- **Automatic recovery**: Failed notes retried automatically on next run (smart mode)
- **Clean failure log**: Successful operations auto-removed from failure log
- **Cost savings**: No redundant API calls for successfully processed items

**Performance Impact**: ~1-5% overhead for incremental saves (acceptable trade-off for data safety)

### 3. Workflow Logic Refinements (State Consistency)

**Design Goal**: Ensure `changedNoteIds` and processing state remain consistent across all edge cases (failures, cancellations, retries).

**Key Refinements** (implemented in "refine-workflow-logic" proposal):

1. **changedNoteIds Only Contains Successful Operations**:
   ```typescript
   // OLD (WRONG): Added before try block
   if (needsUpdate || !existingNote) {
     changedNoteIds.add(noteId);  // ❌ Added even if embedding fails
     try {
       await generateEmbedding();
     } catch (error) { /* ... */ }
   }

   // NEW (CORRECT): Added after successful save
   if (needsUpdate || !existingNote) {
     try {
       await generateEmbedding();
       await saveMasterIndex(masterIndex);
       changedNoteIds.add(noteId);  // ✅ Only added on success
     } catch (error) { /* ... */ }
   }
   ```
   **Impact**: Failed embeddings no longer participate in similarity calculation, preventing logic errors.

2. **Simplified Failure Retry Logic**:
   ```typescript
   // OLD (18 lines of manual loop):
   let failedNoteIds = new Set<NoteId>();
   const embeddingFailures = await failureLogService.getUnresolvedFailures();
   for (const op of embeddingFailures) {
     if (op.operation_type === 'embedding') {
       for (const item of op.batch_info.items) {
         embeddingFailedIds.add(item);
       }
     }
   }

   // NEW (single API call):
   const failedNoteIds = await failureLogService.getFailedNoteIdsByType('embedding');
   ```
   **Benefits**: Code duplication eliminated, uses centralized failure tracking API.

3. **Embedding Verification for Tag Generation**:
   ```typescript
   for (const [noteId, metadata] of Object.entries(masterIndex.notes)) {
     if (!metadata.tags_generated_at) {
       // ✅ Verify embedding exists before generating tags
       const embResult = await cacheService.loadEmbedding(noteId);
       if (embResult.success && embResult.embedding) {
         notesNeedingTags.add(noteId);
       } else if (settings.enable_debug_logging) {
         console.log(`[Main] 跳过标签生成（无 embedding）: ${noteId}`);
       }
     }
   }
   ```
   **Impact**: Tags only generated for notes with embeddings, preventing incomplete semantic understanding.

4. **Comprehensive Processing Statistics**:
   ```typescript
   if (settings.enable_debug_logging) {
     const failedCount = files.length - newEmbeddingsCount - skippedCount;
     console.log(`[Main] Embedding 处理统计:
       - 总笔记: ${files.length}
       - 跳过（hash 未变）: ${skippedCount}
       - 成功生成 embedding: ${newEmbeddingsCount}
       - 失败: ${failedCount}
       - changedNoteIds (成功): ${changedNoteIds.size}
     `);
   }
   ```
   **Benefits**: Clear visibility into workflow execution for debugging.

**Edge Cases Handled**:
- ✅ Embedding fails → Note NOT in `changedNoteIds` → No incorrect similarity calculation
- ✅ Workflow canceled → changedNoteIds only contains completed notes → Correct incremental resume
- ✅ Tag generation without embedding → Skipped with debug log → No incomplete tags
- ✅ Failed note retry → Auto-detected via `getFailedNoteIdsByType()` → Forced update despite unchanged hash

**Success Metrics**:
- `changedNoteIds.size === successfully embedded notes` (exact equality)
- Failed notes auto-retry on next run (smart mode)
- No tags generated for notes without embeddings

### 4. Gemini Thinking Mode Token Consumption

**Problem**: Gemini 2.5 uses "Extended Thinking" mode, consuming significant tokens for internal reasoning.

**Example**:
```
Thoughts tokens: 3626 (internal reasoning)
+ Output tokens: 400 (JSON result)
= Total: 4026 tokens (can exceed maxOutputTokens)
```

**Detection and fix** (`src/services/api-service.ts:250-254`):
```typescript
if (finishReason === 'MAX_TOKENS') {
  console.error('[Gemini Adapter] Response truncated due to MAX_TOKENS. Thoughts tokens:', data.usageMetadata?.thoughtsTokenCount);
  throw new Error('Gemini response truncated. Try reducing batch size or using thinkingBudget.');
}
```

**Mitigations applied**:
- `thinkingBudget: 4000` - Limits thinking tokens to 4000 (default can be up to 24576)
- `maxOutputTokens: 16384` (scoring), `8192` (tagging) - Increased output limits
- `responseModalities: ["TEXT"]` - Force text-only output
- For simple tasks (scoring/tagging), limited thinking improves speed and reduces cost

**Alternative**: Use `gemini-1.5-flash` (no thinking mode) for even faster responses


### 4. Atomic Cache Writes

```typescript
// Write to temp file, then rename (atomic operation)
const tempFile = `${indexFile}.tmp`;
await fs.writeFile(tempFile, content);
await fs.rename(tempFile, indexFile);  // Atomic!
```

Prevents corruption if process crashes mid-write.

### 5. Task Locking Mechanism

The `TaskManagerService` prevents concurrent operations via mutex:

```typescript
if (this.taskLock) {
  throw new Error('Another operation is in progress');
}
this.taskLock = true;
```

Prevents race conditions in cache updates.

### 6. Three-Tier Error Classification

From `src/utils/error-classifier.ts`:

| Type | Action | Examples |
|------|--------|----------|
| **ConfigurationError** | Abort | 401 Unauthorized, 404 Not Found |
| **TransientError** | Retry 3x | 500 Server Error, 429 Rate Limit |
| **ContentError** | Skip item | Content too long, parse errors |

Retry: exponential backoff (1s → 2s → 4s)

### 7. HASH_BOUNDARY Auto-Completion (Prevents Infinite Loops)

**Problem**: If user deletes the `<!-- HASH_BOUNDARY -->` marker, the plugin will hash the entire file (including generated links), causing an infinite reprocessing loop.

**Solution** (`src/services/note-processor.ts:97-111`):
```typescript
async calculateContentHash(file: TFile): Promise<ContentHash> {
  const content = await this.app.vault.read(file);

  // Auto-add missing HASH_BOUNDARY
  if (!content.includes('<!-- HASH_BOUNDARY -->')) {
    if (this.settings.enable_debug_logging) {
      console.log(`[Note Processor] 自动添加 HASH_BOUNDARY 到 ${file.path}`);
    }
    const newContent = content.replace(/\n*$/, '') + '\n<!-- HASH_BOUNDARY -->\n';
    await this.app.vault.modify(file, newContent);
  }

  const mainContent = await this.extractMainContent(file);
  return await calculateContentHash(mainContent);
}
```

**Benefits**:
- ✅ Prevents infinite reprocessing when marker is accidentally deleted
- ✅ Silent auto-fix (only logs in debug mode)
- ✅ Idempotent (safe to call multiple times)

### 8. File System Event Monitoring (Cache Consistency)

**Problem**: When users rename or delete notes outside workflows, cache becomes stale.

**Solution** (`src/main.ts:1507-1621`):

**Event registration**:
```typescript
private registerFileSystemEvents(): void {
  // Monitor file renames
  this.registerEvent(
    this.app.vault.on('rename', async (file, oldPath) => {
      if (file instanceof TFile && file.extension === 'md') {
        await this.handleFileRename(file, oldPath);
      }
    })
  );

  // Monitor file deletions
  this.registerEvent(
    this.app.vault.on('delete', async (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        await this.handleFileDelete(file);
      }
    })
  );
}
```

**Rename handler** (updates file path in cache):
```typescript
private async handleFileRename(file: TFile, oldPath: string): Promise<void> {
  const masterIndex = this.cacheService.getMasterIndex();
  if (!masterIndex) return;

  // Find note by old path and update
  for (const [noteId, meta] of Object.entries(masterIndex.notes)) {
    if (meta.file_path === oldPath) {
      meta.file_path = file.path;
      await this.cacheService.saveMasterIndex(masterIndex);
      break;
    }
  }
}
```

**Delete handler** (comprehensive cleanup):
```typescript
private async handleFileDelete(file: TFile): Promise<void> {
  // 1. Delete note metadata
  delete masterIndex.notes[deletedNoteId];

  // 2. Delete related scores
  for (const key in masterIndex.scores) {
    if (key.includes(deletedNoteId)) {
      delete masterIndex.scores[key];
    }
  }

  // 3. Clean broken links in ledger
  if (masterIndex.link_ledger) {
    const ledger = masterIndex.link_ledger as Record<NoteId, NoteId[]>;
    delete ledger[deletedNoteId];  // Remove as source

    // Remove from target lists
    for (const [sourceId, targets] of Object.entries(ledger)) {
      ledger[sourceId] = targets.filter(id => id !== deletedNoteId);
    }
  }

  // 4. Delete embedding file
  await this.cacheService.deleteEmbedding(deletedNoteId);
}
```

**When automatic cleanup works**:
- ✅ Deleting files in Obsidian
- ✅ Renaming files in Obsidian
- ✅ Moving files between folders in Obsidian

**When manual cleanup needed** (see Cache Maintenance Tools below):
- ❌ Deleting files via external tools (OS file manager, Git)
- ❌ Batch operations via shell scripts
- ❌ Sync conflicts that remove files

**Benefits**:
- Real-time cache consistency
- No orphaned data accumulation during normal usage
- Broken links automatically cleaned

### 9. Cache Maintenance Tools (Manual Cleanup)

**Added UI**: Sidebar menu → 🔍 Health Check / 🧹 Clean Orphaned Data

**Health Check Workflow** (`src/main.ts:1733-1840`):
Non-destructive diagnostics that report issues without modifying data.

**Checks performed**:
1. **Orphaned notes** - Files deleted but cache still contains data
2. **Missing UUIDs** - Notes without `note_id` in front-matter
3. **Missing HASH_BOUNDARY** - Notes missing the separator marker
4. **Broken links** - Ledger entries pointing to deleted notes

**Example report**:
```
⚠️ 发现 3 类问题:

🔸 12 个孤立笔记（文件已删除但缓存仍存在）
🔸 5 个笔记缺少 note_id
🔸 8 个断链（指向不存在的笔记）

建议：使用"清理孤立数据"功能修复
```

**Clean Orphaned Data Workflow** (`src/main.ts:1623-1731`):
Destructive cleanup that removes all orphaned data.

**Cleanup actions**:
1. Scan vault for all existing files
2. Identify notes in cache but not in vault
3. Delete orphaned note metadata
4. Delete related scores
5. Delete orphaned embedding files
6. Clean broken links in ledger

**Result notification**:
```
✅ 清理完成:
- 删除 15 个孤立笔记
- 删除 15 个嵌入文件
- 清理 42 个断链
```

**Recommended usage pattern**:
```
1. Run Health Check → See what's wrong
2. Review the report → Decide if cleanup is needed
3. Run Clean Orphaned Data → Fix all issues
4. Re-run Health Check → Verify fix (should show "缓存健康状况良好")
```

**Implementation**: See `MEDIUM_LOW_PRIORITY_FIXES.md` for complete documentation.

## Common Gotchas

### 1. Forgetting to Rebuild Score Index

After modifying `masterIndex.scores`, always call:
```typescript
this.cacheService.setMasterIndex(masterIndex);
```

This rebuilds the bidirectional in-memory index.

### 2. Content Extraction Order

**Correct order**:
1. Parse front-matter (YAML)
2. Extract body after `---\n---\n`
3. Truncate at `<!-- HASH_BOUNDARY -->`

**Wrong order** includes generated links in hash → infinite reprocessing loop.

### 3. Embedding Dimension Mismatches

Different Jina models have different dimensions:
- `jina-embeddings-v2-base-en`: 768
- `jina-embeddings-v3`: 1024

Mixing embeddings from different models causes cosine similarity errors. **Always clear cache when changing models**.

### 4. Batch Size vs Token Limits

**Gemini Free Tier**: ~32K input tokens
**GPT-4o-mini**: ~128K input tokens

If scoring fails with token errors, reduce `batch_size_scoring`:
- Conservative (safe): 5
- Aggressive (high-context models): 20

### 5. Provider Configuration Persistence

Settings stored per-provider in `provider_configs`. When switching:
1. Current provider's config is saved
2. New provider's config is loaded

**Never directly modify** `ai_api_url`, `ai_api_key`, `ai_model_name` without syncing to `provider_configs`.

### 6. Link Threshold Filtering

Links inserted by the plugin are **always** filtered by current threshold settings:
- `similarity_threshold`: Minimum cosine similarity (default: 0.7)
- `min_ai_score`: Minimum LLM score (default: 7)

**Important**: When you modify thresholds and re-run the workflow (even in smart mode), links that no longer meet the new thresholds will be removed.

**Example**:
- Initial run with `min_ai_score=7` → inserts links with score=7, 8, 9
- User changes `min_ai_score` to 8
- Re-run workflow → removes links with score=7, keeps score=8, 9

This ensures displayed links always match your current quality standards. Both `similarity_threshold` and `min_ai_score` must be satisfied (AND logic, not OR).

**How to apply new thresholds**:
1. **Settings UI** (Recommended): Go to Settings → Link Settings → Click "Recalibrate Now"
2. **Sidebar Menu**: Click ribbon icon → "重新校准链接（应用新阈值）"

Both methods use the same underlying workflow and are instant (no API calls).

**Similarity Threshold Behavior**:
- **Minimum recommended**: 0.7 (enforced in Settings UI)
- **Increasing threshold** (0.7 → 0.8): Only requires recalibration (fast)
- **Decreasing threshold** (0.8 → 0.7): Requires force mode to re-compute similarities
- **Warning**: Values below 0.7 significantly increase candidate pairs sent to LLM, wasting tokens

**Implementation**: `LinkInjectorService._listTargetsFromPairs` filters pairs before selecting top N links, consistent with `AILogicService.filterByThresholds`.

### 7. File System Event Limitations

**Automatic cleanup works for**:
- ✅ Renaming files in Obsidian
- ✅ Deleting files in Obsidian
- ✅ Moving files between folders in Obsidian

**Manual cleanup required for**:
- ❌ Deleting files via OS file manager (Finder, Explorer)
- ❌ Batch operations via shell scripts
- ❌ Git operations (checkout, pull, merge)
- ❌ Sync conflicts that remove files
- ❌ Third-party sync tools (Dropbox, iCloud)

**When to use manual tools**:
1. After using external tools to modify vault
2. After Git operations that delete/rename files
3. After resolving sync conflicts
4. Periodic maintenance (monthly health check)

**Best practice**:
```
1. External batch operation (e.g., git pull)
2. Open Obsidian
3. Click ribbon icon → 🔍 缓存健康检查
4. Review report
5. If issues found → 🧹 清理孤立数据
6. Re-check → Should show "缓存健康状况良好"
```

### 8. Front-matter Parsing Edge Cases (Now Fixed)

These edge cases are **no longer issues** as of 2025-10-28:

**Previously problematic**:
- ❌ Files starting with blank lines
- ❌ Windows CRLF line endings (`\r\n`)
- ❌ Empty front-matter (`---\n---\n`)
- ❌ Numeric `note_id` values

**Now handled automatically**:
- ✅ Leading whitespace auto-trimmed
- ✅ Both LF and CRLF supported
- ✅ Empty front-matter recognized
- ✅ Numeric `note_id` converted to string
- ✅ YAML errors reported with actionable messages

**If you still see parsing issues**:
1. Check console for specific YAML error
2. Verify front-matter syntax at yaml-online-parser.appspot.com
3. Common mistakes: unquoted special chars, inconsistent indentation

### 9. Syncing Content Hash (避免不必要的重新处理)

当您只修改笔记的 front-matter（如添加 `created` 字段）而不改变正文内容时，可能触发不必要的 embedding 重新生成。这通常是因为编辑器自动调整了格式（空行数量、不可见字符等），导致 content hash 改变。

**使用场景**：
- 批量添加 front-matter 字段（如 `created`、`modified`、`tags`）
- 使用格式化工具调整笔记格式
- 明知正文内容未变，但 hash 改变了

**解决方法**：
1. 修改完 front-matter 后
2. 点击侧边栏图标 → "同步内容 Hash（不重新生成 Embedding）"
3. 等待同步完成（显示"✅ 已同步 N 个笔记的 Hash"）
4. 下次运行智能模式时，这些笔记会被跳过

**工作流程**：
```
扫描所有笔记
  ↓
重新计算当前 hash
  ↓
更新 masterIndex.notes[noteId].content_hash
更新 masterIndex.notes[noteId].last_processed
  ↓
保存到磁盘
  ↓
不调用任何 API（Jina/LLM）
不修改 embedding/scores/tags
```

**注意事项**：
- ⚠️ 如果正文内容确实改变了，使用此功能会导致下次智能模式跳过该笔记
- ⚠️ 若误用，可使用强制模式重新处理所有笔记
- ✅ 适用于批量修改 front-matter 后快速同步 hash

**Implementation**: `src/main.ts:syncHashWorkflow()`

## Key Files Reference

### Core Services
- `src/main.ts` - Entry point, workflow orchestration
- `src/services/cache-service.ts` - Master index + sharded storage, bidirectional score index
- `src/services/api-service.ts` - HTTP client, LLM adapters, retry logic
- `src/services/ai-logic-service.ts` - Similarity calculation, scoring, tagging
- `src/services/note-processor.ts` - Vault scanning, UUID management, content extraction

### Utilities
- `src/utils/vector-math.ts` - Cosine similarity (numerically stable with `Math.hypot()`)
- `src/utils/hash-utils.ts` - SHA-256 hashing for change detection
- `src/utils/frontmatter-parser.ts` - Custom YAML parser (no dependencies)
- `src/utils/error-classifier.ts` - Three-tier error classification

### UI Components
- `src/ui/settings-tab.ts` - Settings panel with i18n support
- `src/ui/sidebar-menu.ts` - Ribbon icon menu (5 actions):
  - ⚡ 一键执行（嵌入→打分→插链→打标签）
  - 🔄 重新校准链接（应用新阈值）
  - 🔁 同步内容 Hash
  - 🔍 缓存健康检查 (NEW)
  - 🧹 清理孤立数据 (NEW)
- `src/ui/batch-tag-modal.ts` - Tag generation modal with folder picker

## Known Issues

### 1. Missing Command Registration (Low Priority)

**Location**: `src/main.ts:53`
```typescript
// TODO: Register commands (T040-T043)
```

**Impact**: Keyboard shortcuts unavailable (menu items work via ribbon icon)

### 2. No Per-Note Error Handling in Link Insertion (Medium Priority)

**Location**: `src/main.ts:301-319`

If `insertLinks()` fails for one note, entire batch aborts. Should wrap in try-catch and continue.

### 3. ~~Frontmatter Parser Limitations~~ → Front-matter Parser Robustness (Fixed)

**Status**: Now uses `js-yaml` for robust parsing with comprehensive edge case handling.

**Improvements implemented** (2025-10-28):
- ✅ **CRLF/LF support**: Handles both Windows (`\r\n`) and Unix (`\n`) line endings
- ✅ **Leading whitespace tolerance**: Auto-trims content before parsing
- ✅ **Type coercion**: Automatically converts number `note_id` to string
- ✅ **Empty front-matter**: Supports `---\n---\n` format
- ✅ **Error reporting**: Returns `parseError` field instead of silent failure

**Updated regex** (`src/utils/frontmatter-parser.ts:42`):
```typescript
// Before: /^---\n([\s\S]*?)\n---\n/
// After:  /^---\r?\n([\s\S]*?)(\r?\n)?---\r?\n/
//         ^^^^           ^^^^^^^^
//         CRLF support   Empty FM support
```

**Type tolerance** (`src/utils/frontmatter-parser.ts:62-68`):
```typescript
// Automatically convert note_id to string
if (data.note_id !== undefined && data.note_id !== null) {
  data.note_id = String(data.note_id).trim();
  if (data.note_id === '') {
    delete data.note_id;  // Remove if empty
  }
}
```

**Error handling**:
```typescript
interface FrontMatterData {
  data: Record<string, unknown>;
  raw_yaml: string;
  body: string;
  exists: boolean;
  parseError?: string;  // NEW: Error message if parsing fails
}
```

**User notification** (`src/main.ts:1438-1442`):
```
⚠️ 3 个笔记因 YAML 错误被跳过
请检查控制台日志
```

**Documentation**: See `FIXES_SUMMARY.md` for detailed test results.

## Performance Optimization Guidelines

### For Large Vaults (1000+ notes)

**Recommended settings**:
```typescript
{
  similarity_threshold: 0.75,        // More selective
  min_ai_score: 8,                   // Higher quality
  batch_size_scoring: 15,            // Faster (watch token limits)
  max_links_per_note: 5,             // Reduce spam
  jina_max_chars: 6000,              // Lower API costs
}
```

### Optimization Opportunities (Not Implemented)

1. **Parallel embedding generation**: Use `Promise.all()` with concurrency limit
2. **Incremental score updates**: Only score pairs involving changed notes (90% API call reduction)
3. **Lazy loading of embeddings**: Stream during similarity calculation (80-90% memory reduction)

## Internationalization (i18n)

**Supported languages**: English, Chinese

**Translation structure** (`src/i18n/translations.ts`):
```typescript
{
  sections: {},      // Section headers
  sidebar: {},       // Ribbon menu items
  settings: {},      // Setting names + descriptions
  buttons: {},       // Button text
  notices: {},       // Notification messages
  placeholders: {}, // Input placeholders
  providers: {},     // Provider names
  languages: {}      // Language names
}
```

**Adding a language**:
1. Add to `Language` type in `src/plugin-settings.ts`
2. Add translations to `src/i18n/translations.ts`
3. Update language dropdown

## Debugging

**Enable debug logging**: Settings → Performance and Debugging → Enable Debug Logging

**Console output**:
```
[Main] Processing My Note (changed)
[API Service] Calling Jina API with 1 texts
[Gemini Adapter] Scoring 10 note pairs
[Gemini Adapter] Full scoring API response: {...}
[Link Injector] Inserted 5 links into My Note.md
```

**Common issues**:
- Empty responses: Check `finishReason` for MAX_TOKENS
- Missing links: Verify `similarity_threshold` and `min_ai_score` aren't too restrictive
- High API costs: Enable incremental updates via HASH_BOUNDARY markers

## Design Philosophy

**Minimal Runtime Dependencies**: Only essential production dependencies
- ✅ `js-yaml` - Robust YAML parsing with edge case handling (used as of 2025-10-28)
- ✅ Custom UUID generator (no uuid package)
- ✅ Custom vector math (no numeric library)
- ✅ Custom HTTP client (no axios)

**Why js-yaml was added**:
- Cross-platform compatibility (CRLF/LF)
- Edge case handling (empty front-matter, leading whitespace)
- Type tolerance (number to string conversion)
- Better error messages for users
- Industry-standard, well-tested library

**Trade-off**: ~30KB bundle size increase for significantly improved robustness and user experience. Justified by avoiding silent failures and supporting diverse user environments.

**Overall philosophy**: Prefer custom implementations for simple tasks (UUID, vector math), use battle-tested libraries for complex parsing (YAML) where edge cases are numerous.

## Edge Case Handling Reference

This section documents all edge cases and their fixes. For complete implementation details, see the documentation files in the repository root.

### Front-matter Parsing Edge Cases (All Fixed)

**Issue 1: CRLF Line Endings**
- **Problem**: Windows files with `\r\n` line endings failed to parse
- **Fix**: Updated regex to `/^---\r?\n([\s\S]*?)(\r?\n)?---\r?\n/`
- **Location**: `src/utils/frontmatter-parser.ts:42`
- **Tested**: ✅ Both LF and CRLF files parse correctly

**Issue 2: Leading Whitespace**
- **Problem**: Files starting with blank lines failed to parse
- **Fix**: Auto-trim content before parsing: `content.replace(/^\s*/, '')`
- **Location**: `src/utils/frontmatter-parser.ts:37`
- **Tested**: ✅ Files with leading whitespace parse correctly

**Issue 3: note_id Type Mismatch**
- **Problem**: Numeric note_id (e.g., `123456`) parsed as number, rejected by type check
- **Fix**: Auto-convert to string: `String(data.note_id).trim()`
- **Location**: `src/utils/frontmatter-parser.ts:62-68`
- **Tested**: ✅ Number `123456` converts to string `"123456"`

**Issue 4: Empty Front-matter**
- **Problem**: `---\n---\n` format didn't match regex
- **Fix**: Made middle newline optional: `(\r?\n)?` before closing `---`
- **Location**: `src/utils/frontmatter-parser.ts:42`
- **Tested**: ✅ Empty front-matter returns `exists: true`

**Issue 5: Silent YAML Errors**
- **Problem**: Parse errors caught but only logged, users unaware notes were skipped
- **Fix**: Added `parseError` field to return value, collect in workflows
- **Location**: `src/utils/frontmatter-parser.ts:25,80-88` + `src/main.ts:1438-1442`
- **Result**: Users see `⚠️ N 个笔记因 YAML 错误被跳过` with details

### HASH_BOUNDARY Edge Cases (All Fixed)

**Issue 6: Missing Marker**
- **Problem**: If user deletes `<!-- HASH_BOUNDARY -->`, hash includes generated links → infinite loop
- **Fix**: Auto-add marker when missing in `calculateContentHash()`
- **Location**: `src/services/note-processor.ts:97-111`
- **Result**: Infinite reprocessing prevented automatically

### Cache Consistency Edge Cases (All Fixed)

**Issue 7: File Rename**
- **Problem**: Renamed files had outdated `file_path` in cache
- **Fix**: Event listener for `rename` event updates path
- **Location**: `src/main.ts:1507-1556`
- **Limitation**: Only works for renames in Obsidian (not external tools)

**Issue 8: File Delete**
- **Problem**: Deleted files left orphaned data in cache (notes, scores, embeddings, ledger)
- **Fix**: Event listener for `delete` event cleans all related data
- **Location**: `src/main.ts:1558-1621`
- **Cleanup**: Deletes note metadata, scores, embedding file, ledger entries

**Issue 9: Orphaned Data Accumulation**
- **Problem**: External tools (Git, OS file manager) bypass event listeners
- **Fix**: Manual cleanup tool accessible from ribbon menu
- **Location**: `src/main.ts:1623-1731`
- **UI**: Ribbon menu → 🧹 清理孤立数据

**Issue 10: Cache Health Monitoring**
- **Problem**: No way to detect orphaned data, broken links, missing UUIDs
- **Fix**: Non-destructive health check tool
- **Location**: `src/main.ts:1733-1840`
- **UI**: Ribbon menu → 🔍 缓存健康检查

### Testing Coverage

All edge cases have been tested with dedicated test scripts:

```bash
# Run all edge case tests
node test-edge-cases.js     # Comprehensive edge cases
node test-fixes.js          # All 6 high-priority fixes
node test-empty-fm.js       # Empty front-matter debug
node test-regex.js          # Regex pattern validation
node test-parser-crlf.js    # CRLF line ending test
```

**Test results**: All tests passing ✅

### When to Use Manual Tools

**Use Health Check when**:
- After Git operations (pull, merge, checkout)
- After batch file operations via external tools
- Monthly maintenance routine
- Troubleshooting missing/broken links
- Before running cleanup (to see what will be affected)

**Use Clean Orphaned Data when**:
- Health check reports orphaned notes
- Sync conflicts have removed files
- Vault migration/reorganization completed
- After deleting files via OS file manager

**Workflow recommendation**:
```
1. External operation (Git/OS tools)
2. Open Obsidian
3. Ribbon → 🔍 缓存健康检查
4. Review report
5. If issues: Ribbon → 🧹 清理孤立数据
6. Re-check: Should show "缓存健康状况良好"
```

### Known Limitations

**Automatic cleanup does NOT work for**:
- Files deleted via OS file manager (Finder, Explorer, Nautilus)
- Git operations (checkout, pull, merge, rebase)
- Third-party sync tools (Dropbox, iCloud, Syncthing)
- Batch shell scripts
- Sync conflict resolutions

**Why**: These operations bypass Obsidian's event system. Use manual tools after such operations.

**Future consideration**: Watch filesystem directly (fs.watch) for external changes, but adds complexity and platform-specific issues.
