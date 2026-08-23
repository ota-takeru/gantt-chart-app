# Reversible task operations v1 — Capability Pack

## Status and boundary

- Change type: substantial capability integration plus interaction refinement.
- Locked behavior inputs:
  - `specs/capabilities/reversible-task-operations.md`
  - `specs/capabilities/hierarchical-task-management.md`
  - `design/explorations/history-left-now-right-v1.md`, selected Direction A.
- Product code, SQLite details, headless implementation reasoning, and development harnesses are not design inputs.
- Selection authority: the product owner has repeatedly delegated the recommended direction to Codex.

## User outcome

- A mistakenly created task can be deleted so that it disappears from ordinary task history and timeline.
- The latest task operation can be undone repeatedly in LIFO order, including after restart.
- New work appears first, while completed historical pockets settle below remaining work without becoming a separate completed page or register.
- Completion remains fast and calm: its affordance is visible but quiet, and becomes unmistakably actionable on hover/focus.
- Dragging can place a task before a sibling, inside another parent, at the end of a parent, or at the absolute root end—even when the visible list extends below the viewport.

## Immutable capability semantics

- Delete removes the selected task and all descendants atomically from forest, queue, sessions, events, timeline, archive, and every ordinary projection.
- Delete never reparents descendants and never leaves a user-visible tombstone.
- Undo is persisted, global, strict LIFO, bounded to 50 entries, and applies only to the token returned by current undo status.
- Undo covers successful create, rename, hierarchy move, complete, reopen, and subtree delete. View range, expansion, selection, scrolling, and draft text are not undoable.
- Undo success restores the prior observable task state while versions and global revisions continue monotonically.
- Failed, stale, unavailable, conflicting, or persistence-failed operations change nothing.
- The UI receives only availability, latest token, operation kind, concise Japanese label, committed instant, affected IDs, and resulting revisions—not restoration snapshots.
- Existing hierarchy cycle, depth, completed-parent, incomplete-descendant, and optimistic-concurrency rules remain authoritative.

## Existing spatial and temporal context

- Selected product structure is a left historical time plane, a fixed NOW hinge, and right current task identities/actions.
- Remaining tasks express committed `createdAt → NOW`; completed tasks express `createdAt → completedAt` in compact lineage pockets.
- Completed work stays inside the historical time plane, but is visually secondary and projected below remaining work.
- Current right-side hierarchy is the action origin for create, rename, completion, deletion, and drag/keyboard placement.
- No NEXT, planned dates, progress fill, work-session timer, draggable time bars, oversized title, cards, dashboard tiles, or separate completed register.
- Persisted sibling order and visual status grouping must stay conceptually distinct: the UI may project remaining before completed, but exact hierarchy placement and drag anchors remain deterministic.

## Required states and recovery

- Undo unavailable, available, pending, success, stale token, undo conflict, and persistence failure.
- Delete pending, success, stale hierarchy/task, persistence failure, and cancellation before commit.
- Parent deletion must disclose that descendants will also be deleted before commitment; leaf deletion may use a lighter confirmation path but must remain deliberate.
- A successful delete must leave an immediately understandable undo path without presenting deleted work as history.
- When another operation becomes latest, the displayed undo label/token must update as one result with the rendered task state.
- Pending operations retain the last committed row/pocket geometry. Failure restores the prior committed presentation and keeps recovery local.

## Placement and ordering requirements

- Top-level and child creation insert at the top of that exact sibling group.
- Remaining sibling groups render before completed pockets; older completed work trends lower through its existing deterministic placement/time projection.
- Visual projection must not corrupt the raw parent/position model used for move validation.
- Drag supports cross-parent reparenting with the existing seam/basin grammar.
- During pointer drag, an always-reachable viewport-bottom destination represents root append. Approaching the top or bottom edge may scroll the work surface while retaining the active destination.
- Keyboard users must have an equivalent deterministic root-end placement path and receive the committed destination/result.

## Information and scale inputs

- Typical: 8 remaining, 8 completed, two hierarchy levels, one available undo.
- Historical: 8 remaining, 40 completed across seven days, repeated undo labels.
- Dense: 120 remaining, 600 completed, depth eight, 240-character Japanese titles.
- Parent deletion with 1, 8, and 100 descendants.
- Empty state, only completed, only remaining, no undo, stale undo, undo conflict, and persistence failure.
- Minimum viewport 960×640; ordinary viewport 1280×800; Windows desktop, 200% zoom, reduced motion, grayscale, and high contrast.

## Established design principles and accessibility constraints

- Time-oriented dense work surface, not a generic SaaS dashboard.
- Rows and temporal marks lead; color is semantic and never the only state cue.
- Current, past, pending, deleted, and restored meanings must remain distinguishable.
- Controls need visible keyboard focus and accessible names; hover enhancement cannot be the sole indication that completion or deletion exists.
- Destructive confirmation and undo status must be understandable through text and structure, not icon/color alone.
- Live status should announce pending, success, failure, deletion scope, and undo result without moving keyboard focus unexpectedly.
- Avoid one extra default tab stop for every historical mark at dense scale; use the established composite focus model.

## Required exploration artifact

Produce one monochrome-first artifact using the four independent lenses and three structurally different theses. Each direction must explain:

- where delete begins and how subtree scope is confirmed;
- where the current undo label/action lives, how it changes after each operation, and how repeated undo preserves orientation;
- how a deleted row disappears without becoming ordinary history while recovery remains obvious;
- how remaining-first/completed-lower projection preserves the left-history/right-current structure;
- the completion control's rest, hover, focus, pending, blocked, success, and error grammar;
- the viewport-bottom root destination, edge scrolling, cancellation, and keyboard equivalent;
- empty, typical, dense, long-title, only-completed, stale/conflict/failure, high-contrast, reduced-motion, and 200% behavior;
- a domain-specific signature and anti-template rationale.

End with a recommendation and select it on behalf of the user. Structural choices may not add redo, selective undo, trash/history views, soft deletion, or any new domain mutation.

## Integration stop conditions

Stop and issue a Capability Change Request if a direction requires redo, selecting an older undo, restoring only part of a deleted subtree, hiding deleted data in a user-visible trash/archive, changing the 50-entry/LIFO rule, modifying hierarchy constraints, or persisting a new ordering meaning. Do not simulate those semantics in UI state.
