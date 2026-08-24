# Design exploration: application update delivery v1

## Exploration boundary

- Capability source: locked `application-update-delivery` v1.0 and Capability Pack v1.
- Established context: the product is a dense, calm, time-oriented work surface; task rows and their temporal alignment remain primary.
- Independence: this exploration uses only the locked capability, its Capability Pack, the design principles, and the design-exploration method. It does not derive controls from implementation, tests, or a development harness.
- Fidelity: all theses are monochrome structural proposals. Color, shadow, decorative material, and final motion are deliberately unresolved.
- Human constraint: the user has selected the unobtrusive availability notification with **Later** and explicit **Update and restart**, so the direction that best preserves uninterrupted work is selected below.

## Four-lens notes

### Information lens

- The default workspace should remain unchanged while the startup check runs and when the app is up to date. A quiet result is evidence of normal operation, not a user task.
- Availability needs only the target version and the two timing choices at first glance. Release notes and publication time are useful supporting context, but both may be absent and neither should enlarge the resting notice by default.
- The representation must distinguish four kinds of information without relying on color:
  - **Current:** the running version and the fact that existing work remains usable.
  - **Future:** the candidate version that can be installed.
  - **In progress:** received amount and stage, such as downloading or installing.
  - **Outcome:** installed/ready, failed with a stable recovery path, or relaunch not completed.
- “Available” must read as optional software maintenance, not as a task-domain deadline, schedule exception, or urgent alert.
- Unknown download size needs a determinate-free expression. When total size becomes known, received/total and a progress indicator can appear. Update frequency should be throttled visually and for assistive technology.
- Several paragraphs of notes require a contained reading treatment with an explicit close/back path; they must not permanently consume row-aligned workspace width.
- Signature verification should be reflected through trustworthy outcome wording and failure handling, not a decorative shield or an unverifiable security claim.
- Database migration is not a choice inside the availability surface. It belongs to safe startup: success remains silent; `migration-failed` and `schema-too-new` prevent workspace entry and must identify that user data was not partially changed. The update notice must not imply rollback, because rollback is out of scope.

### Interaction lens

- A startup check begins without focus capture, without blocking workspace loading, and without an animated control that competes with active editing.
- Availability may be deferred with **Later**. Deferral dismisses the notice and preserves the exact work surface, including inline editing or an open memo.
- **Update and restart** is the explicit origin of the apply-and-relaunch sequence. Its label states the interruption before the user commits. No download, install, or relaunch begins merely because the candidate is visible.
- Before that explicit action, optional notes may be disclosed without changing capability state. Closing notes returns focus to the disclosure origin.
- During downloading/installing, the operation surface remains visible but does not trap focus. It reports stage and progress. The locked capability offers no cancellation or undo for an in-flight apply, so the design must not invent either.
- Failure keeps the workspace open. `check-failed` offers **Check again** and dismissal; `download-failed` offers **Try update again** and **Later**; `install-failed` offers **Check again** and dismissal. A relaunch failure states that installation may already be complete and asks the user to restart manually.
- Successful install is the only point from which relaunch may proceed. The initiating **Update and restart** action supplies explicit intent for the sequence; the UI must never present “restarting” before apply success.
- Keyboard focus remains where the user was working when a passive notice appears. The notice enters the reading order and can be reached normally; no automatic focus move occurs. Assertive focus/announcement is reserved for a failure that requires attention, and even then the workspace is not closed.
- “Later” is postponement, not cancellation or undo. No update history, rollback control, or fake reversal affordance is shown.

### Layout lens

- The 80–200 row workspace, history/NOW alignment, and active edit geometry must not reflow when update state changes.
- Availability and operation feedback should occupy a bounded overlay region at a workspace edge, outside the primary row-reading path and clear of the compact top line’s core controls. It should cover the smallest practical area and be dismissible whenever recovery semantics allow.
- The selected structure should retain one stable location through available, downloading, installing, and failure states so state changes feel causally connected to the initiating action.
- At 960 × 640 and 200% zoom, the notice becomes a wider, bottom-attached strip within viewport margins rather than shrinking controls or overflowing. Release notes use a separate, bounded reading layer only on request.
- Long notes scroll inside their reading layer; the underlying task surface neither reflows nor loses its place.
- A safe-start migration failure is structurally separate: because the workspace cannot open, it uses a full-window startup guard rather than masquerading as an update notice over unavailable content.

### Visual lens

