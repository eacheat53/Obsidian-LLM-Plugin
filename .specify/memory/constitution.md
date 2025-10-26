<!-- SYNC IMPACT REPORT
Version change: N/A (initial version) → 1.0.0
List of modified principles: N/A
Added sections: All principles based on user-provided Chinese principles
Removed sections: Template placeholders
Templates requiring updates: ⚠ pending - .specify/templates/plan-template.md, .specify/templates/spec-template.md, .specify/templates/tasks-template.md, .specify/templates/commands/*.toml
Follow-up TODOs: None
-->
# Obsidian LLM Plugin Constitution

## Core Principles

### Core Project Goal
Build a self-contained, pure TypeScript/JavaScript Obsidian plugin that utilizes AI services (text embeddings and large language models) to analyze note content and automatically recommend and insert relevant note links. The plugin MUST operate with zero external dependencies and MUST NOT require any external runtime environments (e.g., Python, Go, Java) to run.

### Core Architecture & Module Design
The plugin MUST follow a single-process architecture where all logic executes asynchronously within the plugin's process. Codebase MUST be organized into clearly defined, single-responsibility modules: services/api-service.ts for external API requests using Obsidian's built-in request API; services/ai-logic-service.ts for orchestrating core AI workflows; services/cache-service.ts for data persistence using a single JSON file; services/link-injector-service.ts for safely inserting links in Markdown files; and ui/ directory for user interface components.

### Data Processing & State Principles
Each note MUST have a unique identifier (UUID) maintained in front-matter as the stable key for all internal data associations. The plugin MUST implement content hash-based change detection to enable efficient incremental updates. Data persistence MUST use JSON files exclusively; binary databases (e.g., SQLite) are PROHIBITED. All time-intensive operations MUST be asynchronous (async/await) to preserve Obsidian UI responsiveness.

### User Experience
The plugin MUST provide a comprehensive settings panel allowing users to configure all necessary parameters including API keys, model names, and thresholds. For long-running tasks, the plugin MUST provide a non-blocking progress dialog that clearly displays current progress and offers a cancellation option.

### Code Quality Standards
All code MUST be written in strict TypeScript with type checking enabled. Codebase MUST follow the prescribed modular design with high cohesion and low coupling. All public functions, classes, and complex algorithms MUST have clear JSDoc comments.

## Additional Constraints

The plugin MUST maintain compatibility with Obsidian's plugin ecosystem and conform to Obsidian's security model. All network requests MUST use Obsidian's built-in request API and MUST NOT bypass security restrictions. The plugin MUST handle errors gracefully and provide meaningful error messages to users.

## Development Workflow

All new features MUST include appropriate unit and integration tests. Code reviews MUST verify compliance with all constitution principles. Breaking changes to the API or data format MUST include migration plans. Development tools and processes MUST be documented for new contributors.

## Governance

This constitution supersedes all other development practices. Amendments to this constitution MUST be documented with clear rationale and approval from project maintainers. All pull requests and code reviews MUST verify compliance with these principles. Any complexity introduced MUST be justified by clear functional or technical requirements.

**Version**: 1.0.0 | **Ratified**: 2025-01-01 | **Last Amended**: 2025-10-25