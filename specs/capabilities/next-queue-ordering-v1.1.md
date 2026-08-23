# Capability: next-queue-ordering

- Status: locked
- Version: 1.1
- User outcome: Maintain a deliberate, stable order of what to work on next, including where interrupted work returns during an atomic focus switch, without calendar scheduling.
- Owner: Gantt Chart App
- Last updated: 2026-08-23

## Domain boundary

### In scope
- Keep every queued or paused task in one ordered queue.
- Append new tasks, move eligible tasks by relative placement, and persist order.
- Remove tasks that become active or completed.
- Insert paused, reopened, and switched-from tasks before an eligible anchor or at queue end.
- Validate explicit focus-switch placement against the queue revision used to prepare it.

### Out of scope
- Dates, durations, deadlines, automatic priority, dependencies, hierarchy, multiple queues, and automatic start.
- UI mechanisms such as drag, numbered controls, menus, or keyboard shortcuts.

## Domain vocabulary

- next-work queue: Ordered set of tasks eligible to become current focus.
- eligible task: Task in queued or paused state.
- relative placement: Before an eligible anchor or at queue end.
- switch return placement: Relative placement of the task paused by a focus switch.
- queue revision: Monotonic revision protecting placement previews from stale order.

## Scenarios

### S1: Capture and reorder next work

**Given** an existing queue
**When** work is created or an eligible task is moved
**Then** creation appends and a relative move produces the requested stable order

### S2: Start or complete queued work

**Given** an eligible task has one queue entry
**When** it becomes active or completed
**Then** its queue entry is removed atomically with the lifecycle transition

### S3: Pause or reopen at a relative placement

**Given** a current queue revision and eligible anchor
**When** active work pauses or completed work reopens with a placement
**Then** one queue entry appears at the requested position atomically with lifecycle state

### S4: Return switched-from work at a relative placement

**Given** A is active and B and C are in queue revision R
**When** focus switches A to B with A requested before C at revision R
**Then** B is removed, A is inserted before C, and the switch increments queue revision once

### S5: Preserve default-end compatibility

**Given** A is active and B is eligible
**When** focus switches without placement/revision
**Then** A is appended at queue end

### S6: Reject stale or invalid switch placement

**Given** a placement preview is stale, missing its revision, or references an unavailable/self anchor
**When** focus switch is requested
**Then** the entire lifecycle and queue operation fails without partial application

## Inputs

- task identifier: Eligible task or switched-from task identifier.
- anchor identifier: Optional eligible task before which work is placed; omission means end.
- expected queue revision: Non-negative revision. Required for explicit switch return placement; optional for compatible default-end switch.
- effective instant: UTC instant for the appended queue/lifecycle audit events.

## Outputs

- queue snapshot: Ordered eligible tasks, queue revision, source revision, and cursor.
- queue/lifecycle result: Resulting revisions, operation identifier, and affected task snapshots or placement.
- domain error: Stable code with no partial state or order change.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| absent | Active or completed task has no queue entry | present when paused/reopened/switched-from |
| present | Queued or paused task has exactly one ordered entry | reordered, absent when active/completed |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| task-not-found | Task does not exist | Refresh state | No |
| task-not-eligible | Moved/anchor task is not eligible | Refresh lifecycle and queue | No |
| anchor-not-found | Anchor is absent or unavailable | Refresh and choose another anchor/end | No |
| self-anchor | Invalid source/target anchor relationship | Correct placement | No |
| stale-queue | Revision is stale or required explicit-placement revision is missing | Refresh and rebuild preview | No |
| persistence-failure | Atomic queue/lifecycle transaction fails | Keep prior state and retry | No |

## Invariants

- Every queued or paused task has exactly one queue entry; active and completed tasks have none.
- Queue order has no duplicates and persists independently of rendered coordinates.
- Reorder and switch placement never alter existing lifecycle/session history; they append audit events.
- Focus switch removes the target and inserts the source in one transaction and increments queue revision once.
- Explicit switch placement requires and validates its preview revision.
- Default-end switch remains valid without placement/revision for v1.0 compatibility.
- Failed or stale operations preserve the complete prior task, queue, session, event, and revision state.
- Queue entries contain no planned date or duration.

## Scale and performance envelope

- Support at least 10,000 eligible tasks with bounded paging.
- Normal relative moves update bounded ordering records; exhausted key space may rebalance atomically without logical-order change.

## Observability

- Record enqueue, dequeue, reorder, and switch-return placement in the shared operation event set.
- Return queue revision and stable rejection code without UI-specific details.

## Headless interface

```text
getNextQueue(afterCursor, limit) -> QueuePage
moveQueuedTask(taskId, beforeTaskId | end, expectedQueueRevision, effectiveInstant) -> QueueChangeResult | DomainError
switchFocus(fromTaskId, toTaskId, expectedVersions, fromQueuePlacement?, expectedQueueRevision?, effectiveInstant) -> LifecycleResult | DomainError
```

## Contract tests

- All version 1.0 ordering, paging, stale revision, rebalance, and atomic lifecycle tests remain unchanged and pass.
- Explicit switch placement returns the source before the chosen anchor after removing the target.
- Omitted switch placement/revision appends the source at end.
- Missing or stale revision, missing/ineligible anchor, self-anchor, and target-as-anchor roll back the full switch.
- Successful switch increments queue/source revisions once and retains existing sessions/events.

## Change history

- 1.1 / 2026-08-23: Draft successor authorized by CCR-001; specifies switched-from queue placement and revision safety.
- 1.1 / 2026-08-23: Implemented and locked after all prior ordering tests and new switch-placement regression tests passed.