- Monochrome hierarchy comes from position, border, typography, labels, and progress geometry. Availability, progress, success, and failure remain distinguishable in grayscale and forced-colors mode.
- The candidate version is the leading text; maintenance context and optional metadata are secondary; actions are plainly labeled text controls. **Update and restart** has stronger weight than **Later**, but both remain visible and keyboard reachable.
- Progress has a textual stage plus numbers where known. The bar is redundant, never the sole state carrier.
- Motion is limited to a restrained entrance and state replacement that respects reduced-motion settings. No pulsing, bouncing, countdown, or urgency animation.
- Final semantic color may later reinforce failure, success, and action hierarchy, but it may not encode state on its own or borrow colors used for task status and temporal meaning without explicit review.
- Borders must survive forced colors; visible focus must not depend on box shadow; controls need adequate target size and separation at 200% zoom.

## Monochrome structural theses

### Direction A: Edge operation receipt

- Thesis: Treat software maintenance as a compact, non-domain operation receipt that appears at the edge of the work surface, asks when interruption is acceptable, and then stays in that same place to report the consequence of the chosen action.
- Spatial model: A bounded notice overlays a low-conflict viewport edge without changing row or timeline geometry. Its resting form is compact. An optional release-notes reading layer opens only on request. At narrow effective widths it becomes a bottom-attached strip. Startup migration failures use a separate full-window guard because no workspace is available.
- Primary object: The transition from the running version to one trusted candidate version.
- Action origin: The availability receipt itself: **Later** preserves work; **Update and restart** explicitly starts the apply/relaunch sequence. A secondary **Release notes** disclosure appears only when notes exist.
- State/result expression: The receipt changes in place from available to downloading to installing to restarting. Text labels accompany a determinate or indeterminate progress form. Recoverable failures replace progress with the stable error meaning and the appropriate retry/check action. Relaunch failure explains manual restart. There is no cancellation or undo affordance because the capability provides neither.
- Temporal/history representation: A short forward sequence—`Current version → Candidate → Downloading → Installing → Restarting`—is expressed by the current stage and a compact textual stage line, not by a persistent history. Past attempts are not retained. “Later” returns to present work without creating an application task.
- Domain signature: The **version handoff line** keeps current and candidate versions on one axis (for example, `0.2.0 running → 0.3.0 available`) and then replaces the arrow label with the active stage. It makes “checking is not applying” and “current versus future” legible without turning the update into a task or timeline item.
- Capability traceability: Covers quiet S1; candidate metadata and deferral in S2; explicit apply, progress, successful install, and relaunch ordering in S3; check/apply/relaunch recovery in S4; and the no-reflow, no-auto-action, non-color invariants. Safe-start handling covers the user-visible boundary of S5/S6 without placing migration inside the update choice.
- Risks and scale concerns: The receipt could cover late columns or transient controls if placement is naive. Long translated labels and 200% zoom can force stacking. Repeated byte events could cause visual and screen-reader chatter. A notice that persists too aggressively may feel like an alert; one that disappears too quickly may be missed.
- Typical-pattern rationale: This is notification-like because the capability becomes relevant asynchronously while another task owns the screen. Without a bounded overlay, the workspace would reflow or an active edit would be interrupted. A dashboard, sidebar, or permanent settings page would falsely elevate maintenance into a primary work object; a modal would capture attention before the user has chosen interruption. The bounded receipt preserves optionality, dense scale, and the locked distinction between availability and urgency.

Monochrome sketch:

```text
                                                    ┌──────────────────────────────┐
  unchanged task rows and aligned time surface      │ 0.2.0 running → 0.3.0 ready  │
                                                    │ Release notes                 │
                                                    │ [Later] [Update and restart]  │
                                                    └──────────────────────────────┘

                                                    ┌──────────────────────────────┐
                                                    │ Updating to 0.3.0             │
                                                    │ Downloading 38 MB of 112 MB   │
                                                    │ [───────────────             ]│
                                                    └──────────────────────────────┘
```

### Direction B: Top-line maintenance waypoint

