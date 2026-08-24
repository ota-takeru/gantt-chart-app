# Capability: task-memo

- Status: implemented / locked
- Version: 1.0
- User outcome: Keep a durable free-form memo with any remaining or completed task without changing the task's lifecycle, hierarchy, or work history.
- Owner: Gantt Chart App
- Last updated: 2026-08-24

## Domain boundary

### In scope
- Read the memo stored with a task through the normal task snapshot.
- Save, replace, or clear a task memo with optimistic concurrency.
- Preserve memo text across lifecycle changes, hierarchy moves, application restarts, completion, and reopening.
- Preserve a memo when a deleted task subtree is restored by the existing undo capability.

### Out of scope
- Rich text, attachments, multiple notes, note history, collaboration, search, and synchronization.
- Rich note-operation history beyond the existing bounded global latest-operation undo model.
- Changing task lifecycle state, queue placement, hierarchy placement, sessions, or lifecycle events.
- UI representation and the mechanism used to edit the memo.

## Domain vocabulary

- task memo: Optional plain Unicode text associated with one stable task identity; the empty string means no memo.
- memo update: An atomic replacement of the complete memo value.
- expected task version: The current optimistic-concurrency version of the task being updated.

## Scenarios

### S1: Add or replace a memo

**Given** an existing remaining or completed task at version V
**When** valid memo text is saved with expected version V
**Then** the exact text is retained, the task and source revisions each advance once, one undoable memo-update operation is recorded, and lifecycle, queue, hierarchy, sessions, and completion history are unchanged.

### S2: Clear a memo

**Given** a task has a non-empty memo
**When** the empty string is saved with the current task version
**Then** the task retains an empty memo, the clear is undoable, and no other task meaning changes.

### S3: Reject stale or invalid updates

**Given** the task is missing, the expected version is stale, or the memo exceeds the supported limit
**When** a memo update is requested
**Then** a stable domain error is returned and no task, revision, event, queue, hierarchy, session, or undo state changes.

### S4: Preserve a memo through task operations

**Given** a task has a memo
**When** it is renamed, moved, completed, reopened, restarted, deleted and restored through the existing task-operation undo
**Then** the memo remains associated with the same restored task identity, except that a task which remains deleted is absent from every ordinary projection.

### S5: Avoid duplicate writes

**Given** an existing task at version V
**When** its current memo is saved again with expected version V
**Then** the current snapshot is returned without incrementing task/source/undo revisions or appending an event or undo entry.

## Inputs

- task identifier: Existing stable task UUID.
- memo: Plain Unicode text from 0 to 4,000 Unicode scalar values; line breaks and surrounding whitespace are retained exactly.
- expected task version: Non-negative version equal to the current task version.
- effective instant: Valid RFC3339 UTC-normalizable instant used for the audit event.

## Outputs

- task snapshot: The current task fields including the complete memo value and resulting version.
- domain error: Stable code and message with no partial change.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| empty | Task memo is the empty string | non-empty |
| non-empty | Task memo contains 1–4,000 Unicode scalar values | non-empty, empty |

Task lifecycle state is orthogonal; queued, active, paused, and completed tasks allow the same memo transitions.

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| task-not-found | Task identifier does not exist | Refresh the task forest | No |
| stale-version | Expected task version differs from stored version | Reload the task and reapply the intended text | No |
| invalid-memo | Memo exceeds 4,000 Unicode scalar values | Shorten the memo and retry | No |
| invalid-effective-instant | Effective instant is invalid | Retry with a valid application-clock instant | No |
| persistence-failure | Atomic persistence fails | Keep prior memo and retry safely | No |

## Invariants

- Each retained task has exactly one memo value; absence in pre-capability storage migrates to the empty string.
- Memo content is returned exactly as saved, including Unicode, line breaks, and surrounding whitespace.
- Memo updates never change task state, completion instant, queue membership/order, hierarchy placement/revision, sessions, or lifecycle history.
- Changed memo updates increment the task version, source revision, and undo revision exactly once and commit atomically with one `task-memo-updated` event and one `memo-update` undo entry.
- The audit event records only whether a memo exists and its scalar length; it never duplicates memo text.
- Memo undo restores the prior memo value through the existing bounded, LIFO, restart-safe task-operation undo semantics.
- Unchanged saves are version-checked no-ops and do not replace the latest undoable operation.
- Delete removes the memo with its task; restoring the deleted subtree restores the memo from the same undo snapshot.

## Scale and performance envelope

- Up to 4,000 Unicode scalar values per task and the existing 5,000-task forest limit.
- One memo update should complete within the existing ordinary local mutation target and must not load other task memos.

## Observability

- Record `task-memo-updated` with task identifier, operation identifier, effective instant, `hasMemo`, and scalar length, excluding memo content.
- Existing source and task revisions expose successful changes; stable error codes expose rejected changes.

## Headless interface

```text
updateTaskMemo(taskId, memo, expectedTaskVersion, effectiveInstant) -> ReversibleChangeResult | DomainError
```

The normal task snapshot includes `memo`, defaulting to the empty string for migrated data.

## Contract tests

- S1 saves exact Unicode, whitespace, and line breaks for remaining and completed tasks while preserving lifecycle, hierarchy, queue, and sessions and recording one undo entry.
- S2 clears a memo atomically.
- S3 rejects missing task, stale version, invalid time, and 4,001-scalar memo without partial change.
- S4 preserves memo through rename, move, complete, reopen, restart, and delete/undo; memo update/undo restores the prior value; mixed operations remain LIFO; pre-capability undo snapshots deserialize with an empty memo.
- S5 performs a version-checked no-op without revision or event changes.
- Migration adds an empty memo to existing tasks idempotently without changing existing task fields or revisions.
- Audit payload never contains memo text.

## Change history

- 1.0 / 2026-08-24: Initial draft for durable per-task plain-text memos.
- 1.0 / 2026-08-24: Implemented and locked after persistence, validation, privacy-safe audit, migration, restart, delete/restore, mixed LIFO undo, and adapter contract tests passed under approved CCR-003.
