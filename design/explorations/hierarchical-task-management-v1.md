# Hierarchical task management v1 — independent design exploration

- Exploration status: Selected direction ready for integration planning
- Capability status: Implemented / locked
- Product surface: Japanese-first Windows desktop app
- Selection authority: The product owner delegated direction selection to Codex.
- Selection owner: Codex (explicitly delegated)
- Independence boundary: This exploration uses only the locked Capability Pack, locked capability specification, provisional design principles, and the capability-locked design-exploration reference. It does not use implementation code, a development harness, screenshots, or previous explorations.

## Contract boundary

The interface exposes hierarchy creation, reading, movement, completion, and reopening without adding new domain behavior. In particular, it does not introduce deletion, cascade completion, bulk selection, dates, estimates, deadlines, dependencies, progress percentages, timers, session controls, or detailed duration history.

The daily surface is **NOW / 残っている仕事**. There is no NEXT region. Completed work is a secondary, inspectable register rather than a peer workspace. The top bar is one compact control line; there is no oversized product title.

## Lens 1 — Information

### Information that must be visible together

- A remaining task's title, lifecycle distinction when relevant, depth, parent-child continuity, sibling order, expansion state, and available row actions.
- The active placement context: the task being moved, whether the current destination is before a sibling or at the end of a parent, and whether that destination is valid.
- A mutation's local status and outcome: pending, committed, rejected, refreshed, or ready to retry.
- For blocked completion, the relationship from the parent to its unfinished descendants and a direct route to the first unfinished descendant.
- During nested reopen, the target and every ancestor returned to NOW.

### Information that may be deferred

- Identifiers, optimistic versions, hierarchy/source revisions, operation identifiers, and exact completion instants stay in adapter/state logic. They appear only as user-meaningful refresh or conflict messages.
- Completed task titles and retained placement live in a collapsed secondary register. A compact count at the related remaining branch may disclose that completed descendants exist, but the completed rows are not duplicated in NOW.
- Exact queued/active/paused values remain in data. NOW groups them as remaining; a small text or shape marker may distinguish the actual lifecycle state only where useful. No timer or work-session meaning is implied.
- Long diagnostic detail is available through an expandable error detail line, while the primary recovery stays adjacent to the failed action.

### Current versus past

- NOW contains only remaining tasks. It is the sole primary work region.
- **完了済み** is a secondary register using completion state and retained hierarchy, not a chronological session history. It must not be labeled HISTORY because this iteration does not present detailed work sessions or durations.
- A completed child under a remaining parent is omitted from the NOW row stream and appears once in the completed register with its retained ancestor path. NOW may show a subdued disclosure such as `完了 2件` on the branch so hidden completed structure is not mistaken for missing data.
- Reopening a completed nested task returns the task and its completed ancestor path to NOW together. A compact result message names the count of returned tasks; it does not suggest that a timer or session started.

### Empty and exceptional information

- No tasks: one inline top-level creation line is the primary content, not an illustration or dashboard card.
- Only completed tasks: NOW remains visibly empty with a top-level creation line; the completed register shows the retained forest below it.
- No completed tasks: the secondary register is a single quiet line, `完了済み 0件`, without an empty panel.
- Truncated or limit-reached forest: mutation controls are unavailable and a persistent status explains that retained work exceeds the supported view; no operation is presented as safe until the full forest is available.

## Lens 2 — Interaction

### Common action model

- Top-level creation begins on the compact NOW command line and expands into one inline editor at the insertion point. `Enter` submits, `Esc` cancels, and validation stays attached to the editor.
- Direct subtask creation begins on the relevant remaining task row through an always keyboard-reachable `子タスクを追加` action. It opens an indented inline editor immediately after that parent's existing children. It never requires a modal or administration screen.
- Completion and reopen begin on the task row. Each pending lifecycle mutation stays visibly attached to its row and temporarily prevents a second mutation of the same task.
- Expand/collapse is independent of completion. A collapsed branch shows the count of hidden remaining descendants; completion is never implied by collapse.

### Pointer placement

Each row has a dedicated drag handle so selection, text use, completion, and movement do not compete. Pickup raises a compact movement status line and exposes two kinds of monochrome destination:

1. a **sibling seam** between rows, labeled in assistive text as `〈B〉の前へ移動` or `この階層の末尾へ移動`;
2. a **parent basin** within an eligible row, labeled `〈P〉の子の末尾へ移動`.

