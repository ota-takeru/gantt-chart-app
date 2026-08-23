# Capability Pack: hierarchical-task-management v1.0

- Capability status: implemented / locked
- Selection authority: Product owner previously delegated the recommended direction to Codex.
- Product surface: Local Windows desktop app built with React and Tauri.
- Locale: Japanese-first interface.

## Locked capability source

- `specs/capabilities/hierarchical-task-management.md`

The source contract is authoritative. The UI must not add cascade completion, deletion, dates, timers, progress percentages, or another behavior absent from the contract.

## Observable outcomes that must be exposed

- The user can distinguish remaining tasks from completed tasks.
- The user can add a top-level task and add a direct subtask with little interaction overhead.
- The user can move a task before a sibling or reparent its entire subtree.
- Movement retains task identity, state, history, and internal subtree order.
- A parent with remaining descendants cannot be completed; recovery points the user to the unfinished descendants.
- Reopening nested completed work also reopens its completed ancestor path, without starting a timer or session.
- Completed tasks remain inspectable and reopenable without dominating daily work.
- Stale placements refresh safely; failed actions never leave partially moved or partially completed work.

## Contract-test evidence

- 7 hierarchy-specific Rust contract tests cover creation, child insertion, completed-parent rejection, reorder/reparent, stale revision rollback, cycles, maximum depth, incomplete-descendant protection, ancestor reopening, migration, invalid placement, limits, and atomicity.
- All 28 pre-existing locked lifecycle, queue, work-session history, and projection tests remain unchanged and pass.
- Total backend result at lock: 35 passed, 0 failed; Clippy passes with warnings denied.

## Required product context

- The previous time-detailed HISTORY / NOW / NEXT work surface is no longer the primary experience.
- Do not present detailed working duration, session segments, timers, planned start dates, or planned end dates in this iteration.
- Remove the oversized product title and preserve useful vertical space for everyday use.
- The primary daily surface is NOW: remaining work. Do not retain a separate NEXT region.
- Completed work must remain available but visually secondary to remaining work.
- Subtask creation must be discoverable directly from the relevant task, not require a separate administration screen.
- Dragging must support both sibling reorder and parent reassignment. A non-pointer alternative must provide the same final placement capability.

## Relevant design principles

- Use a dense, calm, readable work surface rather than dashboard cards or decorative whitespace.
- Let task rows and their hierarchy lead the structure.
- Keep hierarchy and state understandable without color alone.
- Use color only for semantic state, selection, errors, or drop validity.
- Give hierarchy manipulation one domain-specific signature representation or interaction.
- Typical cards, tabs, sidebars, and modals require a functional rationale; they are not defaults.
- History/completed state is distinct from remaining state and should not compete with it.

## Information available to the UI adapter

Each forest entry provides:

- task identifier and title;
- lifecycle state: `queued`, `active`, `paused`, or `completed`;
- optimistic task version;
- creation instant and optional latest completion instant;
- optional parent task identifier;
- sibling position;
- zero-based depth.

The forest also provides a hierarchy revision and source revision. Mutations return changed task/entry snapshots and stable errors. The UI may group queued/active/paused as remaining but must retain the task's actual state in data.

## Realistic data and scale

Design for these conditions, not a three-row ideal case:

- Typical: 18 remaining tasks, 42 completed tasks, depths 0–3, Japanese titles 8–35 characters.
- Dense: 120 remaining tasks, 600 completed tasks, depths 0–6, repeated sibling reorder and collapsed branches.
- Maximum supported: 5,000 retained tasks and depth 8.
- Mixed state: a remaining parent may contain completed children; a completed task cannot contain remaining descendants after hierarchy-capability operations.
- Long labels: up to 240 characters, mixed Japanese/ASCII.
- Empty states: no tasks, no completed tasks, or only completed tasks.

Representative hierarchy:

```text
API障害のフォローアップ
  原因の仮説を整理する
    DB接続数のログを確認
    タイムアウト境界のテストを追加 [completed]
  顧客向け回答を作る
リリース準備
  変更点を短くまとめる [completed]
  レビュアーへ依頼する
明日の調査メモを残す
```

## Accessibility and host constraints

- Full operation at 960×640 and 1280×800 without an oversized header consuming the workspace.
- Keyboard access for create, complete, reopen, expand/collapse, reorder, and reparent.
- Pointer drag is additive; it cannot be the only way to change placement.
- Visible focus, screen-reader names, status announcements, and error recovery remain available.
- Drop destination and invalid/cyclic destination must be understandable without color alone.
- Reduced-motion users receive state continuity without relying on movement animation.
- Keep controls usable with Windows desktop pointer and keyboard conventions.

## States the exploration must cover

- Initial loading and safe refresh.
- Empty forest and top-level creation.
- Typical remaining tree with collapsed and expanded branches.
- Inline/direct subtask creation.
- Drag pickup, valid sibling insertion, valid reparent target, invalid/cyclic target, cancellation, commit pending, success, stale failure, and recovery.
- Completion blocked by unfinished descendant.
- Completing a leaf, completed tasks becoming secondary, reopening a nested task and its ancestor path returning to remaining.
- Dense tree, long title, and deep hierarchy.

## Exclusions from design input

- Do not use the existing React screen, its temporary controls, or its HISTORY/NOW/NEXT composition as a reference.
- Do not infer controls from Rust/SQLite implementation details.
- Do not change or reinterpret the locked contract to simplify a direction.
