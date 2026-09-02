# Capability Pack: open-issues-28-30-v1

- Status: ready for integration
- Date: 2026-09-02
- Scope: Issues #28, #29, and #30; presentation only, with no new domain mutation.

## Locked capability sources

- `task-memo` 1.0: every task snapshot contains exact memo text and an empty string means no memo.
- Existing history-left / NOW / current-identity surface: a task remains one aligned row across its lifetime, the NOW hinge, and its current identity.

## Required outcomes

- A task with a non-empty memo is recognizable from the resting task list without exposing memo text.
- The top task-creation bar remains reachable while the document is vertically scrolled.
- Remaining tasks receive a stable, automatically derived visual identity accent that survives reload, rename, and reorder.

## Constraints

- Preserve task state, hierarchy, order, selection, lifecycle, timeline geometry, memo contents, and all mutation interfaces.
- Memo presence and all existing domain states remain understandable without color.
- Identity color is presentation-only, derived from immutable task ID, and must not imply state, priority, progress, hierarchy, or time.
- Do not color the lifetime rail or NOW hinge, and do not change the fixed task-row height.
- Keep task creation, keyboard focus, sticky offsets, forced-colors behavior, 960 px width, 200% zoom, and dense-scale rendering usable.

## Representative data

- Empty and non-empty memo tasks mixed in one resting list.
- Stable task IDs whose titles and sibling order change.
- 120 remaining tasks, deep hierarchy, long Japanese titles, narrow viewport, dark mode, and forced colors.
