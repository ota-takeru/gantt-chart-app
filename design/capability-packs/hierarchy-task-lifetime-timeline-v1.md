# Capability Pack: hierarchy + task lifetime timeline v1

- Capability status: Existing inputs implemented / locked
- Product surface: Japanese-first React + Tauri desktop app
- Change type: UI composition only; no new persistence or domain mutation

## Locked sources

- `specs/capabilities/hierarchical-task-management.md`
- `specs/capabilities/focus-work-lifecycle-v1.1.md`
- `design/principles.md`

The locked sources are authoritative. The UI may derive a task-lifetime bar from retained timestamps, but it must not reinterpret it as planned duration or detailed work-session time.

## Corrected user outcome

- Keep the compact hierarchy management introduced in the current NOW surface.
- Restore a visible Gantt-style time axis.
- For completed work, make both creation time and completion time understandable.
- For remaining work, make it clear when the task was created and that it continues through NOW.
- Keep NEXT removed.
- Keep the oversized product title removed.
- Do not restore detailed session segments, timers, accumulated working duration, or planned dates.
- Completed history should remain available without overwhelming everyday remaining work.

## Exact temporal semantics

- bar start: `task.createdAt`.
- completed bar end: `task.completedAt` for a completed task.
- remaining bar end: current display instant, rendered as NOW.
- missing completed end: show a retained-data warning and no fabricated end.
- `actualStartAt` and work sessions are not used for this lifetime bar.
- Bar length means elapsed lifetime since creation, not progress, effort, estimate, or time actively worked.
- Reopening retains old completion history in the backend, but the current lifetime bar becomes creation-to-NOW because the task is remaining again.
- Moving or reparenting changes hierarchy placement only and must not alter the bar.

## Available data

Each hierarchy entry already exposes:

- task id, title, state and version;
- `createdAt`;
- optional `completedAt`;
- optional parent id, sibling position and depth.

The forest exposes hierarchy/source revisions and truncation state. No additional backend query is needed for the requested UI.

## Required interaction continuity

- Top-level and child creation, rename, completion, reopen, collapse, pointer drag, and keyboard placement remain available.
- The task row and its time bar must stay aligned so hierarchy and time can be read together.
- Pointer movement begins from the task identity side; drop seams/basins must remain distinguishable from the time bar.
- Completing a task changes its bar endpoint from NOW to the committed completion instant without suggesting that active work duration was measured.
- Reopening changes the current endpoint back to NOW and restores any completed ancestor path as defined by the locked hierarchy capability.
- Time-range controls are presentation state only and never mutate tasks.

## Realistic states

- Typical: 8 remaining tasks, 2–10 recently completed tasks, depth 0–3, tasks spanning minutes to several days.
- Dense: 120 remaining tasks, 600 completed tasks, depth 0–6.
- A remaining task created before the visible range needs a left-clipped continuation cue and exact created timestamp.
- A completed task whose entire lifetime is outside the visible range remains discoverable through range change or history expansion.
- Empty, only-completed, only-remaining, long title, depth eight, stale mutation, load error and reduced motion.

## Host and accessibility constraints

- Work at 960×640 and 1280×800.
- Keep one compact header line; no display-sized title.
- Time meaning must not depend on color alone: endpoint shape/text, NOW marker, clipping cue and exact timestamp are required.
- Tree rows and timeline must remain associated for screen readers.
- Horizontal scrolling, if used, must not break keyboard task actions or row alignment.
- Visible focus and error recovery remain attached to the task origin.

## Design exploration requirements

- Produce three structurally different ways to combine hierarchy and lifetime Gantt history.
- At least one direction must align the hierarchy row and timeline bar in one continuous row.
- At least one direction must keep completed work visibly secondary while still exposing past bars without navigation to another page.
- Define a recommended default time window and how users change it.
- Explain how clipped bars, exact created/completed times, NOW, dense scale and completed-history density work.
- Select the recommended direction on behalf of the user, consistent with the prior delegated recommendation.

## Exclusions

- No planned start/end, estimates, dependencies, progress percentages or scheduling engine.
- No detailed work sessions, duration aggregation or timer controls.
- No backend/core/spec changes.
- Do not reuse the old HISTORY/NOW/NEXT three-pane screen as an unquestioned template.
