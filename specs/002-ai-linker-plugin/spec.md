# Feature Specification: Obsidian AI Linker Plugin

**Feature Branch**: `002-ai-linker-plugin`  
**Created**: 2025-10-25  
**Status**: Draft  
**Input**: User description: "Obsidian AI Linker Plugin - A powerful, highly configurable, pure TypeScript Obsidian plugin. Users can configure AI services through an intuitive GUI and execute smart tasks: process notes and insert suggested links, batch add AI tags, and preprocess notes, transforming the knowledge base into an intelligent connected network."

## Clarifications

### Session 2025-10-25

- Q: When an API call fails (invalid key, network error, rate limit), how should the plugin respond? → A: Implement three-tier error classification strategy: (1) Configuration Errors (401, 404, 400) - immediate failure with non-blocking notification banner providing actionable guidance, abort task and release lock; (2) Transient Errors (500, 503, 504, 429) - auto-retry with exponential backoff (max 3 attempts: 1s, 2s, 4s delays), show notification only on final failure with manual retry button; (3) Content Errors (oversized notes, special characters) - skip problematic item, continue processing queue, report skipped items in final summary notification.
- Q: When batching multiple note pairs for AI scoring (FR-005), how should the request/response be structured? → A: Use JSON array of objects in request; JSON array of score objects in response with note_id pairs for verification.
- Q: When inserting the suggested links block (`<!-- LINKS_START -->` to `<!-- LINKS_END -->`), where in the note should it be placed? → A: After `<!-- HASH_BOUNDARY -->` marker.
- Q: When a note file is deleted or permanently moved outside the vault, what should happen to its cached data (embedding, scores, tags)? → A: Preserve orphaned data indefinitely; only clear via manual "Clear Cache" action.
- Q: When the "Batch Insert AI Tags" feature generates tags for a note, where should they be inserted? → A: In YAML front-matter under `tags:` field (array or comma-separated), merged with existing tags.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-time Configuration & Parameter Tuning (Priority: P1)

As a new user, I want to complete all necessary initial configuration in a unified, comprehensive settings interface and fine-tune the plugin's parameters according to my advanced needs.

**Why this priority**: This is the foundational setup that enables all other functionality. Without proper configuration, none of the core features will work correctly.

**Independent Test**: Can be fully tested by configuring all settings, saving them, and verifying they persist and affect subsequent task execution.

**Acceptance Scenarios**:

1. **Given** I open the plugin settings with the top title "Jina AI Linker Plugin Settings". **When** I enter my "Jina API Key" (password field) and optionally modify "Jina Model Name" and "Jina Embedding Max Characters" in the first section "Jina AI Linker Settings". **Then** this information should be securely saved and used in subsequent embedding generation tasks.
2. **Given** I am in the "AI Smart Scoring Configuration" area. **When** I select a service from the "AI Provider" dropdown menu (e.g., Gemini) and fill in the corresponding "API URL", "API Key" (password field), and "Model Name". **Then** all future functions requiring large language models (like AI scoring, AI tagging) should call this specified model.
3. **Given** I am in the "Processing Parameters" and "Link Insertion Settings" areas. **When** I set "Default Scan Path" (e.g., "/" for entire vault), "Excluded Folders" (e.g., ".obsidian, Attachments"), "Excluded File Patterns" (e.g., "*.excalidraw"), "Jina Similarity Threshold" (e.g., 0.7), "Minimum AI Score for Link Insertion" (e.g., 7), and "Maximum Links per Note" (e.g., 7). **Then** when executing link tasks, the plugin must strictly adhere to these ranges and numerical limits.
4. **Given** I am in the "AI Scoring Prompt Settings" or "AI Tag Generation Settings" area. **When** I enable the "Use Custom Prompt" switch and input my own Prompt content in the expanded text box below, or click the "Restore Default Prompt" button. **Then** AI must use my provided custom prompt or the restored default prompt based on the switch state during corresponding tasks.

---

### User Story 2 - One-click Execution of Core Workflows (Priority: P1)

As a daily user, I want to conveniently access a quick menu containing all core functions through a fixed icon in the Obsidian sidebar.

**Why this priority**: This provides the primary user interaction point for the core functionality, making it accessible without navigating through complex menus.

**Independent Test**: Each button in the menu can be clicked independently, triggering its expected behavior (modal dialog, background task, etc.).

**Acceptance Scenarios**:

1. **Given** I have completed basic configuration. **When** I click the plugin icon in the sidebar and select the first item, "Process Notes and Insert Suggested Links" with a link icon, from the popup menu. **Then** the plugin should immediately start the core link generation background task and display a progress dialog.
2. **Given** I want to generate tags for a batch of notes. **When** I select "Batch Insert AI Tags" with a tag icon from the sidebar menu. **Then** the system should pop up a modal titled "Batch Insert AI Tags". This modal contains a "Generation Mode" dropdown (options: "Smart (New Notes Only)" and "Force (Always Regenerate)") and a "Target File/Folder" text input. When I click the "Insert Tags" button, the corresponding task starts.
3. **Given** some of my notes need initialization to be efficiently processed by the plugin. **When** I select "Batch Add Hash Boundary Marker" or "Generate Unique ID for Current Note" with a # icon from the sidebar menu. **Then** the plugin should immediately perform the corresponding file modification operation, preparing for incremental updates and data association.

