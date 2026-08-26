# Design exploration: open-issues-followup-v2

- Inputs: `design/capability-packs/open-issues-followup-v2.md`, `design/principles.md`.
- Selection owner: Main agent, delegated by the request to complete all open issues.

## Direction selection

- Selected direction: A — Boundary-led continuous outline.
- Why it was selected: It keeps one time-aligned task row, preserves dense forest scanning, and solves hierarchy legibility and placement ambiguity with one visual grammar.
- Structural decisions now fixed: Numeric depth labels are removed; bounded indentation, branch rails/elbows, and selected ancestry carry hierarchy; completed lanes share the ordinary rail geometry; a zero-height boundary rail appears before the first completed sibling during drag.
- Visual decisions still open: Exact rail weight and dash cadence may be tuned during rendered QA without changing geometry or semantics.
- Integration questions: None; `beforeTaskId` already expresses the boundary placement.

## Rejected directions

- Nested work bands: stronger subtree grouping, but too noisy at dense scale and weakens cross-root time comparison.
- Ancestry-path cohort lens: strong for deep focus, but hides the forest overview and makes cross-parent movement harder.

## Acceptance checks

- Depth 0–8 is distinguishable without visible depth numbers or color alone; `aria-level` and full selected ancestry remain intact.
- Completed and remaining rails have equal coordinate origins and widths at 960, 1280, and 1920 pixels.
- A completed mark's percentage position and width match `createdAt` and `completedAt` within the selected range.
- Dragging exposes the current/completed boundary without changing row height; dropping there calls the existing move operation with the first completed sibling as `beforeTaskId`.
- Invalid, cancelled, and stale moves do not mutate state; existing undo and focus behavior remains available.

