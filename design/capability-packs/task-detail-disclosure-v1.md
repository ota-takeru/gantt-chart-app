# Capability Pack: task-detail-disclosure-v1

- Status: locked and ready for design
- Date: 2026-08-26
- Sources: locked `task-detail-disclosure` 1.0, issue #21, `design/principles.md`, established history-left/NOW-right task surface.

## User outcome

Scan a dense time-oriented task surface with materially less competing text and ink, then select one task to expose the context and secondary controls needed to understand or act on it. Keyboard focus must provide the same stable disclosure as pointer selection.

## Locked behavior

- At most one available task is the stable selection.
- Explicit task selection and focus entering a task produce the same stable selection and disclosure.
- Hover may paint a lightweight preview but cannot reveal selection-only information, replace selection, clear selection, or mutate disclosure state.
- Every task always exposes essential identity, lifecycle state, lifetime meaning, completion eligibility, and hierarchy cues.
- Only the stable selection exposes secondary information and actions.
- Unavailable selection/focus targets preserve a current valid selection; reconciliation clears a selected task that disappeared; explicit context reset clears selection.
- Disclosure is local presentation state. It never changes persistence, revisions, task data, history, memo, hierarchy, ordering, or undo.

## Headless interface

```text
transitionTaskDetailDisclosure(state, intent, availableTaskIds) -> TaskDetailDisclosureState
projectTaskDetailDisclosure(state, taskId, availableTaskIds) -> TaskDetailDisclosureProjection
```

The projection always enables essential information and lifecycle. Secondary information, secondary actions, and the continuous selection link are enabled only for the selected available task.

## Established design context

- The work surface is one dense history-left / NOW-hinge / current-identity-right composition. Task lifetime means `createdAt → NOW` for remaining work and `createdAt → completedAt` for completed work; it is not duration worked, progress, or schedule.
- A selected remaining task already paints one continuous relationship across its lifetime mark, NOW crossing, and current identity. Preserve and strengthen that domain-specific signature.
- Remaining tasks are hierarchical rows. Completed-only subtrees are compacted into local history pockets rather than duplicated as a second task list.
- Existing primary affordances include fixed-size completion, hierarchy disclosure, and task identity. Existing secondary actions include memo, add child, delete, and completed-task reopen.
- Established editors/confirmations may open a separate interaction surface, but merely revealing selected detail must not insert flow content, change row height, shift neighbors, or move primary controls.
- Do not add a generic page, dashboard, card collection, navigation sidebar, tabs, or persistent inspector that detaches selection from the time-oriented row unless a direction demonstrates a necessary capability or scale function.

## Required disclosed context

- Full ancestry path where it disambiguates hierarchy.
- Memo presence and a memo affordance without exposing memo body on the main surface.
- Direct-child remaining/total metadata where children exist.
- Secondary actions relevant to the task lifecycle.
- Exact `createdAt → NOW/completedAt` temporal readout or an equivalent immediately inspectable exact-time context.
- Essential lifecycle state remains visible before selection and does not depend on hover, color, or the disclosed context.

## Representative data and scale

- Resting, selected, focused, and hovered remaining rows at depths 0 and 8.
- One selected task among 120 remaining rows with mixed queued, active, and paused states and long Japanese/Latin titles.
- Dense completed history pockets, including an expanded pocket and a selected completed descendant with exact creation/completion times and lazy actual-work history.
- Empty memo and memo-present tasks; zero children and mixed remaining/completed direct children.
- 960×640 desktop viewport, narrow layout at 760px, 200% zoom, OS dark mode, forced-colors mode, and reduced motion.

## Accessibility and interaction constraints

- Stable selection must be available by pointer, the existing tree composite keyboard model, and focus entering a row action.
- Resting actions may remain in the document/tab order so keyboard focus can disclose them, but they must not be pointer-hit targets or visually compete before selection.
- Visible focus, accessible lifecycle name, and non-color state/selection cues are required.
- Completed history must not add one tab stop per nonselected mark.
- Selection disclosure must be geometry-neutral: same row height, neighboring row positions, NOW column, completion control, and action-origin coordinates before and after selection/focus.
- Hover is paint-only preview; leaving hover must visibly return to the still-selected task without state loss.

## Acceptance evidence

- Interaction tests demonstrate sole selected disclosure, selection persistence across another row's hover, focus equivalence, reconciliation, and always-visible lifecycle.
- Geometry assertions compare row and primary-control bounds before and after selection/focus.
- Dense 120-row rendering visibly shows only essential metadata at rest and one selected row with actionable context.
- Representative light/dark/forced-colors screenshots or inspection confirm a continuous history → NOW → identity link and non-color selection/focus cues.
- Existing locked capability specs, headless core, contract tests, Rust domain core, and adapter contracts remain untouched during UI integration.
