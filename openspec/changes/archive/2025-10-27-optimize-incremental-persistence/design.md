# Design: Optimize Incremental Persistence

## Architectural Overview

This change enhances the existing persistence strategy across three core workflows:

```
┌─────────────────────────────────────────────────────────────┐
│ generateEmbeddingsWorkflow (main.ts)                        │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐ │
│  │Jina API  │ → │Save Emb. │ → │Update    │ → │Save     │ │
│  │Call      │   │(sharded) │   │MasterIdx │   │MasterIdx│ │
│  └──────────┘   └──────────┘   └──────────┘   └─────────┘ │
│       ↓ (IMMEDIATELY after each API success)                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ scorePairs (ai-logic-service.ts) - ALREADY OPTIMIZED        │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐ │
│  │LLM Score │ → │Update    │ → │Save      │ → │Cleanup  │ │
│  │Batch     │   │MasterIdx │   │MasterIdx │   │Failures │ │
│  └──────────┘   └──────────┘   └──────────┘   └─────────┘ │
│       ↓ (ALREADY IMMEDIATE - lines 338-358)                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ generateTagsBatch (ai-logic-service.ts) - ALREADY OPTIMIZED │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐ │
│  │LLM Tag   │ → │Update    │ → │Save      │ → │Cleanup  │ │
│  │Batch     │   │MasterIdx │   │MasterIdx │   │Failures │ │
│  └──────────┘   └──────────┘   └──────────┘   └─────────┘ │
│       ↓ (ALREADY IMMEDIATE - lines 571-586)                 │
└─────────────────────────────────────────────────────────────┘
```

## Current State Analysis

### ✅ Already Optimized (No Changes Needed)

1. **`scorePairs()` in `ai-logic-service.ts`** (lines 338-380)
   - ✅ Saves masterIndex immediately after each batch (line 357)
   - ✅ Deletes failures from log after success (lines 361-380)
   - ✅ Continues on failure without aborting entire workflow (line 451)

2. **`generateTagsBatch()` in `ai-logic-service.ts`** (lines 571-607)
   - ✅ Saves masterIndex immediately after each batch (lines 584-586)
   - ✅ Deletes failures from log after success (lines 588-607)
   - ✅ Continues on failure without aborting entire workflow (line 673)

### ❌ Needs Optimization

1. **`generateEmbeddingsWorkflow()` in `main.ts`** (lines 158-462)
   - ❌ Only saves masterIndex once at end of entire workflow (line 288)
   - ❌ Embeddings saved per-note (lines 253-259) but masterIndex not persisted immediately
   - ❌ No immediate cleanup of embedding failures from failure log
   - **Impact**: If interrupted after 50/100 notes, all 50 completed embeddings are lost

## Key Design Decisions

### 1. Incremental Persistence Pattern

**Pattern**: Save → Update → Persist → Cleanup

```typescript
// For each successful API call:
1. Save data to cache (embedding shard / masterIndex.scores / masterIndex.notes[].tags)
2. Update in-memory masterIndex
3. Persist masterIndex to disk (atomic write)
4. Cleanup failure log (remove successful items)
```

**Rationale**: Ensures work is never lost, even on interruption

### 2. Embedding Workflow Modifications

**Current Flow** (problematic):
```typescript
for each note:
  - Generate embedding via Jina API
  - Save embedding shard ✅
  - Update masterIndex.notes[noteId] in memory ⚠️
  - (NO DISK SAVE until end of loop)
After loop ends:
  - Save masterIndex once ❌
```

**New Flow** (optimized):
```typescript
for each note:
  - Generate embedding via Jina API
  - Save embedding shard ✅
  - Update masterIndex.notes[noteId] in memory ✅
  - IMMEDIATELY save masterIndex to disk ✅
  - Cleanup embedding failures from log ✅
After loop ends:
  - (masterIndex already saved incrementally)
```

### 3. Failure Log Integration

The `FailureLogService` already supports:
- Recording failures per operation type (`embedding`, `scoring`, `tagging`)
- Storing specific note IDs/pairs in `batch_info.items`
- Deleting resolved failures

**Enhancement**: Add failure recording for embedding operations (currently missing)

**Location**: `generateEmbeddingsWorkflow()` in catch block

### 4. Smart Mode Optimization

**Current Behavior**:
- Smart mode skips notes with unchanged `content_hash`
- Failed notes not automatically retried unless `content_hash` changes

**Enhancement**:
- Check failure log for unresolved embedding operations
- Force re-generate embeddings for failed notes (similar to how `scorePairs()` does)

**Implementation**: Add `getFailedNoteIds()` check before embedding generation loop

### 5. Performance Considerations

**Concern**: Frequent disk I/O may slow down processing

**Analysis**:
- Current: 1 disk write per 100 notes = ~10ms
- Proposed: 100 disk writes per 100 notes = ~1000ms (+990ms overhead)
- **But**: Only applies to *new/changed* notes (90% skipped in smart mode)
- Typical scenario: 5-10 changed notes per run = 50-100ms overhead

**Mitigation**:
- Use existing atomic write pattern (already fast)
- Trade-off accepted: 1s overhead for 100% data safety

### 6. Atomic Write Safety