The seam and basin are shape- and label-distinct, not color-dependent. Invalid self, descendant, completed-parent, or depth-nine destinations remain visible but use a barred pattern and an explicit reason. Dropping on an invalid destination never submits. `Esc`, releasing outside a destination, or invoking `キャンセル` restores the unchanged forest.

### Keyboard-equivalent placement

The focused row exposes `移動` in the same row action set as pointer dragging. Activating it enters **placement mode** without opening a modal:

- The moving row is named in a pinned compact status line.
- `Up` and `Down` step through sibling seams in pre-order.
- `Left` moves to the current branch's parent-level seams; `Right` enters an eligible parent basin. These keys change the semantic destination, not merely a visual pixel position.
- Expanding a collapsed candidate remains available without leaving placement mode.
- `Enter` commits the named destination; `Esc` cancels.
- Screen readers receive the exact target parent, before-sibling/append meaning, resulting depth, validity, and invalid reason.

Pointer and keyboard paths resolve to the same `target parent + optional before sibling` placement. Neither path has a destination the other cannot reach.

### Completion and reopen

- Completing a leaf or fully completed branch changes the row to `完了処理中` in place. On success it leaves NOW and the completed count/register updates. Focus moves to the next remaining sibling, previous sibling, or parent in that order, with a polite status announcement.
- If unfinished descendants block completion, the row remains unchanged. An inline recovery line reports the remaining-descendant count and offers `最初の未完了へ`, which expands the necessary path and focuses that task.
- Reopening begins in the completed register. Pending state stays there. On success, the reopened task and any completed ancestors leave the register and reappear in NOW at their retained locations. Focus follows the reopened target in NOW; the announcement states how many ancestors also returned.

### Undo boundary

There is no post-commit domain undo in v1. Placement previews and inline creation are cancelable before commit. A successful move could only be reversed by a new move against the new hierarchy revision, so the interface must not label that as guaranteed `Undo`. After success, the task remains focused and its previous and new parent are announced, making an intentional reverse move straightforward without inventing history semantics.

### Pending, failure, and recovery choreography

| Situation | Perceived state | Recovery and continuity |
|---|---|---|
| Initial loading | Compact skeleton rows align with the future outline; NOW is `aria-busy` | On success, focus enters the NOW heading or prior remembered task; on failure, show retry in the same region |
| Safe refresh with existing data | Keep the last committed forest readable, mark it `更新中`, and disable placement commit | Replace atomically when the full snapshot arrives; preserve focus by task identity where possible |
| Top-level or subtask edit | Inline input occupies the exact future placement | `Esc` removes it; focus returns to its origin |
| Create pending | Input becomes read-only with `追加中`; no speculative task row is presented as committed | Success replaces editor with the committed row; failure restores editable text |
| Drag pickup | Moving task remains represented at origin; movement line names it | `Esc` or outside release cancels without mutation |
| Valid sibling insertion | Solid full-width seam spans only the target sibling scope; label names the before-sibling | Drop or `Enter` submits that exact placement |
| Valid reparent | Bounded parent basin plus child-indent preview shows resulting containment and depth | Drop or `Enter` submits append-to-parent placement |
| Invalid/cyclic/depth destination | Barred destination, stop glyph, and reason text; cursor alone is not the signal | Destination cannot submit; continue navigating or cancel |
| Move commit pending | Origin and destination stay marked; moved subtree is not optimistically reflowed as committed | Disable another hierarchy mutation until result; lifecycle actions on unrelated tasks may remain available only if adapter concurrency is safe |
| Move success | One short outline emphasis at the committed location; subtree expands only if needed to reveal result | Focus remains on moved task; status names new parent and position |
| Stale move failure | Preview clears and committed old forest remains until safe refresh completes | Refresh, preserve moved-task focus, then offer `移動先を選び直す`; never auto-replay against a changed revision |
| Other move failure | Origin is unchanged; destination marker changes to error text | Explain stable reason, then choose another placement, refresh, or retry as appropriate |
| Complete pending | Row remains in NOW, read-only for that task, labeled `完了処理中` | Success removes it; failure restores row with focus and attached recovery |
| Completion blocked | No visual completion and no descendant state change | Expand path and focus first unfinished descendant |
| Reopen pending | Row remains in completed register, labeled `再開中` | Success transfers returned path to NOW atomically; failure leaves register unchanged |
| Refresh/persistence failure | Last committed forest is retained and marked potentially stale | Retry refresh; mutation controls remain unavailable when placement/version safety is unknown |

