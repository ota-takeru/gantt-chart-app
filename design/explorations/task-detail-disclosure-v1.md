# Design exploration: task-detail-disclosure-v1

- Status: direction selected; ready for integration planning
- Date: 2026-08-26
- Inputs: locked `task-detail-disclosure` 1.0, Capability Pack `task-detail-disclosure-v1`, and `design/principles.md`
- Exploration boundary: grayscale structure only. This artifact does not alter the capability, specify implementation internals, or use a development harness as design evidence.
- Human-selected anchor: issue #21 selects persistent row selection as the primary progressive-disclosure state.

## Four-lens notes

### Information lens

At rest, a task must remain independently scannable: identity, hierarchy cue, lifecycle state, lifetime meaning, and completion eligibility cannot depend on selection, hover, or color. Disclosure should add context rather than repair an incomplete resting row.

The selected task needs five secondary information groups without becoming a second task page: ancestry when the visible indentation is insufficient, memo presence plus an affordance (not the memo body), direct-child remaining/total metadata, lifecycle-relevant secondary actions, and an exact lifetime readout. Remaining and completed time must remain semantically distinct: `createdAt → NOW` means an open lifetime, while `createdAt → completedAt` is a closed lifetime. Neither is duration worked, progress, nor schedule.

The densest useful grouping is therefore relational rather than categorical. Exact time belongs with the lifetime mark; ancestry belongs near identity; child counts belong near the hierarchy cue; memo and lifecycle actions belong at the identity/action end. Putting all details into one generic text block would make their meaning harder to locate and would compete with 120-row scanning.

One selection-only presentation may be visible at a time. Hover can increase local legibility or paint a lightweight preview, but it must never reveal any of the five selection-only groups. When another row is hovered, the selected row must remain plainly identifiable and fully disclosed.

### Interaction lens

The action begins on the task itself. Pointer selection from the row's non-primary surface and focus entering any existing row action both establish the same stable selection. This equivalence should be visible: the same context and controls appear regardless of whether selection began with pointer or keyboard.

Selection is persistent, not a press-and-hold or hover state. The user can move the pointer away, hover another row, traverse the time surface, or enter a selected row's secondary control without losing disclosure. Selecting or focusing another available task transfers the single selection atomically. Selecting the already selected task is visually idempotent; it must not collapse the disclosure or restart motion.

The selection operation itself has no pending, success, failure, undo, or persistence ceremony because it is local presentation state. An unavailable selection target produces no partial visual change and preserves a current valid selection. If reconciliation removes the selected task, its linking treatment and secondary disclosure disappear together and the surface returns to resting projection. A context reset does the same. Editors and confirmations launched by secondary actions retain their established interaction surfaces; the disclosure merely provides their action origin.

Completed history needs equivalent reach without creating a tab stop for every dormant history mark. A completed descendant becomes selectable when its history pocket is in its established inspectable state; focus entering that descendant's available interactive context establishes stable selection. Reopen is disclosed only for the selected completed task and remains anchored to that task.

### Layout lens

The governing geometry is the existing history-left / NOW-hinge / current-identity-right composition. Selection may change paint, typography, clipping priorities, and which preallocated content is visible, but not row height, neighboring row positions, the NOW column, the completion control, or any primary action origin.

At depth 8 and at 760 px, disclosure cannot depend on a long contiguous sentence. It must tolerate truncation by distributing meaning to the region it describes and preserving immediately inspectable exact-time context. Long Japanese and Latin titles retain first claim on the identity region after essential hierarchy and lifecycle cues; selection-only text yields or becomes inspectable without moving primary controls.

Completed history pockets are local temporal structures, not a second list. A selected descendant's closed lifetime must remain legible inside that pocket and must not cause the pocket or its surrounding rows to reflow merely because detail was disclosed.

### Visual lens

The exploration is intentionally grayscale. Structure relies on line weight, text weight, outline/underline, fill texture, position, and explicit labels rather than color. Stable selection, keyboard focus, lifecycle, and hover need separable non-color cues: selection is a continuous relational link; focus is a local focus indicator around the current interactive origin; hover is a lighter, bounded surface treatment.

The selected row may raise contrast selectively, but essential text on unselected rows must still meet its final contrast target. Exact times should use numerals with stable widths where the product type system permits. Motion is optional and must not carry meaning; reduced-motion presentation can switch disclosure atomically. No shadow, gradient, accent color, or card material is needed to explain any thesis.

## Grayscale structural theses

