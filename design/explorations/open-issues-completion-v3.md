# Open issues completion v3 — independent design exploration

- Exploration status: selected direction ready for UI integration
- Scope: Issues #13–#20
- Capability status: keyboard task placement and completed-pocket window are implemented / locked; task-detail disclosure is implemented / locked; the remaining work is representation and integration
- Product surface: Japanese-first Windows desktop app
- Selection authority: The user explicitly delegated completion of all remaining issues to Codex
- Independence boundary: This exploration uses only the named Capability Packs, established history-left / NOW / current and hierarchy/reversibility explorations, issue bodies, design principles, and established screenshots/tokens. It does not use product source, implementation reasoning, or a temporary harness.

## Locked design boundary

The shared spatial grammar remains:

```text
PAST / RETAINED HISTORY  ───────────────  NOW  │  CURRENT TASK IDENTITY
createdAt → completedAt / NOW                    title + lifecycle + actions
```

- Remaining work is one aligned object across lifetime, NOW, and current identity.
- Completed work remains in its retained hierarchy location on the history side; it is not moved to a page, archive register, dashboard, or completion-time-sorted list.
- Stable selection is the only rich-disclosure state. Hover is paint-only and cannot replace selection or reveal selection-only actions.
- Keyboard placement submits the same exact tuple as pointer placement: `target parent + optional before sibling`.
- Completed-pocket rendering uses the locked prefix plus selected-reveal projection: at most 40 ordinary members initially, bounded incremental reveal, and at most one off-prefix selected member.
- Nonselected completed marks do not each become page tab stops. The history tree/composite remains the keyboard navigation owner.
- Delete confirmation is pre-commit presentation. It may inspect the full scope, but it does not change deletion meaning, hierarchy, history, or Undo.
- Selection, confirmation, pocket expansion, range, and incremental-window state are presentation-only. Pending and failure preserve last committed task geometry.

## Monochrome structural vocabulary

Structure is selected before color.

| Mark | Meaning |
|---|---|
| thin horizontal rule | ordinary row alignment only |
| branch rail / elbow | retained ancestry on the current-identity side |
| lifetime tick / rail | temporal placement on the history side |
| quiet vertical band + named rule | NOW, the shared structural boundary |
| open cap `○` | remaining lifetime reaches NOW |
| closed cap `■` | committed completed endpoint |
| double outline | stable selected task or completed mark |
| barred seam + reason | invalid placement destination |
| anchored bounded sheet | pre-commit destructive scope, not a new row |
| stacked short rails + count | accumulated completed context, not work duration or progress |
| omitted interval + ordinal text | completed members retained but not currently mounted |

## Lens 1 — Information

### What must remain visible together

- The history plane, NOW hinge, and current task identities must remain simultaneously legible.
- Every remaining row always exposes title, lifecycle, completion eligibility, lifetime meaning, and enough ancestry to scan the forest.
- Stable selection exposes exact lifetime, full path when needed, direct-child count, memo state, and secondary operations without changing row height.
- Placement mode exposes source identity, currently named destination, destination kind, validity, invalid reason, and commit/cancel state.
- Delete confirmation exposes the root title, exact descendant count, every affected descendant in retained path order, and commit/cancel controls.
- A completed pocket at rest exposes historical presence, count, and temporal distribution without repeating every identity.
- A selected completed item exposes title, visible ancestry, exact creation/completion timestamps, actual-history state, and memo/reopen/delete actions locally.
- Incremental history exposes the rendered prefix, original ordinal/total semantics, omitted count, and an explicit bounded continuation.

### What is deferred

- Resting rows defer memo presence, child count, and secondary actions until stable selection/focus.
- Completed items defer repeated titles and exact timestamps until inspection; their marks, count, and distribution remain visible.
- Off-prefix completed members remain unmounted until bounded continuation or direct selection requires one selected reveal.
- Delete confirmation does not shorten a large subtree to a sample. The list may be internally scrolled, but no affected identity is omitted.
- Versions, revisions, tokens, operation identifiers, and window-controller state remain adapter concerns and are translated into user-facing pending, stale, failure, and recovery language.

### Priority order

At ordinary scan density, each remaining row reads:

