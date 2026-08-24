# Capability: reversible-task-operations

- Status: implemented / locked
- Version: 1.1
- User outcome: Remove mistakenly created work and reliably undo recent task mutations, including memo updates and operations retained across desktop-app restarts.
- Owner: Gantt Chart App
- Last updated: 2026-08-24

## Domain boundary

### In scope
- Record each successful task create, rename, hierarchy move, completion, reopen, deletion, and changed memo update as one undoable operation.
- Delete a task and its complete descendant subtree atomically from the forest, memos, lifecycle history, work sessions, events, queue, and projections.
- Undo the latest available operation in strict LIFO order and restore its prior observable state.
- Restore deleted task identities, titles, memos, states, timestamps, hierarchy, queue placement, sessions, and task events.
- Persist the latest 50 available undo operations in the same SQLite database across restarts.
- Expose a concise latest-operation label and stable token without exposing snapshot or memo content.

### Out of scope
- Redo, selective older undo, cross-device synchronization, and undoing view-only state or unchanged memo submissions.
- Presenting deleted tasks or internal snapshot data in ordinary history or projections.

## Domain vocabulary

- reversible operation: One successful create, rename, move, complete, reopen, delete, or changed memo-update mutation with an atomic restoration record.
- memo-update: Atomic replacement or clearing of a task memo; unchanged submissions are validated no-ops.
- undo journal: Internal bounded SQLite restoration records.
- available undo: Newest applied journal entry.
- deleted subtree: Selected task plus every descendant at commit time.
- operation token: Stable identifier for the exact latest journal entry.
- ordinary history: User-visible task, memo, event, session, timeline, day, archive, and forest projections; excludes the journal.

## Scenarios

### S1: Delete mistaken work without ordinary history

**Given** an existing task with zero or more descendants and current task/hierarchy revisions
**When** its subtree is deleted
**Then** every subtree member and memo disappears atomically from ordinary projections and one undo entry becomes available.

### S2: Undo deletion

**Given** deletion is the latest available undo
**When** its exact token is undone
**Then** the subtree including memos and all prior observable state is restored atomically while revisions remain monotonic.

### S3: Undo ordinary task mutations

**Given** create, rename, move, complete, reopen, or changed memo-update is latest
**When** its exact token is undone
**Then** observable state immediately before that operation is restored and the entry is no longer available.

### S4: Undo several operations in order

**Given** several mixed reversible operations committed successfully
**When** undo is repeated with each latest token
**Then** operations revert newest-first until none remain or the retained limit is reached.

### S5: Retain undo across restart

**Given** an operation including memo-update is available
**When** the database is reopened
**Then** the same token and label remain available and restore successfully.

### S6: Reject stale or unavailable undo

**Given** a token is absent, undone, pruned, or not latest
**When** undo is requested
**Then** a stable error is returned with no partial change.

### S7: Preserve bounded storage

**Given** more than 50 reversible operations commit
**When** the newest operation commits
**Then** oldest excess entries are pruned without changing current state.

### S8: Ignore unchanged memo submissions

**Given** a task memo already equals the submitted value and its expected version is current
**When** the same memo is saved
**Then** the current result is returned without an event, revision change, or replacement of the latest undo entry.

## Inputs

- task identifier, expected task version, expected hierarchy revision, effective instant, and expected operation token as defined by the originating capability.
- memo-update input additionally follows locked `task-memo` 1.0: exact 0–4,000-scalar text and current task version.

## Outputs

- undo status: availability, token, operation kind including `memo-update`, concise label, committed instant, and undo revision.
- reversible change result: operation identifier, source/hierarchy/queue/undo revisions, affected task identifiers, and latest undo status.
- restored state is read through existing task/memo/forest/history queries.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| unavailable | No retained applied operation can be undone | available after a changed reversible mutation |
| available | Latest entry can be undone | undoing, available after a newer mutation |
| undoing | Restoration is atomic and in progress | available, unavailable, failed |
| failed | No partial restoration committed | prior available/unavailable state |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| task-not-found | Mutation target is absent | Refresh state | No |
| stale-hierarchy | Expected hierarchy revision is stale | Refresh and rebuild operation | No |
| version-conflict / stale-version | Expected task version is stale | Refresh task and retry | No |
| undo-not-available | No applied entry exists | Continue without undo | No |
| stale-undo | Token is not latest | Refresh undo status | No |
| undo-conflict | Current invariants cannot accept restoration | Keep current state and resolve conflict | No |
| persistence-failure | Snapshot, mutation, journal, pruning, or restoration fails | Keep prior state and retry | No |

## Invariants

- Mutation and journal entry commit in one transaction; failure creates neither.
- Undo is latest-only, atomic, bounded to 50 entries, and restart-safe.
- Restoration includes task memos and preserves hierarchy, single-active, single-open-session, order, and depth invariants.
- Task versions and global source/hierarchy/queue/undo revisions never decrease.
- Undo creates no new user-undoable entry.
- Changed memo updates create exactly one `memo-update` entry; unchanged saves create none and preserve the prior latest entry.
- Snapshot and public receipt data never expose memo content; legacy snapshots without `memo` restore it as empty.
- Delete removes the whole subtree and memo; undo restores it without reparenting.
- Every 1.0 behavior and test remains supported unchanged.

## Scale and performance envelope

- Existing limits remain: 5,000 tasks, depth eight, 50 journal entries, one serialized local writer.
- Ordinary mutations target 200 ms, 500-task deletion 300 ms, and restore 1,000 ms on typical local hardware.
- Memo snapshotting supports 4,000 scalars per task within the same bounded journal model.

## Observability

- Expose token, kind, concise label, affected identifiers, committed instant, and applied/undone state.
- Memo-update labels may identify the task but never include memo body; audit events expose only `hasMemo` and scalar length.
- Stable errors distinguish unavailable, stale, conflicting, validation, and persistence failures.

## Headless interface

```text
updateTaskMemo(taskId, memo, expectedTaskVersion, effectiveInstant)
  -> ReversibleChangeResult | DomainError

deleteTaskSubtree(taskId, expectedTaskVersion, expectedHierarchyRevision, effectiveInstant)
  -> ReversibleChangeResult | DomainError

getUndoStatus()
  -> UndoStatus | DomainError

undoLastTaskOperation(expectedOperationToken, effectiveInstant)
  -> ReversibleChangeResult | DomainError
```

Existing create, rename, move, complete, and reopen commands continue to create one atomic journal entry.

## Contract tests

- All version 1.0 delete, restore, mixed LIFO, restart, stale/conflict, bound, rollback, and invariant tests remain unchanged and pass.
- Changed memo save creates one privacy-safe event and one `memo-update` entry; undo restores exact prior text.
- Clear/undo, completed-task memo, rename/memo mixed LIFO, restart, and delete/restore preserve memo semantics.
- Invalid, stale, and persistence-failed saves change no task, event, revision, or journal state.
- Unchanged save is a version-checked no-op.
- Legacy migration and snapshot JSON without memo remain compatible and idempotent.

## Change history

- 1.1 / 2026-08-24: Implemented and locked under user-approved CCR-003; adds memo-update undo and legacy memo snapshot compatibility without weakening 1.0.