### Stable error mapping

| Stable error | User-facing expression | Recovery offered |
|---|---|---|
| `invalid-title` | Inline title message with current character count | Edit and retry |
| `task-not-found` | Origin row is marked unavailable after refresh | Refresh forest; return focus to nearest retained row |
| `parent-not-found` | Intended parent is named as no longer available | Refresh and select another parent |
| `parent-completed` | Parent basin/editor states that remaining work cannot be added there | Go to that task in completed register and reopen it; creation/move is not auto-retried |
| `anchor-not-found` | Intended sibling seam is no longer current | Refresh and rebuild placement |
| `anchor-scope-mismatch` | Intended before-sibling no longer belongs to the chosen parent | Refresh and rebuild placement |
| `hierarchy-cycle` | Barred parent basin states `自分の配下には移動できません` | Choose another parent |
| `hierarchy-depth-exceeded` | Destination preview states resulting depth exceeds eight | Choose a shallower parent |
| `stale-hierarchy` | Global placement status states the forest changed | Safe refresh, then explicitly reselect destination |
| `version-conflict` | Lifecycle result states this task changed | Refresh task/forest, keep focus by identity, retry only by user action |
| `incomplete-descendants` | Attached line names remaining descendant count | Expand path and focus first unfinished descendant |
| `invalid-state` | Action result states current state no longer allows it | Refresh and expose only currently allowed action |
| `tree-limit-exceeded` | Persistent supported-limit status above NOW | Disable mutation; require future narrowing/archive capability rather than a UI workaround |
| `persistence-failure` | Attached operation failure with no visual partial commit | Refresh, then offer retry |

## Lens 3 — Layout

### Workspace frame

- One compact top line contains `NOW`, the remaining count, top-level add, refresh status, and the completed-register disclosure. The product name remains in native window chrome or compact text; it does not consume a content band.
- The task surface begins immediately below and uses a continuous row grid. Hierarchy indentation, branch rails, row baselines, and destination seams share the same geometry.
- At 960×640, the outline, inline status, and completed disclosure stay in one scrollable workspace. At 1280×800, additional width goes to titles and recovery text rather than decorative gutters.
- NOW has one vertical scroll owner. Nested branches do not create nested scrollbars.

### Density and hierarchy

- Default row height targets a compact Windows work surface while preserving at least a 32×32 CSS-pixel actionable row zone; compact icon targets may be visually smaller but receive a larger hit area.
- Depth is conveyed by indentation plus continuous branch rails. At deep levels, indentation compresses after depth four while a path label on focus exposes the full ancestry; depth eight must not squeeze titles into unusable slivers.
- Long titles wrap to at most two lines in the working row and can expand on focus. Movement and state controls remain aligned to the first line. Full text remains programmatically available.
- Dense forests require virtualized rendering or equivalent bounded DOM work, but focus, expanded state, live-region announcements, and semantic tree relationships must survive row recycling.

### Secondary completed register

- The completed register is attached after NOW as a collapsed disclosure row by default, with count and last refresh state.
- Opening it replaces neither NOW nor the current focus context. Its rows use the same hierarchy geometry at reduced visual emphasis and retain ancestor-path context.
- At dense scale, the register needs its own incremental rendering within the same primary scroll flow, not a competing permanent pane.

## Lens 4 — Visual

### Monochrome-first rules

- Structure is proven in grayscale: text weight, indentation, rails, solid versus barred destination shapes, disclosure triangles, border weight, and status wording carry meaning.
- No gradients, shadows, decorative cards, illustrations, or large display typography are used to create novelty.
- NOW heading, row titles, branch rails, completed rows, error messages, focus ring, and placement targets must remain distinguishable in Windows high-contrast mode.

### Typography and material

- Japanese system UI typography with compact line height leads. Numerals and short state labels use tabular alignment only where counts must scan.
- The surface is flat and editorial: rows on one continuous plane, thin separators only when they clarify sibling scope, and no container elevation.
- Completed rows use lower emphasis plus an explicit `完了` text/shape marker; opacity alone does not carry state.

### Semantic color after selection

- Neutral structure remains dominant.
- One accent may identify focus/selection and valid placement.
- Error color is paired with stop/barred geometry and text.
- Completed state may use a muted semantic tone only alongside its explicit marker and secondary placement.
- No color differentiates arbitrary hierarchy levels.

