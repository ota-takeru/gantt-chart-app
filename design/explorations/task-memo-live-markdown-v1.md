# Design exploration: task memo live Markdown v1

- Status: direction selected for integration
- Inputs: locked `task-memo-live-markdown-v1` Capability Pack and provisional design principles
- Exploration mode: monochrome structural study; visual styling is intentionally deferred
- Fixed premise: every direction uses one continuously editable, live-projected Markdown surface. Enlarging changes the presentation of that same surface; it never creates a second editor, preview, route, notebook, or saved state.

## Four-lens notes

### Information lens

The memo text, the task identity that gave rise to it, and the save boundary must be understood together. The current draft is the primary information. Task title and temporal origin are supporting context, while scalar count, pending state, and recovery messages are operational information that must remain visible without competing with the memo.

The surface has three meanings that must not be conflated:

- immediate Markdown appearance describes the current local draft;
- explicit Save determines whether that draft becomes persistent task data;
- global undo belongs to the result of a successful save, not to local editor undo.

The ordinary and large presentations therefore need the same task identity, draft, count, status, and actions. The large state may reveal more room but must not reveal a different information model. Inactive complete Markdown can become visually semantic; incomplete, unsupported, raw-HTML, image, and failed projections remain literal source. The active construct keeps its punctuation available. This distinction must be perceptible without a second preview copy or a separate Markdown legend occupying permanent space.

Long content is not exceptional: code, URLs, and tables can be wider than the readable text measure, and a 4,000-scalar memo can be tall. Horizontal overflow belongs to the content region only. The title, count, status, size control, Save, and Cancel stay reachable. At 4,001 scalars the draft remains editable and the error is locally associated with both the count and Save outcome.

Tension: keeping the timeline legible behind the transient boundary supports origin awareness, but too much visible timeline reduces the writing area and can make the large state feel merely wider rather than focused.

### Interaction lens

The action starts at the memo action on the current-side identity of a remaining task, or in the selected local detail of a completed task. Opening places the caret in one live surface. Typing changes presentation locally and immediately, but never communicates that a save occurred. Delimiters become available because the caret or selection enters their construct, not because of hover.

Enlarge is a reversible presentation change inside the same transient editing session. Activating it must preserve caret, selection, composition, local undo/redo, exact source, draft scroll position, validation or persistence error, and pending state. The reverse action returns to ordinary size with the same guarantees. The user should perceive spatial growth from the memo’s existing boundary rather than a close-and-reopen sequence.

Save and Cancel remain explicit and stable in meaning at both sizes. Save enters a single pending state that prevents duplicates. Success closes the transient editor and hands off to the existing privacy-safe global undo result. Validation failure keeps editing available. Stale state offers reload; persistence failure offers retry; both retain the exact draft under the established rules. Cancel or Escape follows the established discard behavior, outside click is inert, and final dismissal returns focus to the exact origin action.

IME composition is a hard interaction boundary: size change, Escape handling, presentation updates, and save initiation may not consume or rearrange uncommitted text. Links remain editable content rather than app navigation. Image and HTML source remains inert. Keyboard order should move predictably among size, editor, recovery controls when present, Cancel, and Save, with the editor itself retaining normal text-editing behavior.

Tension: a persistent bottom action strip makes saving legible in long memos, but it can feel detached from the current line. Its purpose is the whole draft, so that separation is acceptable if the strip remains clearly inside the memo boundary.

### Layout lens

The established composition is a dense temporal surface with history on the left, a NOW hinge, and current identity on the right. The memo begins on that current side and should not masquerade as a new destination. The ordinary presentation remains viewport-contained and right-biased. A large presentation needs enough uninterrupted width and height for long prose, wide tables, and code while retaining a small but meaningful trace of the originating time surface.

The main layout decisions are therefore:

- which edge or point stays invariant while the memo grows;
- how much of the timeline remains visible and whether it is context or chrome;
- whether task identity is a header, a spatial tether, or an enclosing band;
- whether actions are fixed to the memo boundary or flow after the content;
- how content-only horizontal scrolling is isolated from the rest of the transient surface.

