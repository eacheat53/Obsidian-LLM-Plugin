# Quickstart Guide: Obsidian AI Linker Plugin

**Branch**: `002-ai-linker-plugin`
**For**: New developers joining the project
**Last Updated**: 2025-10-25

---

## Overview

Welcome to the Obsidian AI Linker Plugin project! This guide will help you set up your development environment, understand the architecture, and make your first contribution.

### What This Plugin Does

- Analyzes notes in an Obsidian vault using AI embeddings (Jina AI)
- Calculates semantic similarity between notes
- Uses LLMs (Gemini, OpenAI, etc.) to score note pair relevance
- Automatically inserts suggested links in Markdown notes
- Generates AI-powered tags for knowledge organization
- Implements efficient incremental updates via content hashing

### Key Constraints

✅ **Pure TypeScript/JavaScript** - No external runtimes (Python, Go, etc.)
✅ **Zero runtime dependencies** - Uses built-in Web APIs
✅ **JSON-based storage** - Master index + sharded embeddings
✅ **Async-first** - Non-blocking UI during long operations

---

## Prerequisites

### Required

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Obsidian**: v1.0.0 or higher (for testing)
- **Git**: For version control

### Recommended

- **VS Code** with TypeScript extension
- **Obsidian Sample Vault** for testing (see setup below)

---

## Quick Setup (5 minutes)

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/obsidian-llm-plugin.git
cd obsidian-llm-plugin

# Install dependencies
npm install

# Build the plugin
npm run build
```

### 2. Create a Test Vault

```bash
# Create a test vault directory
mkdir -p ~/obsidian-test-vault/.obsidian/plugins/jina-ai-linker

# Link your development build to the test vault
ln -s "$(pwd)/main.js" ~/obsidian-test-vault/.obsidian/plugins/jina-ai-linker/main.js
ln -s "$(pwd)/manifest.json" ~/obsidian-test-vault/.obsidian/plugins/jina-ai-linker/manifest.json
ln -s "$(pwd)/styles.css" ~/obsidian-test-vault/.obsidian/plugins/jina-ai-linker/styles.css
```

### 3. Open in Obsidian

1. Launch Obsidian
2. Open vault: `~/obsidian-test-vault`
3. Go to Settings → Community Plugins
4. Enable "Jina AI Linker Plugin"
5. Configure API keys in plugin settings

### 4. Start Development Mode

```bash
# Watch for changes and rebuild automatically
npm run dev
```

Now you can edit code, save, and reload Obsidian (Ctrl+R / Cmd+R) to see changes!

---

## Project Structure

```
obsidian-llm-plugin/
├── src/
│   ├── main.ts                    # ⭐ Plugin entry point
│   ├── plugin-settings.ts         # Settings schema and defaults
│   │
│   ├── services/
│   │   ├── api-service.ts         # 🔌 External API calls (Jina, LLMs)
│   │   ├── ai-logic-service.ts    # 🧠 Core AI workflows
│   │   ├── cache-service.ts       # 💾 JSON persistence layer
│   │   ├── link-injector-service.ts # ✍️ Markdown link insertion
│   │   ├── note-processor.ts      # 📄 Note scanning & hashing
│   │   └── task-manager.ts        # ⚙️ Background task orchestration
│   │
│   ├── ui/
│   │   ├── settings-tab.ts        # ⚙️ Main settings interface
│   │   ├── progress-modal.ts      # 📊 Progress dialog
│   │   ├── batch-tag-modal.ts     # 🏷️ Tag generation modal
│   │   └── sidebar-menu.ts        # 📌 Ribbon icon & menu
│   │
│   ├── utils/
│   │   ├── id-generator.ts        # 🆔 UUID generation
│   │   ├── hash-utils.ts          # #️⃣ SHA-256 hashing
│   │   ├── vector-math.ts         # 📐 Cosine similarity
│   │   ├── frontmatter-parser.ts  # 📋 YAML manipulation
│   │   └── error-classifier.ts    # 🚨 Three-tier error handling
│   │
│   └── types/
│       ├── index.ts               # 📘 Main type definitions
│       ├── api-types.ts           # 🔌 API contracts
│       └── cache-types.ts         # 💾 Cache schemas
│
├── specs/002-ai-linker-plugin/   # 📚 Design documentation
│   ├── spec.md                    # Feature specification
│   ├── plan.md                    # Implementation plan
│   ├── research.md                # Technology decisions
│   ├── data-model.md              # Data entities
│   └── contracts/                 # API contracts
│
├── manifest.json                  # Obsidian plugin manifest
├── package.json                   # NPM configuration
├── tsconfig.json                  # TypeScript config
└── rollup.config.js               # Build configuration
```

---

## Architecture Overview

### Data Flow: Link Generation

```
User clicks "Process Notes" in sidebar
           ↓
   [task-manager.ts]
   Start background task
           ↓
   [note-processor.ts]
   Scan vault for .md files
   Generate UUIDs if missing
   Calculate SHA-256 hashes
           ↓
   [cache-service.ts]
   Check if content changed
   (Skip if hash matches)
           ↓
   [api-service.ts]
   Batch call Jina API
   Get embeddings
           ↓
   [vector-math.ts]
   Calculate cosine similarity
   for all note pairs
           ↓
   Filter by threshold (e.g., >0.7)
           ↓
   [ai-logic-service.ts]
   Batch call LLM for scoring
   (e.g., Gemini)
           ↓
   Filter by AI score (e.g., ≥7)
           ↓
   [link-injector-service.ts]
   Insert [[WikiLinks]]
   after <!-- HASH_BOUNDARY -->
           ↓
   [progress-modal.ts]
   Show completion summary
