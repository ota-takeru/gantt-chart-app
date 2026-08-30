# Capability: task-detail-disclosure

- Status: implemented / locked
- Version: 1.1
- Supersedes: 1.0 for UI disclosure behavior; 1.0 remains historical evidence
- User outcome: Scan a dense task surface with essential task identity, lifecycle meaning, completion eligibility, and hierarchy cues; reach secondary task actions either through stable selection/focus or through a transient pointer-hover affordance without changing selection.
- Owner: Gantt Chart App
- Last updated: 2026-08-30

## Domain boundary

### In scope
- Maintain at most one stable task selection within the current task context.
- Select a task through an explicit task-selection intent or by moving keyboard focus into that task's interactive context.
- Project essential versus selection-only information for every available task.
- Allow pointer hover to transiently expose the hovered task's secondary actions for pointer use.
- Preserve the stable selection while pointer hover enters or leaves any task.
- Clear a selection when its task is no longer available or when the surrounding task context is explicitly reset.

### Out of scope
- Persisting selection across application restarts or task-context changes.
- Changing task lifecycle, hierarchy, memo, history, ordering, or any other task data.
- Choosing row geometry, action labels, colors, animation, or a particular pointer/keyboard control.
- Opening or defining editors, dialogs, confirmations, or history pockets.

## Domain vocabulary

- available task: A task identity present in the current task projection and eligible for inspection.
- stable selection: The one available task whose richer context remains disclosed independently of transient pointer hover.
- essential information: Task identity, lifecycle meaning, lifetime meaning, completion eligibility, and hierarchy cues needed to scan safely. Essential information may be visually compact or assistive-only when another visible cue carries the same row identity.
- selection-only information: Ancestry, exact temporal context, and other richer task details reserved for the stable selection.
- secondary actions: Non-primary task operations such as memo, add-child, and delete.
- context reset: An explicit replacement or dismissal of the current task-inspection context.

## Scenarios

### S1: Resting scan
**Given** available tasks and no stable selection
**When** disclosure is projected
**Then** every task exposes its essential meaning and no task exposes selection-only information; secondary actions remain visually hidden until selection, focus, or pointer hover.

### S2: Deliberate stable selection
**Given** available tasks and any prior selection
**When** one available task is selected
**Then** that task becomes the sole stable selection and exposes selection-only information and secondary actions.

### S3: Keyboard-equivalent disclosure
**Given** available tasks
**When** keyboard focus enters an available task's interactive context
**Then** that task becomes the stable selection and its secondary actions enter sequential keyboard navigation.

### S4: Transient hover actions
**Given** any stable selection state
**When** pointer hover enters another available task
**Then** that row's secondary actions become visible and pointer-operable without changing stable selection, revealing selection-only information, or entering those actions into sequential keyboard navigation; leaving hides them unless the row is selected or contains focus.

### S5: Selected task disappears
**Given** one task is the stable selection
**When** available task identities are reconciled without that task
**Then** selection clears without changing task data.

## States and errors

The stable capability states remain `resting` and `selected`. Hover is transient presentation input, not a capability state. Unavailable targets preserve the current valid selection; reconciliation clears a stale selection. No task data is partially applied.

## Invariants

- At most one available task is the stable selection.
- Lifecycle meaning remains available for every row even when its visible metadata line is omitted.
- Selection-only information is exclusive to the stable selection.
- Secondary actions may be exposed by stable selection, focus, or transient row hover.
- Hover cannot replace, clear, or otherwise mutate the stable selection.
- Hover-exposed actions remain outside sequential keyboard navigation; focus/selection exposes the equivalent keyboard path.
- Disclosure transitions never mutate task data, hierarchy, lifecycle, history, memo, ordering, revisions, or undo state.
- Row and primary-control geometry do not change when transient actions appear or disappear.

## Scale and observability

- Support at least 5,000 available tasks with constant-time state transitions and projection per task.
- A representative 120-task fixture must not require retained hover state or task-specific listeners.
- Expose stable selection and per-task disclosure state through deterministic return values and DOM state; hover produces no persistence, audit, revision, or undo event.

## Headless interface

The 1.0 headless interface and all transition/projection contract tests remain unchanged:

```text
transitionTaskDetailDisclosure(state, intent, availableTaskIds) -> TaskDetailDisclosureState
projectTaskDetailDisclosure(state, taskId, availableTaskIds) -> TaskDetailDisclosureProjection
```

Transient hover action exposure is a CSS/UI integration projection and does not add a domain transition.

## Contract and integration tests

- Preserve every 1.0 headless contract test, including hover causing no state transition.
- Verify a hovered resting row exposes only its secondary actions, keeps `data-disclosure-state="resting"`, and leaves selection-only details absent.
- Verify pointer leave restores the hidden resting action state.
- Verify hover actions remain `tabIndex=-1`, while focus/selection exposes the same actions with `tabIndex=0`.
- Preserve fixed geometry, dense-fixture, focus equivalence, reconciliation, and sole-stable-selection coverage.

## Change history

- 1.1 / 2026-08-30: Authorized CCR-004; added transient pointer-hover secondary actions without changing stable selection or the headless capability.
