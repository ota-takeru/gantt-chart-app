# Capability: history-projection

- Status: locked
- Version: 1.0
- User outcome: Review recent work in detail and older work in progressively denser summaries without losing the underlying actual history or obscuring current work.
- Owner: Gantt Chart App
- Last updated: 2026-08-23

## Domain boundary

### In scope
- Produce read-only projections from retained tasks, work sessions, lifecycle events, and next-work order.
- Return detailed actual session segments for a bounded focus range.
- Return task/session summaries for a local calendar day.
- Return day-level summaries for longer archive ranges.
- Include the single current focus and a bounded page of next work in a focus-surface projection.
- Evaluate an open session through a caller-supplied current instant without closing or mutating it.
- Preserve enough identifiers for a consumer to request underlying detail.

### Out of scope
- Planned dates, future time bars, estimated duration, automatic scheduling, and persistence of zoom or visual layout.
- UI structures such as rails, timelines, lists, screens, panels, or animations.
- Mutating lifecycle state, sessions, events, or queue order.

## Domain vocabulary

- projection: A deterministic read model derived without changing source records.
- focus detail: Exact retained session segments within a bounded recent actual-time range.
- day summary: Actual work grouped by task for one caller-specified local calendar day.
- archive summary: Actual work grouped by local calendar day across a longer range.
- effective end: The supplied current instant used only to represent an open session in a projection.
- detail reference: Stable identifier that permits retrieval of source task, session, or event detail.

## Scenarios

### S1: Project recent actual work with current focus

**Given** closed recent sessions, one active task with an open session, and queued work
**When** a focus projection is requested for a bounded range ending at current instant N
**Then** it returns exact recent segments, the open segment ending effectively at N and marked open, the current focus, and a bounded ordered next-work page

### S2: Summarize one local day

**Given** sessions that may cross local midnight
**When** a day summary is requested with an IANA time zone
**Then** duration is split at that day's local boundaries and grouped by task without modifying source sessions

### S3: Summarize an archive range

**Given** retained sessions across multiple days
**When** an archive summary is requested
**Then** it returns per-day task count, session count, and actual duration with detail references

### S4: Preserve reopened history

**Given** a task was completed, reopened, and worked again
**When** any history projection includes those intervals
**Then** all applicable sessions remain represented and completion cycles are distinguishable through retained event references

### S5: Return an empty projection

**Given** no actual sessions exist in the requested range
**When** a projection is requested
**Then** it returns a valid empty history result while still returning current focus and requested next-work data where applicable

## Inputs

- actual-time range: Inclusive UTC start and exclusive UTC end with start before end and a bounded maximum span per query type.
- current instant: UTC instant used to calculate only the effective end of an open session.
- IANA time zone: Required for local-day boundaries and daylight-saving behavior.
- projection kind: focus-detail, day-summary, or archive-summary.
- pagination cursor and limit: Bounded controls for tasks, segments, and next-work entries.

## Outputs

- focus projection: Exact session segments, current focus, bounded next-work entries, source references, and continuation cursors.
- day summary: Local-day boundary, per-task actual duration, session count, completion count, and source references.
- archive summary: Per-day actual duration, distinct task count, session count, completion count, and detail cursor.
- projection metadata: Source revision, query instant, time zone, truncation flags, and continuation cursors.
- domain error: Stable error code; projections never partially mutate source state.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| empty | No source sessions intersect the requested range | populated when matching history exists |
| populated | One or more source sessions intersect the range | empty or populated as source history/range changes |
| truncated | More results exist beyond a bounded page | populated or truncated through pagination |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| invalid-range | Start is not before end or exceeds the projection's maximum span | Correct the range and retry | Not applicable; read-only |
| invalid-current-instant | Current instant precedes an included open session's start | Refresh the clock and retry | Not applicable; read-only |
| invalid-time-zone | Time zone is not recognized | Supply a valid IANA time zone | Not applicable; read-only |
| stale-cursor | Source revision or query shape differs from the cursor | Restart pagination from the first page | Not applicable; read-only |
| persistence-failure | Source records cannot be read consistently | Retry from the same requested range | Not applicable; read-only |

## Invariants

- A projection never creates, updates, closes, merges, or deletes source sessions or events.
- Exact focus segments preserve interruption gaps; summaries may aggregate duration but never fabricate continuous work.
- Planned dates and future time bars are absent.
- An open session is explicitly marked open; its effective end is not persisted.
- Local-day calculations use the requested IANA time zone and handle offset transitions.
- Completed work remains retrievable even when omitted from a current-work projection.
- Every aggregate retains a path to underlying task/session/event detail.
- Equal source revision, inputs, and current instant produce the same semantic projection data; diagnostic query duration may differ.

## Scale and performance envelope

- Support source data of at least 10,000 tasks and 100,000 sessions/events.
- Focus-detail queries cover at most 24 hours; day summaries cover one local day; archive pages cover at most 366 local days.
- Results are bounded and paginated so UI consumers never require all retained history at once.

## Observability

- Return projection kind, source revision, result counts, truncation state, and query duration in diagnostic metadata.
- Record projection failures by stable error code without recording UI layout or gesture data.

## Headless interface

```text
getFocusProjection(rangeStart, rangeEnd, currentInstant, nextCursor, limits) -> FocusProjection | DomainError
getDaySummary(localDate, timeZone, currentInstant, cursor, limit) -> DaySummaryPage | DomainError
getArchiveSummary(localDateRange, timeZone, currentInstant, cursor, limit) -> ArchiveSummaryPage | DomainError
```

## Contract tests

- S1 marks the running segment open and uses current instant only as its effective end.
- S2 correctly splits sessions at local-day boundaries, including an offset transition day.
- S3 aggregates exact source duration and retains detail references.
- Day and archive projections use the supplied current instant for open sessions and are deterministic for equal inputs and source revision.
- S4 retains sessions from every completion/reopen cycle.
- S5 returns a valid empty history result without hiding current focus or next work.
- Projection queries do not mutate any source record or revision.
- Pagination remains stable or returns stale-cursor rather than mixing revisions.
- Summary duration equals the covered duration of underlying sessions without double counting.

## Change history

- 1.0 / 2026-08-23: Initial draft for actual-history semantic projections with no planned dates.
- 1.0 / 2026-08-23: Implemented and locked after focus/day/archive, deterministic current-time, DST, completion-only, cursor, and no-mutation contract tests passed.