```

### Key Design Patterns

1. **Service Layer**: Business logic isolated in `services/` directory
2. **Sharded Cache**: Master index (`index.json`) + per-note embedding files
3. **Incremental Updates**: SHA-256 hash comparison prevents redundant API calls
4. **Three-Tier Errors**: Configuration/Transient/Content error classification
5. **Async/Await**: All I/O operations non-blocking

---

## Development Workflows

### Making Your First Change

**Example Task**: Add a new setting for minimum tags per note

#### 1. Update Settings Schema

```typescript
// src/plugin-settings.ts

export interface PluginSettings {
  // ... existing settings ...

  // Add new setting
  min_tags_per_note: number;  // NEW
}

export const DEFAULT_SETTINGS: PluginSettings = {
  // ... existing defaults ...
  min_tags_per_note: 3,  // NEW
};
```

#### 2. Add UI Control

```typescript
// src/ui/settings-tab.ts

export class SettingsTab extends PluginSettingTab {
  display(): void {
    // ... existing settings ...

    // NEW: Add slider for minimum tags
    new Setting(containerEl)
      .setName('Minimum Tags per Note')
      .setDesc('Require at least this many tags from AI')
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.min_tags_per_note)
        .onChange(async (value) => {
          this.plugin.settings.min_tags_per_note = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
```

#### 3. Use in Business Logic

```typescript
// src/services/ai-logic-service.ts

async generateTags(noteId: string): Promise<string[]> {
  const tags = await this.callLLMForTags(noteId);

  // NEW: Enforce minimum tag count
  if (tags.length < this.settings.min_tags_per_note) {
    throw new ContentError(`Insufficient tags: got ${tags.length}, need ${this.settings.min_tags_per_note}`);
  }

  return tags;
}
```

#### 4. Test Your Change

```bash
npm run build
# Reload Obsidian (Ctrl+R)
# Open Settings → Jina AI Linker
# Verify new slider appears
# Generate tags and verify enforcement
```

---

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- hash-utils.test.ts

# Run tests in watch mode
npm test -- --watch
```

### Example Test

```typescript
// src/utils/hash-utils.test.ts

import { calculateContentHash } from './hash-utils';

describe('calculateContentHash', () => {
  it('should generate consistent SHA-256 hash', async () => {
    const content = 'Hello, world!';
    const hash1 = await calculateContentHash(content);
    const hash2 = await calculateContentHash(content);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different hashes for different content', async () => {
    const hash1 = await calculateContentHash('Content A');
    const hash2 = await calculateContentHash('Content B');

    expect(hash1).not.toBe(hash2);
  });
});
```

### Manual Testing Checklist

Before submitting a PR:

- [ ] Plugin loads without errors in Obsidian
- [ ] All settings persist after reload
- [ ] Progress dialog shows accurate percentage
- [ ] Cancel button stops background tasks
- [ ] Links inserted in correct format (`[[Note Title]]`)
- [ ] Incremental updates skip unchanged notes
- [ ] Error notifications show helpful messages

---

## Common Tasks

### Adding a New API Provider

1. **Create adapter** in `src/services/api-adapters/`
   ```typescript
   // src/services/api-adapters/anthropic-adapter.ts
   export class AnthropicAdapter implements LLMAdapter {
     async scoreBatch(request: ScoringBatchRequest): Promise<ScoringBatchResponse> {
       // Implementation
     }
   }
   ```

2. **Register in api-service.ts**
   ```typescript
   const adapters = {
     'gemini': new GeminiAdapter(),
     'openai': new OpenAIAdapter(),
     'anthropic': new AnthropicAdapter(),  // NEW
   };
   ```

3. **Add to settings dropdown**
   ```typescript
   // src/ui/settings-tab.ts
   .addDropdown(dropdown => dropdown
     .addOption('gemini', 'Google Gemini')
     .addOption('openai', 'OpenAI')
     .addOption('anthropic', 'Anthropic Claude')  // NEW
   )
   ```

### Debugging Tips

**Enable Debug Logging**:
```typescript
// src/main.ts
if (this.settings.enable_debug_logging) {
  console.log('[AI Linker] Processing note:', noteId);
}
```

**Inspect Cache**:
```bash
# View master index
cat ~/obsidian-test-vault/.obsidian/plugins/jina-ai-linker/cache/index.json | jq

# Count embedding files
ls ~/obsidian-test-vault/.obsidian/plugins/jina-ai-linker/cache/embeddings/ | wc -l
```

**Hot Reload Shortcut**:
- Windows/Linux: `Ctrl + R`
- macOS: `Cmd + R`

---

## Code Style Guidelines

### TypeScript

```typescript
// ✅ GOOD: Explicit types, JSDoc
/**
 * Calculate cosine similarity between two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score in range [0, 1]
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }
  // Implementation...
}

// ❌ BAD: No types, no documentation
export function cosineSimilarity(a, b) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}
```

### Error Handling

```typescript
// ✅ GOOD: Use custom error types
import { ConfigurationError, TransientError, ContentError } from './errors';

if (response.status === 401) {
  throw new ConfigurationError('Invalid API key');
}

// ❌ BAD: Generic errors
if (response.status === 401) {
  throw new Error('API error');
}
```

### Async/Await

```typescript
// ✅ GOOD: Async/await, proper error handling
async function processNotes(): Promise<void> {
  try {
    const notes = await this.scanVault();
    await this.generateEmbeddings(notes);
  } catch (error) {
    this.handleError(error);
  }
}

// ❌ BAD: Promise chains
function processNotes() {
  return this.scanVault()
    .then(notes => this.generateEmbeddings(notes))
    .catch(error => this.handleError(error));
}
```

---

## Resources

### Documentation
- **Feature Spec**: `specs/002-ai-linker-plugin/spec.md`
- **Data Model**: `specs/002-ai-linker-plugin/data-model.md`
- **API Contracts**: `specs/002-ai-linker-plugin/contracts/`
- **Constitution**: `.specify/memory/constitution.md`

### External References
- [Obsidian API Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian Plugin Development Guide](https://marcus.se.net/obsidian-plugin-docs/)
- [Jina AI Embeddings API](https://jina.ai/embeddings/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

### Community
- **GitHub Issues**: Report bugs and request features
- **Discussions**: Ask questions and share ideas
- **Pull Requests**: Contribute code (see CONTRIBUTING.md)

---

## Troubleshooting

### Build Errors

**Problem**: `Cannot find module 'obsidian'`
```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Problem**: TypeScript errors in VS Code
```bash
# Solution: Reload VS Code window
Ctrl/Cmd + Shift + P → "Reload Window"
```

### Runtime Errors

**Problem**: Plugin doesn't appear in Obsidian
- Check `manifest.json` has correct `id` and `name`
- Verify plugin is enabled in Settings → Community Plugins
- Check Obsidian console for errors (Ctrl/Cmd + Shift + I)

**Problem**: API calls failing
- Verify API keys in settings (show/hide password fields)
- Check network connection
- Enable debug logging and inspect console

---

## Next Steps

1. ✅ Complete this quickstart
2. 📖 Read `specs/002-ai-linker-plugin/spec.md` for requirements
3. 🏗️ Review `specs/002-ai-linker-plugin/data-model.md` for architecture
4. 🐛 Pick a "good first issue" from GitHub
5. 💬 Join community discussions

**Happy coding!** 🚀