### Motion

- Movement may use a short spatial transition after a successful commit, but the destination seam, focus transfer, and status announcement provide full continuity when reduced motion disables animation.
- Pending state uses a text/state marker rather than an endlessly moving skeleton. Success emphasis does not blink or rely on transient color.

## Three structural directions

All three directions begin in monochrome and honor the same locked states. They differ in the object made central, spatial organization, action origin, and history representation.

### Direction A: Living outline with placement seams

- **Thesis:** The forest itself is the work surface; manipulation happens on the same branch geometry used to understand the work.
- **Spatial model:** One continuous NOW outline followed by a collapsed completed register. Branch rails connect hierarchy, and full-width seams/basins appear only during placement. A compact top line replaces a header band.
- **Primary object:** The task row in its retained branch.
- **Action origin:** Inline top-level creation; direct child creation from a row; completion from the row; pointer pickup from a dedicated handle; keyboard `移動` from the same row.
- **State/result expression:** Pending and error lines attach to the origin row and intended seam. Success resolves at the committed row. Cancellation removes the placement layer without reflow. No post-commit undo is claimed.
- **Temporal/history representation:** NOW is remaining state only. Completed hierarchy is a secondary register, with compact completed-descendant counts on related NOW branches.
- **Domain signature:** **Placement seams** express the contract's exact placement pair. A horizontal seam means `before sibling`; a contained basin means `append under parent`. The same semantic targets power pointer and keyboard placement.
- **Capability traceability:** S1–S2 originate in place; S3 maps to sibling seams; S4 maps to parent basins and moves the intact subtree; S5 is shown by barred destinations; S6–S8 remain attached to rows and transfer between NOW/completed; S9 is preserved by nonduplicated projections; S10 requires no special legacy presentation.
- **Risks and scale concerns:** Continuous pre-order rendering needs virtualization; deep indentation must compress; hidden completed descendants need explicit counts; placement seams must remain discoverable without cluttering ordinary reading.
- **Typical-pattern rationale:** No cards, tabs, dashboard tiles, permanent sidebar, or modal are needed. A disclosure register is used because completed work must remain inspectable without competing with NOW; removing it would make reopening undiscoverable, while a tab would hide current context and imply equal workspaces.

Monochrome sketch:

```text
NOW  18                                      ＋タスク   完了済み 42 ▸
─────────────────────────────────────────────────────────────────
≡  ▾ API障害のフォローアップ                         □ 完了
│    ≡  ▾ 原因の仮説を整理する                       □ 完了
│    │    ≡  DB接続数のログを確認                    □ 完了
│    │    ┄┄┄〈この前へ〉┄┄┄                         placement seam
│    │       完了 1件 ▸
│    ≡  顧客向け回答を作る                           □ 完了
≡  ▸ リリース準備                         残り1・完了1
≡    明日の調査メモを残す                            □ 完了
─────────────────────────────────────────────────────────────────
完了済み 42 ▸
```

### Direction B: Branch desk with ancestor compass

- **Thesis:** Users reason about one branch at a time; a compact ancestor compass preserves location while the focused branch gets the full workspace.
- **Spatial model:** A narrow vertical compass lists top-level roots and the selected ancestor path. The main plane shows only the focused parent's direct children plus one level of preview. Moving into another branch changes the compass target before showing sibling seams. Completed work opens as a lower register for the focused path.
- **Primary object:** The currently focused branch, not the whole forest.
- **Action origin:** Child creation begins in the focused branch's child lane. Reorder begins on a child row. Reparent begins by dragging or keyboard-navigating first to a compass branch, then selecting its child seam.
- **State/result expression:** A pinned operation ribbon spans compass and branch plane, naming source and destination. Pending locks the destination lane; success navigates to the destination branch; failure returns to the source branch. Cancellation returns compass focus to the source.
- **Temporal/history representation:** Completed rows are a secondary ledger scoped to the focused branch, with an all-completed count available at the compass root.
- **Domain signature:** **Ancestor compass** makes parent reassignment a two-stage, explicit path decision: choose parent branch, then exact sibling position.
- **Capability traceability:** Strong for S2, S4, S5, and S7 because parent context is explicit; S3 uses the child lane; S6–S8 use the branch ledger. S9 remains possible but the complete forest is not simultaneously visible.
- **Risks and scale concerns:** Users may lose cross-branch overview; repeated navigation makes wide reorganization slower; drag across a narrow compass is harder for pointer users; completed tasks across the whole forest are less directly inspectable; screen-reader mode changes need careful announcements.
- **Typical-pattern rationale:** The compass resembles a sidebar but has a functional hierarchy role: it exposes alternative parents while one branch is focused. Without it, reparenting outside the focused branch would be impossible. It preserves task ancestry rather than hosting generic navigation. A modal is still unnecessary.

