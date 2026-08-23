# Capability: reversible-task-operations

- Status: implemented / locked
- Version: 1.0
- User outcome: Remove mistakenly created work without leaving it in task history, and reliably undo recent task mutations in reverse order, including after restarting the desktop app.
- Owner: Gantt chart app
- Last updated: 2026-08-23

## Domain boundary

### In scope

- Record each successful task create, rename, hierarchy move, completion, reopen, and deletion as one undoable operation.
- Delete a task and its complete descendant subtree atomically from the task forest, lifecycle history, work sessions, events, queue, and all projections.
- Undo the latest available operation in strict last-in-first-out order.
- Restore a deleted subtree with its task identities, titles, states, timestamps, hierarchy, queue placement, sessions, and task events.
- Persist the latest 50 available undo operations in the same local SQLite database across app restarts.
- Expose the latest undo label and stable operation token without exposing internal snapshot data.

### Out of scope

- Redo after an undo.
- Undoing view-only changes such as timeline range, selection, expansion, scrolling, or draft text.
- Undoing mutations performed outside the task operations listed above.
- Selective undo of an older operation while newer operations remain applied.
- Syncing undo history between databases or devices.
- Presenting deleted tasks in ordinary task history, archive summaries, timelines, or search results.

## Domain vocabulary

- reversible operation: One successful create, rename, move, complete, reopen, or delete mutation with an atomic restoration record.
- undo journal: Internal SQLite records containing the bounded restoration data required to undo reversible operations.
- available undo: The newest journal entry that is applied and has not been undone.
- deleted subtree: The selected task plus every descendant at the instant deletion commits.
- operation token: Stable identifier naming the exact journal entry a caller intends to undo.
- ordinary history: User-visible task, event, session, timeline, day, and archive projections; it excludes the internal undo journal.

## Scenarios

### S1: Delete mistaken work without ordinary history

**Given** an existing task with zero or more descendants and a current task/hierarchy revision
**When** its subtree is deleted
**Then** every subtree member disappears atomically from the task forest, queue, sessions, events, timeline, and archive projections; unrelated work is unchanged; one undo entry becomes available.

### S2: Undo deletion

**Given** deletion is the latest available undo
**When** that exact operation token is undone
**Then** the complete subtree and its prior observable task, hierarchy, lifecycle, session, event, and queue state are restored atomically, while global revisions advance monotonically.

### S3: Undo ordinary task mutations

**Given** a create, rename, move, complete, or reopen is the latest available undo
**When** that exact operation token is undone
**Then** the observable domain state immediately before that operation is restored atomically and the undone operation is no longer available.

### S4: Undo several operations in order

**Given** several reversible operations committed successfully
**When** undo is requested repeatedly using the latest token each time
**Then** operations are reverted newest-first until no available undo remains or the retained limit is reached.

### S5: Retain undo across restart

**Given** at least one reversible operation is available
**When** the database is closed and reopened
**Then** the same latest operation token and label remain available and can be undone.

### S6: Reject stale or unavailable undo

**Given** the requested token is absent, already undone, pruned, or is not the latest available operation
**When** undo is requested
**Then** the operation fails with a stable error and changes no task, hierarchy, queue, session, event, journal state, or revision.

### S7: Preserve bounded storage

**Given** more than 50 reversible operations commit
**When** the newest operation commits
**Then** the oldest excess journal entries are permanently pruned without changing current task state; pruned operations cannot be undone.

## Inputs

- task identifier: Existing stable task UUID selected for deletion.
- expected task version: Non-negative task version guarding deletion of the selected root.
- expected hierarchy revision: Current non-negative hierarchy revision guarding subtree membership and placement.
- effective instant: Valid RFC3339 UTC-normalizable instant naming the mutation time.
- expected operation token: Identifier returned by the latest undo status; it must still be the latest available entry.

## Outputs

- undo status: Whether undo is available plus the latest operation token, concise operation kind, user-facing label, and committed instant.
- reversible change result: Operation identifier, resulting source/hierarchy/queue revisions, affected task identifiers, and current undo status.
- restored task forest: Read through the existing task forest query after a successful undo or deletion.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| unavailable | No retained applied operation can be undone | available after a reversible mutation |
| available | Latest retained operation can be undone | undoing, available after a newer mutation |
| undoing | Restoration is executing atomically | available for the preceding entry, unavailable, failed |
| failed | Undo or delete made no partial change | available or unavailable according to the last committed journal state |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| task-not-found | Delete root does not exist | Refresh the forest | No |
| stale-hierarchy | Expected hierarchy revision is stale | Refresh and retry deletion | No |
| version-conflict | Delete root version is stale | Refresh and retry deletion | No |
| undo-not-available | No retained applied operation exists | Continue without undo | No |
| stale-undo | Token is not the latest available operation | Refresh undo status | No |
| undo-conflict | Restoring the snapshot would violate current database invariants | Keep current state and undo status; resolve newer/non-journalled work first | No |
| persistence-failure | Snapshot, mutation, pruning, or restoration cannot commit | Refresh and retry | No |