1. title;
2. lifecycle state;
3. lifetime/time relationship;
4. hierarchy controls and secondary metadata;
5. secondary operations after selection/focus.

Completed history reads as distribution and retained count first, individual identity second, and local exact detail only for the selected item.

## Lens 2 — Interaction

### Keyboard placement choreography

1. Focus or select a remaining task and invoke the named `移動` action.
2. Keep the source row in place and enter an in-surface placement mode.
3. Present the adapter-validated ordered destinations as the same semantic seams and parent basins used by pointer placement. Root end and the remaining/completed boundary are named destinations, not inferred y-coordinates.
4. `Next` / `Previous` traversal wraps through the candidate order. The current candidate names target parent, before-sibling or append meaning, resulting relationship, and validity.
5. `Enter` on an invalid destination leaves the operation in choosing, reads the stable reason, and causes no mutation.
6. `Enter` on a valid destination enters submitting while retaining source and destination. Success moves the committed row/subtree and returns focus to the moved task or its stable control.
7. `Escape` cancels with no mutation and returns focus to the originating `移動` action.
8. Stale or failed submission retains the chosen destination and error until the user cancels, refreshes, or deliberately retries; committed hierarchy remains unchanged and focus returns to a useful origin.

Pointer drag remains available and resolves to the identical placement tuple and validation language.

### Full-scope delete confirmation

- Delete begins from the selected remaining row or selected completed detail.
- The confirmation is anchored to that origin and overlays its spatial neighborhood; it never inserts another timeline/history row.
- The heading states the root task and total descendants. A dedicated internally scrollable list shows every affected descendant in retained path order with wrapping long paths.
- Heading, destructive explanation, total, commit, and cancel remain fixed while only the affected-task list scrolls.
- Initial focus does not land on destructive commit. `Escape` and cancel close the sheet, preserve all geometry, and return focus to the exact delete origin without viewport movement.
- Pending retains all committed rows/marks. Failure keeps the sheet anchored with reason and recovery. Success removes the subtree atomically, follows established focus recovery, and exposes the existing latest Undo receipt.
- Near viewport edges the sheet flips above/below or inward while its pointer/line anchor continues to identify the source task.

### Completed-window navigation

- Opening a pocket renders the first bounded prefix, never every member.
- `さらに40件` or equivalent continuation adds the next prefix without replacing earlier members or moving selection.
- The omission boundary says which ordinal interval is not yet rendered and does not imply deletion or filtering.
- Direct selection/jump to member 437 immediately adds only member 437 as the selected reveal beside the current prefix; members 41–436 remain omitted.
- The selected reveal carries its original `437 / 600` semantics and participates in the same local detail, focus, and scroll handoff as a prefix member.
- Range changes preserve the window and selected task identity. Removing the selected item reconciles to a valid active descendant before focus handoff.

### Selection and hover

- Pointer click, tree selection, and focus entering a task establish the same stable disclosure.
- Hover may lightly track a different row or mark, but does not move selection, show its actions, or hide the selected task’s detail.
- Completed title prominence follows the same rule: resting marks are quiet; the selected item owns the visible title/path/exact-detail emphasis.

## Lens 3 — Layout

### One aligned work surface

- The shared grid remains history / NOW / current identity with one vertical scroll owner.
- NOW is a continuous narrow structural band through ruler, remaining rows, completed pockets, Undo receipt, and empty states. It does not widen or shift between states.
- Ordinary row separators are quiet alignment aids. Temporal guides stay on the left; hierarchy rails and elbows stay on the right; NOW is the only shared vertical structure.
- Remaining-row height and primary control positions are invariant across resting, hover, selected, focused, pending, and failure states.

### Anchored sheets

- Remaining delete confirmation occupies an overlay anchored to the current-identity side.
- Completed delete confirmation occupies a history-side overlay anchored to the selected mark/detail and ends at the NOW band; it never creates a false current row.
- Both use the same internal anatomy and focus contract. Their only structural difference is which side of NOW owns the anchor.
- Large affected lists use internal scroll with sticky heading/actions. The timeline, NOW, subsequent pockets, and viewport scroll position remain fixed.

### Accumulated completed context

