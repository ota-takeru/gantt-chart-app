# Capability contract

Read this reference when defining a new capability, implementing its headless behavior, diagnosing a behavior bug, or considering a change to a locked capability. It is the source of truth for the contract schema and lock/change protocol.

## Capability versus interaction mechanism

A capability is the domain behavior and user outcome that must remain reliable across UI implementations. It describes what the product can do, the information it needs, the result it guarantees, and the states or failures it exposes.

An interaction mechanism is a possible way to invoke or represent that behavior: a drag gesture, modal, card, sidebar, tab, menu, inline editor, or other UI choice. Mechanisms belong to design exploration unless the user explicitly requires one. Do not put a mechanism in a capability contract merely because it is familiar or convenient for the implementation.

For example, “reassign a task to another project from an effective date while preserving assignment history” is a capability. “Drag a row into a project sidebar and confirm in a modal” is one possible mechanism and must remain undecided in the capability contract.

## Normative schema

Create each capability specification with these sections, in this order. Replace every placeholder with project-specific content before moving past `draft`.

```md
# Capability: <stable-id>

- Status: draft
- Version: <version>
- User outcome: <observable outcome>
- Owner: <responsible agent or team>
- Last updated: <date>

## Domain boundary

### In scope
- <behavior included in this capability>

### Out of scope
- <nearby behavior deliberately excluded>

## Domain vocabulary

- <term>: <meaning in this capability>

## Scenarios

### S1: <name>

**Given** <starting domain conditions>
**When** <domain operation>
**Then** <observable result and retained information>

### S2: <name>

**Given** <starting domain conditions>
**When** <domain operation>
**Then** <observable result and retained information>

## Inputs

- <input>: <type, validation, and meaning>

## Outputs

- <output>: <type and guaranteed meaning>

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| <state> | <domain or operation state> | <next states> |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| <error> | <condition> | <safe recovery> | <yes/no and why> |

## Invariants

- <rule that must remain true before and after every operation>

## Scale and performance envelope

- <expected data volume, concurrency, latency, or other relevant boundary>

## Observability

- <domain event, audit record, metric, or diagnostic field needed to verify behavior>

## Headless interface

```text
<domain command or query>(<input>) -> <output or domain error>
```

## Contract tests

- <test mapped to S1 or another scenario>
- <test for each important state and error>
- <test for every invariant and no-partial-application rule>

## Change history

- <version/date>: <authorized change or initial draft>
```

The interface may use the repository’s language and architecture, but it must remain UI-neutral. Use domain commands, queries, and results; do not make a visual component the public contract.

## Lifecycle

The only normal status transitions are:

1. **draft** — the domain boundary and behavior are being defined. UI mechanisms remain open.
2. **implemented** — headless behavior exists and the contract tests pass.
3. **locked** — the contract has been reviewed after passing implementation tests. Its semantics, core behavior, and existing contract tests are now the compatibility boundary.
4. **superseded** — an authorized successor version has been implemented and tested. Keep the prior contract as history; do not erase it.

Lock only after the headless implementation and contract tests pass. A design direction is not required to lock the capability.

## Lock and change-request protocol

Once locked, do not edit the capability specification, change its core semantics, or rewrite existing contract tests as part of ordinary UI work. Adding a new adapter or a new UI must consume the locked interface.

If implementation or design reveals a missing or incorrect capability:

1. Stop the affected integration or core edit.
2. Create a `Capability Change Request` that identifies the capability/version, reason, proposed semantic change, affected scenarios/states/errors/invariants, test impact, compatibility or migration impact, and the requested authorization.
3. Wait for explicit user authorization. “Make the UI work” or a general implementation request is not authorization to change locked behavior.
4. With authorization, create a successor version where practical, update implementation and tests together, preserve the old contract as history, and run the full regression suite.
5. Mark the old version superseded only after the successor passes its contract tests and review.

Use this compact request shape:

```md
## Capability Change Request: <request-id>

- Affected capability/version: <id>/<version>
- Why the locked contract is insufficient: <evidence>
- Proposed semantic change: <precise change>
- Affected scenarios/states/errors/invariants: <list>
- Existing and new tests: <impact>
- Compatibility or migration impact: <impact>
- Requested authorization: <specific permission>
- Authorization: pending
```

Explicit authorization permits the requested change; it does not permit weakening coverage or making unrelated edits. Existing tests must continue to express the behavior that remains supported.

### Language and approval presentation

The compact schema is a content checklist, not a requirement to present English headings to the user. Write the stored request and the user-facing summary in the user's language. Preserve exact capability IDs, versions, test names, and error codes where needed, and explain them briefly in ordinary language.

An approval checkpoint must be understandable without opening the request file. State:

1. what the current locked behavior is;
2. what observable behavior would change;
3. what will deliberately remain unchanged;
4. why explicit approval is needed; and
5. the exact short reply that authorizes the scoped change.

Avoid leading with terms such as “CCR”, “semantic change”, or “headless projection”. If those terms are useful for traceability, introduce them after the plain-language explanation.

## Example: task reassignment

This is a concise example of a capability contract. It intentionally leaves the UI mechanism open.

```md
# Capability: task-reassignment

- Status: implemented
- Version: 1.0
- User outcome: Move a task’s current project assignment from an effective date while retaining assignment history.

## Domain boundary

### In scope
- Preview and commit a change to the current project assignment.
- Read the assignment history and undo the last committed reassignment.

### Out of scope
- Changing task dates, hierarchy, dependencies, or permissions.

## Scenarios

### S1: Preview a valid reassignment

**Given** a task is assigned to Project A and Project B is available
**When** a reassignment to Project B is requested from 2026-08-23
**Then** a preview describes the resulting assignment and the preserved history without mutating the task

### S2: Commit and undo a reassignment

**Given** a valid preview exists
**When** it is committed and then undone
**Then** the new assignment and its history record are committed atomically, and undo restores the prior current assignment

## Inputs

- task identifier
- target project identifier
- effective date
- preview identifier for commit

## Outputs

- preview: proposed assignment, affected records, and warnings
- reassignment result: current assignment, history record, and undo identifier

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| idle | No operation in progress | previewing |
| previewing | Validating and calculating impact | ready, failed |
| ready | Preview can be committed | committing, idle |
| committing | Atomic write in progress | succeeded, failed |
| succeeded | New assignment is current and undoable | undoing, idle |
| undoing | Reverting the committed operation | idle, failed |
| failed | Operation made no partial change | idle, previewing |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| invalid target | Target does not exist or is not allowed | Return validation detail; keep current assignment | No |
| stale preview | Source state changed after preview | Require a fresh preview | No |

## Invariants

- Assignment history is append-only; a reassignment does not erase prior records.
- Current assignment and task hierarchy remain distinct concepts.
- Failed operations do not partially apply.

## Scale and performance envelope

- Support the project’s declared task/project volume without loading unbounded history into one operation.

## Observability

- Record reassignment, undo, rejection reason, and correlation identifiers without exposing UI-specific details.

## Headless interface

```text
previewTaskReassignment(input) -> Preview | DomainError
commitTaskReassignment(previewId) -> ReassignmentResult | DomainError
undoTaskReassignment(operationId) -> ReassignmentResult | DomainError
getTaskAssignmentHistory(taskId) -> AssignmentHistory
```

## Contract tests

- Preview does not mutate state.
- Valid commit appends history and updates the current assignment atomically.
- Invalid target and stale preview produce no partial application.
- Undo restores the prior current assignment while retaining the audit record.
```
