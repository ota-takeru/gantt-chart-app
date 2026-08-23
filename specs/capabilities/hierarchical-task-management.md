# Capability: hierarchical-task-management

- Status: implemented / locked
- Version: 1.0
- User outcome: Keep remaining and completed work in a stable hierarchy, add subtasks quickly, and move or reparent tasks without losing their completion history.
- Owner: Gantt chart app
- Last updated: 2026-08-23

## Domain boundary

### In scope

- Create a top-level task or a direct subtask at a relative sibling position.
- Read the complete task forest with stable parent, sibling order, task state, and revisions.
- Move a task before a sibling or to the end of another parent, including top-level placement.
- Complete remaining work while retaining its hierarchy placement and completion instant.
- Reopen completed work, including the completed ancestor path required to make it visible as remaining work.
- Preserve compatibility with the existing task lifecycle, queue, session, and history capabilities.
- Backfill existing tasks as top-level hierarchy members without deleting or rewriting their lifecycle history.

### Out of scope

- Planned start/end dates, estimates, deadlines, dependencies, assignees, tags, or progress percentages.
- Starting, pausing, switching focus, timers, duration totals, and detailed work-session presentation.
- Deleting tasks, bulk editing, arbitrary multi-selection, or cross-database synchronization.
- UI controls, drag gestures, hover behavior, visual nesting, animation, and screen layout.

## Domain vocabulary

- remaining task: A task whose lifecycle state is queued, active, or paused.
- completed task: A task whose lifecycle state is completed; its hierarchy placement and completion instant remain retained.
- parent: The direct containing task, or absent for a top-level task.
- sibling order: The stable order among tasks with the same parent.
- task forest: All top-level tasks and their ordered descendants.
- placement: A target parent plus an optional sibling before which the task is inserted; omission of the sibling means the end of that parent.
- ancestor path: The ordered parents from a task to its top-level root.
- hierarchy revision: A monotonic revision protecting placement previews from stale concurrent hierarchy changes.

## Scenarios

### S1: Create top-level work

**Given** a current hierarchy revision
**When** a valid title is created without a parent at a valid top-level placement
**Then** one queued task and one top-level hierarchy entry are committed atomically, sibling order is stable, and the hierarchy and source revisions each advance once.

### S2: Create a subtask quickly

**Given** a remaining parent and current hierarchy revision
**When** a valid child title is created for that parent
**Then** the new queued task is appended to that parent's children unless a valid before-sibling is supplied, and task creation plus placement commit atomically.

### S3: Reorder within one parent

**Given** A and B share a parent at hierarchy revision R
**When** A is moved before B using R
**Then** only their sibling order changes, A retains its state and history, and hierarchy revision advances once.

### S4: Reparent a task and its subtree

**Given** A has descendants and target parent P is not A or a descendant of A
**When** A is moved to P at a valid placement using the current revision
**Then** A and its entire subtree retain identity, state, internal order, and history while A receives the new direct parent.

### S5: Reject a cyclic or too-deep move

**Given** a requested parent is the moved task, its descendant, or would make the resulting depth exceed eight levels
**When** the placement is submitted
**Then** the operation fails with a stable error and no task, hierarchy, queue, event, or revision change.

### S6: Complete a leaf or fully completed branch

**Given** a remaining task has no remaining descendants
**When** it is completed with the current task version
**Then** its state and completion instant change, its hierarchy placement is retained, no other task starts, and lifecycle history remains available.

### S7: Protect unfinished descendants

**Given** a remaining parent has at least one remaining descendant
**When** completion is requested
**Then** completion fails with `incomplete-descendants`, identifies a safe recovery, and changes nothing.

### S8: Reopen completed nested work

**Given** a completed task is nested under one or more completed ancestors
**When** it is reopened with the current task version
**Then** the task and each completed ancestor become queued in one transaction, existing completion events remain, no session is fabricated or started, hierarchy placement is unchanged, and returned changed tasks identify every reopened task.

### S9: Separate remaining and completed projections

**Given** a task forest containing both remaining and completed tasks
**When** the forest is read
**Then** every retained task appears exactly once with state, parent, sibling order, and depth so a consumer can derive remaining and completed views without reconstructing history.

### S10: Preserve existing data during migration

**Given** tasks created before hierarchy support
**When** the database is opened after the hierarchy migration
**Then** every existing task receives exactly one top-level entry in deterministic creation order and all titles, states, versions, sessions, completion instants, events, and queue entries remain unchanged.

## Inputs

- title: Trimmed UTF-8 text from 1 to 240 characters.
- task identifier: Existing stable task UUID.
- target parent task identifier: Existing task UUID or absent for top level.
- before task identifier: Existing task UUID sharing the target parent, or absent to append.
- expected task version: Non-negative optimistic-concurrency version for completion/reopen.
- expected hierarchy revision: Non-negative revision that must equal the stored hierarchy revision for create and move placement commands.
- effective instant: Valid RFC3339 UTC-normalizable instant used for lifecycle history.

## Outputs

