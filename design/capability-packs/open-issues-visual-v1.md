# Capability Pack: open-issues-visual-v1

- Status: ready for integration
- Date: 2026-08-24
- Scope: Issues #1, #3, and #4; no new domain mutation.

## Locked capability sources

- `hierarchical-task-management` 1.0: exact parent, sibling order, depth 0–8, collapse/reopen semantics, and retained completed hierarchy.
- `work-session-history` 1.0: actual sessions remain distinct, total closed duration excludes gaps, and completion/reopen preserves recorded work.
- Existing history-left/NOW-right design: task lifetime (`createdAt` to NOW/completion) is not work duration and its range presets remain explicit.

## Required outcomes

- All supported hierarchy depths remain visually distinguishable without relying on color; selected deep work exposes its full ancestry.
- A wider/maximized window increases usable canvas and time-plane pixel resolution while preserving the selected time range and NOW hinge alignment.
- A selected completed task shows the retained aggregate actual-work duration, or an explicit no-record state, without reinterpreting the lifetime bar.

## Constraints

- Preserve task state, hierarchy/order, collapse behavior, range dates, sessions, events, and every mutation interface.
- Keep one aligned row across history, NOW hinge, and current identity.
- No automatic range/preset change on resize and no Task API mutation caused by resize.
- Query actual history lazily for the selected completed task; do not load all task histories or merge session gaps.
- Maintain keyboard/focus behavior, high-contrast/non-color cues, 960px minimum layout, 200% zoom usability, and dense-scale bounded rendering.

## Representative data

- Typical mixed forest, only-completed state, depth 0–8 with a 240-character Japanese title, 120 remaining/600 completed, completed task with 17 minutes across one session, multiple sessions with gaps, and completed task with no session.