---

### User Story 3 - Plugin Maintenance & Debugging (Priority: P3)

As an advanced user, when the plugin encounters issues or I want to manage its cache, I want to have tools for maintenance.

**Why this priority**: While not essential for core functionality, this is crucial for debugging and long-term usability, allowing users to resolve issues without needing developer intervention.

**Independent Test**: After the plugin has run for some time, clicking the maintenance buttons in settings verifies their effect.

**Acceptance Scenarios**:

1. **Given** I am in the "Performance and Debugging" area of the settings panel. **When** I click "Clear Cache", "Show Statistics", or "Cancel Current Operation" buttons. **Then** the plugin should respectively clear JSON cache files, print performance data to the developer console, or terminate the currently running background task.

---

### Edge Cases

- **API Errors**: System implements three-tier error classification: (1) Configuration Errors (invalid API key, wrong endpoint, bad model name) immediately abort with actionable notification; (2) Transient Errors (network issues, 500/503 status, rate limits) auto-retry with exponential backoff (3 attempts: 1s, 2s, 4s) before showing notification; (3) Content Errors (notes exceeding API limits, special characters) skip item, continue queue, report in final summary.
- **Concurrent Tasks**: If user tries to process notes while another task is running, system should prevent the new task from starting and show a notification indicating which task is currently in progress, with option to cancel the running task.
- **Malformed YAML Front-matter**: System should gracefully handle parsing errors, log warning, and either skip the note with a warning notification or attempt to append the `note_id` after existing front-matter delimiter.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (Unique ID)**: System MUST generate and maintain a unique UUID (`note_id`) in each note file's `front-matter`. This ID serves as a stable identifier ensuring associations (like embeddings, scores) persist even if the note file is renamed or moved. If processing a note reveals a missing `note_id`, the system MUST automatically generate and write it back to the file.
- **FR-002 (Incremental Update)**: System MUST implement an efficient incremental update mechanism. Specifically, this is achieved by calculating the SHA-256 hash of the file's **main content (starting immediately after the closing `---` of YAML front-matter, ending immediately before `<!-- HASH_BOUNDARY -->` marker)**. Only when the newly calculated hash differs from the old hash stored in the cache should the note be considered modified and reprocessed. If no `HASH_BOUNDARY` marker exists, all content after the front-matter should be used for hash calculation. **Critical**: The hash MUST exclude all content after the `<!-- HASH_BOUNDARY -->` marker to prevent plugin-generated links from triggering re-processing.
- **FR-003 (Link Insertion Format)**: When inserting suggested links into notes, the system MUST strictly follow Obsidian's standard WikiLink format: `[[File Name]]`. **Links must NOT include the `.md` file extension**. The inserted link block must be wrapped by `<!-- LINKS_START -->` and `<!-- LINKS_END -->` markers and placed **immediately after the `<!-- HASH_BOUNDARY -->` marker** (or at the end of the file if no marker exists). The system MUST **first remove any existing link block before inserting the new one** to prevent infinite appending. This placement ensures that links do not affect the content hash used for incremental updates.
- **FR-004 (Safe File Writing)**: When writing to files (e.g., inserting links, tags, or `note_id`), the system MUST intelligently **preserve all user original content after the `<!-- HASH_BOUNDARY -->` marker**, ensuring any content added by the user after this marker (like personal comments, other links, etc.) is not accidentally deleted. The correct file structure MUST be: 1) YAML front-matter, 2) Main user content (hashed), 3) `<!-- HASH_BOUNDARY -->` marker, 4) `<!-- LINKS_START -->` block with AI-generated links, 5) `<!-- LINKS_END -->` marker, 6) Optional user-added content after links (preserved on updates).
- **FR-005 (Batch API Requests)**: To optimize API cost and reduce latency, requests to LLMs MUST be **batched** using structured JSON format. The system should combine multiple independent scoring items (note pairs) or tag generation items (notes) into a single API request structured as a JSON array of objects. Each request object MUST include necessary context (e.g., `note_id_1`, `note_id_2`, note content/excerpts). The AI response MUST return a JSON array of result objects that include the original note_id pairs for verification and mapping back to the corresponding items, ensuring robust error handling and preventing mis-alignment of scores.
- **FR-006 (Efficient Similarity Calculation)**: Vector similarity calculations MUST be performed efficiently in the JS environment. Implementation SHOULD avoid using N*N nested loops for pairwise comparisons, instead seeking vectorized or matrix operation approaches (e.g., via math libraries or optimized algorithms) to simulate NumPy's high-performance matrix multiplication for all comparisons.
- **FR-007 (Smart Skipping)**: In addition to hash-based incremental updates, the system SHOULD implement higher-level intelligent skipping logic. During AI scoring or tag generation tasks, it should first check the cache; **if a project (e.g., a note pair or a note) already has valid scores or tags, it should skip that project** unless the user selects "Force" mode in the interface.
- **FR-008 (Settings Panel)**: System MUST implement a multi-region settings panel including "Jina AI Linker Settings", "AI Smart Scoring Configuration", "Processing Parameters", "AI Batch Processing Parameters", "AI Scoring Prompt Settings", "Link Insertion Settings", "Performance and Debugging", "AI Tag Generation Settings", etc., with all options configurable and persistent.
- **FR-009 (Quick Menu)**: System MUST provide a plugin icon in the Obsidian sidebar. Clicking it should pop up a menu with four options: "Process Notes and Insert Suggested Links", "Batch Add Hash Boundary Marker", "Batch Insert AI Tags", "Generate Unique ID for Current Note".
- **FR-010 (Data Persistence Architecture)**: To balance performance with zero-dependency requirements, the system MUST adopt a **"Master Index + Sharded Data"** caching architecture.
  - **A. Master Index File (`index.json`)**: MUST create a single, lightweight `index.json` file. This file stores all notes' **metadata** (`note_id`, file path, content hash, tags, etc.) and **relationship data** (AI scores for note pairs). This file MUST NOT store large embedding vectors to ensure fast reading and parsing.
  - **B. Sharded Embedding Data (`embeddings/<note_id>.json`)**: MUST create an `embeddings` folder. Each note's embedding vector (a large array of floats) MUST be stored as a separate JSON file within this folder, named after its `note_id`. This ensures extremely efficient updates for individual note embeddings.
  - **C. Orphaned Data Handling**: When a note file is deleted or moved outside the vault, the system MUST preserve all associated cached data (embedding files, index entries, scores) indefinitely. Orphaned data is NOT automatically cleaned up during scans. Users can manually clear all cache data via the "Clear Cache" button in settings, which prevents accidental data loss and allows recovery if files are temporarily moved or renamed.
