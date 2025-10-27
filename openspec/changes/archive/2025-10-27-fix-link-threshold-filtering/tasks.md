# Implementation Tasks

## Task 1: Add Threshold Filtering to _listTargetsFromPairs
**Estimated Time**: 15 minutes
**Priority**: High

**Implementation**:
- File: `src/services/link-injector-service.ts`
- Location: `_listTargetsFromPairs` method (line 188)
- Add filtering step before deduplication:
  ```typescript
  private _listTargetsFromPairs(relevant: NotePairScore[]): NoteId[] {
    // ✅ Filter by thresholds
    const filtered = relevant.filter(p =>
      p.similarity_score >= this.settings.similarity_threshold &&
      p.ai_score >= this.settings.min_ai_score
    );

    // Deduplication
    const seen = new Set<NoteId>();
    const unique: NotePairScore[] = [];
    for (const p of filtered) {  // Changed from 'relevant' to 'filtered'
      if (!seen.has(p.note_id_2)) { seen.add(p.note_id_2); unique.push(p); }
    }

    // Sort and take top N
    unique.sort((a,b)=> b.ai_score - a.ai_score);
    return unique.slice(0, this.settings.max_links_per_note).map(p=>p.note_id_2);
  }
  ```

**Acceptance Criteria**:
- [x] Filtering logic added before deduplication
- [x] Uses same filter logic as `AILogicService.filterByThresholds`
- [x] Both `similarity_threshold` and `min_ai_score` checked
- [x] Loop changed from `relevant` to `filtered`
- [x] Build succeeds without errors

---

## Task 2: Test with Modified min_ai_score
**Estimated Time**: 10 minutes
**Priority**: High
**Dependencies**: Task 1

**Test Scenarios**:
1. **Baseline**: Run workflow with default settings (min_ai_score=7)
   - Verify links inserted for notes
2. **Increase threshold**: Change min_ai_score from 7 to 8
   - Run workflow (smart mode)
   - Verify: score < 8 links removed
   - Verify: score >= 8 links retained
3. **Decrease threshold**: Change min_ai_score from 8 to 6
   - Run workflow (smart mode)
   - Verify: new score=6-7 links added if available

**Acceptance Criteria**:
- [ ] Threshold increase removes low-score links
- [ ] Threshold decrease adds newly-qualified links
- [ ] No errors in console
- [ ] Debug logs show filtered counts

---

## Task 3: Test with Modified similarity_threshold
**Estimated Time**: 10 minutes
**Priority**: Medium
**Dependencies**: Task 1

**Test Scenarios**:
1. Run workflow with similarity_threshold=0.7
2. Change similarity_threshold to 0.75
3. Run workflow (smart mode)
4. Verify: similarity < 0.75 links removed

**Acceptance Criteria**:
- [ ] Similarity threshold correctly applied
- [ ] Links with similarity < threshold removed
- [ ] Links with similarity >= threshold retained

---

## Task 4: Add Debug Logging for Filtering
**Estimated Time**: 5 minutes
**Priority**: Low
**Dependencies**: Task 1

**Implementation**:
- Add debug log showing filtering results:
  ```typescript
  private _listTargetsFromPairs(relevant: NotePairScore[]): NoteId[] {
    const filtered = relevant.filter(p =>
      p.similarity_score >= this.settings.similarity_threshold &&
      p.ai_score >= this.settings.min_ai_score
    );

    if (this.settings.enable_debug_logging && filtered.length < relevant.length) {
      console.log(`[Link Injector] Filtered ${relevant.length - filtered.length} pairs below threshold (${relevant.length} -> ${filtered.length})`);
    }

    // ... rest of method
  }
  ```

**Acceptance Criteria**:
- [x] Debug log added showing before/after counts
- [x] Only logs when filtering removes pairs
- [x] Only logs when debug_logging enabled

---

## Task 5: Update Documentation
**Estimated Time**: 10 minutes
**Priority**: Low

**Updates**:
- File: `CLAUDE.md`
- Section: "Critical Implementation Details" or "Common Gotchas"
- Add note about threshold filtering behavior:
  ```markdown
  ### Link Threshold Filtering

  Links inserted by the plugin are **always** filtered by current threshold settings:
  - `similarity_threshold`: Minimum cosine similarity (default: 0.7)
  - `min_ai_score`: Minimum LLM score (default: 7)

  **Important**: When you modify thresholds and re-run the workflow (even in smart mode),
  links that no longer meet the new thresholds will be removed.

  Example:
  - Initial run with min_ai_score=7 → inserts links with score=7,8,9
  - User changes min_ai_score to 8
  - Re-run workflow → removes links with score=7, keeps score=8,9

  This ensures displayed links always match your current quality standards.
  ```

**Acceptance Criteria**:
- [x] Documentation added to CLAUDE.md
- [x] Clear example provided
- [x] Explains smart mode behavior

---

## Dependencies Graph

```
Task 1 (Add threshold filtering)
  ├─→ Task 2 (Test min_ai_score)
  ├─→ Task 3 (Test similarity_threshold)
  └─→ Task 4 (Add debug logging)

Task 5 (Documentation) [Independent]
```

## Success Metrics

1. **Correctness**: Links displayed always match current thresholds
2. **User Experience**: Threshold changes take effect immediately (no need for force mode)
3. **Code Quality**: Single method change, minimal impact
4. **Debuggability**: Clear logging shows filtering behavior