- Collapsed pocket: compact retained-slot caption, count, and a small temporal distribution rail.
- Expanded pocket: bounded prefix of low-height marks in hierarchy order. Repeated titles do not create a second ordinary task list; identity appears on selection/focus and in attached detail.
- Omitted members are represented by a continuation boundary within the same pocket, not a page or nested browser.
- An off-prefix selected reveal is attached to the pocket without mounting the omitted interval.
- At most one selected completed detail is expanded richly; neighboring marks remain quiet.

### Narrow and pressure layouts

- At 960px and effective 200%, the current-identity side receives enough width for a useful title before selected secondary controls.
- Placement status may wrap to two lines but cannot cover the source row or destination.
- Delete sheets fit inside viewport edges and keep heading/actions visible.
- Completed continuation and ordinal semantics remain readable without horizontal scrolling.

## Lens 4 — Visual

### Line roles

- NOW receives the strongest persistent structural rule plus a subtle distinct surface. It must read in grayscale before accent color is applied.
- Ordinary row separators are the quietest lines.
- Temporal ticks/rails are slightly stronger than row separators and live only on the history side.
- Hierarchy rails/elbows are shape-distinct, subordinate to titles, and live only on the current side.
- Selection is primarily a continuous surface and double/system outline, not another equally strong grid line.
- Delete scope uses anchor and double destructive border; invalid placement uses barred geometry and text; neither relies on red alone.

### Typography and emphasis

- Task title is the strongest row text.
- Lifecycle text and shape remain immediately legible but smaller/quieter.
- Drag affordance, disclosure, child/memo indicators, counts, and secondary actions recede at rest.
- Completed pocket captions and counts are quieter than current titles. Selected completed title/path/detail rises to current-title strength locally.
- Exact timestamps use tabular numerals but do not dominate title/path.

### Theme and motion

- Light, dark, forced-colors, and grayscale preserve the same hierarchy of NOW, title, state, selection, temporal marks, and branch rails.
- Standard motion may acknowledge successful move or completion, but placement preview, confirmation, and selected disclosure are understandable without animation.
- Reduced motion removes interpolation while preserving focus transfer, live status, and final geometry.

## Three structural theses

### Direction A: Hinge-led living outline with anchored lenses

- **Thesis:** One task lineage remains the primary object; NOW divides retained time from current identity, while placement, destructive scope, and completed inspection appear as temporary lenses attached to their exact origin.
- **Spatial model:** Existing history-left / NOW / current rows remain aligned. NOW becomes the strongest continuous structure. Placement destinations are in-surface seams/basins on the current side. Delete sheets anchor to the source on its own side of NOW. Completed pockets become count/distribution summaries with a bounded prefix and one selected reveal.
- **Primary object:** The selected task across retained lifetime, NOW crossing, hierarchy slot, and local actions.
- **Action origin:** Remaining actions and keyboard move begin on the current row; completed inspect/delete/reopen begin on the selected historical mark/detail; continuation begins at the pocket omission boundary.
- **State/result expression:** Choosing keeps source/destination visible; invalid confirmation stays local; submitting preserves committed geometry; success resolves at the moved task; cancel/failure return focus to origin. Delete scope stays anchored through pending/failure. Selection is stable and hover is paint-only.
- **Temporal/history representation:** Completed work is accumulated retained context in local lineage pockets. Count/distribution are visible collapsed; a prefix of marks appears expanded; direct off-prefix selection reveals one member without eager mounting.
- **Domain signature:** **NOW hinge + lineage lens.** Current identity opens to the right of NOW, retained completion accumulates to the left, and any temporary operation keeps a visible tether to the exact lineage/time origin.
- **Capability traceability:** Directly expresses keyboard placement phases/effects, prefix/selected reveal, stable disclosure, exact retained hierarchy, and latest Undo/focus continuity without adding behavior.
- **Risks and scale concerns:** Anchored sheets can collide with viewport edges; many placement targets can momentarily increase ink; distribution rails can be mistaken for aggregate duration; off-prefix reveal can look out of order without explicit ordinal text.
- **Typical-pattern rationale:** The anchored lens is not a modal/card/sidebar. Destructive scope must remain attached to hierarchy and time evidence; a detached dialog would hide that evidence. The completed pocket is not an accordion list: it is a retained-slot time distribution with bounded identity reveal.

