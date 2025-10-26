# Tasks: Obsidian AI Linker Plugin

**Branch**: `002-ai-linker-plugin`
**Input**: Design documents from `/specs/002-ai-linker-plugin/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Tests**: No test tasks included (not explicitly requested in specification). Focus on implementation and manual testing per acceptance scenarios.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single Obsidian plugin project structure:
- `src/` - TypeScript source code
- `manifest.json`, `package.json`, `tsconfig.json` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create Obsidian plugin project structure with src/ directory per plan.md
- [ ] T002 Initialize TypeScript project with package.json and dependencies (Obsidian API, TypeScript, rollup, @types/node for build tools only)
- [ ] T003 Create manifest.json with plugin metadata (id: "jina-ai-linker", name: "Jina AI Linker Plugin", version: "0.1.0", minAppVersion: "1.0.0")
- [ ] T004 Create versions.json for Obsidian version compatibility tracking
- [ ] T005 [P] Configure tsconfig.json with strict type checking, ES2020+ target, and module resolution for Obsidian
- [ ] T006 [P] Configure rollup.config.js for bundling TypeScript to main.js with external Obsidian API
- [ ] T007 [P] Create .eslintrc.json with TypeScript linting rules per constitution code quality standards
- [ ] T008 [P] Create styles.css placeholder for plugin UI styles
- [ ] T009 [P] Create README.md with plugin description, installation, and usage instructions
- [ ] T010 [P] Add npm scripts to package.json: dev (watch build), build (production), lint

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T011 Create src/types/index.ts with base TypeScript interfaces for NoteMetadata, NotePairScore, EmbeddingVector per data-model.md
- [ ] T012 [P] Create src/types/api-types.ts with interfaces for Jina and LLM API request/response types per contracts/
- [ ] T013 [P] Create src/types/cache-types.ts with MasterIndex and cache structure types per data-model.md
- [ ] T014 Create src/plugin-settings.ts with PluginSettings interface and DEFAULT_SETTINGS constant per data-model.md (23 configurable parameters)
- [ ] T015 [P] Implement src/utils/id-generator.ts with generateNoteId() function using crypto.randomUUID() per research.md
- [ ] T016 [P] Implement src/utils/hash-utils.ts with calculateContentHash() function using crypto.subtle.digest() for SHA-256 per research.md
- [ ] T017 [P] Implement src/utils/vector-math.ts with cosineSimilarity() function using Math.hypot() per research.md
- [ ] T018 [P] Implement src/utils/frontmatter-parser.ts with functions to parse/modify YAML front-matter (parseFrontMatter, updateFrontMatter, ensureNoteId)
- [ ] T019 [P] Implement src/utils/error-classifier.ts with three-tier error classification (ConfigurationError, TransientError, ContentError classes) per FR-012
- [ ] T020 Create src/services/cache-service.ts skeleton with loadMasterIndex(), saveMasterIndex(), loadEmbedding(), saveEmbedding() methods per FR-010
- [ ] T021 Create src/services/note-processor.ts skeleton with scanVault(), extractMainContent(), ensureNoteHasId() methods per FR-001, FR-002
- [ ] T022 Create src/services/api-service.ts skeleton with callJinaAPI(), callLLMAPI() methods using Obsidian requestUrl() per research.md
- [ ] T023 Create src/services/ai-logic-service.ts skeleton with calculateSimilarities(), scorePairs(), generateTags() methods
- [ ] T024 Create src/services/link-injector-service.ts skeleton with insertLinks(), removeOldLinks(), formatWikiLink() methods per FR-003, FR-004
- [ ] T025 Create src/services/task-manager.ts skeleton with startTask(), cancelTask(), taskLock management for concurrent task prevention

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - First-time Configuration & Parameter Tuning (Priority: P1) 🎯 MVP

**Goal**: Enable users to configure all plugin settings through a comprehensive GUI interface with persistence across sessions

**Independent Test**: Configure all settings, save them, reload Obsidian, verify settings persist and affect subsequent operations

### Implementation for User Story 1

- [ ] T026 [P] [US1] Create src/ui/settings-tab.ts extending PluginSettingTab with display() method skeleton
- [ ] T027 [US1] Implement Jina AI Linker Settings section in src/ui/settings-tab.ts (API Key password field, Model Name text input, Max Characters slider) per acceptance scenario 1
- [ ] T028 [US1] Implement AI Smart Scoring Configuration section in src/ui/settings-tab.ts (AI Provider dropdown with Gemini/OpenAI options, API URL text, API Key password, Model Name text) per acceptance scenario 2
- [ ] T029 [US1] Implement Processing Parameters section in src/ui/settings-tab.ts (Default Scan Path text, Excluded Folders text area, Excluded File Patterns text area) per acceptance scenario 3
- [ ] T030 [US1] Implement Link Insertion Settings section in src/ui/settings-tab.ts (Jina Similarity Threshold slider 0-1, Min AI Score slider 0-10, Max Links per Note slider 1-50) per acceptance scenario 3
- [ ] T031 [US1] Implement AI Scoring Prompt Settings section in src/ui/settings-tab.ts (Use Custom Prompt toggle, Custom Prompt text area, Restore Default button) per acceptance scenario 4
- [ ] T032 [US1] Implement AI Tag Generation Settings section in src/ui/settings-tab.ts (Use Custom Tag Prompt toggle, Custom Tag Prompt text area, Restore Default button) per acceptance scenario 4
- [ ] T033 [US1] Implement AI Batch Processing Parameters section in src/ui/settings-tab.ts (Batch Size Scoring slider 1-50, Batch Size Tagging slider 1-20)
- [ ] T034 [US1] Add settings persistence logic in src/main.ts (loadSettings, saveSettings methods using Obsidian plugin.loadData/saveData API)
- [ ] T035 [US1] Wire settings-tab.ts to main.ts by registering in addSettingTab() method
- [ ] T036 [US1] Add input validation for all settings fields (API key non-empty, numeric ranges, valid paths) with user-friendly error messages

**Checkpoint**: At this point, User Story 1 should be fully functional - all settings configurable, persistent, and validated

---

## Phase 4: User Story 2 - One-click Execution of Core Workflows (Priority: P1)

**Goal**: Provide quick access to core plugin functions through sidebar icon with progress tracking and cancellation

**Independent Test**: Each menu option should trigger its expected behavior (modal, background task) without requiring settings navigation

### Implementation for User Story 2

- [ ] T037 [P] [US2] Create src/ui/sidebar-menu.ts with addRibbonIcon() registration for plugin icon in left sidebar
- [ ] T038 [P] [US2] Create src/ui/progress-modal.ts extending Modal with progress bar, percentage display, and Cancel button per SC-007
- [ ] T039 [P] [US2] Create src/ui/batch-tag-modal.ts extending Modal with Generation Mode dropdown and Target File/Folder input per acceptance scenario 2
- [ ] T040 [US2] Implement sidebar menu item "Process Notes and Insert Suggested Links" in src/ui/sidebar-menu.ts triggering processNotesWorkflow() per acceptance scenario 1
- [ ] T041 [US2] Implement sidebar menu item "Batch Insert AI Tags" in src/ui/sidebar-menu.ts opening batch-tag-modal per acceptance scenario 2
- [ ] T042 [US2] Implement sidebar menu item "Batch Add Hash Boundary Marker" in src/ui/sidebar-menu.ts calling addHashBoundaryToNotes() per acceptance scenario 3
- [ ] T043 [US2] Implement sidebar menu item "Generate Unique ID for Current Note" in src/ui/sidebar-menu.ts calling addUuidToCurrentNote() per acceptance scenario 3
- [ ] T044 [US2] Implement processNotesWorkflow() in src/main.ts that orchestrates: scan vault → ensure UUIDs → calc hashes → generate embeddings → calc similarities → AI scoring → insert links
- [ ] T045 [US2] Implement addHashBoundaryToNotes() in src/services/note-processor.ts to insert <!-- HASH_BOUNDARY --> marker after YAML front-matter if missing
- [ ] T046 [US2] Implement addUuidToCurrentNote() in src/services/note-processor.ts to generate and write note_id to active file's front-matter per FR-001
- [ ] T047 [US2] Complete src/services/cache-service.ts implementation: load/save master index JSON, load/save sharded embeddings, create cache directory structure
- [ ] T048 [US2] Complete src/services/note-processor.ts implementation: scanVault with exclude patterns, extractMainContent (before HASH_BOUNDARY), calculate content hashes per FR-002
- [ ] T049 [US2] Complete src/services/api-service.ts Jina embeddings implementation: prepare content (truncate to max chars), batch API requests, parse response, validate response includes all requested note_id pairs per contracts/jina-api.md, handle errors per three-tier classification
- [ ] T050 [US2] Implement Gemini adapter in src/services/api-service.ts for batch scoring and tag generation per contracts/llm-api.md
- [ ] T051 [US2] Complete src/services/ai-logic-service.ts implementation: calculateSimilarities (vectorized cosine similarity for all pairs), scorePairs (batch LLM API calls), filter by thresholds per FR-006
- [ ] T052 [US2] Implement generateTags() in src/services/ai-logic-service.ts using LLM batch tagging endpoint, merge with existing tags, avoid duplicates per FR-013. Detect existing tags format (array vs comma-separated) and preserve same format when merging AI-generated tags
- [ ] T053 [US2] Complete src/services/link-injector-service.ts implementation: remove old <!-- LINKS_START/END --> block, insert new links after HASH_BOUNDARY in WikiLink format [[Title]] per FR-003, FR-004. Implement formatWikiLink(filePath) method: remove .md extension, wrap in [[brackets]], handle duplicate filenames with relative paths if needed
- [ ] T054 [US2] Complete src/services/task-manager.ts implementation: task locking to prevent concurrent tasks, progress tracking callbacks, cancellation support per edge case handling
- [ ] T055 [US2] Wire progress-modal to task-manager in src/main.ts to show real-time progress during long-running operations
- [ ] T056 [US2] Implement smart skipping logic in src/services/ai-logic-service.ts: check cache for existing embeddings/scores, skip unless Force mode enabled per FR-007
- [ ] T057 [US2] Implement batch tag modal handler in src/ui/batch-tag-modal.ts: parse target path, call generateTags for filtered notes, display completion summary
- [ ] T058 [US2] Add three-tier error handling throughout workflow: Configuration errors abort with notification, Transient errors retry with exponential backoff (1s, 2s, 4s), Content errors skip and report per FR-012
- [ ] T059 [US2] Implement concurrent task prevention: if task running when user clicks menu, show notification with current task name and Cancel option per edge case
- [ ] T060 [US2] Add malformed YAML front-matter handling in src/utils/frontmatter-parser.ts: gracefully handle parse errors, log warnings, attempt append after delimiter per edge case

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - full link generation and tag insertion workflows functional

---

## Phase 5: User Story 3 - Plugin Maintenance & Debugging (Priority: P3)

**Goal**: Provide advanced users with tools for cache management, performance monitoring, and task cancellation

**Independent Test**: After plugin has processed notes, use maintenance buttons to verify cache clearing, statistics display, and task cancellation

### Implementation for User Story 3

- [ ] T061 [P] [US3] Add Performance and Debugging section to src/ui/settings-tab.ts with Clear Cache, Show Statistics, Cancel Current Operation buttons
- [ ] T062 [P] [US3] Add Enable Debug Logging toggle in Performance section of src/ui/settings-tab.ts
- [ ] T063 [US3] Implement clearCache() in src/services/cache-service.ts to delete index.json and all embeddings/*.json files per acceptance scenario
- [ ] T064 [US3] Implement showStatistics() in src/services/cache-service.ts to print cache stats to console: total notes, embeddings, scores, orphaned notes per data-model.md stats
- [ ] T065 [US3] Wire Clear Cache button in src/ui/settings-tab.ts to call cache-service.clearCache(), show success notification
- [ ] T066 [US3] Wire Show Statistics button in src/ui/settings-tab.ts to call cache-service.showStatistics(), notify user to check console
- [ ] T067 [US3] Wire Cancel Current Operation button in src/ui/settings-tab.ts to call task-manager.cancelTask(), show cancellation notification
- [ ] T068 [US3] Add conditional debug logging throughout services (api-service, ai-logic-service, cache-service) using settings.enable_debug_logging flag
- [ ] T069 [US3] Implement orphaned data detection in src/services/cache-service.ts: compare cached note_ids with actual vault files, update stats.orphaned_notes (read-only, no auto-cleanup) per FR-010.C

**Checkpoint**: All user stories should now be independently functional - complete plugin feature set implemented

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final production readiness

- [ ] T070 [P] Add JSDoc comments to all public functions in services/ per SC-008 (api-service, ai-logic-service, cache-service, link-injector-service, note-processor, task-manager)
- [ ] T071 [P] Add JSDoc comments to all UI components (settings-tab, sidebar-menu, progress-modal, batch-tag-modal)
- [ ] T072 [P] Add JSDoc comments to all utility functions (id-generator, hash-utils, vector-math, frontmatter-parser, error-classifier)
- [ ] T073 [P] Create default prompts for AI scoring and tag generation in src/plugin-settings.ts per contracts/llm-api.md examples
- [ ] T074 [P] Optimize vector similarity calculation in src/utils/vector-math.ts for 10k+ notes performance per SC-002 target (5 minutes for 1000 notes)
- [ ] T075 [P] Implement atomic cache writes in src/services/cache-service.ts: write to temp file, then rename (crash-safe) per data-model.md
- [ ] T076 [P] Add cache schema version validation in src/services/cache-service.ts on loadMasterIndex() per data-model.md migration strategy
- [ ] T077 Code review all modules for constitution compliance: zero external dependencies, pure TypeScript, async/await, modular design
- [ ] T078 Security audit: verify API keys stored securely (Obsidian's data.json), no keys logged, validate all user inputs
- [ ] T079 Performance testing: measure actual processing time for 1000 notes, optimize bottlenecks to meet SC-002 (<5 min) and SC-005 (90% reduction with incremental updates)
- [ ] T080 Manual end-to-end testing per quickstart.md: fresh install in test vault, configure all settings, process notes, verify links/tags inserted correctly
- [ ] T081 Test all edge cases: invalid API keys, network errors, rate limits, malformed YAML, concurrent tasks, orphaned notes, oversized content
- [ ] T082 Update README.md with comprehensive documentation: features, installation from release, configuration guide, troubleshooting, API key setup
- [ ] T083 Create release build with npm run build, verify main.js, manifest.json, styles.css bundle correctly
- [ ] T084 Final quickstart.md validation: verify developer onboarding guide is accurate, test setup instructions on fresh clone
- [ ] T085 [P] Implement optional user satisfaction tracking in src/services/cache-service.ts: add feedback prompt after link insertion, store ratings in stats for SC-001 validation
- [ ] T086 [P] Benchmark incremental update performance in test vault: measure full scan vs incremental for 100-note vault with 10 changed notes, verify ≥90% time reduction per SC-005
- [ ] T087 [P] Test cache persistence across Obsidian sessions: save embeddings/scores, close Obsidian, reopen, verify all data reloads correctly per SC-006
- [ ] T088 [P] Audit runtime dependencies: verify package.json has zero production dependencies (only devDependencies), check no Node.js-specific APIs used per FR-011
- [ ] T089 [P] Scalability stress test: create test vault with 10,000 notes, measure memory usage and processing time, verify <5 min per SC-002 and plan.md:36 target

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User Story 1 (US1): Independent - settings UI only
  - User Story 2 (US2): Independent but uses settings from US1
  - User Story 3 (US3): Independent - maintenance tools
  - Stories can proceed in parallel (if staffed) or sequentially (P1 → P1 → P3)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Reads settings from US1 but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Operates on cache created by US2 but independently testable

### Within Each User Story

- US1: All tasks can run mostly in parallel (separate settings sections), final wiring depends on all sections complete
- US2: API service tasks → AI logic service → workflow integration → error handling (sequential dependencies)
- US3: All tasks can run in parallel (separate maintenance features)

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T003-T010)
- All Foundational type definition tasks can run in parallel (T011-T019)
- Foundational service skeletons can run in parallel (T020-T025)
- US1 settings sections can be built in parallel (T026-T033)
- US2 UI components can be built in parallel (T037-T039)
- US3 maintenance features can run in parallel (T061-T069)
- All Polish tasks marked [P] can run in parallel (T070-T084)

---

## Parallel Example: User Story 1 (Settings UI)

```bash
# Launch all settings sections together:
Task T027: "Implement Jina AI Linker Settings section in src/ui/settings-tab.ts"
Task T028: "Implement AI Smart Scoring Configuration section in src/ui/settings-tab.ts"
Task T029: "Implement Processing Parameters section in src/ui/settings-tab.ts"
Task T030: "Implement Link Insertion Settings section in src/ui/settings-tab.ts"
Task T031: "Implement AI Scoring Prompt Settings section in src/ui/settings-tab.ts"
Task T032: "Implement AI Tag Generation Settings section in src/ui/settings-tab.ts"
Task T033: "Implement AI Batch Processing Parameters section in src/ui/settings-tab.ts"
```

## Parallel Example: User Story 2 (UI Components)

```bash
# Launch all UI components together:
Task T037: "Create src/ui/sidebar-menu.ts with addRibbonIcon() registration"
Task T038: "Create src/ui/progress-modal.ts extending Modal with progress bar"
Task T039: "Create src/ui/batch-tag-modal.ts extending Modal with Generation Mode dropdown"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only - Both P1)

