# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a sophisticated AI-powered Obsidian plugin that uses embeddings and LLM scoring to automatically generate contextual links and tags between notes. The plugin features Jina AI embeddings, multi-provider LLM support, and a robust caching system with incremental updates.

## Development Commands

```bash
# Install dependencies
pnpm install

# Development build with file watching
npm run dev

# Production build
npm run build

# Linting
npm run lint

# Create release package
npm run release
```

## Architecture

### Core Services (`src/services/`)

- **api-service.ts**: External API calls to Jina and LLM providers (Gemini, OpenAI, Anthropic)
- **log-service.ts**: Error tracking and failure logging
- **notifier.ts**: User notifications and progress updates
- **task-manager.ts**: Background task coordination and progress tracking

### Core Business Logic (`src/core/`)

- **ai-service.ts**: AI scoring and tag generation logic
- **note-processor.ts**: Note parsing, UUID management, content hashing
- **link-injector.ts**: Link insertion and link ledger management
- **workflow-service.ts**: High-level workflow orchestration

### Storage Layer (`src/storage/`)
- **cache-service.ts**: Master index and embedding caching with sharded storage

### UI Components (`src/ui/`)

- **settings-tab.ts**: Comprehensive settings interface with 23+ parameters
- **sidebar-menu.ts**: Quick access sidebar integration
- **progress-modal.ts**: Real-time progress tracking
- **single-run-modal.ts**: Single operation workflows

### Main Plugin Entry Point

- **main.ts**: Plugin initialization, command registration, and workflow orchestration

## Key Configuration

### Required Setup
- **Jina AI API Key**: For embeddings generation
- **LLM Provider Key**: Gemini, OpenAI, or other services
- **Settings**: Configurable via plugin settings UI

### Critical Settings
- `similarity_threshold`: 0.0-1.0 for minimum similarity between notes
- `min_ai_score`: 0-10 for minimum AI relevance score
- `max_links_per_note`: Limit links per note (1-50)
- `jina_max_chars`: Content truncation limit for embeddings
- Batch processing sizes for API optimization

## Plugin Workflows

### Main Pipeline
1. **Scan Vault**: Find markdown files respecting exclusion patterns
2. **Generate Embeddings**: Jina API for vector representations
3. **Calculate Similarity**: Cosine similarity between note pairs
4. **AI Scoring**: LLM evaluates relevance (0-10 scale)
5. **Insert Links**: WikiLinks after hash boundary
6. **Generate Tags**: AI-generated contextual tags in frontmatter

### Specialized Workflows
- **Embedding Only**: Generate embeddings without scoring
- **Batch Tagging**: Generate tags for multiple notes
- **Link Recalibration**: Update links based on threshold changes
- **Data Cleanup**: Remove orphaned entries and broken links
- **Health Check**: Validate cache consistency

## File Modifications

The plugin modifies notes by:
- Adding UUIDs to frontmatter: `note_id: uuid-here`
- Adding hash boundary: `<!-- HASH_BOUNDARY -->`
- Inserting links after boundary: `- [[Related Note]]`
- Generating tags in frontmatter: `tags: [ai-generated, topic]`

## Performance & Scaling

- **90%+ reduction** in processing time with incremental updates
- **Supports 10,000+ note vaults**
- **Processes 1000 notes in <5 minutes**
- **Non-blocking UI operations**
- **Memory-efficient sharded cache**

## Error Handling

### Three-Tier Classification
1. **Configuration**: API keys, settings issues
2. **Transient**: Network timeouts, rate limits
3. **Content**: Invalid markdown, parsing failures

### Recovery Features
- Automatic retry with exponential backoff
- Failure logging with batch recovery
- Orphan data cleanup utilities
- Health validation and repair

## Cache Structure

- **Master Index**: `index.json` with note metadata and links
- **Sharded Embeddings**: Separate files for note embeddings
- **SHA-256 Hashing**: Content change detection for incremental updates
- **Link Ledger**: Tracks all inserted links for validation

## Development Tips

1. **Start with `main.ts`** - Orchestrates all workflows and service initialization
2. **Understand service boundaries** - Each service has clear responsibilities
3. **Review `plugin-settings.ts`** - 23+ configuration parameters with defaults
4. **Test incrementally** - Use specialized workflows for focused testing
5. **Monitor error logs** - Built-in failure tracking and recovery systems
6. **Check cache consistency** - Use health check utilities for validation

## Type System

Strong TypeScript typing throughout:
- Note metadata and processing states
- API request/response structures
- Cache data structures
- Task management types
- Plugin settings interface