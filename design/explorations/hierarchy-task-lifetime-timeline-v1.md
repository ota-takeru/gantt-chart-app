# Hierarchy + task-lifetime timeline v1 — independent design exploration

- Exploration status: Selected direction ready for integration planning
- Capability status: Existing inputs implemented / locked; UI composition only
- Product surface: Japanese-first Windows desktop app
- Selection authority: The product owner delegated the recommendation to Codex.
- Selection owner: Codex (explicitly delegated)
- Independence boundary: This exploration uses only the supplied Capability Pack, the two locked capability specifications, design principles, the selected compact-hierarchy exploration, and the capability-locked design-exploration reference. It does not use product code, screenshots, implementation details, the old focus-flow exploration, or a development harness.

## Preserved structure and contract boundary

The selected compact hierarchy remains the interaction foundation:

- one compact top line, with no oversized product title;
- NOW as the only primary task region and no NEXT region;
- a continuous hierarchical row plane;
- completed work in a collapsed secondary register;
- inline top-level and direct-child creation;
- inline rename;
- row-origin completion and reopen;
- collapse/expand;
- pointer drag from the task-identity side;
- sibling seams and parent basins for reorder/reparent;
- an in-surface keyboard placement mode with the same final placements;
- pending, error, and recovery attached to the task origin.

The time axis is a read-only representation over retained timestamps. It does not add planned start/end dates, estimates, dependencies, progress, deadlines, timer controls, session segments, accumulated work duration, or a scheduling engine. A bar is never movable or resizable.

## Exact task-lifetime semantics

### Bar interval

| Current task state | Start | End | Meaning |
|---|---|---|---|
| `queued`, `active`, or `paused` | `createdAt` | current display instant, rendered as **NOW** | The task has existed from creation through the current display instant |
| `completed` with `completedAt` | `createdAt` | committed `completedAt` | The task existed from creation until its latest retained completion instant |
| `completed` without `completedAt` | visible creation point only, when in range | no fabricated end | Retained data is incomplete; the row shows `完了時刻なし` |

The bar length is elapsed task lifetime. It is not percentage complete, estimated duration, planned schedule, urgency, time in the active state, or accumulated work-session time. `actualStartAt`, open/closed sessions, and session events do not participate in the bar.

### State changes and invariants

- Creation commits a start at `createdAt`; the new remaining task has a creation-to-NOW bar. A visually short interval uses a minimum-size marker but retains its exact timestamps.
- Rename does not change the interval.
- Start, pause, and focus switch change lifecycle state but not the lifetime interval because all of those states remain open through NOW. The axis must not imply that a focus switch changes measured work time.
- Completion changes the open NOW endpoint to a closed endpoint at the committed `completedAt`. The UI does not preview an uncommitted completion time.
- Reopening changes the current bar back to `createdAt → NOW`, including for ancestors reopened atomically. Prior completion history remains retained in the backend but is not drawn as an additional session segment or duplicate completed bar.
- Reorder and reparent change row placement only. Bar start, end, and scale position do not change.
- Failed or stale mutations leave both hierarchy and bars at their last committed values.

### Endpoint grammar

- **Creation:** a short vertical start tick with accessible text `作成`.
- **Remaining end:** an open right cap touching the vertical NOW rule, plus text `NOW` in the ruler/readout. The open cap distinguishes continuation from completion without color.
- **Completed end:** a closed square cap with accessible text `完了` and exact `completedAt` in the readout.
- **Missing completed end:** a creation tick plus a barred warning stub and `完了時刻なし`; it never extends to NOW.
- **Zero or sub-pixel completed lifetime:** a diamond-like joined start/end marker at the correct instant, with separate `作成` and `完了` timestamps in text. Minimum visual width does not alter semantic position.

### Current display instant

The display captures NOW at initial successful load and refreshes it at minute boundaries while the app is visible. It does not animate continuously, show seconds, tick audibly, or announce each update. The ruler's exact NOW timestamp is available in the range readout. This keeps remaining bars current without resembling a work timer.

## Default time window and range changes

### Default

- Default duration: rolling **24 hours**.
- Default bounds: `[NOW − 24 hours, NOW]`.
- Default major ticks: six hours; shorter subordinate ticks may be added when width permits.
- Rationale: rendered integration evidence at 960×640 and 1280×800 showed same-day lifetimes collapsing at the right edge in a seven-day default. The product is optimized for small daily tasks, so 24 hours keeps creation-to-NOW differences legible; seven days and longer periods remain one-step presets for older work.