- hierarchy entry: Task snapshot, optional parent identifier, integer sibling position, and zero-based depth.
- task forest snapshot: Pre-order entries, hierarchy revision, source revision, and truncation state.
- hierarchy change result: Operation identifier, resulting hierarchy/source revisions, changed hierarchy entries, and changed task snapshots where lifecycle state changed.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| remaining | Queued, active, or paused work visible in the remaining projection | completed |
| completed | Finished work retained in the completed projection and hierarchy | remaining through reopen |

Hierarchy membership is orthogonal to lifecycle state. Moving or reparenting never changes lifecycle state.

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| invalid-title | Trimmed title is empty or exceeds 240 characters | Correct the title and retry | No |
| task-not-found | Source task does not exist | Refresh the forest | No |
| parent-not-found | Requested parent does not exist | Refresh the forest | No |
| parent-completed | A new remaining task would be placed under a completed parent | Reopen the parent, then retry | No |
| anchor-not-found | Requested before-sibling does not exist | Refresh the forest | No |
| anchor-scope-mismatch | Requested anchor does not share the target parent | Rebuild the placement from the current forest | No |
| hierarchy-cycle | Task would become its own ancestor | Choose another parent | No |
| hierarchy-depth-exceeded | Resulting subtree would exceed depth eight | Choose a shallower parent | No |
| stale-hierarchy | Expected revision differs from stored revision | Refresh and rebuild the placement | No |
| version-conflict | Expected task version is stale | Refresh the task and retry | No |
| incomplete-descendants | Completion target has remaining descendants | Complete remaining descendants first | No |
| invalid-state | Completion or reopen is invalid for the current state | Refresh and choose an allowed action | No |
| tree-limit-exceeded | A full forest exceeds 5,000 retained tasks | Narrowing/archive support is required before mutation | No |
| persistence-failure | Atomic commit fails | Retry after refreshing | No |

## Invariants

- Every retained task has exactly one hierarchy entry.
- A hierarchy entry has at most one direct parent and no task is its own ancestor.
- Sibling order is deterministic and unique after every successful mutation.
- Maximum resulting task depth is eight, with top-level depth zero.
- A completed task has no remaining descendants immediately after a successful capability operation.
- Creating remaining work under a completed parent is rejected.
- Reopening nested work also reopens every completed ancestor required to preserve the preceding invariant.
- Reparenting preserves the complete subtree, task identifiers, versions, states, completion instants, sessions, events, and internal order.
- Completion and reopening preserve hierarchy membership and sibling order.
- A successful create or move increments hierarchy revision exactly once; a lifecycle-only completion or reopen does not change hierarchy revision.
- Failed operations change no task, hierarchy, queue, session, event, or revision.
- Existing locked lifecycle and queue contracts remain valid; this capability does not weaken or replace them.

## Scale and performance envelope

- Up to 5,000 retained tasks and eight hierarchy levels in one local SQLite database.
- Full-forest read target: 200 ms at the supported limit on a typical desktop after database open.
- Create, move, complete, and reopen target: 100 ms for ordinary trees and 200 ms at the supported limit.
- One local writer is serialized by the application database mutex; revisions reject stale UI placement previews.

## Observability

- Record `task-hierarchy-created` and `task-hierarchy-moved` events with operation identifier, previous/new parent, placement anchor, and resulting hierarchy revision.
- Existing `task-created`, `task-completed`, and `task-reopened` events remain authoritative lifecycle history.
- Return stable error codes without SQLite statements or local file paths.

## Headless interface

```text
createTaskInHierarchy(title, targetParentTaskId?, beforeTaskId?, expectedHierarchyRevision, effectiveInstant)
  -> HierarchyChangeResult | DomainError

moveTaskInHierarchy(taskId, targetParentTaskId?, beforeTaskId?, expectedHierarchyRevision, effectiveInstant)
  -> HierarchyChangeResult | DomainError

completeHierarchyTask(taskId, expectedTaskVersion, effectiveInstant)
  -> HierarchyChangeResult | DomainError

reopenHierarchyTask(taskId, expectedTaskVersion, effectiveInstant)
  -> HierarchyChangeResult | DomainError

getTaskForest(limit)
  -> TaskForestSnapshot | DomainError
```

## Contract tests

- S1 creates task and top-level placement atomically and advances revisions once.
- S2 appends or relatively inserts a child and rejects a completed parent.
- S3 reorders siblings and rejects stale revisions with no partial change.
- S4 reparents an intact subtree while preserving lifecycle/history fields.
- S5 rejects self-parent, descendant-parent, and depth-nine results atomically.
- S6 completes a leaf or fully completed branch without changing hierarchy.
- S7 rejects parent completion while any descendant remains.
- S8 reopens the target and completed ancestor path without opening sessions or changing hierarchy.
- S9 returns each task once in deterministic pre-order with correct depth and revisions.
- S10 backfills pre-hierarchy data deterministically and idempotently without changing existing records.
- Limit, invalid-title, missing task/parent/anchor, anchor-scope, version-conflict, and persistence errors have stable codes and no partial application.
- All existing locked capability tests remain unchanged and pass.

## Change history

- 1.0 / 2026-08-23: Implemented and locked after 7 hierarchy contract tests and all 28 pre-existing locked capability tests passed; additive to the locked lifecycle, queue, session-history, and projection capabilities.