### Direction A: Threaded row disclosure

- **Thesis:** Treat stable selection as one continuous task-lifetime thread. Secondary context appears at the point on that thread where it has meaning, while the row's footprint remains fixed.
- **Spatial model:** The selected task's existing lifetime mark is strengthened from its creation point through the NOW crossing to the current identity for remaining work, or from creation to completion and the completed identity/mark for completed work. A compact, single-line disclosure stratum is revealed within already reserved row bands: exact time along the temporal segment, ancestry and child ratio adjacent to identity/hierarchy, and memo/actions in the existing action band. Content uses clipping and priority rules; no inline panel is inserted.
- **Primary object:** The task as a temporal row whose past and present identity are one object.
- **Action origin:** Pointer selection begins on the row's non-primary surface; keyboard focus entering any row control produces the same stable row selection. Secondary actions originate from fixed action positions on the selected row.
- **State/result expression:** The selection result is the continuous history → NOW → identity link plus the one visible disclosure stratum. Focus adds a separate local focus ring; hover adds a light preview wash without interrupting the selected thread. Unavailable intents leave the thread unchanged. Reconciliation/reset removes the entire thread and disclosure in one step. There is no pending, success toast, cancellation, or undo for selection.
- **Temporal/history representation:** Remaining tasks receive an explicitly open-ended `createdAt → NOW` readout across the hinge. Completed tasks receive a closed `createdAt → completedAt` readout within their history pocket. Endpoint shapes and words, not color alone, distinguish open and closed lifetimes.
- **Domain signature:** A single continuous selection thread binds the task's history mark, NOW crossing, and current identity. It directly expresses stable selection without detaching detail from the lifetime it describes.
- **Capability traceability:** Covers S1 through S5. It preserves essential resting information, produces exactly one disclosed task, gives focus and pointer identical structure, keeps hover paint-only, and makes stale-selection clearing visually atomic. Distributed disclosure maps every required secondary field to its relevant task region.
- **Risks and scale concerns:** Narrow widths can force priority conflicts between long titles, ancestry, and actions. Depth-8 rows may leave too little inline identity width. Exact-time labels can collide with short history segments or dense completed marks. Integration needs deterministic overflow rules and an immediately inspectable fallback that does not add geometry or a hover-only dependency.
- **Typical-pattern rationale:** No card, sidebar, modal, tabs, or dashboard grouping is used for disclosure. Established memo editors and delete confirmations may still open their established separate surfaces because editing and destructive confirmation are different tasks; merely revealing context does not require them.

### Direction B: Temporal aperture

- **Thesis:** Treat selection as opening a fixed-height reading aperture across the time field, making one task's temporal facts primary while compressing its secondary identity/actions into fixed edge registers.
- **Spatial model:** A horizontal aperture aligned to the selected row spans the time field from history through NOW. Inside the unchanged row bounds, exact endpoints and child/history metadata occupy fixed temporal slots. An identity-side register shows ancestry and memo/actions; completed selections use the same aperture wholly on the history side. Other rows remain visible through a lower-emphasis texture, but do not move.
- **Primary object:** The selected interval or open lifetime, rather than the task label.
- **Action origin:** Selection still starts on the task row or by focus entering it, but follow-up inspection is organized from the temporal aperture toward fixed left/right registers. Secondary actions remain at fixed row coordinates.
- **State/result expression:** The aperture is the stable selection. A narrow focus outline identifies the actual focused control inside it. Hover on another row draws a thin guide that can cross the aperture without replacing it. Reconciliation/reset closes the aperture; unavailable intents do nothing. Because selection is local, it has no pending/success/undo state.
- **Temporal/history representation:** Exact creation and end/NOW labels attach to opposite ends of the aperture. Remaining work has an open terminal at NOW; completed work has two closed endpoints. Lazy actual-work history, when present, remains a distinct subordinate trace and is not conflated with lifetime.
- **Domain signature:** A measurement-like temporal aperture turns the chosen task's open or closed lifetime into the immediate reading surface.
- **Capability traceability:** Strongly covers exact temporal context, lifecycle-essential scanning, sole disclosure, focus equivalence, and hover stability. Ancestry, memo, child ratio, and lifecycle actions are available in the identity register only for the selected task.
- **Risks and scale concerns:** The time field may become visually dominant enough to suppress task identity and hierarchy. Closely spaced completed marks can make the aperture appear to select an interval rather than a task. At 200% zoom the two registers may have insufficient width, and the aperture could be mistaken for schedule duration or progress despite labels.
- **Typical-pattern rationale:** This is not a dashboard or detached inspector; it is a fixed-row temporal reading mode. The register resembles a detail rail only because identity-side actions need stable origins. A conventional sidebar was rejected because it would sever the selected fact from its temporal endpoint and consume narrow-layout width.