At 960×640 and 200% zoom, the large state cannot depend on a two-column interior. Its essential regions need to collapse to a single vertical sequence while keeping the editor and action/status strip usable. The task title may wrap, but it must not push size and dismissal controls out of reach. The 240-character title is supporting context and may be line-clamped with an accessible full name.

Tension: preserving exact geometric attachment to a deeply indented task can produce a cramped ordinary surface. The attachment should communicate origin without inheriting the row’s indentation as editor width.

### Visual lens

Structure is evaluated in grayscale. Hierarchy comes from type scale, weight, whitespace, rules, and surface boundaries rather than decorative color. The task identity is quieter than the draft but stronger than operational metadata. Editor focus, pending state, errors, concealed delimiters becoming visible, and disabled duplicate-save behavior all need non-color cues.

The live Markdown treatment should remain typographically restrained: semantic hierarchy can distinguish headings, quotes, code, lists, and tables, but the editable source must still read as a coherent text surface. Typography cannot imply a rendered document separate from editing. Concealed inactive delimiters should not cause line reflow or unstable content geometry when they reappear around the caret; any width change needs to remain local and predictable.

Motion, if used after selection, should explain continuity between ordinary and large size. Reduced-motion mode should use an immediate geometry change with persistent task identity and focus as the continuity cues. Forced-colors mode needs explicit boundaries, focus indicators, and state labels. Error and pending meaning must use text and shape/position, not hue.

Tension: editorial typography makes Markdown meaning clear, while the product’s dense task surface favors compactness. The large state can afford a more generous reading measure, but the ordinary state must not collapse constructs into an illegible miniature.

## Monochrome structural theses

The diagrams use line weight and position only. They do not prescribe color, shadow, corner radius, icon style, or animation timing.

### Direction A: Hinge-grown memo

- Thesis: The memo remains visibly attached to the current-side task identity and grows away from that origin into a focused workspace. The fixed right-side hinge is the continuity cue.
- Spatial model: In ordinary size, a right-biased transient sheet occupies part of the viewport over the time surface. Its right and top boundaries remain stable. Enlarging moves the left and lower boundaries outward until the sheet nearly fills the viewport, leaving a narrow timeline/context margin. The task-origin label stays in the same header position relative to the fixed hinge. A fixed interior footer holds count/status and Cancel/Save; only the memo content region scrolls.
- Primary object: The task-bound memo draft, understood as an attribute of the current task rather than a separate document.
- Action origin: The memo action on the current-side task identity or completed-task detail opens the sheet. The size action sits in the sheet header beside the task context; it reads as changing the current surface, not opening another destination.
- State/result expression: Local projection appears within the editor. A compact status line above the footer expresses over-limit, pending, stale, missing, or persistence failure in words and exposes Reload/Retry only when relevant. Pending changes the Save action to a labelled in-progress state and prevents duplicate activation. Success dismisses the sheet into the established global undo result. Cancellation dismisses toward the originating action. Enlarging never clears or replaces status.
- Temporal/history representation: A slim visible slice of the time surface, including the NOW relationship and originating row position when available, remains behind the sheet’s growing edge. It is context only, not interactive navigation while the memo is open. The stable right hinge says “this is still the current-side detail of that temporal row.”
- Domain signature: **NOW-side hinge growth.** The surface enlarges by extending back across available time-space while its current-side attachment remains fixed. This directly expresses that a larger writing view is the same task memo session, not a notebook page.
- Capability traceability: One surface and a stable hinge support exact draft/caret continuity across sizes; contained scrolling supports long code/tables; fixed status/actions preserve explicit Save and recovery; retained row context supports exact origin return and remaining/completed symmetry; one mounted surface avoids duplicate assistive-technology content.
- Risks and scale concerns: The residual timeline strip could become visual noise, especially at 200% zoom, and must collapse before it steals required editor width. A very long task title can overfill the fixed header. Growth from a right hinge may be spatially subtle for completed-task origins located elsewhere. Wide content needs its own overflow boundary so the entire sheet never pans horizontally. The fixed footer must not cover the last editor line.
- Typical-pattern rationale: A transient sheet/dialog is necessary because explicit Save/Cancel, inert outside click, focus containment, and exact origin return already define a bounded task operation. Without a boundary, local draft versus saved task data becomes ambiguous and focus can leak into the timeline. A page, notebook, sidebar navigation system, or tab set would sever task-origin continuity and add information architecture the capability does not provide. The right-biased sheet fits the dense time surface because it overlays rather than reflows 5,000 rows.

