# Capability: focus-work-lifecycle

- Status: superseded
- Version: 1.0
- User outcome: Capture small work items quickly, keep exactly one current focus, and move work through queued, active, paused, and completed states without entering planned dates.
- Owner: Gantt Chart App
- Last updated: 2026-08-23

## Domain boundary

### In scope
- Create a task with a required title and no planned start or end.
- Rename a task.
- Start a queued or paused task when no other task is active.
- Atomically switch focus from the active task to a queued or paused task.
- Pause the active task.
- Complete a queued, paused, or active task without automatically starting another task.
- Reopen a completed task as queued work.
- Preserve the current focus across application restarts until an explicit transition occurs.

### Out of scope
- Planned start dates, planned end dates, deadlines, and calendar scheduling.
- Percentage progress, dependencies, hierarchy, recurring tasks, deletion, and collaboration.
- UI mechanisms such as buttons, gestures, dialogs, cards, or timeline bars.
- Editing recorded work-session timestamps.

## Domain vocabulary

- task: A named unit of work whose lifecycle is managed by this capability.
- current focus: The single task in the active state.
- queued: Work that has not started or has been reopened and is available to start.
- active: Work currently declared as in progress.
- paused: Previously started work that is not currently active and may resume later.
- completed: Work declared finished; its prior sessions and events remain retained.
- focus switch: One atomic operation that pauses the current focus and starts another task at the same effective time.

## Scenarios

### S1: Capture work without scheduling it

**Given** a non-empty task title
**When** a task is created
**Then** it is queued, has no planned start or end, and is available in the next-work queue

### S2: Start the first current focus

**Given** no task is active and a queued task exists
**When** that task is started at a supplied instant
**Then** it becomes the only active task and a work session is opened at that instant

### S3: Switch current focus atomically

**Given** Task A is active and Task B is queued or paused
**When** focus is switched from A to B at a supplied instant
**Then** A becomes paused, A's open session closes, B becomes active, and B receives a new open session at the same instant

### S4: Complete current work

**Given** a task is active
**When** it is completed at a supplied instant
**Then** its open session closes, the task becomes completed, retained history is unchanged, and no next task starts automatically

### S5: Complete work that has no session

**Given** a task is queued and has never been started
**When** it is completed
**Then** it becomes completed with a completion event and no fabricated work session

### S6: Reopen completed work

**Given** a completed task with retained sessions and events
**When** it is reopened
**Then** it becomes queued, its earlier completion and sessions remain in history, and no session starts automatically

### S7: Reject a conflicting start

**Given** Task A is active and Task B is queued
**When** Task B is started without a focus-switch command
**Then** the command fails with an active-task conflict and neither task changes

## Inputs

- task identifier: Stable unique identifier; required for commands on an existing task.
- title: Trimmed Unicode text from 1 to 240 characters.
- effective instant: UTC instant supplied by the application clock; must not precede the task's creation, latest retained event, latest session boundary, or an affected open session's start.
- expected version: Non-negative task version used to reject stale mutations.
- queue placement: Optional queue-relative placement used when pausing or reopening; interpreted by `next-queue-ordering`.

## Outputs

- task snapshot: Identifier, title, lifecycle state, current version, creation instant, and latest completion state.
- lifecycle result: All task snapshots changed by the atomic operation plus its operation identifier.
- domain error: Stable error code with safe recovery information and no partial application.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| queued | Available to become current focus; never started or reopened | active, completed |
| active | The single current focus with one open session | paused, completed |
| paused | Previously started and available to resume | active, completed |
| completed | Declared finished and absent from current work | queued |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| invalid-title | Title is blank or exceeds 240 characters | Correct the title and retry | No |
| task-not-found | Task identifier does not exist | Refresh current state | No |
| invalid-transition | Source state does not allow the command | Refresh and choose an allowed command | No |
| active-task-conflict | A start was requested while another task is active | Use the explicit focus-switch operation or pause the active task | No |
| stale-version | Expected version differs from stored version | Refresh and retry from current state | No |
| invalid-effective-instant | Effective instant precedes an affected open session | Correct the clock/input and retry | No |
| persistence-failure | Atomic storage operation fails | Keep prior state and retry safely | No |

## Invariants

- At most one task is active globally.
- An active task has exactly one open work session; a non-active task has no open work session.
- Planned start and planned end do not exist in this capability.
- Completing a task never starts another task implicitly.
- Reopening or renaming a task never erases or rewrites prior events or work sessions.
- Retained event and session instants for each task are nondecreasing, and no event or session predates task creation.
- A focus switch applies both task transitions and both session changes atomically at one effective instant.
- Failed operations make no task, queue, session, or event change.
- Application shutdown does not itself end an active session or change lifecycle state.

## Scale and performance envelope

- Support at least 10,000 retained tasks and 100,000 lifecycle events in one local SQLite database.
- A single lifecycle command affects a bounded number of task, queue, session, and event records and does not scan all history.

## Observability

- Append task-created, task-renamed, task-started, task-paused, focus-switched, task-completed, and task-reopened events with operation identifier and UTC instant.
- Record rejected command code and correlation identifier without storing UI-specific details.

## Headless interface

```text
createTask(title, effectiveInstant) -> TaskSnapshot | DomainError
renameTask(taskId, title, expectedVersion, effectiveInstant) -> TaskSnapshot | DomainError
startTask(taskId, expectedVersion, effectiveInstant) -> LifecycleResult | DomainError
switchFocus(fromTaskId, toTaskId, expectedVersions, effectiveInstant) -> LifecycleResult | DomainError
pauseTask(taskId, expectedVersion, queuePlacement, effectiveInstant) -> LifecycleResult | DomainError
completeTask(taskId, expectedVersion, effectiveInstant) -> LifecycleResult | DomainError
reopenTask(taskId, expectedVersion, queuePlacement, effectiveInstant) -> LifecycleResult | DomainError
getCurrentFocus() -> TaskSnapshot | null
getTask(taskId) -> TaskSnapshot | DomainError
```

## Contract tests

- S1 creates queued work without planned dates.
- S2 opens exactly one session and establishes exactly one current focus.
- S3 closes and opens sessions at the same instant in one atomic operation.
- S4 closes the open session without automatically starting queued work.
- S5 completes never-started work without fabricating a session.
- S6 retains all prior sessions and events after reopening.
- S7 and every error return no partial application.
- Restarting the application preserves active state and the open session.
- A mutation timestamp earlier than task creation or the latest retained task event is rejected with no partial application.
- Every allowed and rejected state transition satisfies the single-active-task invariant.

## Change history

- 1.0 / 2026-08-23: Initial draft; planned dates explicitly excluded by product decision.
- 1.0 / 2026-08-23: Implemented and locked after lifecycle, atomicity, temporal-order, restart, and negative contract tests passed.
- 1.0 / 2026-08-23: Superseded by locked version 1.1 after authorized CCR-001 implementation and regression verification.
