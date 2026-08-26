# Capability Pack: Completed Pocket Window 1.0

## Locked inputs

- Capability: `specs/capabilities/completed-pocket-window.md` 1.0, implemented / locked.
- Core: `src/completedPocketWindow.ts`.
- Contract evidence: `src/completedPocketWindow.test.ts`.
- Related locked capabilities: hierarchy ordering, history projection, lifetime timeline, task-detail disclosure.

The UI must consume the pure prefix/selected-reveal projection. It must not reorder completed members, persist window state, add one tab stop per dormant mark, or change lifecycle/history data.

## Required outcomes

- Opening a representative 600-member pocket renders at most 40 ordinary members.
- Additional bounded requests eventually expose every retained member.
- Selecting or jumping to an off-prefix member renders that member immediately without mounting the omitted interval.
- Rendered items expose original ordinal/total semantics for assistive navigation.
- Timeline range changes do not reset the window or remount unrelated pockets.
- Reconciliation after removal cannot leave an invalid active descendant.

## Established product context

- The work surface is `history | NOW | current identity`; completed pockets remain on the history side.
- Completed history is accumulated context, not a second current-task list.
- Nonselected completed marks do not each enter the page tab order; the established tree composite owns keyboard traversal.
- Exact lifetime is `createdAt → completedAt`; actual work sessions are a separate lazy readout.
- Stable task selection is the sole rich-disclosure state. Hover is paint-only.
- The selected completed task exposes title, visible ancestry, exact timestamps, actual-history state, memo/reopen/delete actions locally.

## Data and scale

- Typical pockets are small; dense evidence includes 600 completed tasks and the application limit is 5,000 retained tasks.
- Default batch is 40. An off-prefix selected member is the only allowed extra item.
- Hierarchy depth is at most eight; long Japanese/Latin paths must remain attributable.

## Accessibility and recovery

- A rendered member needs `aria-posinset` and `aria-setsize` or equivalent semantics.
- Omitted-range/load-more status must be announced without implying tasks were deleted.
- Loading more preserves current selection and focus origin.
- Direct selection/jump must ensure the active descendant exists in the DOM before focus/scroll handoff.
- Reduced motion, forced colors, dark mode, narrow width, and effective 200% zoom must remain coherent.

## Design boundary

Explore how prefix, omitted history, selected reveal, and load-more affordance are represented. Do not replace retained hierarchy with completion-time sorting, a separate archive page, dashboard, or full eager list. A temporary harness is not a design reference.
