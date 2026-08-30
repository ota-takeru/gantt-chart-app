# Capability Pack: task-memo-live-markdown-v1

- Status: locked and ready for design
- Date: 2026-08-30
- Sources: locked `task-memo-live-markdown` 1.0, locked `task-memo` 1.0, locked `reversible-task-operations` 1.1, `design/principles.md`, and the established history-left/NOW-right task surface.

## User outcome

Read and edit a task memo in one continuously editable surface where Markdown meaning appears immediately while typing, without an Edit/Preview mode switch, and enlarge that same memo into a focused large-screen view when needed.

## Locked behavior

- The memo source remains exact plain Unicode text; presentation never normalizes or replaces stored Markdown.
- Complete supported CommonMark/GFM constructs produce semantic and delimiter ranges after each local source or selection change.
- Markdown delimiters remain available around the active caret/selection and may be visually concealed only for complete inactive constructs.
- Incomplete, unsupported, raw-HTML, or failed projection remains exact editable source.
- Projection performs no save, auto-save, audit, undo, HTML execution, resource fetch, or other I/O.
- Existing explicit save, unchanged no-op, 4,000-scalar validation, stale reload, retry, global latest-operation undo, privacy, completed-task symmetry, and focus-return behavior remain intact.

## Headless interfaces

```text
projectTaskMemoMarkdown(source, selections) -> MemoLiveProjection

updateTaskMemo(taskId, memo, expectedTaskVersion, effectiveInstant)
  -> ReversibleChangeResult | DomainError
```

## Established design context

- Tasks are dense temporal rows spanning left lifetime, a NOW hinge, and right current identity.
- Memo actions originate from the current-side identity of a remaining task or the selected local detail of a completed task.
- The existing memo surface is one right-biased, viewport-contained dialog with explicit Save/Cancel, inert outside click, focus containment, and exact origin focus return.
- The user explicitly rejected separate Edit and Preview modes and asked for Obsidian-like immediate Markdown reflection in the same editable surface.
- The user explicitly accepted enlarging the same live editing surface so the memo can occupy a large focused view.
- Preserve the main time surface behind the transient memo boundary; do not introduce a notebook, note register, navigation section, or page transition.

## Required interaction states

- Open empty or existing memo directly into one editable live-projected surface with exact source and the caret ready for input.
- Reflect supported Markdown meaning after every local input while keeping the active construct's editing punctuation available.
- Preserve caret, selection, composition, local editor undo history, draft, scroll, errors, and pending state when changing between ordinary and large presentation.
- Keep explicit Save and Cancel; immediate presentation must never imply auto-save.
- Count Unicode scalars, block a 4,001-scalar save, and allow correction without disabling editing or projection.
- Pending prevents duplicate save. Success continues to the existing privacy-safe global undo result.
- Stale/missing/persistence failure retains the exact draft and offers the established reload/retry recovery.
- Escape/Cancel discard according to the established memo rule; outside click remains inert; focus returns to the exact originating action.
- Japanese IME composition must not close, save, duplicate, reorder, or conceal uncommitted text.
- Raw HTML and image syntax must not execute or fetch. Links must not navigate the application surface unexpectedly.

## Representative data and scale

- Empty memo; plain Japanese; mixed Japanese/emoji/combining text; exact 4,000-scalar and correctable 4,001-scalar drafts.
- Headings, nested emphasis, strikethrough, ordered/unordered/task lists, block quotes, links, inline/fenced code, and tables.
- Incomplete emphasis/link/fence/table while typing; raw HTML/script/image syntax; long unbroken URL; long code and wide table.
- Caret at delimiter boundaries, multi-character selection across nested constructs, keyboard undo/redo, paste, and IME composition.
- Remaining depth-0/depth-8 tasks, completed pocket detail, 240-character task title, and an open draft during stale reload or persistence retry.
- 5,000 tasks with exactly one mounted/projected memo. Ordinary and large presentation must remain responsive at the locked 4,000-scalar scale.

## Accessibility and visual constraints

- The live surface has a programmatic textbox name and does not expose a duplicate preview copy to assistive technology.
- Semantic appearance cannot remove editable source meaning from the accessibility tree.
- Visible focus, predictable keyboard navigation, composition safety, Escape/Cancel, and exact origin focus return are required.
- Markdown state and errors do not rely on color alone; concealed delimiters reappear through caret/selection rather than hover only.
- Large presentation remains within the application viewport and usable at 960×640 and 200% zoom.
- Wide tables/code scroll within the memo content region; header, count, status, Save/Cancel, and size control remain reachable.
- Reduced motion and forced-colors modes preserve state comprehension.

## Design exploration boundary

- Explore three structurally different ways to relate the ordinary task-origin surface and the user-requested large memo view.
- Every direction must use one continuously editable live-projected surface with no Edit/Preview switch.
- Do not infer controls, parser behavior, editor-library structure, or a development harness from implementation details.
- Treat explicit saving, large-view continuity, temporal origin, error recovery, and accessibility as fixed requirements; their spatial expression remains open.
