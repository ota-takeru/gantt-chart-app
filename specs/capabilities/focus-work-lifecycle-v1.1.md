# Capability: focus-work-lifecycle

- Status: locked
- Version: 1.1
- User outcome: Capture small work items quickly, keep exactly one current focus, and move work through queued, active, paused, and completed states without entering planned dates, including a predictable queue return position when focus switches.
- Owner: Gantt Chart App
- Last updated: 2026-08-23

## Domain boundary

### In scope
- Create a task with a required title and no planned start or end.
- Rename a task.
- Start a queued or paused task when no other task is active.
- Atomically switch focus from the active task to a queued or paused task while placing the switched-from task at an explicit relative queue position or, by default, at queue end.
- Pause the active task at a relative queue position.
- Complete a queued, paused, or active task without automatically starting another task.
- Reopen a completed task at a relative queue position.
- Preserve current focus across application restarts until an explicit transition occurs.

### Out of scope
- Planned dates, deadlines, percentage progress, dependencies, hierarchy, recurring tasks, deletion, collaboration, and session-time editing.
- UI mechanisms such as gestures, dialogs, cards, rows, or timeline bars.

## Domain vocabulary

- task: A named unit of work managed by this capability.
- current focus: The single task in the active state.
- queued: Work available to start that has not started or has been reopened.
- active: Work currently declared in progress.
- paused: Previously started work not currently active and eligible to resume.
- completed: Work declared finished while its history remains retained.
- focus switch: One atomic operation that pauses the current focus, returns it to the queue, and starts another task at the same effective instant.
- switch return placement: Relative queue placement for the switched-from task; before an eligible anchor or at queue end.

## Scenarios

### S1: Capture work without scheduling it

**Given** a valid title
**When** a task is created
**Then** it is queued at queue end with no planned date or duration

### S2: Start the first current focus

**Given** no active task and an eligible queued task
**When** that task is started
**Then** it becomes the only active task and opens one session

### S3: Switch focus with explicit return placement

**Given** A is active and B and C are eligible in the current queue revision
**When** focus switches from A to B with A requested before C
**Then** A's session closes, A becomes paused before C, B leaves the queue and becomes active, and B opens a session at the same instant in one transaction

### S4: Switch focus with backward-compatible default

**Given** A is active and B is eligible
**When** focus switches from A to B without a return placement or queue revision
**Then** A becomes paused at queue end and B becomes active, preserving version 1.0 behavior

### S5: Reject stale or invalid switch placement

**Given** A is active and a placement preview references an old queue revision or unavailable anchor
**When** the switch is submitted
**Then** it fails with no task, queue, session, event, or revision change

### S6: Pause or complete current work

**Given** a task is active
**When** it is paused or completed
**Then** its open session closes; pause queues it at the requested position, while completion leaves no active task and starts no next task

### S7: Complete work without a session and reopen it

**Given** queued work has never started
**When** it is completed and later reopened
**Then** no session is fabricated, completion history remains, and reopening queues it without starting it

### S8: Reject a conflicting start

**Given** A is active and B is queued
**When** B is started without the explicit switch operation
**Then** the operation fails and no state changes

## Inputs

- task identifier: Stable unique task identifier.
- title: Trimmed Unicode text from 1 to 240 characters.
- expected task version: Non-negative version used to reject stale mutation.
- effective instant: UTC instant that does not precede task creation, latest event, latest session boundary, or an affected open-session start.
- queue placement: Relative placement before an eligible anchor or at queue end.
- switch return placement: Optional queue placement for the switched-from task; omission means queue end.
- expected queue revision: Optional non-negative queue revision. An explicit switch return placement requires the revision used to prepare it; omission is supported only for the backward-compatible default-end switch.

## Outputs

