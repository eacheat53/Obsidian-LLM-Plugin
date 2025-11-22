# Obsidian LLM Plugin

[English](README.md) | [中文](README_CN.md)

A powerful, highly configurable, pure TypeScript Obsidian plugin that uses AI services to automatically analyze notes and insert intelligent link suggestions.
![3.png](.assets/3.png)

## Features

- **AI-Powered Link Suggestions**: Uses Jina embeddings and LLMs (Gemini, OpenAI, etc.) to analyze semantic similarity between notes and suggest relevant links
- **Intelligent Tag Generation**: Automatically generates contextual tags for your notes using AI
- **Incremental Updates**: Efficient content hash-based change detection ensures only modified notes are reprocessed
- **Zero External Dependencies**: Pure TypeScript implementation with no runtime dependencies
- **Highly Configurable**: Comprehensive settings panel with 23+ configurable parameters
- **Non-Blocking UI**: All long-running operations run in the background with progress tracking
- **Smart Caching**: Master index + sharded embedding architecture for optimal performance

## Installation

### From Release

1. Download the latest release from the [Releases](https://github.com/eacheat53/obsidian-llm-plugin/releases) page
2. Extract the files to your vault's `.obsidian/plugins/obsidian-llm-plugin/` directory
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

### From Source

```bash
# Clone the repository
git clone https://github.com/eacheat53/Obsidian-LLM-Plugin.git
cd obsidian-llm-plugin

# Install dependencies (using pnpm)
pnpm install

# Build the plugin
pnpm run build

# Copy to your vault (files are in dist/ directory)
cp dist/main.js dist/sql-wasm.wasm manifest.json styles.css /path/to/your/vault/.obsidian/plugins/obsidian-llm-plugin/
```

## Configuration

### Required API Keys

1. **Jina AI API Key**: Get your API key from [Jina AI](https://jina.ai/)
2. **LLM Provider API Key**: Choose from:
   - Google Gemini: Get key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - OpenAI: Get key from [OpenAI Platform](https://platform.openai.com/api-keys)

### Settings Overview

Open Settings → Obsidian LLM Plugin to configure:

- **Jina AI Settings**: API key, model name, max characters
- **AI Smart Scoring Configuration**: LLM provider selection and credentials
- **Processing Parameters**: Scan paths, excluded folders, file patterns
- **Link Insertion Settings**: Similarity thresholds, score limits, max links per note
- **AI Scoring Prompt Settings**: Customize AI scoring prompts
- **AI Tag Generation Settings**: Customize tag generation prompts
- **AI Batch Processing Parameters**: Batch sizes for API optimization
- **Performance and Debugging**: Cache management, statistics, debug logging

## Usage

### Quick Access Menu

Click the Obsidian LLM Plugin icon in the left sidebar to access:

1. **Process Notes and Insert Suggested Links**: Runs the full workflow (scan → embed → score → insert links)
2. **Batch Insert AI Tags**: Generate AI tags for selected notes or folders
3. **Generate Unique ID for Current Note**: Add unique UUID to active note's front-matter

### Workflow

1. **Initial Setup**: Add hash boundary markers and UUIDs to your notes
2. **Process Notes**: Run the main workflow to generate embeddings and calculate similarities
3. **Review Links**: Check the suggested links inserted after `<!-- HASH_BOUNDARY -->` in each note
4. **Add Tags** (optional): Use batch tag generation to organize your vault

### File Structure

The plugin modifies your notes in a structured way:

```markdown
---
note_id: 550e8400-e29b-41d4-a716-446655440000
tags: [ai-generated, knowledge-base]
---

Your main content goes here...

<!-- HASH_BOUNDARY -->
- [[Related Note 1]]
- [[Related Note 2]]


Additional content you add here is preserved...
```

## How It Works

1. **Scan Vault**: Plugin scans all markdown files (respecting exclusion patterns)
2. **Generate UUIDs**: Ensures each note has a unique identifier in front-matter
3. **Calculate Hashes**: SHA-256 hash of main content (before `<!-- HASH_BOUNDARY -->`)
4. **Generate Embeddings**: Calls Jina API to create vector embeddings for changed notes
5. **Calculate Similarity**: Cosine similarity between all note pairs
6. **AI Scoring**: LLM evaluates relevance of similar note pairs (0-10 score)
7. **Insert Links**: Top-scored links inserted in WikiLink format `[[Note Title]]`

## Performance

- Processes 1000 notes in <5 minutes on standard hardware
- 90%+ reduction in processing time with incremental updates
- Responsive UI during background operations
- Efficient sharded cache architecture supports vaults with 10,000+ notes

## Troubleshooting

### Links Not Appearing

- Check API keys are correctly configured
- Verify similarity threshold isn't too high (try 0.7)
- Ensure minimum AI score isn't too restrictive (try 5)
- Check excluded folders/patterns aren't filtering your notes

### High API Costs

- Reduce "Jina Embedding Max Characters" (default: 8000)
- Increase "Jina Similarity Threshold" to score fewer pairs
- Use batch processing settings to optimize requests
- Enable incremental updates with hash boundary markers

### Performance Issues

- Clear cache via Settings → Performance and Debugging
- Reduce batch sizes if memory usage is high
- Add more folders to exclusion list (e.g., attachments, templates)

### Debug Mode

Enable debug logging in Settings → Performance and Debugging, then check the Developer Console (Ctrl/Cmd+Shift+I) for detailed logs.

## Development

See [quickstart.md](specs/002-ai-linker-plugin/quickstart.md) for development setup and contribution guidelines.

## Architecture

- **Pure TypeScript**: No external runtime dependencies
- **Service Layer**: Modular design (api-service, ai-logic-service, cache-service, etc.)
- **Sharded Cache**: Master index (`index.json`) + per-note embeddings
- **Three-Tier Error Handling**: Configuration/Transient/Content error classification
- **Async/Await**: All I/O operations are non-blocking

## License

MIT
