# Capability: completed-pocket-window

- Status: implemented / locked
- Version: 1.0
- User outcome: Inspect every retained completed task in a large hierarchy pocket without mounting the entire pocket at once or losing the selected task's context.
- Owner: Gantt Chart App
- Last updated: 2026-08-26

## Domain boundary

### In scope
- Project an ordered initial prefix of completed pocket members.
- Reveal additional bounded prefixes until every member is reachable.
- Include one selected member outside the prefix without mounting the omitted range.
- Expose each rendered member's retained ordinal and total set size.
- Reconcile the window when membership shrinks and reset it to the initial bound.

### Out of scope
- Changing retained hierarchy order, task lifecycle, persistence, actual-history queries, range geometry, or selection semantics.
- Choosing product UI controls, scroll containers, virtualization libraries, or visual styling.

## Domain vocabulary

- retained order: The input hierarchy order, which this capability never sorts or rewrites.
- visible prefix: The first bounded group of members included for ordinary inspection.
- selected reveal: A selected member beyond the visible prefix, included without the intervening omitted members.
- window state: Only the prefix count and batch size; no state is retained per member.

## Scenarios

### S1: Open a large pocket

**Given** a pocket with hundreds of members in retained hierarchy order
**When** its initial window is projected
**Then** only the first bounded prefix is returned and the omitted count is explicit.

### S2: Reach every member incrementally

**Given** a truncated prefix
**When** additional batches are requested repeatedly
**Then** the prefix grows by the bounded batch size and eventually contains every member in original order.

### S3: Reveal an off-prefix selection

**Given** a selected member after the visible prefix
**When** the window is projected
**Then** the prefix plus that selected member are returned, with its original ordinal and total, without including the omitted interval.

### S4: Preserve navigation semantics

**Given** rendered prefix and selected-reveal members
**When** a consumer builds composite navigation
**Then** every rendered member has its one-based position and full set size, and output order matches retained input order.

### S5: Reconcile changed membership

**Given** a previously expanded prefix
**When** total membership shrinks or context resets
**Then** reconciliation clamps the prefix without invalid state, and reset returns to the initial batch.

## Inputs

- members: Ordered immutable records with stable identifiers.
- selected member identifier: Optional identifier from the same membership projection.
- total: Non-negative current member count.
- batch size: Positive safe integer; invalid input normalizes to 40.
- intent: `load-more`, `reconcile`, or `reset`.

## Outputs

- rendered members with original one-based position, total set size, and prefix/selected-reveal reason.
- visible prefix count, omitted count, load-more availability, and next batch size.
- next window state containing only prefix count and batch size.

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| initial | First bounded prefix is available | expanded, reconciled |
| expanded | One or more additional prefixes are available | expanded, complete, reconciled, initial |
| complete | Every member is in the prefix | reconciled, initial |
| reconciled | Prefix is valid for current membership | expanded, complete, initial |

Selected reveal is a projection of the current selection, not retained window state.

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| invalid batch size | Batch is non-positive or not a safe integer | Normalize to 40 | Not applicable; pure projection |
| missing selection | Selected identifier is absent | Return the ordinary prefix | Not applicable; no mutation |
| membership shrink | Prefix exceeds total | Clamp during reconciliation/projection | Not applicable; no mutation |

## Invariants

- Input members are never sorted, mutated, duplicated, or persisted.
- Initial expansion does not return every member when total exceeds the batch.
- At most one off-prefix selected member is added.
- Selected reveal never causes the omitted interval to mount.
- Repeated load-more can reach every retained member.
- Ordinal metadata always refers to the complete ordered input set.
- Window state is O(1); rendered output is bounded by prefix plus at most one selected reveal.

## Scale and performance envelope

- Support 5,000 retained members, with a representative 600-member pocket.
- Default initial and incremental batch size is 40.
- Initial projection mounts at most 40 members, or 41 when an off-prefix selection is revealed.

## Observability

- Expose visible prefix, omitted count, total set size, inclusion reason, load-more availability, and next batch size.
- Do not emit task mutations, revisions, history events, or persistence writes.

## Headless interface

```text
createCompletedPocketWindow(total, batchSize?) -> WindowState
transitionCompletedPocketWindow(state, intent, total) -> WindowState
projectCompletedPocketWindow(members, state, selectedMemberId?) -> WindowProjection
```

## Contract tests

- S1 returns 40 of 600 members in retained order.
- S2 reaches a non-multiple total through bounded batches.
- S3 returns 40-prefix plus member 600 with ordinal 600/600.
- S4 preserves original ordering and coherent set metadata.
- S5 clamps on shrink and resets without per-member state.
- Invalid batch, missing selection, and 5,000-member scale remain bounded.

## Change history

- 1.0 / 2026-08-26: Implemented and locked after seven pure contract tests passed.
