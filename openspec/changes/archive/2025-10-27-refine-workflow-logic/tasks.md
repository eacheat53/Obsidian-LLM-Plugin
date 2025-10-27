# Implementation Tasks

## Task 1.1: Move changedNoteIds.add() to success path
**Estimated Time**: 30 minutes
**Priority**: High

**Implementation**:
- File: `src/main.ts`
- Location: `generateEmbeddingsWorkflow()`, line 269
- Move `changedNoteIds.add(noteId)` from before try block to after successful save
- Ensure it's only added when both embedding save and masterIndex save succeed

**Acceptance Criteria**:
- [x] `changedNoteIds.add()` is inside the try block
- [x] Only called after successful `saveMasterIndex()`
- [x] Failed embeddings do NOT appear in `changedNoteIds`
- [x] Build succeeds without errors

---

## Task 1.2: Add getFailedNoteIdsByType() method to FailureLogService
**Estimated Time**: 20 minutes
**Priority**: High

**Implementation**:
- File: `src/services/failure-log-service.ts`
- Add new method:
  ```typescript
  async getFailedNoteIdsByType(
    operationType: FailedOperationType,
    onlyUnresolved: boolean = true
  ): Promise<Set<NoteId>>
  ```
- Extract noteIds from failures filtered by operation type

**Acceptance Criteria**:
- [x] Method implemented and exported
- [x] Correctly filters by operation_type
- [x] Returns Set of noteIds
- [x] Handles scoring pairs correctly (splits "uuid1:uuid2")

---

## Task 1.3: Simplify embedding failure retry logic
**Estimated Time**: 15 minutes
**Priority**: Medium
**Dependencies**: Task 1.2

**Implementation**:
- File: `src/main.ts`
- Location: Lines 208-226
- Replace manual loop with single API call:
  ```typescript
  const failedNoteIds = this.failureLogService
    ? await this.failureLogService.getFailedNoteIdsByType('embedding')
    : new Set<NoteId>();
  ```

**Acceptance Criteria**:
- [x] Manual loop removed (lines 208-226)
- [x] Replaced with single `getFailedNoteIdsByType()` call
- [x] Behavior unchanged (same notes retried)
- [x] Code is more readable

---

## Task 1.4: Add embedding verification for tag generation
**Estimated Time**: 30 minutes
**Priority**: Medium

**Implementation**:
- File: `src/main.ts`
- Location: Tag collection logic (lines 475-479)
- Before adding to `notesNeedingTags`, verify embedding exists:
  ```typescript
  if (!metadata.tags_generated_at) {
    const embResult = await this.cacheService.loadEmbedding(noteId);
    if (embResult.success && embResult.embedding) {
      notesNeedingTags.add(noteId as NoteId);
    } else if (this.settings.enable_debug_logging) {
      console.log(`[Main] 跳过标签生成（无 embedding）: ${noteId}`);
    }
  }
  ```

**Acceptance Criteria**:
- [x] Embedding existence checked before adding to `notesNeedingTags`
- [x] Notes without embeddings skipped with debug log
- [x] Only notes with embeddings get tags generated
- [x] No performance regression (embedding check is fast)

---

## Task 1.5: Add comprehensive processing statistics logging
**Estimated Time**: 20 minutes
**Priority**: Low

**Implementation**:
- File: `src/main.ts`
- Location: After embedding loop completes (after line 384)
- Add summary log:
  ```typescript
  if (this.settings.enable_debug_logging) {
    const failedCount = files.length - newEmbeddingsCount - skippedCount;
    console.log(`[Main] Embedding 处理统计:
      - 总笔记: ${files.length}
      - 跳过（hash 未变）: ${skippedCount}
      - 成功生成 embedding: ${newEmbeddingsCount}
      - 失败: ${failedCount}
      - changedNoteIds (成功): ${changedNoteIds.size}
    `);
  }
  ```

**Acceptance Criteria**:
- [x] Summary log added after embedding loop
- [x] Shows total/skipped/success/failed counts
- [x] Only logged when debug_logging enabled
- [x] Helps debugging workflow issues

---

## Task 2.1: Test changedNoteIds correctness
**Estimated Time**: 30 minutes
**Priority**: High
**Dependencies**: Task 1.1

**Test Scenarios**:
1. **Normal case**: 10 notes changed → all 10 embeddings succeed
   - Verify: `changedNoteIds.size === 10`
2. **Failure case**: 10 notes changed → 2 embeddings fail
   - Verify: `changedNoteIds.size === 8`
   - Verify: Failed notes NOT in `changedNoteIds`
3. **Cancel case**: 10 notes changed → cancel after 5
   - Verify: `changedNoteIds.size === 5`

**Acceptance Criteria**:
- [x] All test scenarios pass
- [x] `changedNoteIds` only contains successful embeddings
- [x] Scoring/linking uses correct set of notes

---

## Task 2.2: Test embedding verification for tags
**Estimated Time**: 20 minutes
**Priority**: Medium
**Dependencies**: Task 1.4

**Test Scenarios**:
1. Note with embedding but no tags → should generate tags
2. Note without embedding and no tags → should skip
3. Note with embedding and tags → should skip

**Acceptance Criteria**:
- [x] Only notes with embeddings get tags
- [x] Debug log shows skipped notes
- [x] No errors when embedding missing

---

## Task 3.1: Update CLAUDE.md documentation
**Estimated Time**: 15 minutes
**Priority**: Low

**Updates**:
- Document `changedNoteIds` management change
- Document new `getFailedNoteIdsByType()` method
- Update workflow diagrams if needed

**Acceptance Criteria**:
- [x] CLAUDE.md reflects new behavior
- [x] Code examples updated
- [x] Clear explanation of changes

---

## Dependencies Graph

```
Task 1.1 (Move changedNoteIds.add)
   └─→ Task 2.1 (Test changedNoteIds)
       └─→ Task 3.1 (Documentation)

Task 1.2 (Add getFailedNoteIdsByType)
   └─→ Task 1.3 (Simplify retry logic)

Task 1.4 (Verify embeddings for tags)
   └─→ Task 2.2 (Test embedding verification)

Task 1.5 (Add statistics logging) [Independent]
```

## Success Metrics

1. **Correctness**: `changedNoteIds` === successfully embedded notes
2. **Code Quality**: Reduced duplication (lines 208-226 removed)
3. **Robustness**: Tags only for notes with embeddings
4. **Debuggability**: Clear statistics logging
