# Integration gate

Read this reference before implementing a selected design direction through UI adapters and before final verification. It also applies to a small visual-only change as a boundary check, even when the capability implementation path is skipped.

## Boundary

The UI engineer binds the selected direction to the locked headless capability through adapters, view models, or equivalent translation code. The adapter may choose presentation and interaction details that the design selected; it may not redefine domain semantics.

The UI engineer must not edit:

- locked capability specifications;
- locked core behavior or headless interfaces;
- existing contract tests, including their assertions and negative cases.

If any of those need to change, stop and produce a Capability Change Request. A general feature request or a failing UI test is not authorization to change a locked contract.

## Integration sequence

1. Confirm the selected exploration artifact, locked Capability Pack, and design principles are the inputs. Do not use a temporary development harness as the product design.
2. Map UI actions and rendered states to the headless interface. Keep domain validation, persistence, history, and error meaning in the core; keep representation and interaction choreography in the UI layer.
3. Inspect the diff for boundary violations before running the full suite. Look for accidental core edits, contract edits, test weakening, or new UI code that bypasses the headless interface.
4. Run all existing contract tests and any new contract tests. Do not change an existing test merely to make it pass.
5. Add or run interaction tests covering every relevant success, pending, cancellation, failure, recovery, and undo state. Include stale or invalid inputs when the capability exposes them.
6. Render and visually inspect representative states: empty, typical, dense/realistic scale, selected/active, pending, success, error, and recovery. Verify the chosen structural thesis, domain signature, temporal/history distinction, and readable hierarchy—not just a happy-path screenshot.
7. Run relevant accessibility checks, including keyboard operation and focus/announcement behavior when the interaction supports or requires it. Check contrast and non-color state cues.
8. Report the gate result, unresolved risks, and any follow-up that is purely visual versus any follow-up that requires a Capability Change Request.

## Required evidence

The final review should be able to point to:

- passing existing and new contract tests;
- interaction coverage for the capability’s states and errors;
- a diff review showing that locked boundaries were not crossed;
- rendered evidence at representative and realistic scale;
- relevant keyboard, focus, contrast, and non-color checks;
- traceability from the selected design’s structure and signature to the locked capability.

## Missing capability rule

If the selected design requires an operation, state, output, history rule, or error that the locked capability does not provide, stop integration. Record the mismatch and create a Capability Change Request with the affected scenarios, invariants, tests, and compatibility impact. Do not silently expand the headless interface, mutate the core, weaken a contract test, or simulate a new semantic in the UI.

## Visual-only path

For a genuinely visual-only change, confirm that behavior, states, contracts, and interaction semantics remain unchanged. Run the appropriate render and accessibility checks, and verify that the diff contains no locked spec/core/contract-test edits. If the change alters behavior or reveals a missing capability, re-route to the full workflow.

