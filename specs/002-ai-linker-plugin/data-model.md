# Data Model: Obsidian AI Linker Plugin

**Branch**: `002-ai-linker-plugin`
**Date**: 2025-10-25
**Phase**: Phase 1 Design

## Overview

This document defines the core data entities, their attributes, relationships, validation rules, and state transitions for the Obsidian AI Linker Plugin. The data model follows the constitution's requirement for JSON-based persistence with a master index + sharded architecture.

---

## Core Entities

### 1. Note Metadata

Represents the cached metadata for a single note in the vault.

```typescript
interface NoteMetadata {
  // Identity
  note_id: string;              // UUID v4, stable identifier
  file_path: string;            // Relative path from vault root

  // Content tracking
  content_hash: string;         // SHA-256 hash of main content (before HASH_BOUNDARY)
  last_processed: number;       // Unix timestamp (ms) of last processing

  // AI-generated data
  tags: string[];               // AI-generated tags merged with user tags

  // Validation metadata
  has_frontmatter: boolean;     // Whether note has valid YAML front-matter
  has_hash_boundary: boolean;   // Whether note contains <!-- HASH_BOUNDARY --> marker
  has_links_section: boolean;   // Whether note has <!-- LINKS_START/END --> block
}
```

**Validation Rules**:
- `note_id`: Must be valid UUID v4 format
- `file_path`: Must be relative path, no leading slash, must end in `.md`
- `content_hash`: Must be 64-character hexadecimal SHA-256 hash
- `last_processed`: Must be positive integer (Unix timestamp in milliseconds)
- `tags`: Array of non-empty strings, no duplicates, trimmed

**Lifecycle**:
1. **Creation**: When note is first processed
2. **Update**: When content hash changes or force mode is enabled
3. **Orphaned**: When file is deleted/moved (preserved in cache per FR-010.C)
4. **Purged**: Only via manual "Clear Cache" action

---

### 2. Note Pair Score

Represents an AI-generated relevance score between two notes.

```typescript
interface NotePairScore {
  note_id_1: string;            // First note UUID (lexicographically smaller)
  note_id_2: string;            // Second note UUID (lexicographically larger)
  similarity_score: number;     // Cosine similarity (0.0 to 1.0)
  ai_score: number;             // LLM relevance score (0 to 10)
  last_scored: number;          // Unix timestamp (ms) when AI scoring occurred
}
```

**Validation Rules**:
- `note_id_1` < `note_id_2` lexicographically (canonical ordering)
- `similarity_score`: Float in range [0.0, 1.0]
- `ai_score`: Integer in range [0, 10]
- `last_scored`: Positive integer (Unix timestamp in milliseconds)

**Key Constraint**: Each pair `(note_id_1, note_id_2)` appears exactly once in the index.

**State Transitions**:
1. **Candidate**: `similarity_score >= jina_similarity_threshold` (from settings)
2. **Scored**: After LLM assigns `ai_score`
3. **Link-Worthy**: `ai_score >= min_ai_score_for_link_insertion` (from settings)
4. **Inserted**: After link inserted into note (tracked separately)

---

### 3. Embedding Vector

Represents the vector embedding for a note's content.

```typescript
interface EmbeddingVector {
  note_id: string;              // UUID v4
  embedding: number[];          // Float array from Jina API
  model_name: string;           // Jina model used (e.g., "jina-embeddings-v2-base-en")
  created_at: number;           // Unix timestamp (ms) when embedding was generated
  content_preview: string;      // First 200 chars of hashed content (for debugging)
}
```

**Validation Rules**:
- `note_id`: Must be valid UUID v4
- `embedding`: Non-empty array of floats, length depends on Jina model (typically 768 or 1024)
- `model_name`: Non-empty string
- `created_at`: Positive integer timestamp
- `content_preview`: Max 200 characters, trimmed

**Storage**: Each embedding is stored in a separate file: `embeddings/<note_id>.json`

---

### 4. Plugin Settings

User configuration for the plugin.