### Direction C: Paired edge notation

- **Thesis:** Treat selection as a pair of synchronized annotations at the lifetime's two semantic ends, leaving the middle of the dense time field quiet.
- **Spatial model:** The selected row exposes a history-edge notation at creation and a current/completion-edge notation at NOW or completion. A restrained connective rule confirms that both annotations belong to one task. Ancestry and child ratio are encoded at the identity-side notation; exact creation time and memo presence sit at the history-side notation; lifecycle actions occupy the existing fixed action band. Row height and neighbor positions remain unchanged.
- **Primary object:** The task's two lifecycle endpoints as a coordinated pair.
- **Action origin:** Selection begins on the row or through focus. The identity-side endpoint remains the origin for actions, while the history endpoint is inspectable for exact temporal context.
- **State/result expression:** Stable selection is the visible endpoint pair and connector. Focus is a separate outline at the active endpoint/control. Hover can preview one lightweight endpoint tick on another row but cannot reveal its annotation. Reset/reconciliation remove the pair simultaneously; unavailable intent preserves it. There is no operation progress, success, or undo UI.
- **Temporal/history representation:** Open remaining work pairs creation with NOW using an open-ended terminal. Completed work pairs creation with a closed completion terminal. The quiet connector communicates relationship without reading as a filled duration bar.
- **Domain signature:** Synchronized endpoint notation makes lifetime meaning inspectable while reserving visual ink for the facts that define it.
- **Capability traceability:** Covers S1–S5 and all required disclosed groups, with strong non-color differentiation between remaining and completed endpoints. It preserves exactly one selection and makes hover subordinate.
- **Risks and scale concerns:** Users may miss the relationship when endpoints are far apart, especially on wide canvases. Exact creation text can collide in dense completed history pockets. Splitting information between two ends increases scan travel and may be less comprehensible for deep hierarchy or long titles. A stronger connector could collapse back into Direction A.
- **Typical-pattern rationale:** No generic containers are introduced. Tooltip dependence was rejected because it would make detail transient and pointer-biased; a modal was rejected because inspection should preserve the time surface and stable row context.

## Capability traceability matrix

| Locked behavior / required evidence | A: Threaded row | B: Temporal aperture | C: Paired edge notation |
|---|---|---|---|
| S1 resting scan: essential identity, lifecycle, lifetime, eligibility, hierarchy always visible | Resting row is unchanged; selection stratum is absent | Aperture is absent; base rows remain scannable | Endpoint annotations are absent; essential row marks remain |
| S2 sole deliberate selection | One continuous thread and disclosure stratum; previous one clears | One aperture and register pair | One synchronized endpoint pair |
| S3 focus equals explicit selection | Same thread/disclosure; focus ring is additive | Same aperture/registers; focus outline is additive | Same endpoint pair; focus outline is additive |
| S4 hover cannot replace selection | Hover wash on another row; selected thread remains | Hover guide crosses without closing aperture | Preview tick elsewhere; selected pair remains |
| S5 selected task disappears | Thread and all secondary fields clear atomically | Aperture closes atomically | Both endpoints clear atomically |
| Unavailable target preserves valid selection | No visual transition | No visual transition | No visual transition |
| Exact remaining lifetime | `createdAt → NOW` placed along continuous open thread | Opposing aperture endpoints, open at NOW | Creation/NOW endpoint pair with open terminal |
| Exact completed lifetime | Closed thread inside local history pocket | Closed historical aperture | Closed creation/completion endpoint pair |
| Ancestry, memo, child metadata, lifecycle actions | Distributed to identity/hierarchy/action regions | Identity-side fixed register | Split between endpoint notations and action band |
| Disclosure is geometry-neutral and local-only | No inserted surface; fixed row/action positions | Fixed-height aperture and registers | Overlay notations within fixed row bands |
| Domain signature | History → NOW → identity selection thread | Lifetime measurement aperture | Synchronized lifetime endpoints |
| 120 rows / 5,000-task projection | One enhanced row; no per-row disclosed container | One enhanced row; field de-emphasis must stay cheap | One annotated pair; no dormant interactive annotations |

## Cross-direction scale and accessibility risks

