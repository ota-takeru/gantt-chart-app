# Capability: task-memo-live-markdown

- Status: superseded by 1.1
- Version: 1.0
- User outcome: Read and edit a task memo in one continuously editable surface where complete Markdown is reflected immediately without switching between source and preview modes.
- Owner: Gantt Chart App
- Last updated: 2026-08-30

## Domain boundary

### In scope
- Project a task memo's exact Markdown source into source-positioned semantic and delimiter ranges suitable for a live editable presentation.
- Keep Markdown delimiters available around the active selection while allowing complete inactive constructs to be presented without their delimiters.
- Recognize CommonMark plus the supported GFM extensions for headings, emphasis, strong emphasis, strikethrough, lists, task lists, block quotes, links, inline code, fenced code, and tables.
- Return a safe plain-source fallback when a construct is incomplete or projection cannot be produced.
- Preserve the exact memo source and UTF-16 source offsets used by the editor.

### Out of scope
- Saving, replacing, clearing, versioning, undoing, or auditing memo text; these remain owned by locked `task-memo` 1.0 and `reversible-task-operations` 1.1.
- Auto-save, rich-text storage, HTML storage, attachments, embedded media, remote resource fetching, syntax execution, Mermaid, formulas, or collaborative editing.
- A particular editor, dialog, panel, window, button, visual theme, or large-screen mechanism.

## Domain vocabulary

- Markdown source: The exact Unicode memo string retained by `task-memo` without normalization.
- active selection: A caret or selected UTF-16 source range whose containing Markdown construct must expose enough delimiters for direct editing.
- semantic range: A UTF-16 source range with a presentation role such as heading, emphasis, link text, code, list item, or table content.
- delimiter range: Markdown punctuation which may be visually concealed only while its complete construct is inactive.
- fallback projection: A projection that exposes the entire exact source as editable plain text and performs no replacement or resource loading.

## Scenarios

### S1: Project complete Markdown while editing continuously

**Given** valid Markdown source containing supported complete constructs
**When** a projection is requested after any source change
**Then** semantic and delimiter ranges reflect the new exact source immediately, with no saved task mutation and no separate read/edit state.

### S2: Reveal the active construct

**Given** a complete Markdown construct whose delimiters may be concealed while inactive
**When** a caret or selection intersects that construct
**Then** its editing delimiters are exposed at their exact source positions while unrelated complete inactive constructs remain projected.

### S3: Preserve incomplete or unsupported source

**Given** incomplete Markdown, unsupported syntax, raw HTML, or a projection failure
**When** the source is projected
**Then** no source is removed, executed, fetched, or normalized and the affected content remains editable as exact plain source.

### S4: Preserve Unicode positions

**Given** Japanese text, emoji, combining characters, line breaks, and surrounding whitespace
**When** a projection and subsequent projection after an edit are requested
**Then** all ranges use valid UTF-16 boundaries and the exact source remains unchanged.

## Inputs

- source: Exact Unicode string from 0 to 4,000 Unicode scalar values during valid editing; an over-limit draft may still be projected so it can be corrected.
- selections: Zero or more `{ from, to }` UTF-16 code-unit ranges. Reversed, negative, or past-end values are normalized and clamped without changing source.

## Outputs

- projection: Exact source, normalized selections, semantic ranges, delimiter ranges with exposed/concealed disposition, and fallback status.
- projection issue: Privacy-safe code and source position when available; never includes memo text.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| plain | Empty or supported source with no projectable construct | projected, active-source, fallback |
| projected | Complete inactive constructs have semantic projection | projected, active-source, plain, fallback |
| active-source | At least one active construct exposes its editing delimiters | active-source, projected, plain, fallback |
| fallback | Exact source is editable without semantic replacement | plain, projected, active-source, fallback |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| invalid-selection | Selection offsets are reversed, negative, or past source end | Normalize and clamp ranges; project safely | Yes; source is never changed |
| projection-failure | Parser or projector cannot produce a valid source-positioned result | Return the exact source in fallback state and retry on the next edit | No source mutation |
| unsupported-construct | Syntax has no live presentation rule | Keep that construct as exact editable source | Yes; other independent constructs may remain projected |

## Invariants

- Projection never mutates, normalizes, saves, logs, or duplicates the Markdown source.
- Concatenating source slices by their original positions always yields the exact input source.
- Every output range is ordered, non-negative, within source bounds, and aligned to UTF-16 source offsets.
- Concealment applies only to delimiters of complete supported constructs and never to user content.
- A construct intersecting an active selection exposes the delimiters required to edit it.
- Incomplete and unsupported constructs remain available as source; projection failure never makes the memo uneditable.
- Raw HTML is source text only. Projection never creates executable HTML or initiates local or remote resource access.
- Presentation changes never alter task state, version, source revision, undo revision, hierarchy, queue, sessions, or history.

## Scale and performance envelope

- Support the locked task memo limit of 4,000 Unicode scalars plus a correctable over-limit draft.
- Reprojection occurs after local document or selection changes and must remain responsive without reading other tasks or performing I/O.
- Only the one open memo is projected; the 5,000-task forest never mounts or parses every memo.

## Observability

- Projection diagnostics may record a privacy-safe issue code, construct kind, and source offsets.
- Diagnostics, accessibility announcements, and UI status never include memo content.
- Live projection itself emits no persistence, audit, revision, or undo event.

## Headless interface

```text
projectTaskMemoMarkdown(source, selections) -> MemoLiveProjection
```

The existing locked persistence interface remains unchanged:

```text
updateTaskMemo(taskId, memo, expectedTaskVersion, effectiveInstant)
  -> ReversibleChangeResult | DomainError
```

## Contract tests

- S1 recognizes supported CommonMark/GFM constructs and updates semantic ranges after each source change without persistence effects.
- S2 conceals only complete inactive delimiters and exposes all delimiters required by an intersecting caret or selection.
- S3 leaves incomplete, unsupported, and raw-HTML content as exact editable source and provides a complete fallback on projection failure.
- S4 preserves Japanese, emoji, combining characters, whitespace, and line breaks with valid UTF-16 ranges.
- Invalid selections normalize safely without changing source.
- Empty, plain, exact-limit, and over-limit drafts remain projectable and editable.
- Every range is bounded and deterministic; semantic content is never classified as a concealable delimiter.
- Projection performs no task API call, I/O, HTML execution, resource fetch, audit event, or memo-content logging.

## Change history

- 1.0 / 2026-08-30: Initial draft for continuously editable, cursor-aware task memo Markdown projection.
- 1.0 / 2026-08-30: Implemented and locked after CommonMark/GFM projection, active-delimiter, Unicode, malformed-source, raw-HTML, selection-normalization, limit, determinism, full-suite, and type-check coverage passed.
- 1.0 / 2026-08-30: Superseded by authorized 1.1 after its compatibility and regression suite passed; retained as historical contract evidence.
