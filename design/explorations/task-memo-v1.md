# Design exploration: task-memo-v1

- Inputs: locked `design/capability-packs/task-memo-v1.md` and `design/principles.md` only.
- Method: independent monochrome structural exploration; implementation source and headless implementation reasoning were excluded.

## Four lenses

- Information: Show exact target identity, current/draft memo, Unicode-scalar count, local status/error, and Save/Cancel together. Keep memo body out of the main timeline, receipts, and audit-oriented UI.
- Interaction: Remaining rows and selected completed details use the same Memo action. Exact prefill, explicit save/clear, unchanged close, Cancel/Escape discard, outside click does nothing, pending prevents duplicates, failures retain draft, and close restores origin focus.
- Layout: Mount one editor only. Preserve row/time alignment; long text scrolls inside the editor while header, status, count, and actions remain reachable. Collapse to one viewport-contained column at narrow width/200% zoom.
- Visual: Use existing tokens and non-color memo-presence/state cues. Pending and error have text labels. Long titles remain programmatically complete.

## Structural theses

### Direction A: Central editing room

- Thesis: Isolate memo editing in a conventional centered dialog while the task surface remains visible but inert.
- Spatial model: Fixed centered dialog with header, status, editor, count, and actions.
- Primary object: Memo draft.
- Action origin: Remaining row or completed local detail.
- State/result expression: Inline status and fixed footer; success closes into the global undo receipt.
- Temporal/history representation: Header labels this as current task data; history stays in the existing receipt.
- Domain signature: Small NOW/current marker beside the target title.
- Capability traceability: Supports every editing and error state in one boundary.
- Risks and scale concerns: Target-row relationship weakens during repeated edits.
- Typical-pattern rationale: Dialog safely contains draft, Escape, focus, and errors, but central placement is generic.

### Direction B: Memo dock connected to the current side

- Thesis: Treat the memo as current task data attached to the task's NOW-right identity, not as a separate notebook or historical record.
- Spatial model: Right-biased dialog linked to its origin by a minimal current-side rail; narrow/zoomed layouts become one centered column while retaining the origin cue.
- Primary object: Task identity and its current memo together.
- Action origin: Remaining current-identity action or selected completed-detail action.
- State/result expression: Header, stable status rail, scrollable editor, scalar count, and fixed Cancel/Save strip; success returns focus and exposes the existing global undo receipt.
- Temporal/history representation: A compact `past | NOW | current` cue places memo on the current side; no duplicate memo history.
- Domain signature: The editor originates only from the NOW-right identity path and returns to the same origin.
- Capability traceability: Covers remaining/completed symmetry, exact text, errors retaining draft, LIFO undo, and focus restoration.
- Risks and scale concerns: Right-edge collision requires viewport-aware fallback; the origin rail must remain functional, not decorative.
- Typical-pattern rationale: Dialog semantics are required for explicit discard and focus containment. A sidebar would permanently narrow time, while inline expansion would move aligned rows.

### Direction C: Memo band woven into the row

- Thesis: Expand editing immediately beneath the source row or completed detail.
- Spatial model: Full-width inline band with content restricted to the NOW-right side.
- Primary object: Expanded task row.
- Action origin: Same local Memo action.
- State/result expression: Band-local count, status, Save, and Cancel.
- Temporal/history representation: NOW boundary extends through the band.
- Domain signature: A current-side editor physically woven into the timeline row.
- Capability traceability: Strong target association and exact editing behavior.
- Risks and scale concerns: Long text, depth eight, 200% zoom, and completed pockets disrupt row alignment and scroll position.
- Typical-pattern rationale: Rejected because it harms the primary temporal comparison surface.

## Capability traceability

| Requirement | Selected expression |
|---|---|
| Remaining and completed tasks | Same Memo action and editor; distinct recorded origin focus |
| Empty/existing/exact whitespace | Task snapshot prefill without trimming |
| 4,000/4,001 scalar boundary | Scalar counter and local blocking error |
| Pending/success | Duplicate prevention; close to origin; body-free undo receipt |
| Cancel/Escape/outside click | Explicit discard; outside backdrop is inert |
| Stale/missing/persistence | Draft stays mounted; reload or retry is explicit |
| Clear/unchanged | Empty Save mutates; unchanged Save closes without receipt |
| Scale and alignment | One mounted dialog, no memo list/query, no row-height change |
| Accessibility | Labelled modal semantics, contained focus, visible focus, origin restoration |

## Direction selection

- Selected direction: B — Memo dock connected to the current side.
- Selection owner: Main agent under the user's delegated request to complete and release all issues.
- Why it was selected: It combines a safe dialog boundary with strong task/current-side causality, preserves the time surface, and works for both remaining and completed origins.
- Rejected directions: A is safe but generic and spatially detached; C preserves origin best but breaks density, zoom, and time alignment.
- Structural decisions now fixed: One modal editor; NOW-right origins; right-biased desktop placement with narrow fallback; header/status/editor/count/actions; inert outside click; body-free receipts; exact origin focus return.
- Visual decisions still open: Existing-token mapping, memo glyph shape, rail weight, final width/max height, and reduced-motion details.
- Integration questions: None exposing missing capability. Stale reload must update base version without losing the draft.
- Acceptance checks: Remaining/completed open paths; exact prefill; scalar limit/count; unchanged/clear; pending and success undo; Cancel/Escape/outside click; draft retention and explicit retry/reload; focus containment/return; completed pocket state retention; 960×640, 200%, long title/memo, depth-eight, non-color cues, and one editor at 5,000-task scale.
