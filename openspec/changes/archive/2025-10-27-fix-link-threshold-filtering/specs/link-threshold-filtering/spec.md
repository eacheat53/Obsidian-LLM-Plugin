# Capability: Link Threshold Filtering

## Overview

确保链接注入服务在确定要插入的链接时，始终应用当前配置的阈值过滤（`min_ai_score` 和 `similarity_threshold`），使得用户修改阈值后，低于新阈值的链接能够被正确删除。

## MODIFIED Requirements

### Requirement: Link Selection Must Apply Threshold Filters

The `LinkInjectorService._listTargetsFromPairs` method MUST filter out note pairs that do not meet the current configured thresholds (`min_ai_score` and `similarity_threshold`) before selecting links to insert. This ensures that when users modify thresholds, links below the new thresholds are correctly removed on the next workflow run.

#### Scenario: User increases min_ai_score threshold

**Given**:
- Vault has Note A with 4 cached link pairs:
  - B: similarity=0.85, ai_score=9
  - C: similarity=0.80, ai_score=8
  - D: similarity=0.75, ai_score=7
  - E: similarity=0.72, ai_score=7
- Current settings: min_ai_score=7, max_links_per_note=7
- Note A's current links (in ledger): [B, C, D, E]

**When**:
- User changes min_ai_score from 7 to 8
- User runs workflow (smart mode)
- Note A content unchanged → no re-scoring

**Then**:
- `_listTargetsFromPairs` receives 4 pairs
- Filters pairs: only B(9) and C(8) pass (D and E have score=7 < 8)
- Returns [B, C]
- `reconcileUsingLedger` calculates: toRemove=[D, E], toAdd=[]
- Note A's links updated to [B, C]
- D and E links removed from file

**Validation**:
- Links in Note A after workflow: exactly [B, C]
- No links with ai_score < 8 present
- Console shows "Filtered 2 pairs below threshold (4 -> 2)" (if debug logging enabled)

---

#### Scenario: User increases similarity_threshold

**Given**:
- Vault has Note X with 3 cached link pairs:
  - Y: similarity=0.80, ai_score=9
  - Z: similarity=0.72, ai_score=8
  - W: similarity=0.68, ai_score=8
- Current settings: similarity_threshold=0.7, min_ai_score=7
- Note X's current links: [Y, Z, W]

**When**:
- User changes similarity_threshold from 0.7 to 0.75
- User runs workflow (smart mode)

**Then**:
- `_listTargetsFromPairs` receives 3 pairs
- Filters pairs: only Y(0.80) and Z(0.72) pass threshold (W has 0.68 < 0.75)
- Wait, Z has 0.72 which is < 0.75, so only Y passes
- Returns [Y]
- `reconcileUsingLedger` removes Z and W
- Note X's links updated to [Y]

**Validation**:
- Links in Note X: exactly [Y]
- No links with similarity_score < 0.75 present

---

#### Scenario: All pairs filtered out below threshold

**Given**:
- Note M has 2 cached link pairs:
  - N: similarity=0.68, ai_score=6
  - O: similarity=0.65, ai_score=5
- Current settings: similarity_threshold=0.7, min_ai_score=7
- Note M's current links: [N, O] (inserted with old settings)

**When**:
- User runs workflow with new thresholds (0.7 and 7)

**Then**:
- `_listTargetsFromPairs` receives 2 pairs
- Filters pairs: both N and O fail (similarity < 0.7 and score < 7)
- Returns [] (empty array)
- `reconcileUsingLedger` removes all links
- Note M has no AI-generated links

**Validation**:
- HASH_BOUNDARY section in Note M is empty (no links)
- ledger[M] = []

---

#### Scenario: Exact threshold boundary cases

**Given**:
- Note P has 2 cached link pairs:
  - Q: similarity=0.70, ai_score=8.0
  - R: similarity=0.69, ai_score=7.999
- Current settings: similarity_threshold=0.7, min_ai_score=8.0

**When**:
- User runs workflow

**Then**:
- `_listTargetsFromPairs` uses `>=` comparison
- Q passes: 0.70 >= 0.70 ✓ AND 8.0 >= 8.0 ✓
- R fails: 0.69 >= 0.70 ✗ (fails similarity check)
- Returns [Q]

**Validation**:
- Link Q is included (boundary case included)
- Link R is excluded (below boundary)

---

### Requirement: Threshold Filtering Must Be Consistent with AILogicService

The filtering logic in `LinkInjectorService._listTargetsFromPairs` MUST be identical to the filtering logic in `AILogicService.filterByThresholds` to maintain consistency across the codebase and avoid confusion from different services using different filtering rules.

#### Scenario: Filtering logic matches AILogicService

**Given**:
- `AILogicService.filterByThresholds` uses:
  ```typescript
  pairs.filter(pair =>
    pair.similarity_score >= this.settings.similarity_threshold &&
    pair.ai_score >= this.settings.min_ai_score
  )
  ```

**When**:
- Developer implements `_listTargetsFromPairs` filtering

**Then**:
- Must use identical filter expression:
  ```typescript
  relevant.filter(p =>
    p.similarity_score >= this.settings.similarity_threshold &&
    p.ai_score >= this.settings.min_ai_score
  )
  ```
- Both use `>=` (not `>`)
- Both use AND logic (not OR)
- Both check both thresholds

**Validation**:
- Code review confirms identical logic
- No divergence in edge case handling

---

### Requirement: Debug Logging for Filtering Results

When threshold filtering removes one or more pairs, the system MUST log the before/after counts to help users understand why certain links were removed. Logging MUST only occur when debug logging is enabled in settings.

#### Scenario: Debug log shows filtering statistics

**Given**:
- Settings: enable_debug_logging=true
- `_listTargetsFromPairs` receives 10 pairs
- After filtering: 7 pairs remain (3 filtered out)

**When**:
- Method executes

**Then**:
- Console output includes:
  ```
  [Link Injector] Filtered 3 pairs below threshold (10 -> 7)
  ```

**Validation**:
- Log shows correct before/after counts
- Log only appears when enable_debug_logging=true
- Log only appears when filtering removes at least 1 pair

---

#### Scenario: No log when nothing filtered

**Given**:
- `_listTargetsFromPairs` receives 5 pairs
- All 5 pairs pass threshold filtering

**When**:
- Method executes

**Then**:
- No filtering log appears (5 -> 5, no change)

**Validation**:
- Console does not show unnecessary logs
- Clean output when no filtering occurs
