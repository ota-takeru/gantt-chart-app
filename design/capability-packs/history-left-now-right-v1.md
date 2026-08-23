# History-left / NOW-right v1 — Capability Pack

## Status and boundary

- Change type: substantial design-plus-integration change over existing locked capabilities.
- Locked behavior inputs:
  - `specs/capabilities/hierarchical-task-management.md`
  - `specs/capabilities/focus-work-lifecycle-v1.1.md`
  - `design/capability-packs/hierarchy-task-lifetime-timeline-v1.md`
- No headless capability change is required. `TaskSnapshot.createdAt`, state, optional `completedAt`, hierarchy placement, completion, reopen, create-child, rename, reorder, and reparent already exist.
- Product code, Rust core, SQLite schema, locked specifications, and existing contract tests are not design inputs and must not be changed by the explorer.

## Corrected user outcome

The user wants the surface to read spatially as:

```text
PAST / TIME  ────────────────  NOW  │  CURRENT TASKS
```

- Time and completed work live to the left of a clear NOW boundary.
- Current tasks live to the right and remain the primary actionable surface.
- A completed task does not move into a separate "完了済み" register or page.
- Completed tasks remain directly visible inside the historical time plane, but at lower density so they do not compete with current work.
- A current task still communicates when it was created and that it continues to NOW.

## Immutable temporal semantics

- Remaining task interval: committed `createdAt → current display NOW`.
- Completed task interval: committed `createdAt → completedAt`.
- A completed task without `completedAt` shows an explicit incomplete-data warning and never fabricates an endpoint.
- These intervals mean task lifetime, not active work duration, progress, planned dates, estimates, or scheduled occupancy.
- Completion seals the endpoint only after a successful commit.
- Reopen changes the task back to an open interval ending at NOW; prior completion events are not drawn as session segments.
- Rename, reorder, and reparent do not change any temporal coordinate.

## Locked interaction outcomes to preserve

- NOW remains the only primary actionable task region; NEXT stays absent.
- No oversized product title.
- Top-level and inline child creation.
- Inline rename, completion, and reopen.
- Collapse/expand hierarchical branches.
- Pointer sibling reorder/reparent and equivalent keyboard placement.
- Blocked parent completion reveals the first incomplete descendant.
- Stale/failed mutations retain the last committed hierarchy and timestamps.
- Completed and remaining projections contain each task exactly once.

## Presentation freedom and explicit constraints

The explorer must produce three structurally distinct ways to satisfy the explicit left-history/right-current direction. Variants may differ in how completed intervals are packed, how a current row connects to history, and how exact details/reopen are revealed.

Required:

- one clear vertical NOW boundary;
- historical time increases toward NOW from left to right;
- current-task identity and mutation controls remain on the right;
- open current lifetimes remain understandable across the boundary;
- completed intervals are compacted within the left time plane, not placed in a completed register;
- completed title/path and exact timestamps remain discoverable by pointer and keyboard;
- reopening originates from the historical representation or its attached detail and returns the task to the right NOW surface;
- completed history remains visible at first glance without dominating the right NOW surface;
- 24-hour default with 7-day/30-day/90-day/all range options remains available unless rendered evidence justifies a different presentation-only default;
- range controls remain presentation-only;
- no draggable/resizable time bars, planned-date controls, timer, work-session segments, progress fill, dependencies, or NEXT.

## Information and scale inputs

Representative states:

- typical: 8 remaining tasks across 2 levels, 2 completed tasks, creation/completion within the last 24 hours;
- historical: 8 remaining, 40 completed spread across 7 days;
- dense: 120 remaining and 600 completed, depth up to 8, Japanese titles up to 240 characters;
- only completed;
- only remaining;
- empty;
- one completed record missing `completedAt`;
- intervals before, after, or spanning the selected range;
- persistence failure and stale hierarchy recovery.

Scale behavior may use deterministic lane packing, aggregation, incremental rendering, or semantic zoom, but every completed task must remain reachable without leaving the surface. Aggregation must not invent duration or lose identity.

## Established product context

- Japanese-first Windows desktop app.
- Compact, flat, low-ink surface; no decorative cards, gradients, large hero header, or dashboard tiles.
- Current semantic tokens: dark neutral text, quiet gray structure, one teal accent, amber active cue, red error cue.
- Minimum viewport: 960×640; ordinary review viewport: 1280×800.
- Keyboard and screen reader access must not add one default tab stop per nonselected historical mark at dense scale.
- High contrast and grayscale must preserve open/closed/clipped/warning distinctions through shape and text, not color alone.

## Required exploration artifact

Use the four independent lenses (information, interaction, layout, visual), then provide three monochrome structural theses. Each must explain:

- left historical time plane and right NOW task structure;
- representation and packing of completed tasks;
- connection between a remaining task's history and its current identity;
- completion, reopen, move/reparent, selection, range, missing-end, clipping, pending, error, and recovery;
- typical, historical, dense, only-completed, empty, 960×640, keyboard, screen reader, high-contrast, and reduced-motion behavior;
- domain signature and anti-template rationale.

End with a recommended direction. The user previously delegated recommendation to Codex and has now fixed the left-history/right-current family, so Codex may select the best variant after reviewing the artifact.

## Integration stop conditions

Stop and issue a Capability Change Request if a direction requires new persisted fields, aggregate semantics, scheduling, session accounting, deletion/archiving, a new reopen outcome, or any mutation not exposed by the locked APIs. Do not simulate those in UI state.