- task snapshot: Identifier, title, lifecycle state, version, creation instant, actual start, and latest retained completion state.
- lifecycle result: Changed task snapshots, operation identifier, queue revision, and source revision.
- domain error: Stable code and safe recovery detail with no partial application.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| queued | Available to become current focus | active, completed |
| active | The single current focus with one open session | paused, completed |
| paused | Previously started and eligible to resume | active, completed |
| completed | Finished and absent from current work | queued |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| invalid-title | Title is blank or exceeds 240 characters | Correct and retry | No |
| task-not-found | Task does not exist | Refresh state | No |
| invalid-transition | Source state disallows the command | Refresh and choose an allowed command | No |
| active-task-conflict | Start requested while another task is active | Use explicit switch or pause first | No |
| stale-version | Expected task version is stale | Refresh task and retry | No |
| stale-queue | Explicit return placement has no matching current queue revision | Refresh queue and rebuild the preview | No |
| anchor-not-found | Return anchor is absent or ineligible | Refresh queue and select another anchor/end | No |
| self-anchor | Source or target is used as an invalid placement anchor | Correct placement | No |
| invalid-effective-instant | Effective instant violates retained temporal order | Refresh clock/state and retry | No |
| persistence-failure | Atomic storage operation fails | Keep prior state and retry safely | No |

## Invariants

- At most one task is active globally, and it has exactly one open work session.
- Every queued or paused task has exactly one queue entry; active and completed tasks have none.
- A focus switch closes the source session, pauses and queues the source, dequeues and activates the target, opens the target session, records events, and increments revisions in one transaction.
- Explicit switch placement is evaluated against its expected queue revision; stale or invalid placement cannot partially switch focus.
- Omitted switch placement returns the source task to queue end for version 1.0 compatibility.
- Completing or reopening work never starts another task automatically.
- Planned dates and durations do not exist.
- Prior events and sessions remain append-only and temporally nondecreasing.
- Failed operations change no task, queue, session, event, or revision.

## Scale and performance envelope

- Support at least 10,000 retained tasks and 100,000 lifecycle events in one local SQLite database.
- A switch affects a bounded set of task/session/event records; ordering keys may rebalance atomically when necessary.

## Observability

- Record task lifecycle, queue membership, focus switch, and session open/close events with operation identifier and UTC instant.
- A switch result exposes the resulting queue/source revisions; rejected switches expose a stable error code without UI-specific details.

## Headless interface

```text
createTask(title, effectiveInstant) -> TaskSnapshot | DomainError
renameTask(taskId, title, expectedVersion, effectiveInstant) -> TaskSnapshot | DomainError
startTask(taskId, expectedVersion, effectiveInstant) -> LifecycleResult | DomainError
switchFocus(fromTaskId, toTaskId, expectedVersions, fromQueuePlacement?, expectedQueueRevision?, effectiveInstant) -> LifecycleResult | DomainError
pauseTask(taskId, expectedVersion, queuePlacement, effectiveInstant) -> LifecycleResult | DomainError
completeTask(taskId, expectedVersion, effectiveInstant) -> LifecycleResult | DomainError
reopenTask(taskId, expectedVersion, queuePlacement, effectiveInstant) -> LifecycleResult | DomainError
getCurrentFocus() -> TaskSnapshot | null
getTask(taskId) -> TaskSnapshot | DomainError
```

## Contract tests

- All version 1.0 lifecycle, session, temporal-order, restart, and no-partial-application tests remain unchanged and pass.
- Explicit-before switch places the source exactly before the requested eligible anchor.
- Omitted placement and revision place the source at queue end.
- Explicit placement without its expected queue revision is rejected with no change.
- Stale queue revision, absent/ineligible anchor, source self-anchor, and target anchor are rejected with full rollback.
- Queue and source revision increment exactly once for a successful switch.

## Change history

- 1.1 / 2026-08-23: Draft successor authorized by CCR-001; adds explicit switched-from queue placement with compatible default-end behavior.
- 1.1 / 2026-08-23: Implemented and locked after all 23 version 1.0 tests and 5 placement/revision/rollback tests passed.