### Range controls

One compact range cluster sits in the top line above the timeline, not in a second header band:

- duration menu: `24時間`, `7日`, `30日`, `90日`, `全期間`;
- `前へ` and `次へ`: shift by 80% of the current duration, preserving 20% temporal context;
- `現在へ`: restore the selected duration with NOW at the right edge;
- `選択を表示`: fit the focused task's full lifetime with 10% padding on each side; for a remaining task, the right bound is NOW;
- exact bound text: for example, `8月16日 14:32 — 8月23日 14:32`.

Range state is presentation-only and is not persisted as task data. If the view is anchored at NOW, changing duration keeps NOW at the right edge. If the user has panned into history, changing duration preserves the center timestamp. `現在へ` is the explicit return. All controls use standard buttons/combobox behavior and work with pointer, keyboard, and screen reader.

Horizontal wheel/trackpad panning may supplement the buttons in the timeline region. It never scrolls the frozen task-identity region or changes the vertical row position. Horizontal panning is not available while a hierarchy drag is active.

## Clipping and out-of-range grammar

| Interval relative to visible range | Bar treatment | Exact recovery |
|---|---|---|
| Starts before left bound, ends inside | Bar begins at left edge with a left continuation chevron | Focus/hover readout gives exact `createdAt`; `選択を表示` reveals full interval |
| Starts inside, ends after right bound | Bar ends at right edge with a right continuation chevron | Readout gives exact completion/NOW; `選択を表示` reveals full interval |
| Spans both bounds | Full-width bar with continuation chevrons on both edges | Readout gives both exact endpoints |
| Entire interval is before the range | Left-edge off-range locator `◁ 範囲外` rather than a false in-range bar | Activating locator or `選択を表示` changes the presentation range to the task |
| Entire interval is after the range | Right-edge off-range locator `範囲外 ▷` | Same fit-to-task recovery |
| Remaining task in a historical window before NOW | Right continuation cue states `NOWは範囲外 →` | `現在へ` returns to the rolling window |
| Completed task lacks an end | Creation tick if visible plus barred warning; otherwise an off-range creation locator | Readout states exact creation and `完了時刻なし`; no endpoint is inferred |

Continuation direction is expressed by shape, text, and accessible name, not color. A clipped cap never looks like a true creation/completion endpoint.

## Lens 1 — Information

### Information that must be visible together

- Task title, hierarchy depth/rails, expansion state, state marker, row actions, and the bar occupying the same row track.
- One shared time ruler, the visible range, the NOW rule when in range, and exact range bounds.
- For the focused row, a compact readout: `作成 8/21 09:14 → NOW 8/23 14:32` or `作成 … → 完了 …`. The readout includes `作業時間ではありません` in its help text.
- During hierarchy movement, the task identity, sibling seam/parent basin, and destination validity. The bar remains reference-only.
- During completion/reopen, the last committed bar and the row-local pending/result state.

### Information that remains deferred

- Exact timestamps are not printed inside every dense bar. They appear for the focused/hovered row, remain in the row's accessible description, and can be opened without changing task data.
- `actualStartAt`, sessions, event segments, queue/source revisions, optimistic versions, and operation identifiers are not shown as timeline content.
- Queued/active/paused remain available as lifecycle state labels on the task-identity side. They all use the same open lifetime endpoint.
- Old completion events for a reopened task are not duplicated on the current lifetime axis.

### Remaining versus completed density

- NOW stays expanded and primary. Its remaining rows and bars are always aligned.
- The completed register stays collapsed by default and reports `完了済み 600（表示期間と交差 18）`.
- Opening the register initially shows tasks whose lifetime intersects the visible range, in retained hierarchy order. Completed ancestors needed to understand a matched path also appear once as context rows, with off-range treatment when appropriate.
- A control within the register changes between `表示期間と交差` and `すべて`. `すべて` uses incremental/virtualized rendering; it does not reorder by completion time.
- Entirely off-range completed work remains discoverable through the total count, `すべて`, its off-range locator, range pan/presets, or `選択を表示`—never by navigating to another page.
- Empty completed history stays a single quiet disclosure line. Only-completed data leaves NOW visibly empty with top-level creation available and the completed register immediately below.

### Information tradeoff

