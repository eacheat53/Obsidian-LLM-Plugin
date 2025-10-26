# Implementation Plan: Obsidian AI Linker Plugin

**Branch**: `002-ai-linker-plugin` | **Date**: 2025-10-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-ai-linker-plugin/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command.

## Summary

Build a pure TypeScript Obsidian plugin that leverages AI services (Jina embeddings and LLMs like Gemini) to automatically analyze notes and insert intelligent link suggestions. The plugin uses vector similarity for semantic matching and AI scoring for relevance validation, implementing an efficient incremental update mechanism via content hashing. All operations run asynchronously within Obsidian's environment with zero external dependencies, storing data in a sharded JSON cache architecture for optimal performance.

## Technical Context

**Language/Version**: TypeScript 4.9+ with strict type checking (ES2020+)
**Primary Dependencies**:
- Obsidian API (^1.0.0) - core plugin framework
- Built-in Web Crypto API - UUID generation (`crypto.randomUUID()`) and SHA-256 hashing (`crypto.subtle.digest()`)
- Native JavaScript Math - Vector operations (cosine similarity via manual implementation)
- No external runtime dependencies required

**Storage**: JSON file-based persistence (master index + sharded embedding files)
**Testing**: Manual testing per acceptance scenarios in spec.md (no automated test framework to maintain zero dependencies)
**Target Platform**: Obsidian Desktop (Windows/macOS/Linux Electron app) and Mobile (iOS/Android)
**Project Type**: Single Obsidian plugin (TypeScript/JavaScript module)
**Performance Goals**:
- Process 1000 notes similarity calculations in <5 minutes
- UI remains responsive during background tasks (non-blocking async operations)
- 90%+ reduction in processing time via incremental updates

**Constraints**:
- Must run within Obsidian's JavaScript sandbox
- Zero external runtime dependencies (no Python, Go, Java)
- No binary database dependencies (SQLite prohibited)
- Must use Obsidian's `requestUrl()` API for all HTTP calls (avoids CORS issues)

**Scale/Scope**: Support vaults with up to 10,000 notes with efficient sharded cache architecture

**Integration Points**:
- Jina AI API (embeddings generation via `requestUrl()`)
- Configurable LLM provider APIs (Gemini, etc.) for scoring and tag generation
- Obsidian Vault API for file system operations
- Obsidian Workspace API for UI integration (sidebar, settings, modals)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Compliance Review** (aligned with Obsidian LLM Plugin Constitution v1.0.0):

✅ **Core Project Goal**: Plugin is pure TypeScript/JavaScript with zero external runtime dependencies. All AI functionality uses external services via HTTP APIs, not local runtimes.

✅ **Core Architecture & Module Design**: Single-process async architecture with clearly defined modules:
- `services/api-service.ts` - External API calls via Obsidian request API
- `services/ai-logic-service.ts` - AI workflow orchestration (embeddings, scoring, link generation)
- `services/cache-service.ts` - JSON-based data persistence (master index + sharded embeddings)
- `services/link-injector-service.ts` - Safe markdown file manipulation
- `ui/` - Settings panel, progress modals, sidebar integration

✅ **Data Processing & State Principles**:
- Unique UUIDs maintained in note front-matter (FR-001)
- Content hash-based incremental updates via SHA-256 (FR-002)
- JSON-only persistence, no binary databases (FR-010)
- All time-intensive operations are async/await (FR-004, SC-004)

✅ **User Experience**:
- Comprehensive settings panel with all configuration options (FR-008, SC-003)
- Non-blocking progress dialog for long-running tasks with cancellation (SC-007)

✅ **Code Quality Standards**:
- Strict TypeScript with type checking enabled (SC-008)
- Modular design with high cohesion, low coupling per prescribed architecture
- JSDoc documentation required for all public APIs (SC-008)

✅ **Security & Compatibility**:
- Uses Obsidian's built-in request API for all network calls
- Conforms to Obsidian plugin security model
- Graceful error handling with three-tier classification (FR-012)

**GATE STATUS**: ✅ PASS - No constitution violations. All requirements align with established principles.

## Project Structure

### Documentation (this feature)

```text
specs/002-ai-linker-plugin/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (technology decisions)
├── data-model.md        # Phase 1 output (entities and schemas)
├── quickstart.md        # Phase 1 output (developer onboarding)
├── contracts/           # Phase 1 output (API contracts)
│   ├── jina-api.md      # Jina embeddings API contract
│   ├── llm-api.md       # Generic LLM API contract (scoring, tagging)
│   └── cache-schema.json # Cache data structure schema
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
obsidian-llm-plugin/
├── src/
│   ├── main.ts                      # Plugin entry point, registers commands/UI
│   ├── plugin-settings.ts           # Settings data model and defaults
│   │
│   ├── services/
│   │   ├── api-service.ts           # HTTP client for external APIs (Jina, LLMs)
│   │   ├── ai-logic-service.ts      # Core workflows: similarity, scoring, tagging
│   │   ├── cache-service.ts         # Master index + sharded embeddings persistence
│   │   ├── link-injector-service.ts # Markdown file manipulation for link insertion
│   │   ├── note-processor.ts        # Note scanning, hash calculation, UUID management
│   │   └── task-manager.ts          # Background task orchestration and cancellation
│   │
│   ├── ui/
│   │   ├── settings-tab.ts          # Main settings panel implementation
│   │   ├── progress-modal.ts        # Progress dialog with cancel button
│   │   ├── batch-tag-modal.ts       # Modal for batch tag insertion
│   │   └── sidebar-menu.ts          # Ribbon icon and quick menu
│   │
│   ├── utils/
│   │   ├── id-generator.ts          # UUID generation for notes
│   │   ├── hash-utils.ts            # SHA-256 content hashing
│   │   ├── vector-math.ts           # Cosine similarity and vector operations
│   │   ├── frontmatter-parser.ts    # YAML front-matter manipulation
│   │   └── error-classifier.ts      # Three-tier error classification logic
│   │
│   └── types/
│       ├── index.ts                 # Main type definitions
│       ├── api-types.ts             # External API request/response types
│       └── cache-types.ts           # Cache data structure types
│
├── styles.css                       # Plugin UI styles
├── manifest.json                    # Obsidian plugin manifest
├── versions.json                    # Plugin version compatibility
├── package.json                     # NPM dependencies and scripts
├── tsconfig.json                    # TypeScript compiler configuration
├── rollup.config.js                 # Build configuration
├── .eslintrc.json                   # Code linting rules
└── README.md                        # Plugin documentation
```

