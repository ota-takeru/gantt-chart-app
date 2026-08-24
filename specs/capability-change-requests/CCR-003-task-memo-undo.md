# Capability Change Request: CCR-003-task-memo-undo

- Affected capability/version: `reversible-task-operations` / 1.0
- Why the locked contract is insufficient: Issue #2 introduces a durable task mutation. The current undo implementation restores whole observable snapshots. Leaving memo updates outside the undo journal would either make the prior undo conflict after a memo revision or let a later snapshot restoration silently erase memo text.
- Proposed semantic change: Add `memo-update` as an undoable task operation in successor `reversible-task-operations` 1.1. A changed memo save creates one atomic journal entry; undo restores the prior memo using the existing bounded, LIFO, restart-safe semantics. An unchanged save remains a version-checked no-op and does not replace the latest undo entry.
- Affected scenarios/states/errors/invariants: Extend S3–S5 and S7, operation kinds, receipt labels, atomicity, LIFO ordering, restart persistence, stale/conflict behavior, and full snapshot compatibility. Task lifecycle, queue, hierarchy, sessions, delete scope, and the 50-entry bound remain unchanged.
- Existing and new tests: Preserve all 1.0 assertions. Add memo update/undo, clear/undo, mixed-operation LIFO, restart, delete/restore with memo, stale/conflict, unchanged-save, event privacy, and legacy undo JSON without a memo field.
- Compatibility or migration impact: Add a default-empty memo value for existing task rows. Legacy undo snapshots deserialize a missing memo as empty. Existing operation kinds and clients remain valid; TypeScript and Rust operation-kind unions gain `memo-update`.
- Requested authorization: Permit successor `reversible-task-operations` 1.1 to add the `memo-update` operation exactly as described so issue #2 can be implemented without corrupting memo or undo behavior.
- Authorization: approved by user on 2026-08-24