Exact timestamp text for every row would improve literal visibility but destroy compact scan density at 960px. The selected structure therefore keeps the shared axis and endpoint shapes continuously visible while showing exact timestamps for the focused row and exposing them programmatically for every row.

## Lens 2 — Interaction

### Coexistence of task and timeline actions

- The task-identity side remains the origin for select, expand/collapse, create child, rename, complete, reopen, drag pickup, and keyboard `移動`.
- A dedicated drag handle is entirely inside the identity cell. Pointer movement cannot begin from a lifetime bar.
- Lifetime bars are read-only inspection targets. They have no resize handles and never use a move cursor. Pointer hover or click focuses the corresponding row and opens the exact lifetime readout.
- The focused tree row receives its temporal readout through an accessible description, avoiding one extra tab stop per bar in a 120-row tree.
- `時間軸へ` moves keyboard focus from the compact task surface to the range control cluster; returning focus restores the same task identity.

### Hierarchy placement over the timeline

- Pickup suppresses timeline panning and dims bar emphasis without hiding it.
- Sibling seams and parent basins appear only in the identity region, where hierarchy meaning is unambiguous. A thin continuation guide may cross the timeline cell to keep row alignment, but it is not a drop target.
- Pointer and keyboard placement retain the selected design's exact `target parent + optional before sibling` destinations.
- `Esc` cancels placement. Stale placement clears the preview, safely refreshes the forest and bars, retains task focus, and requires destination reselection.
- Successful move/reparent changes the task's row and aligned bar together; the bar's temporal position and endpoints remain identical.

### Lifecycle transitions

- Create pending shows no speculative committed timestamp. Success inserts the new row with a creation marker at the committed `createdAt` and open NOW cap.
- Rename pending leaves the bar unchanged; success changes only the title.
- Completion pending leaves the open NOW bar as the last committed truth. On success, the endpoint becomes a closed `completedAt` cap and the task transfers to the completed register. A status message states `作成から完了までを表示`.
- Blocked completion leaves the bar and row unchanged; `最初の未完了へ` expands and focuses the recovery descendant.
- Reopen pending leaves the completed bar unchanged. Success returns the target and reopened ancestor path to NOW with open NOW caps. No animation or copy suggests that a timer started.
- Start, pause, or focus switch—if surfaced by the surrounding lifecycle UI—can change the row's state label but cannot change bar geometry.

### Pending, errors, recovery, and undo

- Existing create/move/complete/reopen pending and stable-error choreography remains attached to the identity side. The timeline always shows the last committed snapshot until success.
- Initial loading uses aligned identity and timeline skeleton rows. Safe refresh retains the last committed grid, marks `更新中`, and prevents placement commit until the new forest is complete.
- Load or persistence failure retains the last committed bars and marks them potentially stale. Mutation and temporal claims do not advance.
- Missing `completedAt` is a retained-data warning, not a recoverable edit in this capability. No fake end, NOW extension, or UI repair is offered.
- Time-range changes can be reversed with `現在へ` or the prior preset/pan, but they are view state rather than domain undo.
- There is no post-commit task undo. A successful move can only be intentionally reversed with a new move; completion/reopen use their locked inverse transitions where valid.

## Lens 3 — Layout

### Shared row grid

- Identity and timeline are cells in one logical row grid, not two separately scrolling lists. A single vertical scroll owner guarantees that title, hierarchy rails, pending messages, and bar cannot drift apart.
- Row height is determined by the identity content and applied to the timeline cell. A two-line long title therefore expands its own bar lane by the same amount.
- The ruler is sticky above the timeline columns. The compact top line remains one line at ordinary width and wraps into a compact two-line control strip only at high zoom—not into a display header.
- The identity region is frozen during horizontal time pan. The timeline region clips/scrolls horizontally while rows remain vertically aligned.

### Width at supported hosts

- At 1280×800, the initial divider allocates approximately 500px to task identity and the remainder to the timeline.
- At 960×640, it allocates approximately 460px to identity and approximately 500px to the timeline, sufficient for seven daily columns.
- A keyboard- and pointer-operable divider may adjust the presentation split within safe minimums: 360px identity and 360px timeline. The split does not mutate task data.
- Depth after level four uses compressed indentation plus a focused full-path label, preserving title width at depth eight.
- Row actions may condense into one always reachable action trigger at 960px, but child creation, rename, completion, movement, and collapse remain keyboard available.

### Dense and completed rendering

