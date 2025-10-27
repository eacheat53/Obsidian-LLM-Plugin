# Spec: Smart Mode Enhancement

## ADDED Requirements

### Requirement: Failed Note Retry in Smart Mode

**Priority**: High
**Rationale**: Automatically retry failed operations without requiring content changes

The system MUST force re-processing of notes with unresolved failures in smart mode, regardless of content hash.

#### Scenario: Failed embedding retried in smart mode

**Given** smart mode workflow is starting
**And** note `abc123` has unchanged content hash
**And** failure log contains unresolved embedding operation for `abc123`
**When** the system processes note `abc123`
**Then** the system forces embedding regeneration (ignores hash match)
**And** the system calls Jina API for `abc123`
**And** on success, removes failure record from log
**And** debug log shows: "强制重试失败笔记: abc123"

#### Scenario: Multiple failed notes retried automatically

**Given** failure log contains 5 unresolved embedding operations
**And** smart mode workflow starts with 100 notes
**And** 95 notes have unchanged hash (normally skipped)
**When** 4 of the 5 failed notes are in the 95 unchanged notes
**Then** the system processes 5 + 4 = 9 notes total
**And** 4 failed notes are retried despite unchanged hash
**And** 91 unchanged notes without failures are skipped

---

### Requirement: Consistent Retry Logic Across Operations

**Priority**: Medium
**Rationale**: Provide uniform behavior for embedding/scoring/tagging retries

The system MUST apply failure retry logic consistently across all operation types (embedding, scoring, tagging).

#### Scenario: Scoring failures retried in smart mode

**Given** smart mode workflow starts
**And** pair `(note1, note2)` has existing similarity score
**And** failure log contains unresolved scoring operation for `note1:note2`
**When** the system scores note pairs
**Then** the system forces re-scoring of `(note1, note2)` pair
**And** on success, removes failure record from log

**Cross-reference**: Scoring retry already implemented in `scorePairs()` (ai-logic-service.ts:229-276)

#### Scenario: Tagging failures retried in smart mode

**Given** smart mode workflow starts
**And** note `xyz789` has existing tags in master index
**And** failure log contains unresolved tagging operation for `xyz789`
**When** the system generates tags
**Then** the system forces tag regeneration for `xyz789`
**And** on success, removes failure record from log

**Cross-reference**: Tagging retry already implemented in `generateTagsBatch()` (ai-logic-service.ts:480-506)

---

### Requirement: Failure-Driven Processing Optimization

**Priority**: Low
**Rationale**: Minimize redundant processing by focusing on actual failures

The system MUST prioritize processing failed operations over full vault scans when possible.

#### Scenario: Only failed notes processed when no content changes

**Given** vault contains 1000 notes
**And** all notes have unchanged content hash
**And** failure log contains 3 unresolved embedding operations
**When** smart mode workflow runs
**Then** the system processes exactly 3 notes (the failed ones)
**And** 997 notes are skipped (hash unchanged, no failures)
**And** workflow completes in <10% of full processing time

## MODIFIED Requirements

None - This capability enhances existing smart mode logic.

## REMOVED Requirements

None - No existing behavior is removed.
