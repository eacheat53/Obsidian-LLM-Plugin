# Project Context

## Purpose

**Obsidian LLM Plugin** is a TypeScript-based Obsidian plugin that uses AI embeddings (Jina) and LLM scoring (Gemini/OpenAI/Anthropic/custom providers) to automatically create intelligent links between semantically related notes. It features incremental updates via content hashing, sharded caching architecture, and full internationalization (English/Chinese).

**Key Features:**
- Automatic semantic link generation based on note similarity
- AI-powered tagging system
- Multi-provider LLM support (Gemini, OpenAI, Anthropic, custom)
- Incremental processing with SHA-256 content hashing
- Failure recovery and retry system
- Bilingual UI (English/Chinese)

## Tech Stack

### Core Technologies
- **TypeScript** - Primary language, strict typing enabled
- **Obsidian API** - Plugin framework (no React/Vue - pure Obsidian components)
- **Node.js** - Build tooling only (not runtime)
- **ESBuild** - Fast bundling for production

### AI Services
- **Jina AI API** - Text embeddings (768-1024 dimensions)
- **LLM APIs** - Gemini, OpenAI, Anthropic, or custom OpenAI-compatible endpoints
- **Vector Math** - Custom cosine similarity implementation

### Build Tools
- `npm run dev` - Development with watch mode
- `npm run build` - Production build (TypeScript check + ESBuild)
- `npm run lint` - ESLint validation

### Runtime Dependencies
**Zero production dependencies** - all utilities are custom-built:
- Custom YAML parser (no js-yaml)
- Custom UUID generator (no uuid package)
- Custom vector math (no numeric library)
- Custom crypto (Node.js built-in)

## Project Conventions

### Code Style
- **Indentation**: 2 spaces
- **Naming**:
  - Files: kebab-case (`cache-service.ts`)
  - Classes: PascalCase (`CacheService`)
  - Functions/variables: camelCase (`loadMasterIndex`)
  - Constants: UPPER_SNAKE_CASE (`DEFAULT_SETTINGS`)
- **Formatting**: ESLint enforced
- **Comments**:
  - JSDoc for public APIs
  - Chinese comments allowed for domain-specific logic
  - `✅` emoji for critical fixes/improvements
- **Internationalization**:
  - **NEVER** hardcode UI strings directly in code
  - **ALWAYS** use `t(language)` function from `src/i18n/translations.ts`
  - All user-facing text MUST support both English and Chinese
  - Add translations to both `en` and `zh` sections
  - Example:
    ```typescript
    // ❌ BAD: Hardcoded string
    .setTitle('重新校准链接')

    // ✅ GOOD: Using i18n
    const tr = t(this.plugin.settings.language);
    .setTitle(tr.settings.recalibrateLinks.name)
    ```

### Architecture Patterns

#### Service-Oriented Design
```
Main Plugin (src/main.ts)
├── CacheService          # Master index + sharded embeddings
├── NoteProcessorService  # Vault scanning, UUID management
├── APIService            # HTTP with LLM adapter pattern
├── AILogicService        # Similarity, scoring, tagging
├── LinkInjectorService   # WikiLink insertion
└── TaskManagerService    # Background tasks with mutex
```

#### Key Design Decisions

**1. HASH_BOUNDARY Marker System**
```markdown
---
note_id: uuid
tags: [...]
---
User content here...
<!-- HASH_BOUNDARY -->
- [[Generated Link 1]]
- [[Generated Link 2]]
```
- Only content **before** HASH_BOUNDARY is hashed for change detection
- Prevents infinite reprocessing loops
- Placed at end of note (not after front-matter)

**2. Sharded Cache Architecture**
```
.obsidian/plugins/obsidian-llm-plugin/cache/
├── index.json              # Master index (metadata + scores)
└── embeddings/
    ├── {uuid1}.json       # Per-note embedding vectors
    └── {uuid2}.json
```
- Prevents loading 1000s of embedding vectors into memory
- Bidirectional in-memory score index for O(1) lookups
- Atomic writes (temp file + rename)

**3. Unidirectional Link Insertion**
- Links inserted in ONE direction only (note_id_1 → note_id_2)
- Leverages Obsidian's built-in backlinks feature
- 50% reduction in link insertions

**4. Incremental Updates**
- SHA-256 content hashing for change detection
- 90%+ reduction in processing time for unchanged notes
- Only reprocess when content actually changes

**5. LLM Adapter Pattern**
```typescript
interface LLMAdapter {
  scoreBatch(request): Promise<response>;
  generateTagsBatch(request): Promise<response>;
}
```
- Easily add new LLM providers
- JSON-based prompting to reduce hallucination
- Structured input/output with pair_id for correct ordering

### Testing Strategy
- **Manual testing** in Obsidian development vault
- **Type safety** via strict TypeScript
- **Build validation** as primary quality gate
- **Debug logging** controlled via settings toggle