Monochrome sketch:

```text
PAST / RETAINED HISTORY                 NOW │ CURRENT IDENTITY
─────────────────────────────────────────╫────────────────────────
    ├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ ╫ ▾ API障害フォロー
                                        ╫   ├ 原因を整理する
 [■■ ■■ 600件 ▸]                        ╫   └ 回答案を作る [移動]
 [prefix 1–40] [41–600をさらに表示]      ╫
 selected 437/600 ─ exact/path/actions ─╫
                                        ╫  ┄〈回答案の前〉 valid
                                        ╫  ▨〈自分の子〉 invalid: cycle
```

### Direction B: Operation shoreline with historical canopy

- **Thesis:** The viewport edge owns operations while the top of the history plane owns completed density; rows remain visually spare.
- **Spatial model:** A fixed bottom operation shoreline presents keyboard destinations, delete confirmation, pending/failure, and continuation controls by mode. Completed marks live in a fixed-height canopy above remaining rows rather than local pockets. NOW continues between canopy/current regions.
- **Primary object:** The current operation mode and the global temporal density field.
- **Action origin:** A row/mark initiates an operation, then focus moves to the shoreline. Completed selection begins in the canopy; current actions begin in rows.
- **State/result expression:** The shoreline retains source and destination text through choose/submit/fail/cancel. Delete scope scrolls inside the dock. Success closes the dock and returns focus to the result. Undo can remain in a separate fixed hinge receipt.
- **Temporal/history representation:** A bounded canopy shows completion density and incremental windows independent of retained row slots; selected detail restores ancestry text.
- **Domain signature:** **Operation shoreline + history canopy.** The bottom edge is the constant command/recovery surface; historical density is a separate overhead field.
- **Capability traceability:** Strong for bounded delete scope and keyboard candidate navigation; prefix windows fit a fixed canopy. Weaker for retained hierarchy placement and origin-result proximity.
- **Risks and scale concerns:** Row-to-dock focus travel is long; placement and delete lose spatial origin; canopy weakens hierarchy slot meaning; only-completed content can look like a dashboard summary; 640px/200% loses vertical work area.
- **Typical-pattern rationale:** A bottom command bar is functionally useful for persistent controls, but here it becomes a generic mode dock and competes with the established local action grammar. The canopy risks becoming a dashboard chart rather than retained task history.

Monochrome sketch:

```text
PAST / HISTORY CANOPY                    NOW │ CURRENT IDENTITIES
 [■ ■■■ 12] [■■ 44] [■ 3]                 ╫
──────────────────────────────────────────╫───────────────────────
   ├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ ╫ API障害フォロー
        ├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ ╫ └ 回答案
─────────────────────────────────────────────────────────────────
│ 移動先 3/18: 顧客回答の前 [前] [次] [決定] [取消]             │
```

### Direction C: NOW transaction spine with branch atlas

- **Thesis:** A narrow operation spine beside NOW coordinates placement, selection, and destructive state, while the current hierarchy is explored one focused branch at a time.
- **Spatial model:** History plane / NOW / transaction spine / focused current branch. The spine contains the active placement candidate, selected completed ordinal, and anchored delete node. An ancestor atlas changes the focused branch. Completed windows attach to atlas branches.
- **Primary object:** The active transaction at NOW and its focused branch.
- **Action origin:** Row actions activate a corresponding spine node; keyboard placement traverses spine destinations; completed marks activate ordinal nodes; delete scope unfolds from the node toward its branch.
- **State/result expression:** Pending and failure remain in the spine; success updates branch and time planes atomically; cancel returns to the originating branch node.
- **Temporal/history representation:** Completed prefix windows remain under branch addresses, with selected off-prefix members pinned to the spine and their exact mark highlighted on the history plane.
- **Domain signature:** **Transaction spine + branch atlas.** Every present/past transition is coordinated at NOW through a named node.
- **Capability traceability:** Exact placement and off-prefix ordinals are explicit. Full delete scope can remain anchored. Stable selection can span the spine. However the complete forest is no longer simultaneously visible.
- **Risks and scale concerns:** 120 rows create operation-node noise; depth-eight navigation becomes mode-heavy; current title and NOW compete for width; screen-reader relationships span four regions; moving between branches adds repeated steps.
- **Typical-pattern rationale:** The branch atlas resembles navigation/sidebar structure and is only justified if one-branch focus is required. The issues request better scanning of the full dense surface, so that requirement is absent and the added navigation layer is not justified.