```typescript
interface PluginSettings {
  // Jina AI Configuration
  jina_api_key: string;                 // API key (stored securely)
  jina_model_name: string;              // Default: "jina-embeddings-v2-base-en"
  jina_embedding_max_chars: number;     // Default: 8000

  // AI Smart Scoring Configuration
  ai_provider: string;                  // e.g., "gemini", "openai", "anthropic"
  ai_api_url: string;                   // Provider-specific endpoint
  ai_api_key: string;                   // API key (stored securely)
  ai_model_name: string;                // e.g., "gemini-1.5-flash"

  // Processing Parameters
  default_scan_path: string;            // Default: "/"
  excluded_folders: string[];           // Default: [".obsidian", "Attachments"]
  excluded_file_patterns: string[];     // Default: ["*.excalidraw"]

  // Link Insertion Settings
  jina_similarity_threshold: number;    // Default: 0.7, range [0.0, 1.0]
  min_ai_score: number;                 // Default: 7, range [0, 10]
  max_links_per_note: number;           // Default: 7, range [1, 50]

  // AI Scoring Prompt Settings
  use_custom_scoring_prompt: boolean;   // Default: false
  custom_scoring_prompt: string;        // User-defined prompt

  // AI Tag Generation Settings
  use_custom_tag_prompt: boolean;       // Default: false
  custom_tag_prompt: string;            // User-defined prompt

  // AI Batch Processing
  batch_size_scoring: number;           // Default: 10, range [1, 50]
  batch_size_tagging: number;           // Default: 5, range [1, 20]

  // Performance & Debugging
  enable_debug_logging: boolean;        // Default: false
}
```

**Validation Rules**:
- `jina_api_key`, `ai_api_key`: Non-empty strings when provider is active
- `jina_embedding_max_chars`: Integer >= 100
- `default_scan_path`: Valid vault path (relative)
- `jina_similarity_threshold`: Float in [0.0, 1.0]
- `min_ai_score`: Integer in [0, 10]
- `max_links_per_note`: Integer in [1, 50]
- `batch_size_scoring`: Integer in [1, 50]
- `batch_size_tagging`: Integer in [1, 20]

**Storage**: Stored in Obsidian's data.json (plugin settings API)

---

### 5. Master Index

The central cache file containing all metadata and relationships.

```typescript
interface MasterIndex {
  version: string;                      // Cache schema version (e.g., "1.0.0")
  last_updated: number;                 // Unix timestamp (ms)

  // Note metadata (indexed by note_id)
  notes: Record<string, NoteMetadata>;

  // Note pair scores (indexed by composite key)
  scores: Record<string, NotePairScore>;  // Key format: "noteId1:noteId2"

  // Statistics
  stats: {
    total_notes: number;
    total_embeddings: number;
    total_scores: number;
    orphaned_notes: number;             // Notes no longer in vault
  };
}
```

**Storage**: `<vault>/.obsidian/plugins/jina-ai-linker/cache/index.json`

**Key Constraint**: Composite key for scores is `${note_id_1}:${note_id_2}` where `note_id_1 < note_id_2`.

---

## Relationships

```
┌─────────────────┐
│  Note File      │
│  (Markdown)     │
└────────┬────────┘
         │ has
         │ front-matter with
         ▼
    ┌─────────┐
    │ note_id │ (UUID)
    └────┬────┘
         │
         │ references
         ▼
┌──────────────────┐         ┌──────────────────────┐
│  NoteMetadata    │◄───────►│  EmbeddingVector     │
│  (in index.json) │  1:1    │  (embeddings/*.json) │
└────────┬─────────┘         └──────────────────────┘
         │
         │ participates in
         │ M:N
         ▼
┌──────────────────┐
│  NotePairScore   │
│  (in index.json) │
└──────────────────┘
```

**Cardinality**:
- 1 Note → 1 NoteMetadata (required)
- 1 NoteMetadata → 0..1 EmbeddingVector (may not be generated yet)
- 1 NoteMetadata → 0..N NotePairScore (as note_id_1 or note_id_2)
- Each NotePairScore references exactly 2 NoteMetadata entries

---

## State Machine: Note Processing