Ordinary:

```text
 history       NOW     current task identity
 ──────────────│───────[ Task 42 · Memo ]──────┐
 row row row   │       │ Memo              [↗] │
 row row row   │       │────────────────────────│
 row row row   │       │ # Status update        │
 row row row   │       │                        │
 row row row   │       │ - [ ] Verify…          │
 row row row   │       │                        │
                       │────────────────────────│
                       │ 132 / 4,000  Cancel Save│
                       └────────────────────────┘  ← fixed hinge
```

Large:

```text
 context  │ Task 42 · Memo                                 [↙]
 strip    │────────────────────────────────────────────────────
 NOW/row  │ # Status update
 remains  │
 visible  │ - [ ] Verify…
          │
          │                       one continuous live surface
          │────────────────────────────────────────────────────
          │ 132 / 4,000                         Cancel     Save
          └────────────────────────────────────────────────────  ← same hinge
```

### Direction B: Row-spanning focus band

- Thesis: The memo grows from a task row into a horizontal focus band that preserves the row as its organizing axis; enlargement increases the band vertically until it becomes the dominant viewport region.
- Spatial model: The ordinary memo is a wide band aligned to the originating row, spanning across the NOW hinge without moving surrounding row geometry; the remaining task surface is masked but still visible above and below. The editor begins beneath a task-identity rail within the band. Large size expands the band upward and downward, leaving thin strips of adjacent temporal rows as context. Header and actions share the task rail; the content body scrolls independently.
- Primary object: The selected temporal row plus its memo layer. The user thinks “I am expanding this row’s narrative,” not “I opened a dialog.”
- Action origin: The memo action reveals the focus band directly at the row. Size change originates from the band’s task rail. For a completed task, the selected completed detail supplies the equivalent local axis.
- State/result expression: Validation, pending, and recovery appear as a full-width operational line between the task rail and editor so they cannot be confused with memo content. Save/Cancel remain at the rail’s trailing end. Success collapses the band back to the exact row and exposes global undo. Failure leaves the band expanded with draft and recovery action intact. Cancellation collapses without an apparent timeline mutation.
- Temporal/history representation: The row itself is the temporal reference. Its lifetime, NOW crossing, and current identity remain aligned in the task rail while the editable memo occupies a layer beneath it. Adjacent rows provide scale and place but are inert during the operation.
- Domain signature: **Narrative row dilation.** A task’s temporal row temporarily gains depth to reveal its exact memo without changing the geometry of other rows in the underlying work surface.
- Capability traceability: Row alignment strongly traces the origin and focus return; the single dilating band keeps the editor instance continuous; inert surrounding rows honor focus containment/outside-click behavior; fixed rail actions preserve explicit saving; operational line supports validation, pending, stale reload, and retry.
- Risks and scale concerns: A row-spanning band competes with the principle that primary row geometry remain stable, even if implemented as an overlay; users may perceive the task row itself as resized. At depth 8, the identity rail can become crowded. Completed-task detail may not have the same full temporal geometry, weakening symmetry. At 200% zoom the visible adjacent-row strips may disappear, reducing the thesis to a generic full-screen overlay. A 240-character title across the rail can crowd actions. Long content still needs a clear content-only scroll model.
- Typical-pattern rationale: This direction deliberately avoids a generic card, sidebar, or dashboard. It still needs a modal interaction boundary because surrounding rows must be inert and focus contained, but its shape derives from the temporal row. A conventional centered modal would lose the row axis; an inline expanding row would reflow thousands of tasks and violate stable row geometry.