Monochrome sketch:

```text
PAST / HISTORY                 NOW │ OPS │ FOCUSED BRANCH
  ├━━━━━━━━━━━━━━━━━━━━━━━━━━○ ╫  3  │ API障害
       ├━━━━━━━━━━━━━━━━━━━━━○ ╫ [4] │ └ 原因整理
 [■ 1–40 + selected 437]        ╫ 437 │
                                ╫ del │ full scope lens →
```

## Issue traceability matrix

| Issue | Explicit outcome | Selected Direction A mechanism | Observable evidence |
|---|---|---|---|
| #13 Keyboard reorder/reparent | Pointer-free reorder/reparent with identical placement tuple, invalid reasons, cancel/failure focus | Row-origin placement mode over the same named seams/basins; controller candidate order; stable origin/result tether | Keyboard reorder, cross-parent reparent, root end, and remaining/completed boundary emit the same parent/before-sibling destination as pointer; invalid confirm has zero mutation; Escape and failure restore useful focus |
| #14 Full affected delete scope | Every descendant inspectable; bounded 100-member list; readable paths; fixed controls | Anchored delete lens with fixed root/count/actions and internally scrolling complete retained-order list | Root + 100 descendants are all present in the accessible list; long paths wrap; scroll does not hide commit/cancel; scope label announces 100 |
| #15 Completed delete without layout shift | Confirmation stays attached to selected completed work; no timeline/NOW movement; focus recovery | History-side anchored lens ending at NOW, with flip/inset behavior at edges | Before/after bounds for subsequent rows, pocket marks, NOW, and viewport scroll are identical; cancel/failure focuses completed delete origin; success follows existing recovery/Undo |
| #16 Incremental completed pocket | Initial expansion bounded; every member reachable; hierarchy/order preserved; off-prefix selection revealed | Locked 40-member prefix window, bounded continuation, one ordinal selected reveal, same history composite | 600-member pocket mounts at most 40 ordinary items; repeated continuation reaches 600; selecting 437 renders only prefix + 437; range change keeps window; removal reconciles active descendant |
| #17 NOW primary structure | `past/history | NOW | current work` reads first; geometry unchanged; modes coherent | Continuous named NOW band/rule; secondary separators reduced; same band through ruler, rows, pockets, receipt, empty states | 960/1280/dense first-glance and grayscale checks identify NOW above row lines; hinge left/width remains fixed; dark/forced-colors/narrow retain text/shape cue |
| #18 Row priority | Title → lifecycle → lifetime → secondary context/actions; long deep titles remain useful | Resting low-ink row; title strongest; lifecycle always present; Issue #21 selection/focus opens exact time/metadata/actions without reflow | Typical/dense scans lead with titles/states; depth 6–8 at 960 retains title width; keyboard focus exposes necessary controls; row and completion bounds do not move |
| #19 Semantic line roles | Fewer/quieter borders; hierarchy right, time left, NOW shared; selection without another grid | Separate row/temporal/hierarchy/NOW tokens and spatial ownership; surface/outline selection | Line inventory falls roughly 30–40% without losing alignment; branch/time lines are distinguishable in grayscale; selected/focused rows remain clear in forced colors |
| #20 Accumulated completed context | Remaining work dominates; collapsed count/distribution; selected completed identity/detail dominates locally | Lineage pocket summary rail, bounded quiet prefix, stable selected reveal and exact anchored detail | Dense 600 history is materially quieter than a conventional list; collapsed pocket shows count/distribution; selected completed item shows title/path/timestamps/actual-history/actions; retained order and lifetime coordinates remain recoverable |

## Scale and accessibility risks

