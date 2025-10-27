# Implementation Tasks

This document outlines the ordered, verifiable tasks required to implement the incremental persistence optimization.

## Phase 1: Embedding Workflow Enhancement (Priority: High)

### Task 1.1: Add immediate masterIndex save after embedding generation
**Estimated Time**: 1 hour
**Dependencies**: None
**Verification**: Manual test - cancel workflow mid-execution, verify embeddings saved

**Implementation**:
- File: `src/main.ts`
- Location: `generateEmbeddingsWorkflow()` function, inside the note processing loop
- After line 259 (save embedding) and line 273 (update masterIndex.notes)
- Add: `await this.cacheService.saveMasterIndex(masterIndex);`
- Ensure: Atomic write pattern already implemented in `CacheService`

**Acceptance Criteria**:
- [x] masterIndex saved to disk after each successful embedding
- [x] Atomic write pattern preserved (temp file + rename)
- [x] Debug log shows: `[Main] Saved masterIndex after embedding note: {noteId}`
- [x] Manual test: Cancel after 10 notes, restart skips those 10

---

### Task 1.2: Add embedding failure recording
**Estimated Time**: 1.5 hours
**Dependencies**: Task 1.1 complete
**Verification**: Simulate API error, check failure-log.json

**Implementation**:
- File: `src/main.ts`
- Location: Add try-catch around Jina API call (lines 242-276)
- On error:
  - Call `this.failureLogService.recordFailure()` with operation_type="embedding"
  - Include noteId in batch_info.items
  - Include file path in display_items
  - Log error and continue (don't throw)

**Acceptance Criteria**:
- [x] API errors recorded in failure log
- [x] Workflow continues processing remaining notes
- [x] failure-log.json contains embedding operation type
- [x] Manual test: Disconnect network, verify failures logged

---

### Task 1.3: Add embedding failure cleanup on success
**Estimated Time**: 1 hour
**Dependencies**: Task 1.2 complete
**Verification**: Retry failed note, verify failure removed from log

**Implementation**:
- File: `src/main.ts`
- Location: After successful embedding save (after Task 1.1 addition)
- Query `failureLogService.getUnresolvedFailures()`
- Filter operation_type="embedding"
- Check if current noteId in op.batch_info.items
- If match, call `deleteFailure(op.id)`

**Acceptance Criteria**:
- [x] Successful embeddings remove failure records
- [x] Debug log shows: "已从失败集合中删除嵌入操作: {op.id}"
- [x] Multiple failures cleaned up in single batch
- [x] Manual test: Create failure, retry successfully, verify cleanup

---

### Task 1.4: Add failed note retry logic for smart mode
**Estimated Time**: 2 hours
**Dependencies**: Task 1.2 complete
**Verification**: Failed note with unchanged hash retried in smart mode

**Implementation**:
- File: `src/main.ts`
- Location: Before note processing loop in `generateEmbeddingsWorkflow()`
- Call `failureLogService.getFailedNoteIds()` to get Set of failed notes
- In loop, add condition: `needsUpdate = needsUpdate || failedNoteIds.has(noteId)`
- Log: "强制重试失败笔记: {noteId}" when retrying

**Acceptance Criteria**:
- [x] Failed notes retried despite unchanged hash
- [x] Smart mode still skips unchanged notes without failures
- [x] Debug log distinguishes forced retries from hash changes
- [x] Manual test: Fail note, don't change content, verify retry

---

## Phase 2: Validation & Testing (Priority: High)

### Task 2.1: Test interruption recovery
**Estimated Time**: 1 hour
**Dependencies**: Phase 1 complete
**Verification**: Manual testing with cancellation

**Test Scenarios**:
1. Process 100 notes, cancel after 50, verify 50 saved
2. Restart workflow, verify 50 skipped (hash unchanged)
3. Change note #25, verify only 1 note reprocessed

**Acceptance Criteria**:
- [x] No data loss on cancellation
- [x] Completed work persists across restarts
- [x] Smart mode correctly identifies completed work

---

### Task 2.2: Test failure recovery
**Estimated Time**: 1 hour
**Dependencies**: Phase 1 complete
**Verification**: Simulate API errors, verify retry

**Test Scenarios**:
1. Disconnect network during processing
2. Verify failures logged with correct noteIds
3. Reconnect and restart workflow
4. Verify failed notes retried automatically
5. Verify failure log cleaned up after success

**Acceptance Criteria**:
- [x] Failures accurately recorded in log
- [x] Failed operations retried on next run
- [x] Successful retries remove failure records
- [x] Workflow completes without manual intervention

---

### Task 2.3: Measure performance impact
**Estimated Time**: 30 minutes
**Dependencies**: Phase 1 complete
**Verification**: Compare execution times

**Measurement Plan**:
1. Baseline: Process 100 new notes with old code
2. Optimized: Process 100 new notes with new code
3. Calculate overhead percentage
4. Verify overhead <10%

**Acceptance Criteria**:
- [x] Performance overhead measured and documented
- [x] Overhead <10% for typical workloads
- [x] Smart mode performance unchanged (90% notes skipped)

---

## Phase 3: Documentation & Cleanup (Priority: Medium)

### Task 3.1: Update CLAUDE.md with new behavior
**Estimated Time**: 30 minutes
**Dependencies**: Phase 2 complete
**Verification**: Documentation review

**Updates Needed**:
- Add "Incremental Persistence" section under "Critical Implementation Details"
- Document immediate save behavior for embeddings
- Document failure retry logic in smart mode
- Update known issues (remove if applicable)

**Acceptance Criteria**:
- [x] CLAUDE.md reflects new behavior
- [x] Code examples show immediate save pattern
- [x] Known issues section updated

---

### Task 3.2: Add inline code comments
**Estimated Time**: 30 minutes
**Dependencies**: Phase 1 complete
**Verification**: Code review

**Locations**:
- Before immediate save: `// ✅ 立即持久化到磁盘（增量保存）`
- Before failure cleanup: `// ✅ 成功后删除失败集合中的相关记录`
- Before retry logic: `// ✅ 强制重试失败集合中的笔记（智能模式）`

**Acceptance Criteria**:
- [x] All new code blocks have clear comments
- [x] Chinese comments for domain-specific logic (consistent with codebase)
- [x] Comments explain "why" not just "what"

---

## Task Dependencies Graph

```
Task 1.1 (Immediate Save)
   ├─→ Task 1.2 (Failure Recording)
   │     ├─→ Task 1.3 (Failure Cleanup)
   │     └─→ Task 1.4 (Failed Note Retry)
   │
   └─→ Task 2.1 (Interruption Test)
         ├─→ Task 2.2 (Failure Test)
         └─→ Task 2.3 (Performance Test)
               └─→ Task 3.1 (Documentation)
                     └─→ Task 3.2 (Code Comments)
```

## Parallelizable Work

- Tasks 2.1, 2.2, 2.3 can run in parallel after Phase 1
- Tasks 3.1 and 3.2 can run in parallel after Phase 2

## Rollback Plan

If critical issues arise:
1. Revert `src/main.ts` changes (keep `ai-logic-service.ts` unchanged)
2. Old behavior restored: Single save at end of workflow
3. No data corruption risk (atomic writes preserved)

## Success Metrics

1. **Data Safety**: 0% data loss on cancellation (measured via manual tests)
2. **Failure Recovery**: 100% of logged failures retried successfully
3. **Performance**: <10% overhead for incremental saves
4. **Code Quality**: All tasks pass verification criteria