Ordinary:

```text
 row above ─────────────│────────────────────────────────────
 TASK 42 ═ lifetime ════│══ current identity ══ [↕] Cancel Save
           status line: Draft not saved · 132 / 4,000
           # Status update
           - [ ] Verify…                ← row-spanning memo band
 row below ─────────────│────────────────────────────────────
```

Large:

```text
 thin row context ──────│────────────────────────────────────
 TASK 42 ═ lifetime ════│══ current identity ══ [↕] Cancel Save
 status line: Draft not saved · 132 / 4,000
 ────────────────────────────────────────────────────────────
 # Status update

 - [ ] Verify…                     one continuous live surface

 ────────────────────────────────────────────────────────────
 thin row context ──────│────────────────────────────────────
```

### Direction C: Origin-marked focus field

- Thesis: The memo becomes a calm central writing field while a persistent origin marker at the viewport edge preserves its connection to the task. Enlargement is a change in the field’s framing, not a directional growth from a panel.
- Spatial model: Ordinary size is a centered, viewport-contained focus field with a short leader to an edge marker identifying the source task and whether it came from current-side or completed detail. Large size expands symmetrically toward all viewport edges; the origin marker remains pinned on the nearest edge and the leader shortens. A narrow top band contains task identity and size control. A bottom band contains draft status/count and actions. The content region alone scrolls.
- Primary object: The act of focused memo composition; task provenance is explicit but secondary.
- Action origin: The task memo action opens the field near viewport center while an origin marker persists at the task’s edge position. Size changes from the top band and preserve the marker.
- State/result expression: Draft/pending/error language occupies the bottom band beside count and recovery actions. Save/Cancel remain fixed. On success or cancel, the field recedes to the origin marker before focus returns; with reduced motion, the marker and task name persist through an immediate dismissal. Stale and persistence failure retain the field, draft, and marker.
- Temporal/history representation: Time is represented minimally by the origin marker: a NOW-side notch for remaining tasks or a completed-detail notch for completed tasks. The dimmed time surface remains visible around ordinary size and as a narrow perimeter around large size, but the memo field itself is not shaped by the timeline.
- Domain signature: **Temporal provenance marker.** A small structural notch identifies where the focused draft belongs in the task’s current/past context throughout the session.
- Capability traceability: Central expansion maximizes room for 4,000 scalars and wide constructs; a single field preserves state across sizes; the provenance marker supports exact origin return and completed-task symmetry; stable bands keep Save/Cancel, count, pending, and recovery reachable; one textbox prevents duplicate assistive output.
- Risks and scale concerns: Centering weakens the established right-side action origin and may feel like a generic document editor. The provenance marker could become decorative or hard to understand without labelling. For deeply nested or offscreen origins, mapping an edge marker may be ambiguous. At small viewport/high zoom, the marker and surrounding timeline may disappear. Symmetric expansion has less obvious continuity than the fixed hinge, particularly without motion.
- Typical-pattern rationale: The centered dialog is justified by focus containment, long-form composition, and stable actions, but it is the most conventional direction. The origin marker is required to prevent it from becoming an unrelated document modal; without that marker, current versus completed provenance and exact focus return are difficult to anticipate. Tabs, navigation, and a note sidebar remain unnecessary because there is only one task-bound draft and no browseable memo collection.

Ordinary:

```text
 timeline row ────────│──────────◇ Task 42 origin
             ┌──────────────┴─────────────────┐
             │ Task 42 · Memo            [⛶] │
             │────────────────────────────────│
             │ # Status update                │
             │                                │
             │ - [ ] Verify…                  │
             │────────────────────────────────│
             │ 132 / 4,000       Cancel  Save │
             └────────────────────────────────┘
```