| Risk | Impact | Mitigation | Verification |
|---|---|---|---|
| 600 completed members | Eager DOM, slow expansion, lost keyboard position | Locked 40-member prefix, bounded continuation, one selected reveal | Initial ordinary member count ≤40; incremental reachability to 600; no unrelated pocket remount |
| Off-prefix selection | Selected task appears out of order or active descendant is absent | Explicit original ordinal/total, selected-reveal separator, render before focus/scroll | Select 437/600 from collapsed/prefix state; active descendant exists before handoff |
| 100 delete descendants | Confirmation overwhelms viewport or hides controls | Internal list scroll; fixed heading/count/actions; complete list | Inspect first/middle/last path; commit/cancel always visible; no outer layout growth |
| Completed confirmation near edge | Overlay detaches or causes viewport jump | Anchor tether plus above/below/inward flip; preserve scroll owner | Top/bottom/narrow placements retain visible origin and unchanged row bounds |
| Many placement candidates | Verbose navigation and loss of source | Stable source label, ordinal candidate status, concise parent/before/append phrase | First/last/wrapped navigation; source remains visible; Narrator phrase is unambiguous |
| Invalid/stale placement | User assumes mutation occurred | Barred shape + reason; last committed geometry; retained failed candidate | Cycle/depth/invalid confirm zero mutation; stale/failure keeps forest and useful focus |
| Depth eight / 240-char title | Title squeezed by rails/actions | Compressed indent, title priority, full selected path, selection-only secondary actions | 960px, 760px, effective 200% preserve useful title and named controls |
| 120 current rows | Completion controls, handles, borders create a spreadsheet cage | Quieter ordinary rules and affordances; selection/focus disclosure | Dense grayscale scan finds titles/states first; only one rich selected row |
| Distribution misread as duration/work amount | Completed summary communicates a false metric | Count label, individual lifetime marks, accessible description `完了したタスクの分布`; no progress fill | First-use/grayscale review distinguishes task distribution from work duration |
| No per-mark tab explosion | Keyboard traversal becomes unusable | One composite tab stop; active descendant and ordinal/set semantics | Tab count does not scale with 600; every rendered/off-prefix item reachable within composite |
| Forced colors / grayscale | NOW, state, selection, invalid, destructive collapse into one line | System colors, labels, double/barred geometry, distinct spatial roles | Windows forced-colors and grayscale distinguish all roles without hue |
| Reduced motion | Origin/result continuity disappears | Persistent anchor, focus transfer, live status, committed geometry | All placement/delete/selection outcomes remain understandable with animation disabled |
| Live-region duplication | Dense operations announce source/result repeatedly | One atomic status per phase; decorative marks hidden from AT | Placement success/cancel/failure and delete success each produce one concise result announcement |

## Anti-template rationale

- No modal is used for placement or deletion. Both decisions require simultaneous visibility of source hierarchy, destination/scope, lifetime, and NOW. A detached modal would hide the evidence needed to decide safely.
- No sidebar/inspector is added for selected details. Stable selection already belongs to one cross-hinge task; attached detail preserves that relationship and avoids a generic master-detail shell.
- No completed page, tab, archive register, dashboard, or global completion chart is introduced. Completed work is retained hierarchy context, so its compression remains at the original lineage slot.
- The pocket distribution is not a metric card or progress visualization. It is a bounded navigation summary for individual retained lifetimes, with count and exact selected detail.
- Incremental continuation is not infinite-feed chronology. It reveals the next retained-order prefix and preserves original ordinal/total semantics.
- The keyboard chooser is not a separate reorder dialog. It reuses the same seam/basin placement vocabulary as pointer manipulation and therefore cannot drift into a second ordering model.
- Anchored delete confirmation is not a popover used by habit. Its anchor proves which lineage/time object owns the destructive scope, and internal scrolling is required to satisfy full inspection without geometry movement.
- NOW emphasis comes from semantic line ownership and a continuous band, not decorative glow, oversized typography, or color saturation.
- Originality comes from the combined **NOW hinge, lineage lens, accumulated pocket, and exact placement seams**, each directly tracing to locked time, hierarchy, disclosure, and placement invariants.

## Direction selection

