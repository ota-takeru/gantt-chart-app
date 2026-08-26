# Capability Pack: open-issues-followup-v2

- Status: ready for integration
- Date: 2026-08-26
- Scope: Issues #6, #7, and #8; no new domain mutation.

## Locked capability sources

- `hierarchical-task-management` 1.0: exact parent, sibling order, depth 0–8, relative before-sibling placement, and retained completed hierarchy.
- `work-session-history` 1.0: actual sessions and aggregate duration remain distinct from task lifetime.
- Existing history-left/NOW-right design: task lifetime remains `createdAt` to NOW/completion.

## Required outcomes

- Hierarchy granularity is communicated without a visible numeric depth label.
- Completed lifetime marks use the same time-coordinate origin and width as remaining lifetime marks.
- Pointer movement exposes a placement boundary at the end of remaining siblings, immediately before the first completed sibling.

## Constraints

- Preserve task state, parent, sibling order, range dates, sessions, events, and mutation interfaces.
- Keep `aria-level` and the selected full ancestry path available.
- Do not reinterpret a lifetime mark as actual-work duration or merge session gaps.
- Use the existing `beforeTaskId` placement for the remaining/completed boundary.
- Preserve invalid-move, stale-revision, cancellation, focus, and undo behavior.

## Representative data

- Depth 0–8 with a 240-character Japanese title.
- Completed tasks with a short interval, a 25-hour interval, multiple sessions with gaps, and no session.
- Parents and the top level containing remaining siblings followed by one or more completed siblings.

