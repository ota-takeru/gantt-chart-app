# Capability: task-detail-disclosure

- Status: implemented / locked
- Version: 1.0
- User outcome: Scan a dense task surface with only essential task identity and lifecycle information at rest, then deliberately expose one task's richer context and secondary actions through a stable selection that keyboard users can reach equivalently.
- Owner: Gantt Chart App
- Last updated: 2026-08-26

## Domain boundary

### In scope
- Maintain at most one stable task selection within the current task context.
- Select a task through an explicit task-selection intent or by moving keyboard focus into that task's interactive context.
- Project essential versus disclosed information for every available task.
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
- essential information: Task identity, compact lifecycle state, lifetime meaning, completion eligibility, and hierarchy cues needed to scan safely.
- secondary information: Ancestry, memo presence/affordance, child metadata, exact temporal context, and non-primary task actions.
- context reset: An explicit replacement or dismissal of the current task-inspection context.

## Scenarios

### S1: Resting scan

**Given** available tasks and no stable selection
**When** disclosure is projected
**Then** every task exposes its essential information and no task exposes selection-only secondary information.

### S2: Deliberate stable selection

**Given** available tasks and any prior selection
**When** one available task is selected
**Then** that task becomes the sole stable selection, exposes secondary information and actions, and all other tasks return to their resting projection.

### S3: Keyboard-equivalent disclosure

**Given** available tasks
**When** keyboard focus enters an available task's interactive context
**Then** that task becomes the stable selection and receives the same disclosure projection as an explicit selection intent.

### S4: Hover does not replace selection

**Given** one task is the stable selection
**When** pointer hover enters and leaves another task
**Then** the stable selection and its disclosed information remain unchanged.

### S5: Selected task disappears

**Given** one task is the stable selection
**When** the available task identities are reconciled without that task
**Then** the selection clears without changing any task data, and remaining tasks use the resting projection.

## Inputs

- available task identifiers: Unique stable task identifiers in the current projection.
- current disclosure state: Optional stable selected task identifier.
- disclosure intent: Select, focus, reconcile available tasks, or reset current context.
- task identifier: Required for select and focus intents and valid only when currently available.

## Outputs

- disclosure state: Optional stable selected task identifier after applying the intent.
- task disclosure projection: For one available task, whether essential information, secondary information, secondary actions, and stable-selection linking are exposed.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| resting | No available task is the stable selection | selected |
| selected | Exactly one available task is the stable selection | selected, resting |

Pointer hover is transient presentation input and is not a capability state transition.

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| unavailable target | Select or focus references a task outside the available projection | Preserve the current valid selection; the caller may reconcile or retry with an available task | No task data is ever changed |
| stale selection | Reconciliation finds that the selected task is no longer available | Clear the selection and return the resting projection | No task data is ever changed |

## Invariants

- At most one available task is the stable selection.
- Every available task always exposes essential information, including lifecycle state; lifecycle meaning is never selection-only.
- Only the stable selection exposes selection-only secondary information and actions.
- Focus selection and explicit selection produce the same disclosure projection.
- Hover cannot replace, clear, or otherwise mutate the stable selection.
- Disclosure transitions never mutate task data, hierarchy, lifecycle, history, memo, ordering, revisions, or undo state.
- Reapplying selection to the current task is idempotent.

## Scale and performance envelope

- Project disclosure for at least 5,000 available tasks with constant-time state transitions and constant-time projection per task.
- A representative 120-task rendered fixture must not require task-specific listeners or retained disclosure state per task.

## Observability

- Expose the stable selected task identifier and per-task disclosure projection through deterministic return values and DOM state used by interaction tests.
- Do not emit persistence events, audit records, task revisions, or undo entries for disclosure changes.

## Headless interface

```text
transitionTaskDetailDisclosure(state, intent, availableTaskIds) -> TaskDetailDisclosureState
projectTaskDetailDisclosure(state, taskId, availableTaskIds) -> TaskDetailDisclosureProjection
```

## Contract tests

- S1 projects essential-only resting tasks with lifecycle information always enabled.
- S2 replaces any prior selection and discloses exactly one available task.
- S3 proves focus and explicit selection produce identical state and projection.
- S4 proves hover has no state transition and the stable selection remains disclosed.
- S5 clears a stale selection during reconciliation.
- Unavailable select/focus intents preserve the prior valid selection.
- Repeated selection is idempotent and projection is constant-time without per-task retained state.

## Change history

- 1.0 / 2026-08-26: Initial draft for issue #21 progressive task-detail disclosure.
- 1.0 / 2026-08-26: Implemented and locked after select/focus equivalence, hover stability, unavailable-target, reconciliation, reset, idempotence, lifecycle-essential, sole-disclosure, and 5,000-task contract tests passed.