- **Narrow width and zoom:** At 760 px or 200% zoom, long titles, depth-8 indentation, and disclosed metadata cannot all claim fixed inline width. The selected structure needs a published content priority: essential lifecycle and identity first; fixed primary controls never move; exact lifetime stays immediately inspectable; secondary prose truncates before those elements. Truncation cannot rely solely on a pointer tooltip.
- **Dense history pockets:** Nonselected completed marks must not each become a tab stop. The established history-pocket navigation exposes an inspectable descendant; stable selection then adds only that descendant's disclosure. Exact-time text must avoid covering neighboring marks in a way that changes which task appears selected.
- **Selection versus focus:** Selection and focus can coexist on the same row or on different visual subparts. They require distinct, simultaneous non-color cues. A selected-but-not-focused row remains identifiable; a focused control on the selected row remains locatable. Forced colors must preserve both via system outlines or equivalent geometry.
- **Hover precedence:** Hover styling must be visibly weaker than stable selection and must disappear without changing disclosed content. Hover cannot be the only way to discover an action or exact value.
- **Lifecycle semantics:** Remaining and completed lifetime marks need explicit endpoint forms and text. Queued, active, paused, completed, completion-eligible, and not-eligible meanings remain available to assistive technology and cannot be inferred only from grayscale value or eventual color.
- **Keyboard action reach:** Resting secondary actions may remain in the tab sequence, but before focus they must be visually quiet and must not accept pointer hits. When focus enters one, disclosure occurs before or with focus presentation so the control's label, task association, and visible location agree. Focus must not cause layout shift.
- **Reduced motion:** No directional movement is required for comprehension. If a short transition is later added, reduced-motion mode reveals/hides disclosure atomically and focus is never delayed.
- **Accessible naming:** The selected task, lifecycle, exact time relation, child ratio, ancestry where needed, memo presence, and action name must have unambiguous accessible text. The continuous line or endpoint notation is supplemental, not the only carrier of meaning.
- **Performance:** Only one task receives selection-only DOM visibility/paint at a time. The design must not require task-specific listeners, retained per-task disclosure state, or a focusable object for every dormant completed mark.

## Anti-template rationale

The task is not “show more fields somewhere”; it is “understand one task more deeply without losing its time and hierarchy context.” A generic card would duplicate the row as a second primary object and interrupt density. A sidebar or persistent inspector would detach exact lifetime and action origin from the chosen row, reduce width at 760 px, and weaken keyboard focus equivalence. Tabs would falsely imply multiple destinations or modes. A dashboard grid would discard the continuous history-left / NOW-right composition.

Direction A therefore uses the existing row and lifetime relationship as the container. Its familiar pieces—inline text, an action band, focus outline—are necessary primitives, not a template: they preserve fixed coordinates, keyboard reach, and local action origin. The distinctive structure is the domain-specific continuous lifetime thread and the distribution of context to the temporal or hierarchical region it explains. Separate memo/editor and confirmation surfaces remain acceptable only after a selected secondary action invokes those established workflows; they are not used for disclosure itself.

## Direction selection

- **Selected direction:** A — Threaded row disclosure.
- **Selection owner:** Issue #21 author/requester (human-selected persistent row selection anchor); this exploration recommends Direction A as the structure that best realizes that selection.
- **Why it was selected:** It keeps the selected task—not an interval, inspector, or endpoint pair—as the primary object; strengthens the established history → NOW → identity signature; preserves row density and action origins; makes pointer/focus equivalence legible; and distributes each fact near the domain relation it explains. It is the least likely to be misread as schedule, progress, or a second task surface.
- **Rejected directions:** Direction B demonstrates that exact time can be unusually legible, but over-promotes the interval and risks reading lifetime as progress or schedule. Direction C uses very little ink and clarifies endpoint semantics, but creates excessive scan travel and weakens the perceived unity of a selected task on wide canvases. Their endpoint-labeling lessons should inform A without changing its structure.
- **Structural decisions now fixed:** Stable selection is expressed on the row; one continuous history → NOW → identity link is its domain signature; selection-only information is distributed within the unchanged row footprint; remaining and completed lifetimes use open versus closed endpoint semantics; primary controls and action origins do not move; focus and hover have cues distinct from stable selection; completed disclosure remains inside the local history pocket; no generic card, sidebar, tab set, dashboard, or persistent inspector is added.
- **Visual decisions still open:** Final typography and truncation treatment; line weights and grayscale hierarchy; semantic colors after grayscale validation; precise system-color mappings in forced-colors mode; focus-outline style; optional reduced-motion-safe transition; exact iconography and localized short labels; final content-priority thresholds at narrow widths.
- **Integration questions:** None presently expose missing capability. If integration cannot keep exact time immediately inspectable without changing row geometry, or cannot focus a completed descendant without adding a tab stop to every dormant mark, stop and determine whether established surface behavior already supplies a compliant mechanism; do not broaden the locked capability through a UI workaround.
- **Acceptance checks:** Use the observable checks below. Measurements compare the same element before and after selection/focus and are geometry-neutral rather than tied to pixel values.