- Thesis: Make update availability a quiet waypoint in the compact top line; the user deliberately opens a maintenance lane that replaces only the top-line utility region while the task surface remains visible below.
- Spatial model: A small textual waypoint appears in the top line. Activating it expands a full-width, single-row maintenance lane immediately below the top line, pushing the workspace down only while open. Notes unfold as additional rows in that lane.
- Primary object: The application’s maintenance state, represented as a waypoint adjacent to existing global status.
- Action origin: The user first opens the waypoint, then chooses **Later** or **Update and restart** from the expanded lane.
- State/result expression: While applying, the expanded lane remains pinned and expresses stage, progress, and retry. It collapses after dismissal or terminal handoff. Errors re-open or retain the lane. No undo is shown.
- Temporal/history representation: A linear stage ruler within the lane—available, downloading, installing, ready—shows sequence. Completed steps acquire non-color marks; it is a current-session sequence, not durable history.
- Domain signature: The **maintenance waypoint** separates a future application version from the NOW line and task schedule by placing it in global chrome, preventing it from reading as project time.
- Capability traceability: Covers S1–S4 and state ordering, explicit intent, progress, and recovery. It cleanly separates application maintenance from task-domain alerts. Startup migration failures still require a separate guard.
- Risks and scale concerns: Opening the lane reflows the time surface, which can shift an active edit and violate the strongest density constraint. Long notes could make the top region dominant. A tiny closed waypoint may be difficult to discover or target at zoom, while an always-open lane becomes persistent chrome.
- Typical-pattern rationale: A top-line status pattern is functionally grounded in global application scope. It avoids cards and modals, and its alignment can convey ordered stages efficiently. It is rejected for selection because the expanded lane changes the vertical origin of row/time content and adds an extra interaction before the accepted choices.

Monochrome sketch:

```text
  Project                                  Application update: 0.3.0 [open]
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 0.2.0 → 0.3.0   Notes   [Later]                 [Update and restart]  │
  └────────────────────────────────────────────────────────────────────────┘
  task rows and time surface begin lower while the lane is open
```

### Direction C: Interruption checkpoint

- Thesis: Treat updating as an explicit interruption checkpoint: availability opens a focused decision layer that freezes interaction with the workspace until the user postpones or commits.
- Spatial model: A centered modal checkpoint sits over a dimmed but spatially stable workspace. Version transition, metadata, notes, and actions share one reading column. Progress and failures remain in the checkpoint.
- Primary object: The decision to interrupt the current work session.
- Action origin: **Later** or **Update and restart** in the checkpoint; the layer receives focus on appearance.
- State/result expression: The checkpoint changes from decision to progress to failure/recovery. Progress is prominent; failures retain focus and offer the appropriate retry. No cancellation or undo is offered unless supplied by the capability.
- Temporal/history representation: A concise “before / after” comparison plus a vertical list of stages presents the future session boundary. No past-attempt history is kept.
- Domain signature: The **session boundary** explicitly labels “work continues now” versus “app restarts after install,” making interruption consequences unmistakable.
- Capability traceability: Strongly supports candidate comprehension, explicit consent, state ordering, release-note reading, failure recovery, keyboard containment, and successful-install-before-relaunch. It can accommodate long notes at minimum size.
- Risks and scale concerns: It blocks inline editing merely because availability was discovered, contradicting non-blocking startup and user control over interruption. Automatic focus movement is disruptive. At 200% zoom, the checkpoint needs internal scrolling and can hide the spatial context it claims to preserve.
- Typical-pattern rationale: A modal is defensible only when a decision must precede all other work or when destructive consequences require immediate acknowledgement. This capability explicitly permits postponement and says availability is not urgency, so forced modality is unnecessary. The direction is retained as a contrast because it offers the clearest consent boundary, but that benefit does not outweigh interruption.

Monochrome sketch:

```text
  ┌──────────────────────────────────────────────────────────────────────┐
  │ dimmed, non-interactive workspace                                   │
  │          ┌─────────────────────────────────────────────┐             │
  │          │ Restart checkpoint                          │             │
  │          │ 0.2.0 running → 0.3.0 available            │             │
  │          │ release notes / publication details        │             │
  │          │ [Later]                [Update and restart] │             │
  │          └─────────────────────────────────────────────┘             │
  └──────────────────────────────────────────────────────────────────────┘
```

## Capability traceability matrix

