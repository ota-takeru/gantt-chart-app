# Capability: next-queue-ordering

- Status: superseded
- Version: 1.0
- User outcome: Maintain a deliberate, stable order of what to work on next without assigning calendar dates or durations.
- Owner: Gantt Chart App
- Last updated: 2026-08-23

## Domain boundary

### In scope
- Keep every queued or paused task in one ordered next-work queue.
- Append newly created tasks to the queue.
- Move an eligible task before another eligible task or to the end.
- Remove a task when it becomes active or completed.
- Insert a paused or reopened task at an explicitly requested relative placement.
- Return stable queue order across application restarts.

### Out of scope
- Planned dates, durations, deadlines, automatic priority scoring, dependencies, hierarchy, and multiple queues.
- UI mechanisms such as drag-and-drop, numbered controls, or keyboard shortcuts.
- Automatically starting the first queued task.

## Domain vocabulary

- next-work queue: The ordered set of tasks eligible to become current focus.
- eligible task: A task in queued or paused state.
- relative placement: A request to place a task before an eligible anchor task or at the end.
- queue entry: The persisted membership and ordering key for one eligible task.

## Scenarios

### S1: Append newly captured work

**Given** an existing queue
**When** a task is created
**Then** one queue entry is appended after all existing entries

### S2: Reorder work by relative placement

**Given** Tasks A, B, and C are queued in that order
**When** C is moved before A
**Then** the order becomes C, A, B without changing any task history

### S3: Start queued work

**Given** a queued task has one queue entry
**When** it becomes active
**Then** its queue entry is removed atomically with the lifecycle transition

### S4: Pause current work into the queue

**Given** a task is active
**When** it is paused with a requested relative placement
**Then** one queue entry is inserted at that placement atomically with the lifecycle transition

### S5: Reject an ineligible move

**Given** a task is active or completed
**When** a queue move is requested for it
**Then** the command fails and queue order remains unchanged

## Inputs

- task identifier: Identifier of the eligible task to position.
- anchor task identifier: Optional identifier before which the task is placed; omitted means the end.
- expected queue revision: Non-negative revision used to reject stale reorder commands.
- effective instant: UTC instant for the appended queue audit event; it must not precede the task's creation or latest retained event.

## Outputs

- queue snapshot: Ordered eligible task identifiers and current queue revision.
- queue change result: Changed placement, resulting revision, and operation identifier.
- domain error: Stable error code with no partial queue or lifecycle change.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| absent | Task has no queue entry because it is active or completed | present when paused or reopened |
| present | Eligible task has exactly one position in the queue | reordered, absent when started or completed |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| task-not-found | Task identifier does not exist | Refresh task state | No |
| task-not-eligible | Task is not queued or paused | Use a lifecycle transition first | No |
| anchor-not-found | Anchor is absent or not eligible | Refresh the queue and choose another anchor | No |
| self-anchor | Task is requested before itself | Treat as invalid and keep current order | No |
| stale-queue | Expected revision differs from current revision | Refresh and retry the relative move | No |
| persistence-failure | Queue update cannot be committed | Keep prior order and retry safely | No |

## Invariants

- Every queued or paused task has exactly one queue entry.
- Active and completed tasks have no queue entry.
- Queue order contains no duplicate task identifiers.
- Reordering never changes task state or existing lifecycle/work-session history; it appends one queue-reordered audit event.
- Starting, pausing, completing, and reopening update lifecycle and queue membership atomically.
- Queue order persists independently of any rendered numbering or coordinates.
- Queue entries contain no planned date or duration.

## Scale and performance envelope

- Support at least 10,000 eligible tasks while retrieving the first 200 entries without loading the full task history.
- Normal relative moves update a bounded set of ordering records. If ordering-key space is exhausted, the queue may be rebalanced atomically without changing its logical order.

## Observability

- Record task-enqueued, task-dequeued, and queue-reordered events with operation identifier and resulting queue revision.
- Record rejected reorder reason and correlation identifier.

## Headless interface

```text
getNextQueue(afterCursor, limit) -> QueuePage
moveQueuedTask(taskId, beforeTaskId | end, expectedQueueRevision, effectiveInstant) -> QueueChangeResult | DomainError
```

Lifecycle commands from `focus-work-lifecycle` own atomic queue insertion and removal when task state changes.

## Contract tests

- S1 appends a new task and increments queue revision once.
- S2 performs the exact relative move, preserves existing task/session/event data, and appends one queue-reordered audit event.
- S3 and S4 update queue membership in the same transaction as lifecycle state.
- S5 and every queue error preserve the complete prior order.
- Concurrent stale moves are rejected without duplicate or missing entries.
- Large queues remain pageable; ordering-key rebalancing, when required, preserves the exact logical order atomically.

## Change history

- 1.0 / 2026-08-23: Initial draft with sequence-only future planning.
- 1.0 / 2026-08-23: Implemented and locked after relative-order, stale-revision, pagination, rebalance, and atomicity contract tests passed.
- 1.0 / 2026-08-23: Superseded by locked version 1.1 after authorized CCR-001 implementation and regression verification.