**Already Implemented** in `CacheService.saveMasterIndex()`:
```typescript
const tempFile = `${indexFile}.tmp`;
await fs.writeFile(tempFile, content);
await fs.rename(tempFile, indexFile);  // Atomic operation
```

**Guarantees**:
- No partial writes visible to readers
- Crash during write = old file intact OR new file complete

## Data Flow Diagrams

### Embedding Generation with Incremental Saves

```
┌─────────────────────────────────────────────────────────────────┐
│ Main Loop (generateEmbeddingsWorkflow)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ For each note in vault:                                         │
│   ├─ Extract main content (before HASH_BOUNDARY)                │
│   ├─ Calculate SHA-256 hash                                     │
│   ├─ Compare with cached hash → Skip if unchanged (smart mode)  │
│   ├─ Call Jina API → Get embedding vector                       │
│   ├─ Save embedding shard: embeddings/{uuid}.json               │
│   ├─ Update masterIndex.notes[uuid] in memory                   │
│   ├─ ✨ NEW: saveMasterIndex() to disk (atomic)                │
│   ├─ ✨ NEW: Cleanup embedding failures from log               │
│   └─ Check cancellation → Throw if cancelled                    │
│                                                                  │
│ Workflow interrupted at any point:                              │
│   → All processed notes already saved to disk ✅                │
│   → Next run skips completed notes (hash unchanged) ✅          │
└─────────────────────────────────────────────────────────────────┘
```

### Failure Log Cleanup Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Cleanup After Successful Operation                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 1. Get unresolved failures from FailureLogService               │
│    ├─ Filter by operation_type (embedding/scoring/tagging)      │
│    └─ Get batch_info.items (note IDs or pair keys)              │
│                                                                  │
│ 2. Check if current successful batch contains failed items      │
│    ├─ For embedding: batch[i] noteId ∈ op.batch_info.items?    │
│    ├─ For scoring: batch[i] pairKey ∈ op.batch_info.items?     │
│    └─ For tagging: batch[i] noteId ∈ op.batch_info.items?      │
│                                                                  │
│ 3. If match found → deleteFailure(op.id)                        │
│    └─ Log: "已从失败集合中删除{operation}操作: {op.id}"         │
│                                                                  │
│ Result: Failure log only contains truly unresolved operations   │
└─────────────────────────────────────────────────────────────────┘
```

## Integration Points

### Files Modified

1. **`src/main.ts`** - `generateEmbeddingsWorkflow()`
   - Add immediate masterIndex save after each embedding
   - Add failure recording on API errors
   - Add failure log cleanup on success
   - Add failed note retry logic (smart mode enhancement)

2. **`src/services/ai-logic-service.ts`** - No changes needed
   - Already implements incremental saves for scoring/tagging

3. **`src/services/failure-log-service.ts`** - No changes needed
   - Already supports all required operations

### API Surface Changes

**None** - All changes are internal implementation details

### Backward Compatibility

**Full compatibility** - No breaking changes to:
- Cache file format (master index / embedding shards)
- Failure log format
- Plugin settings
- Workflow execution contracts

## Error Handling Strategy

### Embedding Generation Errors

**Current**: Throws error, aborts entire workflow

**Enhanced**:
```typescript
try {
  // Generate embedding
  const response = await apiService.callJinaAPI(...);
  // Save immediately
  await cacheService.saveEmbedding(...);
  await cacheService.saveMasterIndex(masterIndex);
  // Cleanup failures
  await cleanupEmbeddingFailures(noteId);
} catch (error) {
  // Record failure
  await failureLogService.recordFailure({
    operation_type: 'embedding',
    batch_info: { items: [noteId], ... },
    error: { message: error.message, ... }
  });
  // Continue to next note (don't abort)
  continue;
}
```

### Cancellation Handling

**Preserved behavior**:
- Check `taskManagerService.isCancellationRequested()` in loop
- Throw error to exit cleanly
- Already-saved work persists on disk ✅

## Testing Strategy

### Manual Testing Scenarios

1. **Interruption Recovery**
   - Process 100 notes, cancel after 50
   - Verify: 50 embeddings + masterIndex entries saved
   - Restart: Verify 50 notes skipped (hash unchanged)

2. **Failure Recovery**
   - Simulate API error on note #25
   - Verify: Failure logged with noteId
   - Verify: Notes 1-24 + 26-100 completed
   - Restart: Verify note #25 retried

3. **Performance Impact**
   - Measure time: 100 notes with old code
   - Measure time: 100 notes with new code
   - Verify: <10% overhead acceptable

### Validation Criteria

1. ✅ No embeddings lost on cancellation
2. ✅ Failure log accurately tracks pending work
3. ✅ Successful operations auto-removed from failure log
4. ✅ Smart mode skips completed work
5. ✅ Performance overhead <10%

## Future Enhancements (Out of Scope)

1. **Parallel Embedding Generation**: Process multiple notes concurrently
2. **Incremental Score Updates**: Only score pairs involving changed notes (partially implemented)
3. **Lazy Embedding Loading**: Stream embeddings during similarity calculation (memory optimization)
4. **UI for Failure Log**: View/retry failed operations from settings panel