## Invariants

- A successful reversible mutation and its undo journal entry commit in the same SQLite transaction.
- A failed mutation creates no undo entry.
- Deleting a task deletes its entire current descendant subtree; it never silently reparents descendants.
- Deleted task identifiers appear nowhere in ordinary history or projections while deletion remains applied.
- Internal undo snapshots are never returned through task, timeline, history, day, archive, or forest queries.
- Undo applies only to the latest available operation and is atomic.
- Undo restores observable domain state from immediately before the reverted operation, including task/session/event timestamps and hierarchy/queue ordering.
- Task versions and global source, hierarchy, queue, and undo revisions remain monotonic; restoration may therefore use newer revision/version values than the pre-operation snapshot.
- Undoing one operation never creates a new user-undoable operation.
- Successful non-delete task mutations listed in scope each create exactly one undo entry.
- At most 50 applied or undone journal records are retained; pruning never changes current task state.
- Existing hierarchy cycle, maximum-depth, single-active-task, single-open-session, and optimistic-concurrency invariants remain valid.
- Failed delete or undo changes no task, hierarchy, queue, session, event, journal state, or revision.

## Scale and performance envelope

- Existing task forest limit: 5,000 retained tasks and eight hierarchy levels.
- Retain at most 50 undo journal entries.
- Correctness is contract-tested for bounded journal retention, subtree restoration, and full observable-state restoration; ordinary use remains local and single-writer.
- Interactive performance target: 200 ms for ordinary mutations at 500 retained tasks, 300 ms for a 500-task subtree delete, and 1,000 ms for its restore.
- The existing 5,000-task forest remains functionally supported, but large-database latency and journal-size optimization are not release guarantees until measured against event/session-heavy fixtures.
- One local writer remains serialized by the application database mutex.

## Observability

- Journal operation token, kind, concise label, affected task identifiers, committed instant, and applied/undone state.
- Do not expose snapshot payloads, SQLite statements, or local file paths.
- Undo itself records an internal undo instant and operation identifier but does not appear as ordinary task history.
- Stable errors distinguish unavailable, stale, conflicting, and persistence failures.

## Headless interface

```text
deleteTaskSubtree(taskId, expectedTaskVersion, expectedHierarchyRevision, effectiveInstant)
  -> ReversibleChangeResult | DomainError

getUndoStatus()
  -> UndoStatus | DomainError

undoLastTaskOperation(expectedOperationToken, effectiveInstant)
  -> ReversibleChangeResult | DomainError
```

The existing successful `createTaskInHierarchy`, `renameTask`, `moveTaskInHierarchy`, `completeHierarchyTask`, and `reopenHierarchyTask` commands additionally create one atomic journal entry. Their existing inputs, outputs, validation, and failure semantics remain compatible.

## Contract tests

- S1 deletes a leaf and a nested subtree from every ordinary projection with one atomic journal entry.
- S2 restores a deleted subtree including task fields, hierarchy, queue placement, sessions, and task events while revisions remain monotonic.
- S3 undoes create, rename, move, complete, and reopen to their prior observable state.
- S4 undoes at least three mixed operations strictly newest-first.
- S5 closes and reopens an on-disk database and retains the latest undo token and successful restoration.
- S6 rejects absent, stale, already-undone, and pruned tokens with no partial change.
- S7 retains 50 entries and prunes the oldest excess entries without changing current state.
- Delete and undo reject stale task/hierarchy inputs and preserve all state atomically on persistence failure.
- Undo restoration preserves hierarchy cycle/depth, single-active, single-open-session, and deterministic sibling/queue ordering invariants.
- All existing locked capability tests remain unchanged and pass.

## Change history

- 1.0 / 2026-08-23: Implemented and locked after the headless SQLite, Tauri adapter, restart, bounded retention, atomic rollback, and monotonic revision/version contract tests passed.
- 1.0 / 2026-08-23: Drafted from the explicitly requested delete-without-history and multi-operation undo capability; additive to the locked hierarchy, lifecycle, queue, session-history, and projection capabilities.
