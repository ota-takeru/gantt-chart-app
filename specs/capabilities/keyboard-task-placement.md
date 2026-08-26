# Capability: keyboard-task-placement

- Status: implemented / locked
- Version: 1.0
- User outcome: A focused task can be assigned an exact hierarchy placement without pointer input, and a failed attempt leaves the chooser recoverable at the same destination.
- Issue: #13
- Owner: Product/domain integration
- Last updated: 2026-08-26

## Domain boundary

### In scope

- A pure, UI-neutral state machine for selecting a placement candidate for one source task.
- The `idle`, `choosing`, `submitting`, and `failed` operation phases.
- Stable return-focus identity retained from begin through cancel, success, and failure recovery.
- Candidate validation supplied by the hierarchy adapter, including a required reason for every invalid candidate.
- Wrapped keyboard/non-pointer navigation through the supplied candidate order.
- Emitting an exact placement request for an external hierarchy mutation.

### Out of scope

- Mutating, persisting, or refreshing the task hierarchy.
- Choosing or deriving candidates from a tree; the adapter supplies the complete ordered list.
- Pointer drag/drop, DOM focus calls, rendering, announcements, or visual affordances.
- Domain validation beyond the candidate validity and reason supplied by the adapter.
- Undo, retries that silently replay a stale placement, or concurrent placement submissions.

## Domain vocabulary

- **Source task**: The task whose subtree will be placed by the external hierarchy operation.
- **Candidate**: One validated destination seam/basin identified by a stable `id`, optional target parent, and optional before-sibling anchor.
- **Exact placement**: `{ sourceTaskId, targetParentId?, beforeTaskId? }`; the only mutation request emitted by this capability.
- **Return focus identity**: An adapter-owned stable identifier for the control that began placement mode.
- **Validation reason**: A user-meaningful explanation attached to an invalid candidate and retained when confirmation is refused.

## Scenarios

### S1: Begin placement mode

**Given** a source task, a stable return-focus identity, and an ordered candidate list where each invalid candidate has a reason
**When** the adapter dispatches `begin`
**Then** the controller enters `choosing`, selects the first candidate, copies the candidate list, and retains the return-focus identity.

### S2: Navigate candidates without a pointer

**Given** the controller is choosing among an ordered candidate list
**When** the adapter dispatches `navigate` with `next` or `previous`
**Then** the selected index advances by one and wraps at either end; invalid candidates remain reachable so their reasons can be exposed by an adapter.

### S3: Refuse an invalid destination

**Given** the selected candidate is marked invalid with a stable reason
**When** the adapter dispatches `confirm`
**Then** the controller remains in `choosing`, emits no mutation effect, preserves the selected candidate, and exposes that reason as `validationReason`.

### S4: Submit an exact valid placement

**Given** the selected candidate is valid
**When** the adapter dispatches `confirm`
**Then** the controller enters `submitting`, retains the exact placement as `pendingPlacement`, and emits one `submit-placement` effect containing the source, target parent, and optional before-sibling anchor.

### S5: Cancel before submission

**Given** the controller is choosing or showing a recoverable failure
**When** the adapter dispatches `cancel`
**Then** the controller returns to `idle` and emits one `focus-return` effect for the original stable return-focus identity.

### S6: Resolve a submitted placement

**Given** the controller is `submitting`
**When** the adapter dispatches `success`
**Then** the controller closes to `idle` and emits `focus-return` using the same identity; no hierarchy data is changed by the controller.

### S7: Recover from a failed submission

**Given** the controller is `submitting` with a selected destination
**When** the adapter dispatches `failure` with a stable error message
**Then** the controller enters `failed`, preserves candidates, current selection, pending placement, and return-focus identity, exposes the error, and emits `focus-return` so the adapter can restore useful focus.

### S8: Reject unsafe operation setup

**Given** the begin input has no candidates, duplicate/empty candidate IDs, missing source/focus identity, or an invalid candidate without a reason
**When** the adapter dispatches `begin`
**Then** the controller enters `failed` with no submit effect and reports a stable input error.

## Inputs