- 120 remaining rows and 600 completed rows require windowed or incremental rendering across the single logical grid.
- The ruler, vertical tick grid, and NOW rule render once for the viewport, not as 720 independent decorations.
- Completed history starts collapsed and interval-filtered when expanded; `すべて` remains possible without allocating every bar at once.
- Horizontal range changes preserve vertical scroll and focused task by identity. Opening completed history does not move NOW into a separate page or tab.

## Lens 4 — Visual

### Monochrome-first structure

- Hierarchy rails, row baselines, time ticks, bar bodies, true endpoints, clipped endpoints, NOW, focus, and invalid drop targets must be distinguishable in grayscale and Windows high contrast.
- Bars are low-ink rails rather than filled progress blocks. A filled rectangle would too readily imply percentage or scheduled occupancy.
- Remaining and completed share the same bar body; their endpoint grammar carries the current temporal state. Completed rows also retain the explicit `完了` identity marker.
- Grid lines are subordinate to text and bars. Major ticks use stronger weight than minor ticks; neither becomes a spreadsheet cage.

### Semantic color after selection

- Neutral hierarchy and timeline structure dominate.
- One accent may mark focus, the NOW rule, and valid placement, but each retains non-color shape/text.
- Completed state may use a muted semantic tone only alongside the closed cap and `完了` label.
- Warnings/errors use a semantic error color only alongside barred geometry and text.
- Lifecycle states do not receive arbitrary multicolor bars; bar length and tone never imply progress.

### Motion and continuity

- Completion may morph the open NOW cap into a closed completion cap and transfer the row to completed history, but status text and focus transfer carry the result when reduced motion is enabled.
- Reopen performs the inverse continuity without replaying historical segments.
- Range pan and zoom may interpolate briefly; reduced motion changes bounds immediately while retaining exact bound text and selected-row readout.
- The NOW marker advances discretely at minute boundaries without animated crawling.

## Three structural directions

All directions use the exact lifetime semantics above and begin in monochrome. They differ in how hierarchy and time share space, what the user reads first, and how completed history is grouped.

### Direction A: Synchronized lifetime grid

- **Thesis:** Preserve the living outline as the task identity rail and add one parallel, globally aligned lifetime axis; each row becomes a single hierarchy-plus-time statement.
- **Spatial model:** A frozen hierarchy identity region on the left and a horizontally pannable timeline region on the right share one row grid and vertical scroller. The completed register remains collapsed beneath NOW and, when opened, uses the same ruler and columns.
- **Primary object:** A task row with two inseparable readings—where the task belongs and how long it has existed.
- **Action origin:** All mutations originate on the identity side. Bars and clipping locators provide inspection/range-fit only. Range changes originate in the compact ruler controls.
- **State/result expression:** Pending and errors stay beside the task title while the bar remains last-committed. Completion seals the NOW endpoint; reopen restores it; movement relocates the whole aligned row without changing bar geometry. Cancellation and stale recovery preserve the committed row/bar pair. No task undo is invented.
- **Temporal/history representation:** One shared axis shows creation-to-NOW for remaining and creation-to-completion for completed tasks. Completed history is a secondary, interval-filtered foldout below NOW, never another page.
- **Domain signature:** **Open-to-NOW / sealed-at-completion lifetime rails** combine a creation tick, read-only lifetime rail, explicit open or closed endpoint, and clipping chevrons. Unlike a planning Gantt, the end grammar reports current lifecycle truth rather than editable schedule.
- **Capability traceability:** Hierarchy S1–S8 retain their row origins and atomic transitions; S9 remains two nonduplicated projections; move/reparent preserves timestamps. Lifecycle create/rename/state changes/complete/reopen map to the exact interval rules without using actual start or sessions.
- **Risks and scale concerns:** The split reduces title width at 960px; horizontal panning must not detach bars; a familiar Gantt silhouette may invite schedule/progress assumptions; dense completed history requires filtering and virtualization.
- **Typical-pattern rationale:** The frozen identity rail resembles a split table, but it is functionally necessary to keep hierarchy readable while time pans horizontally. Without it, deep Japanese titles would leave the viewport or bars would lose task association. It is not a generic sidebar: it shares row geometry, selection, pending state, and vertical scroll with the timeline. Cards, tabs, modal editors, and dashboard summaries remain unnecessary.

Monochrome sketch:

```text
NOW 8  ＋タスク   完了済み 42 ▸   │ 期間 24時間  ◀ 前へ  次へ ▶  現在へ
─────────────────────────────────┼────────────────────────────────────
                                 │  8/18   8/19   8/20   …   NOW
≡ ▾ API障害のフォローアップ      │ ◁━━━━━━━━━━━━━━━━━━━━━━━━○
│  ≡ 原因の仮説を整理する        │       │━━━━━━━━━━━━━━━━━━○
│  │  ≡ DB接続数のログを確認     │             │━━━━━━━━━━━━○
│  │    完了 1件 ▸               │
│  ≡ 顧客向け回答を作る          │                    │━━━━━━━○
≡ ▸ リリース準備                 │          │━━━━━━━━━━━━━━○
─────────────────────────────────┼────────────────────────────────────
完了済み 42（期間内 6）▸         │

│ = 作成       ○ = NOWへ継続       ■ = 完了       ◁ = 左へ継続
```

### Direction B: Under-row temporal ribbons

- **Thesis:** Keep hierarchy titles nearly full width and place each lifetime directly beneath its task as a second-line temporal ribbon aligned to a shared ruler.
- **Spatial model:** The living outline occupies the full row width. Each expanded task row has an identity/action line followed by a shallow, globally aligned time ribbon. A sticky ruler spans the ribbon origin. Completed history remains a folded continuation using the same two-line grammar.
- **Primary object:** The hierarchical task label first, followed immediately by its temporal footprint.
- **Action origin:** Task mutations remain on the upper identity line; bar inspection and range controls use the lower ribbon and ruler. Drag seams appear between the two-line row blocks.
- **State/result expression:** Pending/error occupies the identity line without shifting the ribbon's temporal meaning. Completion changes the ribbon endpoint and moves the two-line block to completed history; movement moves the entire block. Cancellation removes seams; no undo is added.
- **Temporal/history representation:** A shared global ruler aligns all under-row ribbons; completed ribbons appear only when the secondary register opens.
- **Domain signature:** **Task couplets** pair a verbal hierarchy line with a temporal line, making exact readout easy without a vertical divider.
- **Capability traceability:** All hierarchy actions remain local; lifetime semantics are exact and aligned. The design particularly protects long titles and depth-eight ancestry.
- **Risks and scale concerns:** It nearly doubles vertical consumption, weakening the compact hierarchy and showing far fewer tasks at 640px height. Repeated eye movement between text line and ribbon slows cross-row comparison. Drag destination blocks become taller and less dense.
- **Typical-pattern rationale:** No cards, tabs, sidebars, or modals are used. The two-line row is justified only by title-width preservation; it is rejected as the recommendation because vertical density is a stronger constraint for 120 remaining tasks.

Monochrome sketch:

```text
NOW 8   ＋タスク                          8/18  8/19  …  NOW
────────────────────────────────────────────────────────────
≡ ▾ API障害のフォローアップ                         □ 完了
        ◁━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○
│  ≡ 原因の仮説を整理する                           □ 完了
              │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○
│  │  ≡ DB接続数のログを確認                        □ 完了
                         │━━━━━━━━━━━━━━━━━━━━━━━━━━━○
────────────────────────────────────────────────────────────
完了済み 42（期間内 6）▸
```

### Direction C: Branch horizon bands

- **Thesis:** Each top-level branch is a temporal unit with its own repeated horizon, making subtree history self-contained while all horizons share one range.
- **Spatial model:** NOW is divided into top-level branch bands. Each band begins with the root identity and a compact repeated ruler, followed by aligned descendant rows and bars. Top-level creation sits between bands; completed descendants unfold within a secondary completed sub-band, while an all-completed register remains at the end for roots no longer in NOW.
- **Primary object:** A top-level branch and the lifetime relationships within it.
- **Action origin:** Child actions and movement begin inside a band. Cross-parent reparent uses the existing identity-side parent basins across bands. Range changes update every band simultaneously.
- **State/result expression:** Pending and errors are band-local. Movement between roots transfers an intact row/subtree between bands while preserving its bar. Completion may move a fully completed root into the end register. Cancellation restores the source band; no undo is invented.
- **Temporal/history representation:** The same visible bounds repeat per branch, reducing long vertical guide lines and making branch-local comparison strong. Completed work can be unfolded in branch context.
- **Domain signature:** **Branch horizons** present the root as a temporal frame for descendants without computing aggregate or planned branch duration.
- **Capability traceability:** Reparent and subtree preservation remain explicit; create/complete/reopen keep branch context; bars retain exact task-level semantics. No aggregate parent bar is fabricated.
- **Risks and scale concerns:** Repeated rulers consume vertical space, cross-branch bar comparison is weaker, roots with many descendants dominate, and completed children folded into NOW risk making completed work compete with remaining work. The structure resembles section cards unless borders/material are aggressively avoided.
- **Typical-pattern rationale:** Branch bands are not cards: they use no container elevation and exist to repeat temporal context after long vertical spans. Without the repeated ruler, descendants far from the top would lose time orientation. The pattern is not recommended because the continuous grid preserves comparison with less structure and less vertical overhead.

