# Capability: work-session-history

- Status: locked
- Version: 1.0
- User outcome: See when work actually started, paused, resumed, switched, and finished while retaining every real work interval.
- Owner: Gantt Chart App
- Last updated: 2026-08-23

## Domain boundary

### In scope
- Open a work session when a task becomes active.
- Close the open session when work is paused, switched, or completed.
- Retain multiple non-overlapping sessions for a task across pauses, resumes, and reopenings.
- Derive a task's first actual start and its completion events from retained history.
- Keep an open session active across application restarts.
- Query sessions and lifecycle events by task and actual time range.

### Out of scope
- Planned dates, expected duration, passive activity monitoring, idle detection, and automatic pause on application close.
- Editing, merging, or deleting recorded sessions in version 1.0.
- UI representation, visualization density, and aggregation layout.

## Domain vocabulary

- work session: One explicitly declared interval during which a task is active.
- open session: A session with a start instant and no end instant.
- closed session: A session with start and end instants and an end reason.
- actual start: The earliest retained session start for a task.
- completion event: A retained declaration that a task was completed; reopening does not erase it.
- end reason: paused, switched, or completed.

## Scenarios

### S1: Record first actual work

**Given** a queued task has no sessions
**When** it becomes active at instant T1
**Then** one open session begins at T1 and the task's actual start derives to T1

### S2: Retain an interruption

**Given** a task has an open session beginning at T1
**When** it is paused at T2
**Then** that session closes at T2 with reason paused and remains retained

### S3: Resume without joining intervals

**Given** a paused task has a closed session T1-T2
**When** it resumes at T3 where T3 is after T2
**Then** a new open session begins at T3 and the gap T2-T3 remains visible in the data

### S4: Switch between tasks

**Given** Task A has an open session
**When** focus switches to Task B at instant T
**Then** A's session closes with reason switched and B's new session opens at exactly T in one transaction

### S5: Complete and reopen

**Given** a task has prior sessions and is completed at T4
**When** it is later reopened and started at T5
**Then** the completion event at T4 and all prior sessions remain retained, and a new session begins at T5

### S6: Restore after application restart

**Given** a task was active with an open session before application shutdown
**When** the application starts again
**Then** the same session remains open and its rendered effective end may be evaluated against the new current instant

## Inputs

- task identifier: Stable task identifier.
- start or end instant: UTC instant from the application clock.
- end reason: paused, switched, or completed as determined by the lifecycle command.
- query range: Inclusive start and exclusive end UTC instants with start before end.
- pagination cursor and limit: Bounded history retrieval controls.

## Outputs

- work session: Identifier, task identifier, start, optional end, optional end reason, and creating operation identifier.
- actual-history summary: Earliest actual start, latest completion event, total closed duration, optional current open session, and session count.
- history page: Chronologically ordered sessions/events with a continuation cursor.
- domain error: Stable error code with no partial lifecycle or session change.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| none | Task has no open session | open when the task starts or resumes |
| open | Task has exactly one ongoing session | closed by pause, switch, or completion |
| closed | One retained immutable interval | Remains retained; a later distinct session may open |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| session-already-open | A new session is requested for a task with an open session | Refresh lifecycle state | No |
| session-not-open | A close is requested without the expected open session | Refresh lifecycle state | No |
| overlapping-session | A requested interval would overlap retained work history | Reject and inspect task history | No |
| invalid-time-order | End instant is before session start or query range is invalid | Correct the supplied instant/range | No |
| invalid-end-reason | End reason is not allowed | Use the lifecycle-defined reason | No |
| persistence-failure | Session and lifecycle transaction fails | Keep all prior records and retry safely | No |

## Invariants

- At most one work session is open globally because at most one task is active.
- An active task has exactly one open session; all other tasks have none.
- A closed session's end is greater than or equal to its start.
- Sessions for the same task never overlap and are never silently merged.
- Work-session timestamps are actual declared instants, not planned dates or inferred estimates.
- Application shutdown does not create, close, or modify a session.
- Lifecycle state, queue membership, session changes, and events commit atomically.
- Reopening a task preserves prior completion events and sessions.

## Scale and performance envelope

- Support at least 100,000 retained work sessions and 100,000 lifecycle events in one local database.
- Task history and range queries are paginated and use task/time indexes rather than loading unbounded history.

## Observability

- Record session-opened and session-closed events with task, operation, effective instant, and end reason.
- Expose counts and query duration for diagnostics without recording UI interactions.

## Headless interface

```text
getTaskActualHistory(taskId) -> ActualHistorySummary | DomainError
getTaskSessions(taskId, afterCursor, limit) -> WorkSessionPage | DomainError
getHistoryByActualRange(rangeStart, rangeEnd, afterCursor, limit) -> ActualHistoryPage | DomainError
```

Session mutation is internal to the atomic commands defined by `focus-work-lifecycle`; callers cannot open or close sessions independently.

## Contract tests

- S1 derives actual start from the first retained session.
- S2 and S3 preserve the interruption gap as two distinct sessions.
- S4 closes and opens sessions at exactly the same instant atomically.
- S5 retains completion and pre-reopen history.
- S6 preserves the open session across process restart.
- Invalid and overlapping session operations make no lifecycle, queue, session, or event change.
- Pagination returns stable chronological order for equal timestamps.

## Change history

- 1.0 / 2026-08-23: Initial draft for actual-time-only history.
- 1.0 / 2026-08-23: Implemented and locked after multi-session, switch, reopen, cursor, actual-duration, and restart contract tests passed.