- **Selected direction:** A — Hinge-led living outline with anchored lenses
- **Selection owner:** Codex, by the user’s explicit delegation to complete all remaining issues
- **Why it was selected:** It follows the issue authors’ desired directions most directly while preserving the established domain signature. Keyboard placement stays in-surface and shares the pointer destination model; delete scope is fully inspectable yet locally anchored for both remaining and completed work; the locked completed-prefix projection becomes accumulated context rather than a second list; NOW and semantic line roles become clearer without altering geometry; and Issue #21’s stable selection supplies row/detail hierarchy without hover dependence. It also keeps the whole forest readable, unlike the branch atlas, and retains hierarchy placement more faithfully than the historical canopy.
- **Rejected directions:** B contributes the useful concept of a bounded operation surface but detaches actions from their row/mark, weakens retained hierarchy in completed history, and consumes scarce height. C makes exact transaction state explicit but adds a permanent operation/navigation grammar, splits task identity across more regions, and increases density and assistive-relationship complexity.
- **Structural decisions now fixed:** One aligned history / NOW / current work surface and one vertical scroll owner; NOW as the primary continuous band; ordinary row lines quietest, temporal lines left, hierarchy lines right; row title/state always visible and rich detail selected/focused only; keyboard placement as row-origin named seams/basins with controller-owned phases; anchored geometry-neutral delete lenses on the source side of NOW; full internally scrollable delete scope; completed pockets as count/distribution summaries with a 40-member prefix, bounded continuation, one off-prefix selected reveal, and local exact detail; no cards, modal, sidebar, completed page, archive register, dashboard, or eager 600-member list.
- **Visual decisions still open:** Exact light/dark line token values, NOW band shade and rule weight, title/state type sizes, hierarchy-rail cadence, distribution-rail mark density, selected surface tone, anchored-sheet border/anchor shape, placement valid/invalid patterns, and standard-motion duration. These may be tuned only after grayscale, dark, forced-colors, narrow, and reduced-motion evidence without changing the selected structure.
- **Integration questions:** None are currently missing. Integration must stop if the placement adapter cannot expose the exact candidate tuple/reason/focus effects, if the completed-window projection cannot expose ordinal/total and selected reveal before focus handoff, if authoritative full delete scope is unavailable before commit, or if anchored confirmation requires changing deletion/Undo semantics. Any request to reorder completed work by time, selectively undo, omit affected descendants, add archive/trash, persist window state, or let hover own disclosure requires a Capability Change Request rather than a UI workaround.
- **Acceptance checks:**
  - Keyboard-only sibling reorder, cross-parent reparent, root-end, and remaining/completed-boundary placement complete with the same destination tuple as pointer.
  - Placement navigation wraps; invalid/cyclic/depth candidates are identified by shape and text; invalid confirm has no mutation; Escape cancels; stale/failure preserves committed hierarchy; success/cancel/failure returns useful focus.
  - Remaining and completed delete confirmation show root title, exact total, and every descendant in retained path order; 100 paths scroll internally, wrap, and leave commit/cancel visible.
  - Opening completed deletion does not change any unrelated row, pocket, timeline mark, NOW, or viewport-scroll bound; cancel/failure returns focus to the completed delete origin; success follows existing focus recovery and Undo.
  - A 600-member pocket initially renders at most 40 ordinary members; bounded continuation eventually reaches every member; selecting member 437 renders prefix plus 437 without mounting 41–436; ordinal/total semantics and active descendant are correct; range changes preserve window/selection.
  - Typical 18-row, dense 120/600, depth-eight, long-title, empty, only-remaining, and only-completed fixtures are reviewed at 960px, 1280px, 760px, and effective 200%.
  - First glance reads `past/history | NOW | current work`; NOW is stronger than ordinary separators but quieter than task identity; row/lifetime geometry is unchanged.
  - Dense rows scan by title then lifecycle; secondary metadata/actions remain quiet at rest and appear for stable selection/focus without moving rows or primary controls; hover never replaces selection.
  - Border/line inventory demonstrates roughly 30–40% less ordinary ink while temporal, hierarchy, NOW, selection, error, and state meanings remain distinct.
  - Collapsed completed pockets show presence/count/distribution without repeated labels; expanded bounded history remains reachable; one selected completed task clearly dominates with visible title, path, exact timestamps, actual-history state, and actions.
  - Light, dark, grayscale, forced-colors, narrow width, reduced motion, keyboard-only, and Narrator checks preserve the same semantic hierarchy and one concise live announcement per operation phase.