Monochrome sketch:

```text
API障害のフォローアップ        │ 8/18  8/19  8/20  …  NOW
───────────────────────────────┼──────────────────────────────
  原因の仮説を整理する         │    │━━━━━━━━━━━━━━━━━━━━○
    DB接続数のログを確認       │          │━━━━━━━━━━━━━━○
  顧客向け回答を作る           │                │━━━━━━━━○

リリース準備                   │ 8/18  8/19  8/20  …  NOW
───────────────────────────────┼──────────────────────────────
  レビュアーへ依頼する         │       │━━━━━━━━━━━━━━━━━○
```

## Capability traceability matrix

| Locked behavior / input | Timeline requirement | Selected Direction A mechanism | Acceptance evidence |
|---|---|---|---|
| Hierarchy S1 / lifecycle S1 create | Start at committed `createdAt`; remaining ends at NOW | New aligned row appears only after commit with start tick and open NOW cap | Exact readout matches snapshot; no planned fields or speculative timestamp |
| Rename | Title changes; lifetime does not | Identity cell updates while bar geometry stays fixed | Before/after bar endpoints are identical |
| Queued, active, paused | All are remaining and extend to NOW | Same open endpoint; state label remains on identity side | State transitions do not move start/end or create segments |
| Lifecycle start / pause / switch | No session or active-work encoding | Bar remains `createdAt → NOW` | Switching focus changes no bar geometry and opens no timeline detail |
| Hierarchy S2 child creation | Child row/bar aligns at committed depth | Inline child editor commits into shared grid | Child starts at its own `createdAt`, not parent's start |
| Hierarchy S3 sibling reorder | Bar moves rows but retains time coordinates | Sibling seam on identity side relocates full row | Bar x-position/endpoints identical after reorder |
| Hierarchy S4 reparent subtree | Every subtree bar retains interval and internal order | Parent basin moves aligned row blocks | All moved task bars retain exact timestamps |
| Hierarchy S5 invalid move | No partial row or bar movement | Bar stays last-committed; barred destination on identity side | Cycle/depth rejection leaves hierarchy and axis unchanged |
| Hierarchy S6 / lifecycle completion | Remaining NOW endpoint becomes committed completion | Open cap seals only after success; row transfers to completed register | Endpoint equals `completedAt`; no next task starts; no duration/progress claim |
| Hierarchy S7 blocked completion | Parent and all bars remain unchanged | Recovery stays beside identity; first unfinished descendant is focused | No endpoint seals and no row transfers |
| Hierarchy S8 / lifecycle reopen | Target and completed ancestor path return to NOW | Closed caps become open NOW caps atomically in revealed NOW rows | Placement unchanged; prior session/completion history is not drawn as segments |
| Hierarchy S9 separate projections | Each task/bar appears once | NOW grid plus one secondary completed register | Mixed fixture has unique task IDs and no duplicated reopened history |
| Move/reparent invariant | Placement is orthogonal to time | Time cell is read-only and not a drag origin | Moving cannot alter `createdAt` or `completedAt` readouts |
| Remaining task created before range | Continuation and exact creation remain clear | Left clip chevron plus focused exact readout | Grayscale and Narrator identify `左側から継続` |
| Completed task outside range | Task remains discoverable | Register total/`すべて`, off-range locator, and fit-to-task | User reaches bar without leaving page or mutating task |
| Completed missing end | No fabricated completion or NOW endpoint | Creation tick/warning stub only | UI never draws interval beyond known creation |
| Current display instant | NOW is current but not a timer | Minute-resolution static rule/cap update without seconds or announcements | No continuous animation; exact NOW readout updates on minute boundary |
| Time range | Pure presentation state | Presets, 80% pan, current reset, fit selected | Range changes produce no domain calls or task revision changes |
| Failed/stale mutation | No partial temporal result | Last committed row/bar persists through refresh/recovery | Injected failure changes neither endpoint nor placement |