Monochrome sketch:

```text
NOW 18                 API障害のフォローアップ  /  原因の仮説を整理する
┌──────────────┬──────────────────────────────────────────────────┐
│ API障害      │ 子 2件                            ＋子タスク       │
│  └ 原因整理  │ ≡ DB接続数のログを確認             □ 完了         │
│ リリース準備 │ ┄┄〈この階層の末尾〉┄┄                            │
│ 調査メモ     │    完了 1件 ▸                                    │
└──────────────┴──────────────────────────────────────────────────┘
```

### Direction C: Ordered-address ledger

- **Thesis:** Hierarchy management is editing an ordered address: parent path plus sibling seam. The interface makes that address explicit for every task.
- **Spatial model:** NOW is a dense ledger with a task column and a narrow, human-readable path column. Rows remain pre-order, but selected placement expands a horizontal address ruler above the ledger that lists parent path and before-sibling/append slots. Completed work occupies a folded ledger section below.
- **Primary object:** A task's ordered location rather than its visual branch alone.
- **Action origin:** Create and lifecycle actions begin on the task row. Movement begins on the path cell or drag handle; pointer drag drops onto an address slot, while keyboard placement edits parent path then sibling slot.
- **State/result expression:** The address ruler retains source and preview addresses through pending. Success updates the path cell; failure strikes the preview and preserves the prior address; cancel folds the ruler. No undo is promised.
- **Temporal/history representation:** Remaining and completed are two folded registers sharing the same address grammar. Completion transfers a row between registers without changing its retained path.
- **Domain signature:** **Placement address ruler** exposes `parent + before sibling` directly and can narrate exact placement to assistive technology.
- **Capability traceability:** S3–S5 map precisely to address changes; S1–S2 create at a displayed address; S6–S8 move between state registers without changing address; S9 has an explicit once-only row model.
- **Risks and scale concerns:** Mutable ordinal paths can look like stable identifiers; path text consumes width at 960px; long Japanese titles compete with address display; the ruler adds a learning step; direct manipulation feels less like manipulating a tree.
- **Typical-pattern rationale:** The ledger is a continuous table-like work surface because exact sibling order benefits from aligned location information. It is not a dashboard. No cards, tabs, sidebar, or modal are used; folded registers distinguish state without creating equal peer pages.

Monochrome sketch:

```text
NOW 18                      移動: DB接続数のログを確認
─────────────────────────────────────────────────────────────────
移動先  API障害 ＞ 原因整理   [先頭] [仮説整理の前] [末尾]
─────────────────────────────────────────────────────────────────
タスク                                             配置
API障害のフォローアップ                            1
  原因の仮説を整理する                             1.1
    DB接続数のログを確認                           1.1.1
  顧客向け回答を作る                               1.2
リリース準備                                       2
─────────────────────────────────────────────────────────────────
完了済み 42 ▸
```

## Capability traceability matrix