### Remaining-task interaction and acceptance checks

1. With no selection, inspect a remaining row at depth 0 and depth 8. Identity, hierarchy cue, queued/active/paused lifecycle, open-lifetime meaning, and completion eligibility are visible or accessibly named. Ancestry expansion, memo presence/affordance, child ratio, exact timestamp text, and secondary actions are not visually competing or pointer-hit targets.
2. Record the bounding rectangles of the row, its neighboring rows, NOW hinge/column, hierarchy disclosure, completion control, task identity anchor, and fixed primary action origins. Select the row from its non-primary row surface. Every recorded rectangle retains the same position and size.
3. Confirm exactly one continuous non-color link joins the selected remaining task's creation history, NOW crossing, and current identity. Confirm an immediately inspectable exact `createdAt → NOW` readout, ancestry when needed, memo presence/affordance without memo body, direct-child remaining/total when children exist, and lifecycle-relevant secondary actions.
4. Select a second remaining row. Its thread and disclosure replace the first atomically; the first returns to essential-only presentation. At no point are two rows disclosed.
5. Hover a third row, then leave it. Only its lightweight preview paint appears and disappears. The second row's thread, disclosed content, selected DOM state, and action availability remain unchanged throughout.
6. Move keyboard focus into an available resting row's hierarchy, completion, identity, or resting-tab-order secondary control. The row receives the same disclosure fields and continuous link as pointer selection; the focused control has a distinct visible focus cue and does not move. A pointer-selected row and a focus-selected row with the same data are structurally identical apart from the focus cue.
7. Attempt to select/focus an unavailable task identity. The current valid selected row and its disclosed fields remain unchanged. Reconcile available IDs without the selected task, then separately exercise context reset: in each case the link and all secondary disclosure clear together, no task content changes, and remaining rows keep their geometry.
8. At 120 remaining rows, 760 px, 960×640, 200% zoom, long Japanese/Latin titles, and depth 8, verify only one disclosure is visually prominent; titles and essential lifecycle remain attributable; fixed controls do not overlap; exact time is immediately inspectable without pointer-only hover; and no horizontal or vertical layout jump occurs.

### Completed-task interaction and acceptance checks

1. In a dense expanded completed-history pocket, confirm dormant nonselected marks do not each add a tab stop and still expose essential completed lifecycle/lifetime meaning through the established pocket representation.
2. Record the completed descendant's mark/row bounds, neighboring completed marks, containing history pocket bounds, adjacent remaining-row bounds, and reopen/primary action origin if present. Select the completed descendant through its available pointer target, then through its available keyboard interactive context. Both paths yield the same disclosure, and every recorded bound and action origin is unchanged.
3. Confirm the selected completed task shows one closed continuous relationship from `createdAt` to `completedAt`, with an immediately inspectable exact readout. It must not cross or terminate at NOW as if still open. Actual-work history, when lazily available, remains visually and semantically distinct from lifetime.
4. Confirm ancestry where disambiguating, memo presence/affordance without body, direct-child remaining/total where children exist, and completed-lifecycle secondary actions including reopen are disclosed only for this selected descendant.
5. Hover another completed mark or a remaining row. The completed selection, exact closed lifetime, and disclosed actions persist. Leaving hover restores its prior paint without reopening, closing, or transferring selection.
6. Transfer selection from the completed descendant to a remaining task and back. Exactly one task is disclosed, open versus closed endpoint semantics remain explicit without color, and no history pocket or row changes size or position.
7. Remove the selected completed task from the available projection. Its closed thread and disclosure clear atomically; no reopen, memo, hierarchy, history, revision, persistence, or undo mutation occurs.
8. Repeat in OS dark mode, forced-colors mode, and reduced motion. Stable selection, focus, hover, completed lifecycle, exact endpoints, and action boundaries remain distinguishable without relying on color or animation.
