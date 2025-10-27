# Spec: Failure Tracking Enhancement

## ADDED Requirements

### Requirement: Embedding Failure Recording

**Priority**: High
**Rationale**: Enable automatic retry of failed embedding operations

The system MUST record embedding generation failures in the failure log with detailed context.

#### Scenario: Jina API error recorded in failure log

**Given** note with UUID `xyz789` is being processed for embedding
**When** the Jina API call fails with error "Rate limit exceeded"
**Then** the system records a failure operation with:
  - `operation_type`: "embedding"
  - `batch_info.items`: ["xyz789"]
  - `batch_info.display_items`: ["/path/to/note.md"]
  - `error.message`: "Rate limit exceeded"
  - `error.type`: Error class name
  - `timestamp`: Current Unix timestamp
**And** the system continues processing remaining notes
**And** the workflow does not abort entirely

#### Scenario: Multiple embedding failures tracked separately

**Given** batch of 10 notes being processed
**When** notes #3, #5, and #8 fail embedding generation
**Then** the system records 3 separate failure operations
**And** each failure operation contains the specific note ID
**And** the failure log can be queried for unresolved embedding operations

---

### Requirement: Automatic Failure Cleanup

**Priority**: High
**Rationale**: Keep failure log accurate by removing resolved operations

The system MUST automatically remove failure records when the corresponding operation succeeds.

#### Scenario: Successful embedding removes failure record

**Given** failure log contains unresolved embedding operation for note `abc123`
**When** the system successfully generates embedding for note `abc123`
**And** the embedding is saved to disk
**Then** the system queries failure log for operations containing `abc123`
**And** the system deletes the matching failure operation
**And** debug log shows: "已从失败集合中删除嵌入操作: {operation_id}"

#### Scenario: Batch success cleans up multiple failures

**Given** failure log contains 5 unresolved embedding operations
**And** current batch successfully processes notes `[a, b, c]`
**And** notes `a` and `c` have unresolved failures
**Then** the system deletes 2 failure operations (for `a` and `c`)
**And** 3 failure operations remain (unrelated to current batch)

---

### Requirement: Granular Step Tracking

**Priority**: Medium
**Rationale**: Enable users to understand which specific operation (embedding/score/tag) failed

The system MUST track operation type (embedding/scoring/tagging) in failure records for granular retry logic.

#### Scenario: Failure log distinguishes operation types

**Given** note `note1` failed embedding generation
**And** note pair `(note1, note2)` failed scoring
**And** note `note3` failed tag generation
**When** user queries failure log
**Then** the log shows 3 distinct operations:
  - Operation 1: type="embedding", items=["note1"]
  - Operation 2: type="scoring", items=["note1:note2"]
  - Operation 3: type="tagging", items=["note3"]
**And** the system can retry each operation type independently

## MODIFIED Requirements

None - This capability extends existing failure log functionality.

## REMOVED Requirements

None - No existing functionality is removed.