1. Complete Phase 1: Setup (T001-T010)
2. Complete Phase 2: Foundational (T011-T025) - CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T026-T036) - Settings UI
4. **VALIDATE**: Test all settings persist and work
5. Complete Phase 4: User Story 2 (T037-T060) - Core workflows
6. **VALIDATE**: Test full link generation and tag insertion
7. **STOP and DEPLOY**: MVP ready with full P1 functionality

### Incremental Delivery

1. Foundation (Setup + Foundational) → Can save/load settings, but no workflows yet
2. Add User Story 1 → Can configure plugin, settings persist → **Demo ready**
3. Add User Story 2 → Can generate links and tags → **MVP ready for production**
4. Add User Story 3 → Can manage cache and debug → **Full featured**
5. Add Polish → Production ready with documentation → **Release 1.0**

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T025)
2. Once Foundational done:
   - Developer A: User Story 1 (T026-T036) - Settings UI specialist
   - Developer B: User Story 2 (T037-T060) - Core workflow specialist
   - Developer C: User Story 3 (T061-T069) - Maintenance tools
3. All developers: Polish phase (T070-T089) in parallel by module

---

## Notes

- [P] tasks = different files, no dependencies between them
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable per acceptance scenarios
- Foundational phase is CRITICAL - must be 100% complete before any user story work
- US2 has most complexity (37 tasks) as it implements core AI workflows
- Commit after each task or logical group (e.g., all settings sections)
- Stop at any checkpoint to validate story independently
- Manual testing is primary validation method (no automated tests in this version)
- Focus on constitution compliance: zero dependencies, pure TypeScript, JSON storage, async operations