Large:

```text
  ◇ Task 42 origin ─┐
 ┌──────────────────┴──────────────────────────────────────┐
 │ Task 42 · Memo                                     [⛶] │
 │─────────────────────────────────────────────────────────│
 │ # Status update                                         │
 │                                                         │
 │                    one continuous live surface          │
 │─────────────────────────────────────────────────────────│
 │ 132 / 4,000                              Cancel     Save │
 └─────────────────────────────────────────────────────────┘
```

## Capability traceability matrix

| Locked scenario, output, or invariant | Direction A: Hinge-grown | Direction B: Row-spanning band | Direction C: Focus field |
|---|---|---|---|
| One continuously editable live projection; no Edit/Preview switch | One editor remains fixed to the right hinge while its bounds grow | One editor remains in the dilating overlay band | One editor remains in the expanding central field |
| Exact Unicode source; incomplete/unsupported/raw HTML/image syntax stays literal and inert | Editor treatment only; no separate rendered region | Editor treatment only; operational line stays outside content | Editor treatment only; no preview or executable content area |
| Active delimiters available by caret/selection | Same surface and focus retained through size change | Same surface and focus retained through dilation | Same surface and focus retained through expansion |
| Explicit Save/Cancel; no auto-save implication | Persistent interior footer separates draft appearance from persistence | Rail actions plus “Draft not saved” operational line make boundary explicit | Persistent bottom band labels draft state and actions |
| Preserve caret, selection, composition, undo, draft, scroll, errors, pending across sizes | Bounds change around one fixed-hinge surface | Overlay band changes height around one surface | Frame expands symmetrically around one surface |
| 4,000-scalar count; correctable 4,001 failure | Footer count plus adjacent validation text; editing remains available | Operational line spans the band and remains visible | Bottom band ties count/error to Save while editor stays active |
| Pending prevents duplicate save | Save becomes labelled pending and unavailable for repeat activation | Same, in stable task rail | Same, in stable bottom band |
| Stale reload, retry, missing/persistence recovery retains exact draft | Recovery row above footer remains in same sheet | Operational line retains draft and exposes recovery | Bottom status band retains field and exposes recovery |
| Success reaches privacy-safe global latest-operation undo | Sheet dismisses back toward task origin; global result remains outside memo | Band collapses to the row before global result | Field dismisses to provenance marker before global result |
| Cancel/Escape; outside click inert; focus containment and exact return | Explicit transient boundary and fixed origin hinge | Inert row-surrounding overlay and row axis | Explicit field boundary and persistent origin marker |
| Japanese IME composition safety | Size is a geometry change; composition remains in one focused editor | Dilation never replaces editor or moves text into another region | Expansion never replaces editor; size/dismiss actions respect composition |
| Long URL/code/wide table | Memo content gets local horizontal overflow; sheet/header/footer do not pan | Band body gets local horizontal overflow | Field body gets local horizontal overflow |
| 960×640 and 200% zoom | Context strip can collapse; single-column sheet remains | Adjacent-row context may collapse, weakening signature | Perimeter and marker may collapse, weakening signature |
| Remaining/completed origin symmetry | Same hinge with origin label adapted to completed local detail | Strong for remaining row, weaker for completed detail | Provenance marker has explicit remaining/completed variants |
| 5,000 tasks; exactly one mounted/projected memo | Overlay leaves task surface unchanged | Overlay band avoids row reflow | Overlay leaves task surface unchanged |
| No duplicate preview in accessibility tree | A single named textbox | A single named textbox | A single named textbox |

## Scale and accessibility risks

### Shared risks and required mitigations