## Scale and accessibility risks

| Risk | Impact | Required mitigation | Verification |
|---|---|---|---|
| 960×640 split width | Deep hierarchy and seven-day axis compete | Approximately 460/500 initial split; safe resizable divider; compressed indentation after depth four | Depth-eight Japanese fixture retains usable title/actions and daily tick labels |
| 120 remaining / 600 completed | DOM/grid cost and visual noise | One virtualized logical grid; completed collapsed and interval-filtered; ruler/ticks rendered per viewport | Scroll, range, expand, move, complete, and reopen remain responsive without row drift |
| 5,000 hierarchy limit / 10,000 lifecycle scale | A partial forest makes row association unsafe | Honor forest truncation state; disable hierarchy mutations; do not imply unshown bars are a complete view | Truncation fixture shows persistent warning and no active placement targets |
| Long titles up to 240 characters | Variable heights misalign bars | Identity cell owns row height; timeline cell shares that grid row; two-line default and on-focus expansion | Repeated resize and zoom never produce vertical bar/title drift |
| Depth eight | Indentation consumes identity width | Compressed indentation plus focused ancestry readout | Full path and title remain programmatically available at 200% zoom |
| Horizontal panning | Task/bar association can be lost | Frozen identity rail, single vertical scroller, visible range readout | Keyboard/pointer pan keeps the same row aligned and focused |
| Familiar Gantt implies planning/progress | Users misread lifetime as editable schedule | Read-only thin rails, no handles, explicit legend `作成から現在/完了まで`, exact endpoint grammar | First-use comprehension test distinguishes lifetime from work duration and planned dates |
| Remaining and completed look alike | Current versus past becomes ambiguous | Open NOW cap vs closed completion cap plus explicit state text/register separation | Grayscale and high-contrast review identifies each endpoint without color |
| Clipping confused with true endpoint | Users infer false creation/completion time | Chevron clip shape, edge text, exact readout, fit-to-task recovery | Five clipping cases are correctly narrated and visually distinct |
| Very short lifetime | Bar disappears at coarse scale | Minimum visual marker centered on true instant; exact timestamps remain authoritative | Same-minute completed task remains discoverable without false width semantics |
| Missing completed end | UI may silently extend to NOW | Warning stub only and persistent text `完了時刻なし` | Snapshot with missing end never renders a completed interval |
| One focus stop per bar | Keyboard traversal becomes unusable at dense scale | Row focus owns temporal description; bar is not a separate default tab stop | 120-row keyboard pass has one task navigation sequence, not doubled stops |
| Pointer bar conflicts with task drag | Accidental schedule editing or hierarchy movement | Drag begins only from identity handle; bars are inspection-only; panning disabled during drag | Pointer test cannot move/resize a bar and cannot start task drag from it |
| Screen-reader row/time association | Timeline becomes an unlabeled visual chart | Treeitem owns title/state/level plus described lifetime; ruler has named bounds; clipped state is announced | Narrator reads task, hierarchy level, created/end timestamp, and clipping status together |
| High contrast / color deficiency | NOW, completion, warning, and clipping collapse | Shape, line style, text, system colors, and endpoint labels carry meaning | Windows high-contrast and grayscale snapshots preserve distinctions |
| 200% zoom | Top controls wrap or obscure rows | Compact two-line control fallback; minimum split widths; no oversized title | All range/task actions remain available at 960×640 and 200% zoom |
| Reduced motion | Completion/reopen/move loses continuity | Persistent status, focus transfer, endpoint shape, and unchanged timestamps; immediate transitions | Entire workflow remains understandable with animation disabled |
| NOW minute updates | Repeated announcements or perceived timer | No live-region announcement for clock ticks; no seconds; discrete visual update only | Narrator remains silent across minute update and open bar still meets NOW |
| Completed-history density | Past work competes with daily work | Default collapsed; intersecting-lifetime filter; retained-order `すべて` option | First-glance review finds NOW primary; all completed tasks remain reachable in place |

## Anti-template rationale

The selected direction borrows only the useful alignment logic of a Gantt chart, not its scheduling assumptions:

- Bars are derived, read-only lifetime rails. There are no draggable ends, planned dates, duration estimates, progress fills, dependency arrows, milestones, baselines, or resource lanes.
- The left region is the already-selected living outline, not a generic project-plan table. It preserves inline child creation, rename, completion, hierarchy rails, drag handle, placement seams, parent basins, and keyboard placement.
- The timeline is not a restored HISTORY/NOW/NEXT composition. NOW remains the sole primary task surface; time is an aligned reading dimension, and completed history is a subordinate foldout on the same page.
- The frozen identity rail is functionally justified: horizontal time pan would otherwise sever the task/bar relationship. It shares rows and vertical scroll with the timeline, so it is not a navigation sidebar.
- The resizable divider exists only to balance deep Japanese titles against temporal detail at 960px. Without it, one of the two locked readings becomes unusable. It does not create independent panes or state.
- No cards or dashboard summary tiles are used because they would break sibling order, row alignment, and continuous time comparison.
- No modal or tab is used for range or exact-time inspection. Both require the row and axis to remain visible together.
- The domain signature—creation tick, open NOW cap, sealed completion cap, and continuation chevrons—makes current lifecycle truth understandable and actively resists the usual planned-duration interpretation.

## Direction selection

- **Selected direction:** A — Synchronized lifetime grid
- **Selection owner:** Codex, by explicit delegation from the product owner
- **Why it was selected:** It preserves the selected compact living outline with the least structural disruption, gives every visible task a directly aligned temporal reading, supports genuine cross-row Gantt comparison, and keeps pointer hierarchy actions safely separate from read-only time. The open-NOW/sealed-completion grammar communicates exact task lifetime without implying schedule, progress, or active-work duration. A single logical grid also provides the strongest route to dense-scale alignment, virtualization, screen-reader association, and horizontal panning at 960px.
- **Rejected directions:** B protects title width and contributed the focused exact-time couplet idea, but nearly doubles row height and undermines the compact 640px work surface. C strengthens branch-local context and contributed repeated orientation for long trees, but repeated rulers consume space, weaken cross-branch comparison, and risk turning completed branch history into a peer of NOW.
- **Structural decisions now fixed:** retain the compact one-line product controls and selected living outline; no NEXT and no oversized title; add a frozen identity region plus one parallel read-only timeline in a single logical row grid; use one vertical scroll owner; use a default rolling 24-hour window ending at NOW; provide 24-hour/7-day/30-day/90-day/all presets, 80% pan, current reset, and fit selected; define creation tick, open NOW cap, closed completion cap, missing-end warning, and directional clipping grammar; keep all task mutations on the identity side; keep bars inspection-only; retain pointer and keyboard hierarchy placement; keep completed history collapsed by default and interval-filtered when opened; use exact focused-row timestamps and accessible descriptions; never draw sessions, planned dates, progress, or old completion segments for reopened work.
- **Visual decisions still open:** exact identity/timeline split within the defined minimums; Japanese typeface and scale; row height; bar rail thickness; start/end/clip glyph shapes; major/minor tick weights; semantic accent/completed/error colors; focus-ring styling; tooltip/readout material; reduced-motion transition duration.
- **Integration questions:** No missing capability is identified. Integration must stop rather than invent data if the adapter cannot provide `createdAt`, current-state `completedAt`, task identity/state/version, hierarchy placement/depth, full-forest truncation state, or changed tasks for ancestor reopening. The absence of `completedAt` on a completed task is explicitly representable as a warning and does not authorize a fabricated value.
- **Acceptance checks:** verify exact `createdAt → completedAt` and `createdAt → NOW` semantics; confirm `actualStartAt` and sessions never affect geometry; validate create, rename, state change, complete, reopen, ancestor reopen, reorder, reparent, stale failure, and blocked completion; test all five interval clipping/out-of-range cases and missing completion end; test default/preset/pan/current/fit-selected ranges; prove range state makes no domain mutation; confirm bars cannot be dragged or resized; preserve pointer/keyboard hierarchy placement and safe cancellation; verify identity/bar alignment with two-line titles, depth eight, collapse, virtualization, and horizontal pan; exercise 960×640, 1280×800, 120/600 density, only-completed, only-remaining, empty, long title, reduced motion, 200% zoom, grayscale, Windows high contrast, and Narrator row/time association; first-glance review must identify NOW as primary and lifetime—not schedule or progress—as the bar meaning.
