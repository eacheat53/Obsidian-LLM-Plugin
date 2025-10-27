# Proposal: Optimize Incremental Persistence

## Overview

Optimize the plugin's API request handling and data persistence strategy to ensure immediate saves after successful operations, enhance smart mode logic, preserve completed work during interruptions, and provide detailed failure tracking with granular step information (embedding/scoring/tagging) in the failure log for automated retry and cleanup.

## Problem Statement

Currently, the plugin has the following issues:

1. **Delayed Persistence**: While some incremental saving exists, it's not consistently applied across all workflows (especially embedding generation in `generateEmbeddingsWorkflow`)
2. **Work Loss on Interruption**: When API requests are interrupted mid-batch, successfully completed items are not always saved immediately, leading to redundant reprocessing
3. **Incomplete Failure Tracking**: The failure log system records operation types but doesn't track which specific step (embedding generation, scoring, or tag generation) failed for each note
4. **Manual Cleanup Required**: After resolving failures, users must manually verify which operations completed successfully; no automatic cleanup mechanism exists

## Goals

1. **Immediate Persistence**: Save embeddings, scores, and tags to disk immediately after each successful API call
2. **Interruption Resilience**: Preserve all successfully completed work when operations are cancelled or interrupted
3. **Granular Failure Tracking**: Record which specific step (embedding/score/tag) each note requires in the failure log
4. **Automated Cleanup**: Automatically remove completed operations from the failure log after successful execution

## User Benefits

- **Faster Recovery**: Restart interrupted operations without redoing completed work
- **Cost Savings**: Avoid redundant API calls for successfully processed items
- **Better Visibility**: Clear understanding of which notes need which operations
- **Reduced Maintenance**: Automatic cleanup of stale failure records

## Success Criteria

1. Embeddings saved to disk immediately after each Jina API call
2. Scores saved to master index immediately after each LLM scoring batch
3. Tags saved to master index immediately after each LLM tagging batch
4. Failure log accurately tracks pending steps per note (embedding/score/tag)
5. Successful operations automatically removed from failure log
6. Smart mode workflow optimized to handle partial completion scenarios

## Non-Goals

- Changing the overall workflow architecture (HASH_BOUNDARY system, unidirectional links, etc.)
- Implementing parallel embedding generation
- Adding new failure recovery strategies beyond immediate saves
- Modifying the UI/UX for failure log viewing (out of scope)

## Dependencies

- Existing `CacheService` (master index + sharded embeddings)
- Existing `FailureLogService` (failure log management)
- Existing `TaskManagerService` (cancellation detection)

## Timeline Estimate

- **Planning & Design**: 1 day
- **Implementation**: 2-3 days
- **Testing & Validation**: 1 day
- **Total**: 4-5 days

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Frequent disk I/O degrades performance | Medium | Medium | Use atomic writes with temp files; monitor performance |
| Race conditions in concurrent saves | High | Low | Leverage existing task mutex lock |
| Failure log grows unbounded | Low | Medium | Implement auto-cleanup for resolved operations (already exists) |
| Incomplete saves during crashes | Medium | Low | Use atomic write pattern (already implemented) |

## Related Changes

- None (this is a self-contained optimization)

## Alternatives Considered

### Alternative 1: Batch Saves Every N Operations
**Rejected**: Still risks losing work on interruption; doesn't solve the core problem

### Alternative 2: Write-Ahead Log (WAL) Pattern
**Rejected**: Over-engineered for Obsidian plugin context; atomic writes sufficient

### Alternative 3: Checkpoint System with Explicit User Trigger
**Rejected**: Requires user intervention; automatic immediate saves more user-friendly
