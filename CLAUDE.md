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

### 2. Gemini Thinking Mode Token Consumption

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


### 3. Atomic Cache Writes

```typescript
// Write to temp file, then rename (atomic operation)
const tempFile = `${indexFile}.tmp`;
await fs.writeFile(tempFile, content);
await fs.rename(tempFile, indexFile);  // Atomic!
```

Prevents corruption if process crashes mid-write.

### 4. Task Locking Mechanism

The `TaskManagerService` prevents concurrent operations via mutex:

```typescript
if (this.taskLock) {
  throw new Error('Another operation is in progress');
}
this.taskLock = true;
```

Prevents race conditions in cache updates.

### 5. Three-Tier Error Classification

From `src/utils/error-classifier.ts`:

| Type | Action | Examples |
|------|--------|----------|
| **ConfigurationError** | Abort | 401 Unauthorized, 404 Not Found |
| **TransientError** | Retry 3x | 500 Server Error, 429 Rate Limit |
| **ContentError** | Skip item | Content too long, parse errors |

Retry: exponential backoff (1s → 2s → 4s)

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
- `src/ui/sidebar-menu.ts` - Ribbon icon menu (3 actions, no "Hash Boundary" option)
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

### 3. Frontmatter Parser Limitations

Custom YAML parser is intentionally basic:
- ✅ Supports: strings, numbers, booleans, arrays
- ❌ Does NOT support: nested objects, multi-line strings

**Rationale**: Avoids js-yaml dependency (~30KB). Sufficient for `note_id` and `tags` fields.

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

**Zero Runtime Dependencies**: No production npm dependencies
- Custom YAML parser (no js-yaml)
- Custom UUID generator (no uuid package)
- Custom vector math (no numeric library)

**Why**: Reduces bundle size, improves load time, eliminates supply chain risks

**Trade-off**: More maintenance, but justified for Obsidian plugin distribution