**Structure Decision**: Single Obsidian plugin project following standard Obsidian plugin architecture. Modular service layer aligns with constitution requirements for high cohesion and low coupling. UI components separated from business logic for testability.

## Complexity Tracking

**No constitution violations detected.** All complexity is justified by functional requirements and technical constraints outlined in the feature specification.

---

## Phase 0: Research Outcomes

**Status**: ✅ Complete

All "NEEDS CLARIFICATION" items from Technical Context have been resolved through research:

1. **UUID Generation**: Built-in `crypto.randomUUID()` (zero dependencies, 3-12x faster than npm packages)
2. **SHA-256 Hashing**: Web Crypto API `crypto.subtle.digest()` (native, async/await pattern)
3. **Vector Math**: Manual cosine similarity implementation using `Math.hypot()` (no dependencies, sufficient for 10k notes)
4. **Testing Approach**: Manual testing via acceptance scenarios and quickstart.md validation (maintains zero dependencies)
5. **HTTP Requests**: Obsidian's `requestUrl()` API exclusively (avoids CORS, mobile compatible)

**Artifacts**: `research.md` with detailed rationale, alternatives, and implementation examples

---

## Phase 1: Design Outcomes

**Status**: ✅ Complete

All design artifacts have been generated:

### Data Model (`data-model.md`)

Defined 5 core entities with complete schemas:
- **NoteMetadata**: Cached note information (note_id, path, hash, tags)
- **NotePairScore**: Similarity and AI scores for note pairs
- **EmbeddingVector**: Sharded embedding storage (per-note files)
- **PluginSettings**: User configuration (23 configurable parameters)
- **MasterIndex**: Central cache file structure

Includes:
- Validation rules for all fields
- State machine for note processing lifecycle
- Relationship diagrams
- Performance estimates (10k notes = ~2MB index + ~30MB embeddings)
- Migration strategy for future schema changes

### API Contracts (`contracts/`)

Three contract specifications:

1. **jina-api.md**: Jina embeddings API
   - Request/response formats (single and batch)
   - Error classification (401/400/429/500 → Configuration/Content/Transient)
   - TypeScript implementation with `requestUrl()`
   - Content preparation logic (extract main content, truncate)

2. **llm-api.md**: Generic LLM interface
   - Two use cases: batch scoring and tag generation
   - Provider adapter pattern (Gemini, OpenAI implementations)
   - Default prompts with customization support
   - Response validation and error handling

3. **cache-schema.json**: JSON Schema definitions
   - MasterIndex and EmbeddingVector schemas
   - Regex patterns for UUIDs, SHA-256 hashes, timestamps
   - Referential integrity constraints

### Developer Onboarding (`quickstart.md`)

Complete guide covering:
- 5-minute setup process (clone, install, test vault, dev mode)
- Architecture overview with data flow diagrams
- Example: Adding a new setting (end-to-end)
- Testing guide (unit and manual)
- Common tasks (adding API provider, debugging)
- Code style guidelines
- Troubleshooting section

### Agent Context Updates

Updated `CLAUDE.md` with:
- Language: TypeScript 4.9+ with strict type checking
- Database: JSON file-based persistence (master index + sharded)
- Project type: Single Obsidian plugin

---

## Post-Design Constitution Check

**Status**: ✅ PASS (Re-validated)

All design decisions maintain full compliance with constitution:

- ✅ **Zero Runtime Dependencies**: Uses only Web Crypto API, Math, and Obsidian API
- ✅ **Pure TypeScript**: No external runtimes required
- ✅ **JSON Storage**: Master index + sharded architecture as designed
- ✅ **Modular Services**: api-service, ai-logic-service, cache-service, link-injector-service
- ✅ **Async Operations**: All I/O operations use async/await
- ✅ **Security**: Uses Obsidian's `requestUrl()` (not fetch), respects sandbox

**No new violations introduced during design phase.**

---

## Next Steps

This plan document is now complete. To proceed with implementation:

1. **Run task generation**: Execute `/speckit.tasks` to create `tasks.md` with actionable implementation tasks
2. **Review tasks**: Ensure dependency ordering and priority alignment
3. **Begin implementation**: Follow tasks.md for systematic development

**Recommended**: Review all Phase 0 and Phase 1 artifacts before running `/speckit.tasks` to ensure familiarity with the complete design.