| Locked scenario / invariant | Required observable meaning | Direction A | Direction B | Direction C |
|---|---|---|---|---|
| S1: up to date | Workspace loads; no maintenance task, mutation, or persistent result appears | Silent | Silent waypoint | Silent; no checkpoint |
| Startup check does not block | Existing work becomes usable without focus capture | No visible checking state by default | Closed waypoint may expose neutral checking text | Weak fit if checking opens layer; thesis requires keeping it closed until candidate |
| S2: candidate metadata | Version always visible; notes/date appear only when present; user can defer | Compact receipt plus optional reading layer | Expanded maintenance lane | Checkpoint reading column |
| Availability is not urgency | No countdown, task-alert placement, or urgent motion | Strong: edge receipt and neutral copy | Strong: global waypoint | Weak: modality implies urgency |
| Checking is not applying | Passive discovery has no progress/install semantics | Version handoff remains “available” until explicit action | Waypoint changes only after action | Decision state changes only after action |
| Explicit intent only | **Update and restart** is the sole apply/relaunch origin; **Later** preserves work | Direct in receipt | In expanded lane | Direct in checkpoint |
| S3: progress and ordering | Download then install; restart only after successful install | In-place stage receipt | Pinned stage ruler | Focused stage sequence |
| Unknown/known total bytes | Textual indeterminate state, then received/total plus redundant bar | Supported | Supported, but horizontally constrained | Supported |
| S4: check/download/install failure | Current app stays open; stable recovery action is offered | Receipt becomes recovery result | Lane becomes recovery result | Checkpoint becomes recovery result but continues blocking |
| Relaunch failure | Installation may be complete; manual restart guidance appears | Recovery receipt | Recovery lane | Recovery checkpoint |
| No invented cancellation/undo | “Later” only before apply; no in-flight cancel or rollback affordance | Preserved | Preserved | Preserved |
| S5: ordered, data-preserving migrations | Normal migration success does not become update progress or claim rollback | Silent safe startup outside receipt | Silent safe startup outside lane | Silent safe startup outside checkpoint |
| S6 / schema-too-new | Workspace does not open; data-preserving failure is explained without false recovery claims | Separate full-window startup guard | Same | Could reuse checkpoint styling, but structurally it is a startup guard, not the update decision |
| Dense scale / no row reflow | 80–200 rows and time alignment retain geometry | Strong | Weak while lane is open | Geometry retained but interaction blocked |
| Non-color accessibility | Labels, border, position, stage text, and progress numbers carry state | Supported | Supported | Supported |
| Preview/test external-I/O invariant | Preview representation must remain inert and clearly fixture-backed | Integration constraint, no unique visual treatment | Same | Same |

## Cross-direction scale and accessibility risks

| Risk | Required treatment in the selected direction |
|---|---|
| 960 × 640 viewport | Keep the edge receipt within viewport margins and out of the primary top-line reading path; cap its resting height. |
| 200% zoom / narrow effective width | Convert to a bottom-attached stacked strip; keep actions fully visible; move long notes to a bounded, scrollable reading layer. No two-dimensional scrolling. |
| 80–200 rows with active edit or memo | Do not reflow, dismiss, blur, or cover the active editor. Placement must account for open transient surfaces. |
| Long or absent notes | Omit the disclosure when absent. When long, preserve paragraph structure and scroll within the requested notes layer; returning closes the layer and restores focus. |
| Long localized action labels | Allow vertical action stacking and text wrapping without truncating the interruption promise in **Update and restart**. |
| Unknown download size | Use stage text such as “Downloading update…” without a fake percentage; add received/total only when total is known. |
| High-frequency progress | Throttle visual updates and polite announcements. Announce meaningful percentage/amount intervals and stage changes, not every byte event. |
| Screen-reader interruption | Do not move focus on availability. Announce availability politely once. Announce failure once with its recovery action; avoid duplicate status and alert announcements. |
| Keyboard access | Notice, disclosure, actions, and close affordance participate in logical tab order with persistent visible focus. Escape closes notes and dismissible states, never an in-progress operation by implication. |
| Forced colors / low vision | Use system borders, textual state labels, redundant progress numbers, and a visible focus outline. Do not use fill alone to distinguish progress or failure. |
| Reduced motion | Use no spatial travel beyond an optional short appearance transition; replace states without animated stage sweeping. |
| Overlay collision | Define a placement priority among the receipt, memo, undo receipt, and transient operation feedback; never stack surfaces over task controls or make one unreachable. |
| Migration/startup failure | Use a separately specified full-window startup guard with keyboard-readable diagnostic and safe exit/retry possibilities only if the locked adapter exposes them. Do not place it over a fake loaded workspace. |

## Anti-template rationale