- **Zoom and small viewport:** At 960×640 and 200% zoom, structural context must yield before editor controls. Use one vertical reading order: task identity and size control, editor, status/count, recovery if present, then Cancel/Save. All controls remain reachable without horizontal viewport scrolling.
- **Long task identity:** A 240-character title must wrap or truncate within a reserved header region without shifting action targets unpredictably. The full title remains programmatically available.
- **Wide Markdown constructs:** Tables, code, and unbroken URLs scroll horizontally only inside the memo content region. A keyboard user needs a perceivable region boundary and a way to move through it without trapping focus.
- **Four-thousand-scalar draft:** Header/footer or rails remain stationary within the transient boundary while the content region scrolls. The final line must not be obscured by the action area.
- **Live semantic presentation:** Heading/list/quote/code distinctions cannot remove source from the accessibility tree or create a second reading copy. Delimiters return on caret/selection, including keyboard selection; hover is never required.
- **Focus and naming:** The live surface has one stable programmatic textbox name incorporating task context without announcing the 240-character title on every edit. Size change preserves focus unless the user explicitly activates a control, after which focus returns predictably to the surface or control according to the established interaction.
- **IME and composition:** Composition text stays visible and ordered. Escape, Save, and size-change behavior must distinguish active composition from dialog commands. No projection-driven announcement should interrupt each composition update.
- **Dynamic status:** Pending and errors use concise textual status, not color alone. Announcements should occur once per meaningful state change, not after each keystroke or count change. Recovery actions follow the message in reading and keyboard order.
- **Forced colors and reduced motion:** Every boundary, focus state, selected action, pending state, and error survives without custom color. Geometry continuity cannot depend on animation; persistent task identity and the size control’s state name carry the transition in reduced motion.
- **Links and inert syntax:** Link text must remain editable and not unexpectedly navigate. Raw HTML, scripts, and image syntax receive no executable or fetched representation. Their literal treatment needs no alarming styling unless an actual save error exists.

### Direction-specific risk comparison

| Risk | A | B | C |
|---|---:|---:|---:|
| Origin continuity for remaining tasks | Low | Low | Medium |
| Origin continuity for completed tasks | Low | High | Medium |
| Conflict with stable row geometry | Low | High | Low |
| Survival of domain signature at 200% zoom | Low–medium | High | High |
| Resemblance to generic document UI | Low | Low | High |
| Space for wide/long content | Low | Medium | Low |
| Header crowding from long title | Medium | High | Medium |

## Anti-template rationale

The feature needs a transient, focus-contained boundary because it edits an unsaved task property with explicit confirmation, cancellation, recovery, and exact focus return. That functional requirement justifies dialog-like behavior. It does not justify a generic centered card by itself.

No direction introduces tabs: there are not multiple modes or peer views, and an Edit/Preview split is explicitly prohibited. No direction introduces a sidebar or notebook: there is no memo collection, navigation model, or page-level destination in the locked capability. No direction uses dashboard tiles: task memo information is a single coherent draft, not independent metrics. Cards are avoided because the primary domain object remains a temporal row/task-bound memo rather than a set of interchangeable content modules.

Direction A uses the established right-biased transient boundary but makes the NOW-side fixed hinge its domain-specific structural reason. The hinge is not decoration: it preserves origin, explains enlargement, and keeps the memo subordinate to the time surface. Direction B derives its shape directly from the task row, but risks violating the stable-row principle in perception even when technically overlaid. Direction C earns its central field through focused composition and scale, but its provenance marker has to work hard to keep the result from reading as a reusable document-editor template.

The less typical row band was not rejected because it is unfamiliar; it was rejected because completed-task symmetry and stable task geometry are capability/design liabilities. The centered field was not rejected because centered dialogs are common; it was rejected because it weakens the current-side action origin without improving scale beyond what hinge growth can provide.

## Direction selection

