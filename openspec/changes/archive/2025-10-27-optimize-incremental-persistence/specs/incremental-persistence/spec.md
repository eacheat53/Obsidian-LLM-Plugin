# Spec: Incremental Persistence

## ADDED Requirements

### Requirement: Immediate Embedding Persistence

**Priority**: High
**Rationale**: Prevent data loss on workflow interruption

The system MUST save embedding data to disk immediately after each successful Jina API call.

#### Scenario: Single note embedding saved immediately

**Given** a note with UUID `abc123` needs embedding generation
**When** the Jina API returns embedding vector successfully
**Then** the system saves the embedding to `embeddings/abc123.json` atomically
**And** the system updates `masterIndex.notes[abc123]` in memory
**And** the system persists `masterIndex` to disk atomically
**And** all operations complete before processing the next note

#### Scenario: Workflow interrupted mid-processing

**Given** 100 notes require embedding generation
**When** 50 notes have been processed successfully
**And** the workflow is cancelled by user or system interruption
**Then** all 50 completed embeddings are persisted to disk
**And** `masterIndex` contains metadata for all 50 completed notes
**And** next workflow run skips the 50 completed notes (hash unchanged)

---

### Requirement: Atomic Master Index Updates

**Priority**: High
**Rationale**: Ensure consistency between embedding shards and master index

The system MUST use atomic write operations when persisting the master index after embedding generation.

#### Scenario: Atomic write prevents partial data

**Given** the master index is being updated with new note metadata
**When** the system writes the updated index to disk
**Then** the system uses temp file + rename pattern
**And** the operation is atomic (no partial writes visible)
**And** system crash mid-write preserves old index OR completes new index

---

### Requirement: Progress Preservation on Cancellation

**Priority**: High
**Rationale**: Respect user cancellation while preserving completed work

The system MUST preserve all completed work when user cancels workflow execution.

#### Scenario: User cancels embedding workflow

**Given** embedding generation workflow is running
**When** user clicks "Cancel" button in progress UI
**And** 30 out of 100 notes have completed embedding generation
**Then** the system saves all 30 completed embeddings to disk
**And** the system updates master index with 30 note metadata entries
**And** the system throws cancellation error to exit cleanly
**And** no work is lost for the 30 completed notes

## MODIFIED Requirements

None - This capability introduces new requirements only.

## REMOVED Requirements

None - No existing requirements are deprecated.