- The selected edge receipt is not a generic dashboard card. Its necessity follows from asynchronous, optional application maintenance arriving while the user is operating a dense temporal surface. A permanent container would consume scale and falsely make maintenance a primary domain object.
- A sidebar was rejected because it would either reflow the timeline or cover a large, continuous vertical slice of task/time alignment. The update has too little persistent navigation or history to justify that footprint.
- Tabs were rejected because there are no peer application sections to switch among. Candidate details, progress, and failure are ordered states of one operation, not destinations.
- A dashboard was rejected because versions, progress, notes, and recovery are not independent metrics. Separating them into tiles would hide their causal sequence and compete with the actual work surface.
- A modal was explored in Direction C because it makes consent unmistakable. It was rejected for availability because the capability explicitly protects postponement and non-blocking work; forced focus would turn optional maintenance into urgency.
- The selected direction’s domain-specific originality is the version handoff line. It represents present software, future candidate, and active transition in one compact, non-task axis. This signature traces directly to S2/S3 and to the invariants that checking is not applying and relaunch follows successful installation.
- The separate release-notes layer is justified only when notes exceed the compact receipt. Without it, several paragraphs would either obscure tasks or force permanent expansion. It is subordinate, user-invoked, focus-returning, and absent when notes are absent.

## Direction selection

- Selected direction: **A — Edge operation receipt**.
- Selection owner: **Human**. The user accepted an unobtrusive update notification with **Later** and explicit **Update and restart**.
- Why it was selected: It maps that accepted interaction directly onto the locked capability, leaves the dense task/time surface geometrically and interactively intact until the user chooses interruption, and carries availability, progress, and recovery through one causally stable location. Its version handoff line distinguishes current, candidate, and applying states without presenting maintenance as a task-domain alert.
- Rejected directions: **B** demonstrates that global application scope can be kept outside project time, but its expanded lane reflows the row-aligned surface and adds a disclosure step before the accepted choices. **C** creates the strongest consent and notes-reading boundary, but modality and automatic focus capture contradict the non-urgent, postponable nature of availability.
- Structural decisions now fixed:
  - Availability uses a bounded, non-reflowing edge receipt and does not capture focus.
  - The receipt exposes target version, **Later**, and **Update and restart** at first glance.
  - Notes and publication time are optional supporting detail; long notes open only on request in a bounded reading layer.
  - The receipt persists in one location through downloading, installing, and recoverable failure, with textual stages and redundant progress.
  - No automatic apply, relaunch, in-flight cancel, update undo, rollback, countdown, or urgency treatment is introduced.
  - Relaunch begins only after successful install and only as the consequence of the explicit **Update and restart** intent.
  - Migration success remains silent; migration/schema failure is a separate safe-start guard, not part of the update receipt.
- Visual decisions still open:
  - Exact edge placement and collision priority relative to the memo, undo receipt, and other transient feedback.
  - Typography, spacing, border weight, final control sizing, and the breakpoint for the bottom-attached stacked form.
  - Semantic color assignments after checking they do not conflict with task and temporal colors.
  - Exact reduced-motion transition and progress-bar material.
- Integration questions:
  - None that require a capability change for the selected availability/apply flow. Placement collision rules and the safe-start guard’s available recovery actions must be resolved from established host behavior without inventing cancel, rollback, or migration recovery semantics.
- Acceptance checks:
  - With 80–200 rows, an active inline edit, and a memo open, candidate arrival neither moves rows nor changes focus; the accepted notice remains discoverable by keyboard and assistive technology.
  - At 1280 × 800 and 960 × 640, the compact receipt does not obscure primary task/time controls. At 200% zoom, it becomes a readable stacked strip with no clipped actions or horizontal scrolling.
  - An up-to-date result remains quiet. Availability announces once, politely, and does not resemble a task alert or deadline.
  - **Later** dismisses the receipt and preserves the work surface without applying, installing, relaunching, or implying cancellation.
  - **Update and restart** is the only initiating action. The sequence visibly distinguishes downloading, installing, and restarting; restarting never appears before install success.
  - Unknown-size download progress has no fake percentage. Known-size progress provides text and a redundant visual indicator without excessive announcements.
  - Check, download, and install failures leave the workspace open and show the correct safe retry/check action. Relaunch failure states that installation may be complete and provides manual-restart guidance.
  - Release notes are absent when unavailable, readable when several paragraphs long, dismissible by keyboard, and return focus to their origin.
  - Grayscale, forced-colors, reduced-motion, visible-focus, and screen-reader passes preserve every state and action distinction.
  - Browser preview/test rendering of the receipt is inert and triggers no network or desktop-runtime operation.