- Selected direction: **A — Hinge-grown memo**
- Selection owner: **delegated choice**; the user accepted same-surface enlargement and authorized selection of the direction that best preserves continuity with the established current-side task origin.
- Why it was selected: It most directly joins the locked one-surface invariant to the app’s time-oriented structure. The stable NOW-side/current-side hinge makes enlargement legible as a geometry change around the same task-bound draft. It preserves the established right-biased origin, supports long and wide content, keeps persistence controls continuously reachable, avoids row reflow, and retains its domain signature better than the alternatives at small viewport and high zoom. Completed-task origins can use the same fixed sheet geometry with an adapted origin label rather than requiring a different interaction model.
- Rejected directions: **B** demonstrated that the task row is a powerful provenance cue, so the selected header should retain explicit task/current-or-completed context; however, row dilation risks perceived row-geometry change, handles completed detail awkwardly, and loses too much context at high zoom. **C** demonstrated the value of a persistent provenance marker and calm writing measure; however, symmetric central expansion weakens current-side causality and approaches a generic document editor. Its clear status/action bands should inform the selected direction without adopting its spatial model.
- Structural decisions now fixed:
  - one named live-projected textbox is the sole memo surface in ordinary and large presentation;
  - the ordinary surface is a right-biased transient sheet originating from the task’s current-side memo action or completed local detail;
  - enlargement grows the same sheet leftward/downward while its right-side hinge and task context remain stable;
  - the large sheet nearly fills the viewport but preserves a narrow time-surface context strip when space permits;
  - task identity and the reversible size control occupy a stable header;
  - only the memo content region scrolls vertically and, for wide constructs, horizontally;
  - count/status/recovery and explicit Cancel/Save remain in a stable interior footer region;
  - surrounding time-surface content remains visible where space allows but inert throughout the transient operation;
  - context yields before editor usability at 960×640 and 200% zoom;
  - size change never creates, replaces, or remounts a second perceived editing surface and never changes persistence meaning.
- Visual decisions still open:
  - exact typeface, sizes, weights, and readable line measure;
  - border/rule weights and the material distinction between sheet and inert time surface;
  - semantic color roles after monochrome validation;
  - exact delimiter concealment treatment, provided geometry and accessibility remain stable;
  - size-control symbol and labels;
  - transition duration/easing and the reduced-motion equivalent;
  - exact width of the context strip and ordinary sheet at responsive breakpoints;
  - error, pending, and global undo visual styling.
- Integration questions: None identified that require a capability change. Integration must verify that the chosen geometric continuity can preserve composition, caret/selection, local undo, scroll, errors, and pending state without creating a second accessible editor. If the available adapter cannot preserve those states across size change, stop and raise a Capability Change Request rather than simulating continuity with copied text or a duplicate surface.
- Acceptance checks:
  - Opening from a remaining depth-0 or depth-8 task and from completed local detail shows the same right-hinged surface with the correct origin context and caret ready.
  - Typing headings, nested emphasis, lists, quotes, links, code, fences, and tables changes meaning in the one editor immediately; active delimiters remain available and incomplete/unsupported/raw HTML/image syntax stays exact and inert.
  - Enlarging and restoring during plain selection, delimiter-boundary selection, scrolled content, local undo history, 4,001-scalar validation, stale recovery, persistence retry, and pending save preserves every state and the exact draft.
  - Enlarging or restoring during Japanese IME composition does not close, save, duplicate, reorder, commit, or conceal uncommitted text.
  - Save is visibly explicit in both sizes, cannot be duplicated while pending, and success proceeds to the existing privacy-safe global undo result; immediate Markdown appearance never reads as saved confirmation.
  - Cancel/Escape follows the established discard rule, outside click does nothing, focus stays contained, and dismissal returns focus to the exact originating memo action.
  - At 960×640 and 200% zoom, task context, size control, editor, count/status, recovery, Cancel, and Save are reachable; wide tables/code scroll only inside the content region.
  - A screen reader encounters one consistently named textbox and no duplicate preview; semantic appearance does not remove editable source meaning.
  - Keyboard-only, forced-colors, and reduced-motion passes preserve focus visibility, state comprehension, size continuity, recovery access, and origin return.
  - With 5,000 tasks and a representative 4,000-scalar memo, exactly one memo is mounted/projected and both presentation sizes remain responsive.