| Locked scenario / invariant | Required observable UI | Direction A mechanism | Acceptance evidence |
|---|---|---|---|
| S1 create top-level | Quick creation at valid top-level placement; atomic pending/result | Compact NOW add line becomes an inline top-level editor | One row appears only after success; failed create leaves editable title and unchanged tree |
| S2 create direct subtask | Discoverable from remaining parent; append or relative insertion | Always reachable row action opens child-indented editor | Child appears at correct depth/position; completed parent routes to reopen recovery |
| S3 reorder siblings | Exact before-sibling placement and retained identity/state/history | Sibling seam spans only the shared-parent scope | Pointer and keyboard land on same seam; hierarchy changes once; row state/history markers do not change |
| S4 reparent intact subtree | Target parent is explicit; subtree moves as one object | Parent basin previews new indent/depth; source branch remains marked pending | All descendants appear beneath new parent in same internal order after commit |
| S5 reject cycle/depth | Invalid target understandable before and after submit without color | Barred basin/seam plus reason label; invalid targets cannot submit | Self, descendant, and depth-nine destinations announce reason; cancellation leaves tree unchanged |
| S6 complete eligible work | Leaf/fully completed branch leaves NOW and retains placement | Attached completion pending; success transfers once to completed register | No timer/session appears; completed row is inspectable at retained path |
| S7 protect unfinished descendants | No partial completion; recovery locates remaining descendant | Attached blocked line expands and focuses first unfinished descendant | Parent and descendants remain unchanged; keyboard focus arrives on safe recovery target |
| S8 reopen nested work | Target and completed ancestor path return atomically | Reopen pending in register; returned path is revealed and focused in NOW | Announcement names target and ancestor count; no session/timer starts; placement unchanged |
| S9 separate projections | Every task appears once; remaining dominates; completed secondary | NOW rows plus one collapsed completed register; completed descendants summarized, not duplicated | Mixed forest can be audited with unique task IDs in UI tests; completed never appears as a NOW row |
| S10 migrated tasks | Deterministic top-level order does not imply new history | Ordinary top-level outline rows with no migration badge | Existing titles/states/order render normally; no fabricated metadata |
| Maximum depth 8 | Deep ancestry remains understandable and operable | Compressed indentation after depth four plus focused full-path label | Depth-eight titles and controls remain usable at 960px; depth-nine target is barred |
| Maximum 5,000 retained | Full snapshot safety and bounded rendering | Virtualized continuous outline; persistent truncation/limit status disables unsafe mutation | Scroll/focus tests at limit; no mutation from a truncated placement model |
| Failed operations are atomic | UI never leaves a partially moved/completed forest | Origin remains authoritative through pending; commit reflows only after result | Injected failures retain previous rows, order, state, and focus recovery |
| Reopen preserves completion events | Reopen means remaining again, not erasing the past | Completed register transfer; no destructive history wording | Copy says `NOWへ戻しました`, never `完了を削除` |
| Movement preserves lifecycle/history | Placement is orthogonal to state | Drag handle and placement mode do not expose lifecycle controls | Reorder/reparent does not alter the row's lifecycle marker |

## Scale and accessibility risks

| Risk | Impact | Required mitigation | Verification |
|---|---|---|---|
| 120 remaining / 600 completed rows | Slow rendering, lost position | Virtualized or incremental rows with identity-based focus restoration; completed register collapsed by default | Repeated expand, move, complete, and reopen at dense scale without scroll jumps |
| 5,000 retained-task ceiling | A partial forest could make placement unsafe | Surface truncation state and disable hierarchy mutation until a full valid placement model is available | Limit fixture shows persistent explanation and no active drop targets |
| Depth eight at 960px | Titles collapse into narrow columns | Compress indent after depth four; retain rails; expose full path on focus | Japanese 35-character and 240-character titles remain readable and actionable |
| 240-character mixed Japanese/ASCII titles | Excessive row height or clipped controls | Two-line default, on-focus expansion, stable first-line action alignment, full accessible name | 200% zoom and narrow-window tests preserve controls and full programmatic title |
| Drag-only discoverability | Keyboard, switch, and screen-reader users cannot move | Row `移動` action enters the same semantic destination set as drag | Reorder and cross-parent reparent complete without pointer |
| Ambiguous sibling versus child drop | Wrong hierarchy changes | Seam and basin use different geometry, labels, indentation preview, and accessible names | User test distinguishes `before B` from `child of B` in monochrome |
| Invalid destination indicated only by color | Low-vision/color-deficient users miss constraint | Barred texture, stop glyph, reason text, `aria-disabled` | High-contrast and grayscale checks preserve validity distinction |
| Virtualization breaks tree semantics | Screen readers lose level/set information or focus | Maintain `treeitem` level/expanded/position metadata and identity-based active descendant strategy | Narrator keyboard pass through recycled rows and expanded branches |
| Focus loss after row transfers | Completion/reopen feels destructive | Deterministic next-focus order; reopened target focus follows to NOW | Complete last child, complete top-level, reopen nested cases all land predictably |
| Collapsed branch hides blocked descendants | Completion error feels inexplicable | Show hidden remaining count; recovery expands required path | Blocked completion from collapsed parent reveals first unfinished descendant |
| Reduced motion | Reparent/reopen loses spatial continuity | Persistent origin/destination text, focus transfer, and live announcement | With reduced motion, every result remains understandable without animation |
| Safe refresh during move | Stale preview could be committed | Cancel active preview on revision change; preserve source focus; require destination reselection | Simulated stale revision never auto-replays a move |
| Windows high contrast / 200% scaling | Rails, seams, and controls disappear or overlap | System colors/borders, text labels, non-color geometry, reflowing compact top line | 960×640 at 200% and high contrast keeps create, move, complete, reopen available |
| Japanese screen-reader phrasing | Destination sequence becomes verbose or ambiguous | Name parent, sibling relation, depth, validity in a fixed concise order | Narrator announces a destination unambiguously before commit |
| Completed register becomes a second primary surface | Daily work loses focus | Default collapsed, lower typographic emphasis, no permanent side-by-side competition | First-glance review identifies NOW as sole primary region |