### Git Workflow
- **Main branch**: `main` (primary development)
- **Commits**: Conventional commits preferred
  - Example: `fix: tags_generated_at timing issue`
  - Example: `feat: add view logs button`
- **Pull Requests**: Not strictly required for solo development
- **No force push** to main/master

## Domain Context

### Obsidian Specific Knowledge
- **Vault**: User's note repository (local filesystem)
- **TFile**: Obsidian file object (not Node.js fs)
- **Front-matter**: YAML metadata at top of markdown files
- **WikiLink**: `[[Note Title]]` - Obsidian's internal link format
- **Backlinks**: Automatically shown in sidebar for all incoming links

### AI/ML Concepts
- **Embedding**: Dense vector representation of text (768-1024 floats)
- **Cosine Similarity**: Measure of semantic similarity (0-1)
- **Similarity Threshold**: Minimum cosine score to consider (default: 0.7)
- **AI Score**: LLM-assigned relevance rating (0-10)
- **Batch Processing**: Multiple items in single API call for efficiency

### Plugin Workflow
1. Scan vault for markdown files
2. Generate embeddings (Jina API)
3. Calculate pairwise cosine similarity
4. Score pairs with LLM (batch)
5. Filter by thresholds
6. Insert top N links per note
7. Generate AI tags (batch)
8. Write tags to front-matter

## Important Constraints

### Technical Constraints
- **No bundled dependencies**: Keep bundle size minimal for distribution
- **Obsidian API only**: No DOM manipulation, must use Obsidian components
- **TypeScript strict mode**: All code must pass strict type checking
- **Platform compatibility**: Must work on Windows, macOS, Linux

### Performance Constraints
- **Large vaults**: Must handle 1000+ notes efficiently
- **API rate limits**: Batch processing to minimize API calls
- **Memory usage**: Sharded embeddings to avoid loading all into memory
- **Incremental processing**: Hash-based change detection required

### User Experience Constraints
- **Non-destructive**: Never modify user content above HASH_BOUNDARY
- **Cancellable**: All long operations must be cancellable
- **Progress feedback**: Show progress for long operations
- **Bilingual**: Full i18n for English and Chinese

### Business/Regulatory Constraints
- **API keys**: User-provided (no centralized API)
- **Privacy**: All data stays local + user's chosen AI provider
- **Cost transparency**: Users control API usage via batch size settings

## External Dependencies

### Required APIs
1. **Jina AI Embeddings API**
   - URL: `https://api.jina.ai/v1/embeddings`
   - Auth: Bearer token (user-provided)
   - Rate limits: Per account
   - Fallback: None (required for core functionality)

2. **LLM Provider APIs** (one required)
   - **Gemini**: `https://generativelanguage.googleapis.com/v1beta/models/`
   - **OpenAI**: `https://api.openai.com/v1/`
   - **Anthropic**: `https://api.anthropic.com/v1/`
   - **Custom**: Any OpenAI-compatible endpoint

### Optional Dependencies
- **Error logging**: Local filesystem (`.obsidian/plugins/obsidian-llm-plugin/`)
- **Failure set**: JSON file for retry tracking

### Key Settings to Understand

#### Threshold Settings
- `similarity_threshold`: Cosine similarity cutoff (default: 0.7, **minimum recommended: 0.7**)
  - **Increasing threshold** (e.g., 0.7 → 0.8): Only requires recalibration, no re-computation needed
  - **Decreasing threshold** (e.g., 0.8 → 0.7): Requires re-computing similarities (needs force mode)
  - **Warning**: Lower values significantly increase candidate pairs sent to LLM, wasting tokens
  - **Best practice**: Set 0.7 as minimum to balance quality and API costs
- `min_ai_score`: LLM score cutoff (default: 7, range: 0-10)
  - Can be adjusted freely via recalibration (no re-scoring needed)
- `max_links_per_note`: Top N links to insert (default: 7, range: 1-50)
  - Can be adjusted freely via recalibration

#### Batch Size Settings
- `batch_size_scoring`: Pairs per LLM request (default: 10)
- `batch_size_tagging`: Notes per LLM request (default: 4)

#### Content Limits
- `jina_max_chars`: Max characters sent to Jina API (default: 8000)
- `llm_scoring_max_chars`: Max characters per note for scoring (default: 1000)
- `llm_tagging_max_chars`: Max characters per note for tagging (default: 500)

### Common Gotchas
1. **Gemini Thinking Mode**: Uses extended thinking tokens - may hit MAX_TOKENS
2. **Provider Config Persistence**: Settings stored per-provider in `provider_configs`
3. **Embedding Dimension Mismatch**: Different Jina models = different dimensions
4. **Batch Size vs Token Limits**: Reduce batch size if hitting token errors
5. **Score Index Rebuild**: Must call `setMasterIndex()` after modifying scores
