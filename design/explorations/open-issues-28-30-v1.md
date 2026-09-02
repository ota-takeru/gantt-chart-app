# Design exploration: open-issues-28-30-v1

- Inputs: `design/capability-packs/open-issues-28-30-v1.md`, `design/principles.md`, and the established history-left / NOW / current-identity surface.
- Independence: completed without product-source inspection or implementation-control assumptions.
- Selection owner: the user delegated implementation of all open issues; the main agent selected the recommended direction.

## Four lenses

- Information: show memo presence, never memo body; treat task color as a secondary identity accent rather than domain state.
- Interaction: keep task creation at the same top origin while scrolling; memo presence does not introduce a new action.
- Layout: preserve the one-row temporal object and its fixed history/NOW/current columns; keep the sticky footprint compact.
- Visual: hierarchy uses rails, selection uses outline/surface, lifecycle uses existing shape/text, memo uses a document shape, and task identity uses only a thin accent.

## Structural theses

### Direction A: Current-identity rail

- Spatial model: add a thin identity rail and memo-presence glyph beside the current task identity; keep the existing top bar sticky.
- Primary object: the existing task row.
- Action origin: the existing top create form and row actions.
- State/result expression: selection, lifecycle, hierarchy, memo, and identity each use separate visual channels.
- Temporal/history representation: lifetime and NOW rendering remain unchanged.
- Domain signature: a stable identity rail follows one task without becoming a status or timeline mark.
- Risks and scale concerns: the rail remains supplemental; title and non-color cues carry meaning when color cannot.

### Direction B: NOW identity hub

- Spatial model: collect the color notch and memo cue at the NOW hinge.
- Primary object: the transition from history to current state.
- Action origin: the sticky create bar.
- State/result expression: compact marks cluster around the hinge.
- Temporal/history representation: NOW receives additional identity information.
- Risks and scale concerns: identity and memo semantics compete with the hinge's temporal meaning, especially at dense scale and zoom.

### Direction C: Index gutter

- Spatial model: add a dedicated color/memo gutter before the history plane.
- Primary object: a list index mapped to task rows.
- Action origin: a sticky bar integrated with the gutter heading.
- State/result expression: supplemental states are separated into the new gutter.
- Temporal/history representation: history content is unchanged but loses horizontal space.
- Risks and scale concerns: the extra column compresses the time plane at 960 px and 200% zoom and increases horizontal eye travel.

## Direction selection

- Selected direction: A — Current-identity rail.
- Why it was selected: it satisfies all three issues with the smallest impact on timeline meaning, fixed row geometry, density, and accessibility.
- Rejected directions: B overloads NOW; C consumes timeline width and weakens row-to-cue scanning.
- Structural decisions now fixed: visible non-color memo cue for non-empty memos; sticky existing top bar; deterministic task-ID palette; thin current-side rail; no lifetime or hinge coloring.
- Visual decisions still open: exact palette values and three- versus four-pixel rail width may be tuned during rendered QA.
- Integration questions: none; task snapshots expose immutable IDs.
- Acceptance checks: stable accents across reload/rename/reorder; memo cue at rest without body disclosure; reachable creation while scrolled; unchanged row/timeline geometry; dense, narrow, dark, forced-color, keyboard, and focus checks.