```
   ┌─────────┐
   │  New    │
   │  Note   │
   └────┬────┘
        │
        ▼
   ┌─────────────┐
   │ No note_id  │
   │   detected  │
   └──────┬──────┘
          │
          │ Generate & write UUID
          ▼
   ┌──────────────┐
   │ Has note_id  │
   │   in front-  │
   │   matter     │
   └──────┬───────┘
          │
          │ Calculate hash
          ▼
   ┌──────────────┐           ┌────────────────┐
   │  Check cache │───No──────►  Generate      │
   │  for hash    │   match   │  embedding     │
   └──────┬───────┘           └────────┬───────┘
          │                            │
          │ Hash matches               │
          │ (no changes)               │
          │                            │
          ▼                            ▼
   ┌──────────────┐           ┌────────────────┐
   │  Skip        │           │  Update cache  │
   │  (incremental│           │  & embedding   │
   │   update)    │           └────────┬───────┘
   └──────────────┘                    │
                                       │
                                       ▼
                                ┌──────────────┐
                                │  Calculate   │
                                │  similarity  │
                                │  with others │
                                └──────┬───────┘
                                       │
                                       ▼
                                ┌─���────────────┐
                                │  Batch AI    │
                                │  scoring     │
                                └──────┬───────┘
                                       │
                                       ▼
                                ┌──────────────┐
                                │  Insert      │
                                │  links       │
                                └──────────────┘
```

---

## Cache Operations

### Read Operations
1. **Load Master Index**: Parse `index.json`, validate schema version
2. **Load Embedding**: Read `embeddings/<note_id>.json` on demand
3. **Query Scores**: Filter scores by note_id or score thresholds

### Write Operations
1. **Update Note Metadata**: Modify `notes` object, increment `last_updated`
2. **Add/Update Score**: Upsert in `scores` object, update stats
3. **Save Embedding**: Write individual file `embeddings/<note_id>.json`
4. **Atomic Save**: Write to temp file, then rename (crash-safe)

### Cleanup Operations
1. **Clear Cache**: Delete `index.json` and all `embeddings/*.json` files
2. **Orphan Detection**: Compare `notes` keys with actual vault files (manual, not automatic)

---

## Data Integrity

### Constraints
1. **Referential Integrity**: Every `note_id` in `scores` must exist in `notes`
2. **Embedding Consistency**: If `notes[note_id]` exists, `embeddings/<note_id>.json` should exist (or be pending generation)
3. **Hash Uniqueness**: No two notes with the same `content_hash` (edge case: identical notes)

### Validation on Load
```typescript
function validateMasterIndex(index: MasterIndex): ValidationResult {
  // Check schema version compatibility
  // Verify all note_id references in scores exist in notes
  // Validate all field types and ranges
  // Compute stats and verify against stored stats
}
```

### Error Recovery
- **Corrupted index.json**: Regenerate from scratch by scanning vault
- **Missing embedding file**: Regenerate on next processing run
- **Orphaned scores**: Preserve until manual cache clear (per FR-010.C)

---

## Performance Considerations

### Indexing Strategy
- **In-Memory**: Load entire `index.json` on plugin load (~1-2MB for 10k notes)
- **Lazy Embeddings**: Load embedding vectors only when needed for similarity calculation
- **Sharding**: One file per embedding prevents full rewrite on single note update

### Expected Sizes
- **1 Note Metadata**: ~200 bytes
- **1 Note Pair Score**: ~100 bytes
- **1 Embedding (768-dim)**: ~3KB (as JSON)
- **10,000 Notes**:
  - Master Index: ~2MB (metadata) + ~50MB (scores for all pairs - sparse)
  - Embeddings: ~30MB (10k × 3KB)

### Query Optimization
- **Scores Lookup**: Index by composite key `noteId1:noteId2` for O(1) access
- **Top-N Links**: Sort scores by `ai_score` DESC, limit to `max_links_per_note`

---

## Migration Strategy

Future schema changes will include:

```typescript
interface MasterIndex {
  version: string;  // Semantic versioning
  migrations: {
    from_version: string;
    applied_at: number;
  }[];
}
```

Migration path: `1.0.0 → 1.1.0` example:
- Add new optional fields with defaults
- Never remove fields (deprecate instead)
- Provide migration script in plugin for major versions
