# Design Document: Fix Link Threshold Filtering

## Architecture Overview

This is a **single-method fix** with minimal architectural impact.

### Current Flow (Before Fix)

```
getDesiredTargetsFromScores(noteId, allScores)
  ↓
Collect relevant pairs (note_id_1 === noteId)
  ↓
_listTargetsFromPairs(relevant)
  ↓
[Deduplication]  ← No threshold filtering!
  ↓
[Sort by ai_score descending]
  ↓
[Take top N]
  ↓
Return noteIds[]
  ↓
reconcileUsingLedger(file, noteId, desiredTargets)
  ↓
[Calculate diff: toAdd, toRemove]
  ↓
[Update file content]
```

### Fixed Flow (After Fix)

```
getDesiredTargetsFromScores(noteId, allScores)
  ↓
Collect relevant pairs (note_id_1 === noteId)
  ↓
_listTargetsFromPairs(relevant)
  ↓
[✅ Filter by thresholds]  ← NEW: Add filtering step
  ↓
[Deduplication]
  ↓
[Sort by ai_score descending]
  ↓
[Take top N]
  ↓
Return noteIds[]
  ↓
reconcileUsingLedger(file, noteId, desiredTargets)
  ↓
[Calculate diff: toAdd, toRemove]
  ↓
[Update file content]
```

## Data Flow

### Input
```typescript
relevant: NotePairScore[] = [
  { note_id_1: "A", note_id_2: "B", similarity_score: 0.85, ai_score: 9 },
  { note_id_1: "A", note_id_2: "C", similarity_score: 0.80, ai_score: 8 },
  { note_id_1: "A", note_id_2: "D", similarity_score: 0.75, ai_score: 7 },  // Below new threshold
  { note_id_1: "A", note_id_2: "E", similarity_score: 0.72, ai_score: 7 },  // Below new threshold
]

settings: {
  similarity_threshold: 0.7,
  min_ai_score: 8,  // User changed from 7 to 8
  max_links_per_note: 7
}
```

### Processing (After Fix)

**Step 1: Filter by thresholds**
```typescript
filtered = [
  { note_id_2: "B", similarity_score: 0.85, ai_score: 9 },  // ✅ Pass
  { note_id_2: "C", similarity_score: 0.80, ai_score: 8 },  // ✅ Pass
  // D: ai_score=7 < 8 ❌ Filtered out
  // E: ai_score=7 < 8 ❌ Filtered out
]
```

**Step 2: Deduplication** (no change in this example)

**Step 3: Sort by ai_score**
```typescript
sorted = [
  { note_id_2: "B", ai_score: 9 },
  { note_id_2: "C", ai_score: 8 },
]
```

**Step 4: Take top N** (max_links_per_note=7, but only 2 available)
```typescript
result = ["B", "C"]
```

### Output
```typescript
["B", "C"]  // Only 2 links, both meet thresholds
```

### Reconciliation

```typescript
currentTargets = ["B", "C", "D", "E"]  // From ledger (old state)
desiredTargets = ["B", "C"]            // From _listTargetsFromPairs (new filtered result)

toRemove = ["D", "E"]  // Will be removed from file
toAdd = []             // Nothing new to add
```

## Consistency with AILogicService

### filterByThresholds (Existing - Correct)
```typescript
// src/services/ai-logic-service.ts:761
filterByThresholds(pairs: NotePairScore[]): NotePairScore[] {
  return pairs.filter(pair =>
    pair.similarity_score >= this.settings.similarity_threshold &&
    pair.ai_score >= this.settings.min_ai_score
  );
}
```

### _listTargetsFromPairs (Fixed - Now Consistent)
```typescript
// src/services/link-injector-service.ts:188 (AFTER FIX)
private _listTargetsFromPairs(relevant: NotePairScore[]): NoteId[] {
  // ✅ Same filtering logic
  const filtered = relevant.filter(p =>
    p.similarity_score >= this.settings.similarity_threshold &&
    p.ai_score >= this.settings.min_ai_score
  );
  // ... rest of method
}
```

**Result**: Both methods use identical threshold filtering logic.

## Performance Analysis

### Complexity
- **Before**: O(n log n) - dominated by sort
- **After**: O(n) filter + O(n log n) sort = O(n log n) - no change

### Typical Data Size
- Average: ~10-50 relevant pairs per note
- Max: ~100 pairs (rare)

### Impact
- Filter operation: < 1ms for 100 pairs
- **Overall impact**: Negligible

## Edge Cases

### Case 1: All Pairs Filtered Out
```typescript
relevant = [
  { similarity: 0.65, score: 6 },  // Below both thresholds
  { similarity: 0.68, score: 5 },  // Below both thresholds
]

filtered = []  // All filtered out

result = []  // No links to insert
```

**Behavior**: `reconcileUsingLedger` removes all existing links.

### Case 2: Fewer Than max_links_per_note After Filtering
```typescript
max_links_per_note = 7

relevant = [
  { similarity: 0.85, score: 9 },
  { similarity: 0.80, score: 8 },
  { similarity: 0.75, score: 7 },  // Below threshold
]

filtered = [
  { similarity: 0.85, score: 9 },
  { similarity: 0.80, score: 8 },
]  // Only 2 pairs

result = ["B", "C"]  // Only 2 links (not 7)
```

**Behavior**: Insert only the 2 qualifying links, don't lower standards to reach 7.

### Case 3: Exact Threshold Boundary
```typescript
min_ai_score = 8

pairs = [
  { score: 8.0 },   // ✅ Exactly at threshold - INCLUDED
  { score: 7.999 }, // ❌ Below threshold - EXCLUDED
]
```

**Behavior**: Uses `>=` comparison, so exact boundary cases are included.

## Rollback Plan

If issues arise:
1. Revert single method change in `link-injector-service.ts`
2. No database migrations or config changes needed
3. No breaking API changes

**Rollback time**: < 1 minute

## Testing Strategy

### Unit Test Approach (Manual)
1. Create test vault with 5 notes
2. Run workflow with min_ai_score=7
3. Verify links inserted
4. Change min_ai_score to 8
5. Re-run workflow (smart mode)
6. Verify low-score links removed

### Debug Verification
- Enable debug logging
- Check console for filtering messages
- Verify before/after counts

### Edge Case Testing
- Test with no qualifying links
- Test with exact threshold values
- Test with both thresholds modified
