# Capability: task-memo-live-markdown

- Status: implemented / locked
- Version: 1.1
- User outcome: Read and edit a task memo in one continuously editable surface where complete Markdown is reflected immediately without a mode switch or visible source delimiters, in both light and dark themes.
- Owner: Gantt Chart App
- Last updated: 2026-08-30

## Domain boundary

### In scope
- Project exact Markdown source into source-positioned semantic and delimiter ranges.
- Offer an additive policy that keeps delimiters of complete supported constructs concealed even when the caret intersects them.
- Preserve the 1.0 active-delimiter policy as the default for compatibility.
- Expose theme-neutral semantic roles so the editor can follow application light/dark tokens.

### Out of scope
- Changing Markdown storage, persistence, versions, undo, history, memo limits, or save behavior.
- Rich-text or HTML storage, attachments, embedded media, resource fetching, syntax execution, Mermaid, formulas, or collaborative editing.
- Introducing a manual edit/preview switch or an application-owned theme preference.

## Domain vocabulary

- Markdown source: The exact Unicode memo string retained without normalization.
- complete construct: Supported Markdown whose delimiter and content ranges are parseable.
- always-concealed policy: A projection policy under which delimiters of complete constructs remain visually suppressed at active and inactive selections.
- application theme: The OS-selected light or dark token set already used by the application.

## Scenarios

### S1: Project complete Markdown continuously

**Given** valid supported Markdown source
**When** projection is requested after any source or selection change
**Then** semantic ranges immediately reflect the exact source without saving or creating a separate preview state.

### S2: Keep active source delimiters concealed

**Given** a complete supported construct and the `always-concealed` policy
**When** the caret or selection intersects the construct
**Then** its exact source remains editable while every complete delimiter range remains concealed.

### S3: Preserve incomplete or unsupported source

**Given** incomplete Markdown, unsupported syntax, raw HTML, or a projection failure
**When** the source is projected
**Then** affected content remains exact editable plain source and is never executed, fetched, removed, or normalized.

### S4: Follow application theme semantics

**Given** the application is rendered in its light or OS-selected dark theme
**When** the live editor receives focus, selection, or projected Markdown
**Then** background, text, caret, selection, focus, and semantic paint use the active application tokens without a light-only editor surface.

## Inputs

- source: Exact Unicode memo string, including correctable over-limit drafts.
- selections: Zero or more normalized UTF-16 source ranges.
- delimiter policy: `active-exposed` (default compatibility behavior) or `always-concealed`.

## Outputs

- projection: Exact source, normalized selections, semantic ranges, delimiter ranges with disposition, and fallback status.
- projection issue: Privacy-safe code and source position when available; never memo content.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| plain | No complete supported construct is projectable | projected, active-source, fallback |
| projected | Complete constructs have semantic projection and concealed delimiters | projected, active-source, plain, fallback |
| active-source | Compatibility policy exposes an active construct | active-source, projected, plain, fallback |
| fallback | Exact source is editable without semantic replacement | plain, projected, active-source, fallback |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| invalid-selection | Selection offsets are reversed, negative, or past source end | Normalize/clamp; preserve source | Yes; source is unchanged |
| projection-failure | Parser/projector cannot produce valid ranges | Return exact editable source and retry after the next edit | No source mutation |
| unsupported-construct | Syntax has no supported projection | Keep it as exact editable source | Yes; independent constructs may remain projected |

## Invariants

- Projection never mutates, normalizes, saves, logs, or duplicates Markdown source.
- The `always-concealed` policy never exposes a delimiter belonging to a complete supported construct.
- Incomplete and unsupported syntax remains visibly editable as source.
- Theme adaptation changes only presentation, never source, selection, task state, or persistence.
- Raw HTML remains inert source and no local or remote resource is loaded.

## Scale and performance envelope

- Preserve the 4,000 Unicode-scalar memo envelope plus correctable over-limit drafts.
- Reproject only the open memo after local document or selection changes without I/O.

## Observability

- Projection metadata may expose policy, state, safe issue code, construct kind, and offsets, but never memo content.
- Theme changes and live projection emit no persistence, audit, revision, or undo event.

## Headless interface

```text
projectTaskMemoMarkdown(source, selections, { delimiterPolicy }) -> MemoLiveProjection
```

## Contract tests

- Preserve every 1.0 contract test under the default `active-exposed` policy.
- S2 verifies all active complete delimiters are concealed under `always-concealed`.
- S3 preserves incomplete, unsupported, raw-HTML, Unicode, and fallback behavior.
- S4 verifies editor theme wiring uses application tokens and has no light-only active-line/focus paint.
- Projection remains deterministic, bounded, source-exact, and free of task API or I/O effects.

## Change history

- 1.1 / 2026-08-30: Authorized by CCR-005 to add always-concealed live Markdown and application-theme-compatible editor presentation.
- 1.1 / 2026-08-30: Implemented and locked after compatibility-policy, active-selection, IME-composition, runtime light/dark theme, focused editor, full-suite, type-check, build, and real-browser coverage passed.