- **FR-011 (Pure TS Architecture)**: The entire plugin MUST run independently within Obsidian's JavaScript environment, with NO external runtime dependencies.
- **FR-012 (Three-Tier Error Handling)**: System MUST classify all API errors into three categories and handle each differently:
  - **Configuration Errors** (401 Unauthorized, 404 Not Found, 400 Bad Request): Immediate failure without retry. Display non-blocking notification banner (Obsidian Notice) with actionable guidance (e.g., "Invalid API key, check settings"). Abort current task, release task lock, log full error to console.
  - **Transient Errors** (500/503 server errors, 504 timeout, 429 rate limit, network interruption): Implement exponential backoff retry (max 3 attempts with 1s, 2s, 4s delays). Only show notification on final failure with manual retry button. Log all retry attempts.
  - **Content Errors** (note exceeds API context window, unprocessable characters): Skip problematic note, continue processing remaining queue items. Report skipped notes in final task summary with specific reasons. Log note names and error causes.
- **FR-013 (AI Tag Insertion)**: When the "Batch Insert AI Tags" feature generates tags for a note, the system MUST insert them in the YAML front-matter under the `tags:` field (as array or comma-separated string based on existing format). AI-generated tags MUST be intelligently merged with any existing user tags, avoiding duplicates. The system MUST preserve the existing front-matter structure and formatting. Tags enable native Obsidian search and are compatible with the tag pane and other plugins.

### Key Entities

- **Note**: Represents a single markdown file in the Obsidian vault. Key attributes: `note_id` (unique identifier), `file_path`, `content_hash` (SHA-256 of main content), `tags` (array of strings), `embedding` (array of floats).
- **User Settings**: Configuration data for the plugin. Key attributes: `jina_api_key`, `jina_model_name`, `jina_max_chars`, `ai_provider`, `ai_api_url`, `ai_api_key`, `ai_model_name`, `default_scan_path`, `excluded_folders`, `excluded_patterns`, `similarity_threshold`, `min_ai_score`, `max_links_per_note`, `use_custom_prompt`, `custom_prompt`, `force_mode_default`.
- **Cache**: Persistent storage for computed data. Consists of: `index.json` (master index) and `embeddings/<note_id>.json` (sharded embeddings).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users report 80%+ satisfaction with the quality and relevance of suggested links generated by the plugin.
- **SC-002**: The system processes similarity calculations for 1000 notes within 5 minutes on standard consumer hardware (i.e., typical laptop specifications).
- **SC-003**: Any user can configure all necessary API settings (Jina, Gemini, etc.) entirely via the graphical settings panel without editing code.
- **SC-004**: The plugin maintains a responsive UI during background AI processing; no freezing or lag experienced by the user during normal usage.
- **SC-005**: Incremental updates detect and only process notes whose content has changed, reducing processing time by at least 90% compared to a full scan for minor changes.
- **SC-006**: All data (embeddings, scores, note IDs) persists reliably in JSON format across plugin restarts and Obsidian sessions.
- **SC-007**: Progress dialogs accurately reflect the completion percentage of long-running tasks and provide a functional option to cancel operations.
- **SC-008**: The TypeScript codebase maintains strict type checking with comprehensive JSDoc documentation coverage for all public APIs and core internal components.