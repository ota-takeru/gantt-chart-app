# Capability Pack: task-memo-v1

- Status: locked and ready for design
- Date: 2026-08-24
- Sources: locked `task-memo` 1.0, locked `reversible-task-operations` 1.1, `design/principles.md`, established history-left/NOW-right task surface.

## User outcome

Keep, edit, clear, and undo one durable plain-text memo for any remaining or completed task without leaving the task surface or changing lifecycle, hierarchy, queue, session, or timeline meaning.

## Locked behavior

- Every task snapshot has exact `memo` text; empty means no memo.
- Save replaces the whole memo, preserves whitespace/newlines, and accepts 0–4,000 Unicode scalar values.
- Changed save is atomic, version-checked, and globally undoable as `memo-update`; unchanged save is a no-op.
- Completed and remaining tasks behave identically.
- Errors include invalid memo, stale version, missing task, invalid instant, and persistence failure with no partial change.
- Audit and undo receipts never expose memo body.
- Delete removes the memo; delete undo restores it.

## Headless interface

```text
updateTaskMemo(taskId, memo, expectedTaskVersion, effectiveInstant)
  -> ReversibleChangeResult | DomainError
```

Current memo and version arrive on the normal task snapshot. After a successful mutation, the task forest and undo status are re-read through established adapters.

## Established design context

- Tasks remain dense rows spanning left lifetime, one NOW hinge, and right current identity.
- Row actions originate on the right; completed tasks expose attached local detail after their history pocket is expanded and selected.
- Existing inline rename, add-child, delete confirmation, undo receipt, pending notice, and error grammar should remain recognizable.
- The user explicitly requested no page transition and suggested an input dialog.
- No generic cards, navigation sidebar, new page, tab set, or separate note register.

## Required interaction states

- Open with empty or existing memo; exact prefill.
- Edit up to 4,000 Unicode scalars with a visible remaining/used count.
- Save pending, success and global undo receipt; unchanged save closes without mutation.
- Cancel button and Escape discard draft; clicking outside must not silently save or discard without a deliberate rule.
- Invalid length stays open with correction; stale/missing/persistence failure keeps the draft and offers safe retry/reload.
- Initial focus, labelled description, keyboard containment, and focus return to the originating remaining row or completed detail action.
- Clearing is deliberate but uses the same save operation; memo content must not appear in live-region receipts or audit-oriented UI.

## Representative data and scale

- Empty memo, one-line memo, 20-line memo, exact 4,000-scalar Japanese/emoji memo, 4,001-scalar invalid draft.
- Remaining depth-0 and depth-8 tasks, completed task in a collapsed/expanded pocket, long 240-character task title.
- Stale version after external rename, persistence failure, delete while editor closed, successful save followed by global undo.
- 5,000 tasks: no eager note editor mounts, memo-specific queries, or separate note-list rendering.

## Accessibility and visual constraints

- Dialog semantics, programmatic name/description, visible focus, Escape/cancel, predictable focus return, and no keyboard trap failure.
- State and memo-presence cue cannot depend on color alone.
- Keep 960×640 and 200% zoom usable; long memo scrolls inside its editing region without obscuring actions.
- Use existing semantic tokens and calm dense typography; avoid exposing memo text on the main timeline unless the user opens the editor.