- `begin`: source task ID, ordered immutable candidate records, and stable `returnFocusId`. Candidate records contain `id`, optional `targetParentId`, optional `beforeTaskId`, `valid`, and a reason when invalid.
- `navigate`: `next` or `previous`; navigation wraps over the supplied ordered candidates.
- `confirm`: requests submission of the current candidate only when it is valid.
- `cancel`: closes a non-submitting chooser/failure state.
- `success`: resolves the pending external mutation.
- `failure`: external mutation error message and optional stable `submission-failed` code.

## Outputs

- State with exactly one of `idle`, `choosing`, `submitting`, or `failed` phases.
- `submit-placement` effect only for a valid confirmation, carrying the exact placement tuple.
- `focus-return` effect on cancel, success, and failure, carrying the unchanged `returnFocusId`.
- `validationReason` for an invalid confirmation and `error` for setup/submission failures.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| `idle` | No placement operation is active. | `begin` -> `choosing` or `failed` |
| `choosing` | Candidates are available for non-pointer selection. | `navigate` -> `choosing`; valid `confirm` -> `submitting`; invalid `confirm` -> `choosing`; `cancel` -> `idle` |
| `submitting` | One exact placement request is owned by the external adapter. | `success` -> `idle`; `failure` -> `failed`; other begin/cancel/confirm intents are ignored |
| `failed` | Setup or external submission failed; the source and current destination remain inspectable. | `navigate` -> `choosing`; valid `confirm` -> `submitting`; `cancel` -> `idle`; a new `begin` replaces the failed operation |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| `invalid-input` | Required identity missing, IDs are empty/duplicated, or an invalid candidate has no reason. | Enter `failed`; no submit effect; caller may begin again. | No |
| `no-candidates` | Begin receives an empty list. | Enter `failed`; caller refreshes candidate computation and begins again. | No |
| Invalid candidate | Current candidate is marked invalid. | Remain `choosing`, preserve selection, expose `validationReason`, and let the caller navigate or cancel. | No |
| `submission-failed` | External hierarchy mutation rejects or becomes stale. | Enter `failed`, preserve the chooser/current destination and pending placement, emit focus-return, then navigate, confirm again, cancel, or begin after refresh. | No; this capability never mutates the hierarchy |

## Invariants

- The controller never mutates a hierarchy, persistence store, task state, or candidate object.
- A `submit-placement` effect is emitted only when the selected candidate is valid.
- The exact placement effect retains `sourceTaskId`, `targetParentId` when present, and `beforeTaskId` when present without inventing or rewriting an anchor.
- Candidate order and identities remain stable through choosing, submitting, and failed recovery.
- Navigation is deterministic and wrapped; every supplied candidate is reachable.
- `returnFocusId` is stable from begin through every non-idle phase and every focus-return effect.
- A second begin or cancel cannot replace/cancel an in-flight `submitting` operation.
- Success and cancel clear operation state; failure does not clear the current destination or pending placement.

## Scale and performance envelope

- Candidate lists are bounded by the complete destination model supplied by the hierarchy adapter for one source task.
- Each transition is O(1) apart from copying the candidate list at begin; no hierarchy traversal or mutation is performed.
- The controller must remain allocation-light enough for a depth-eight, 5,000-task hierarchy adapter to provide its candidate list without retaining the forest.

## Observability

- The adapter can observe `phase`, selected candidate identity/index, `validationReason`, `error`, `pendingPlacement`, and emitted effect type.
- Effects are explicit so mutation submission and focus restoration can be tested without DOM or a live hierarchy.

## Headless interface

```text
transitionKeyboardTaskPlacement(state, intent) -> { state, effect? }
currentKeyboardTaskPlacementCandidate(state) -> candidate?
```

## Contract tests

- Begin copies candidates, selects the first, and preserves `returnFocusId`.
- Wrapped next/previous navigation reaches first, middle, and last candidates.
- Invalid confirmation stays `choosing`, retains the current candidate, and exposes its reason without an effect.
- Valid confirmation enters `submitting`, retains `pendingPlacement`, and emits the exact placement effect.
- Cancel and success clear to `idle` with a stable focus-return effect.
- Failure preserves candidates, selection, pending placement, error, and useful focus-return effect; navigation recovers the chooser.
- Empty/malformed begin input fails without a submit effect; in-flight begin/cancel are ignored.

## Change history

- 1.0 / 2026-08-26: Issue #13 implemented and locked after 10 focused Vitest contract tests and `npm run check` passed.
