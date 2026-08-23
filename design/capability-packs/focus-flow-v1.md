# Capability Pack: Focus Flow v1

- Status: ready for independent design exploration
- Prepared: 2026-08-23
- Selection owner: Human / product owner
- Product UI reference: None. The current React database-health screen is a temporary development harness and must not be used as a design reference.

## Locked capability inputs

- `specs/capabilities/focus-work-lifecycle-v1.1.md` — locked v1.1
- `specs/capabilities/next-queue-ordering-v1.1.md` — locked v1.1
- `specs/capabilities/work-session-history.md` — locked v1.0
- `specs/capabilities/history-projection.md` — locked v1.0
- `design/principles.md` — provisional established design context

The explorer must read the complete locked files above. The capability meaning, errors, invariants, headless interfaces, and existing contract tests are compatibility boundaries and may not be changed by the design.

## Contract-test evidence

- 28 Rust tests pass as of 2026-08-23.
- Covered boundaries include one active focus, atomic switch, no automatic next start, pause/resume as distinct sessions, completion without a session, reopen with retained completion cycles, queue relative ordering and stale revisions, transaction rollback, monotonic actual time, restart with an open session, delimiter-safe and stale cursors, focus/day/archive projections, supplied-current determinism, IANA time-zone day boundaries and DST, completion-only summaries, and independent pagination of history segments and next work.
- `cargo clippy -- -D warnings`, React type checking/build, and Tauri debug build pass.

## Product outcome

Create a time-oriented work surface for small daily tasks where the user can understand, at a glance:

1. what they are working on now;
2. the deliberate order of work that can happen next;
3. what they actually worked on recently, including interruptions and returns;
4. progressively denser summaries of older actual work.

## Non-negotiable semantic boundaries

- There is at most one active task.
- Future work is an ordered queue, not a calendar schedule.
- Planned start, planned end, deadlines, estimates, and percentage progress do not exist in v1.
- A task can be queued, active, paused, or completed.
- Completing the active task does not automatically start the next task.
- One explicit focus switch atomically pauses the old task and starts the new task.
- A focus switch may preview an explicit queue return placement for the old task against an expected queue revision; omission returns it to queue end.
- Pausing, switching, completing, reopening, and reordering never erase prior actual sessions or events.
- Repeated work on one task remains multiple session segments; gaps must not be rendered as continuous work.
- An open session may be projected to a supplied current instant, but that effective end is never persisted.
- Application shutdown does not end current work.
- Recent, current, next, and older/aggregated meanings must remain distinguishable without relying on color alone.
- UI actions must bind to the locked headless operations; the design may not invent domain mutations or hidden automatic transitions.

## Realistic exploration data

Use Japanese primary labels with a few long mixed Japanese/English titles. Do not design only for a three-item happy path.

### Typical focus state at 15:12

- Active: `APIレスポンス遅延の原因を切り分ける`, open session 14:38–NOW.
- Its earlier sessions: 10:05–10:26 and 13:42–14:01, separated by other work.
- Paused next work: `顧客向け回答の根拠を再確認`, previously worked 11:12–11:29.
- Queued work in deliberate order:
  1. `再現条件をテストケースにする`
  2. `SQLite migrationの失敗ケースを確認`
  3. `レビューコメントへ返信`
  4. `ログ採取手順を短くまとめる`
  5. `リリースノートの表現を確認`
  6. `明日の調査メモを残す`
- Recent completed work: 12–30 tasks across the last three hours, including one task completed without a recorded session.
- Interruptions: at least one sequence A → B → A so the representation must not imply A was continuous.

### Dense states

- 30 next-work entries, including 8 paused tasks and long titles.
- 100 actual sessions in one local day across 45 tasks.
- 10,000 retained tasks and 100,000 sessions/events in the archive source; the rendered result is always bounded/paginated.
- Equal timestamps for multiple events and a session crossing local midnight.

### Required state variants

- Empty: no tasks and no history.
- Queue only: tasks exist but none has ever started.
- Active typical state.
- Active task with several prior session segments.
- No active task after completion, with next work still present.
- Pending command, successful command, stale-version/queue conflict, persistence failure, cancellation, and recovery/refresh.
- Truncated recent history and truncated next-work queue.

## Host and accessibility constraints

- Desktop-first Tauri window: representative 1280×800; minimum 960×640.
- Dense daily operation must remain legible without dashboard cards as the default organization.
- Every primary task operation requires a discoverable keyboard path: create, choose/start, switch, pause, complete, reopen, and reorder.
- Focus order and focus restoration must remain comprehensible after mutations.
- Pending, success, failure, paused, active, completed, and selected meanings require non-color cues.
- Minimum contrast must be compatible with WCAG AA targets once visual styling is added.
- Motion may reinforce `current → history`, but reduced-motion users must receive the same causal/state information without spatial animation.
- Do not assume precise pointer input; design must remain operable by keyboard and coarse trackpad movement.

## Exploration assignment

Produce one monochrome exploration artifact using the required four lenses and three structurally different theses. The directions must differ in spatial model, primary object, action origin, state/result expression, and actual-history/next-order representation. At least one direction should seriously test a History / NOW / Next continuity, but it must not be accepted automatically because it appeared in earlier discussion.

For every direction:

- show compact ASCII wireframes for 1280×800 typical, dense, and no-active states;
- explain create, start, explicit switch, pause, complete-without-auto-start, reorder, error recovery, and history-detail access;
- identify one domain-specific signature representation or interaction;
- trace the structure to locked scenarios and invariants;
- state scale and accessibility risks;
- justify any sidebar, modal, card, tab, or dashboard-like grouping functionally.

End with a recommendation, but leave the selected direction unset for the human owner. List only integration questions that could reveal missing locked capability.

## Excluded inputs

- Source-level Rust/SQLite implementation reasoning.
- Temporary database-health UI structure or styling.
- Guessed controls from the headless implementer.
- Commercial or third-party Gantt component conventions.