## Anti-template rationale

The selected direction is intentionally not a reskinned task dashboard:

- The hierarchy is one continuous working outline, not a collection of cards. Cards would fragment sibling order and make cross-card placement seams ambiguous.
- There is no dashboard summary band. Counts live in the compact NOW line because the operative object is the forest, not metrics about it.
- There are no NOW/NEXT/HISTORY tabs. NEXT is outside this iteration, and a HISTORY tab would overstate detailed time-history support. Completed work is a subordinate disclosure register because inspect/reopen is necessary while daily attention should remain on remaining work.
- There is no permanent navigation sidebar. The whole forest already provides navigation; a sidebar would duplicate hierarchy and consume width needed by deep Japanese titles.
- There is no creation or move modal. Both operations depend on seeing sibling and parent context, which a modal would obscure. Inline editors and placement seams preserve origin-to-result continuity.
- The domain-specific signature is not ornamental. Sibling seams and parent basins directly encode the locked placement tuple and visibly distinguish reorder from reparent.
- The compact top line and continuous row plane use the 960×640 host efficiently. Originality comes from the placement grammar and retained-hierarchy transitions, not branding, gradients, or unusual controls.

## Direction selection

- **Selected direction:** A — Living outline with placement seams
- **Selection owner:** Codex, by explicit delegation from the product owner
- **Why it was selected:** It keeps the complete remaining hierarchy readable at once, makes quick child creation truly local, gives pointer and keyboard users the same exact placement vocabulary, keeps errors attached to their causal location, and scales better than a branch-focused or address-heavy model. Its seam/basin grammar is a domain-specific signature directly traceable to reorder/reparent semantics. It also makes NOW unmistakably primary while keeping completed hierarchy inspectable and reopenable.
- **Rejected directions:** B clarifies one branch well and contributed the ancestor-path announcement idea, but it hides too much cross-branch context and makes broad reorganization laborious. C precisely exposes placement and contributed explicit destination narration, but ordinal addresses compete with long titles and may be mistaken for stable identity.
- **Structural decisions now fixed:** one compact top line; no oversized header; NOW as the only primary work region; a continuous hierarchical row plane; completed work as a collapsed secondary register; direct inline child creation from each remaining task; a dedicated pointer drag handle; sibling seams and parent basins as the placement grammar; an in-surface keyboard placement mode with identical destinations; pending/error/recovery attached to origin and destination; no claimed post-commit undo; no cards, tabs, modal, dashboard band, or permanent sidebar.
- **Visual decisions still open:** exact Japanese typeface and type scale; row height within the compact accessible target; branch-rail weight; grip/disclosure glyph shapes; semantic accent/error/completed colors; focus-ring treatment; final spacing tokens; reduced-motion transition duration.
- **Integration questions:** No missing capability is identified. If the adapter cannot provide a complete, revisioned forest, task versions, changed-task results for ancestor reopening, truncation state, or stable error codes, integration must stop because those are locked inputs rather than conditions to hide in UI.
- **Acceptance checks:** verify 960×640 and 1280×800 without an oversized header; no NEXT or duration/session presentation; typical, dense, depth-eight, mixed-state, long-title, empty, only-completed, and no-completed fixtures; inline top-level and direct-child creation; pointer sibling reorder and reparent; keyboard placement to the identical final destinations; valid/invalid/cyclic/depth targets without color; drag cancellation; commit pending/success/stale rollback/recovery; blocked completion recovery; leaf completion transfer; nested reopen with ancestor path; safe refresh; all stable error mappings; visible focus, Narrator names, live status, high contrast, 200% scaling, and reduced motion.
