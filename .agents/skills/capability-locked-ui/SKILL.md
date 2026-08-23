---
name: capability-locked-ui
description: Separate headless capability implementation from independent, non-template UI exploration and integration for new or substantially changed user-facing features or flows; excludes tiny visual-only tweaks.
---

# Capability-locked UI

Use this skill to make the domain behavior stable before UI mechanisms are chosen, so a new feature can receive an original design without silently changing existing behavior.

## Route the request

- **New capability or full feature workflow:** run the complete workflow below. Read [capability-contract.md](references/capability-contract.md) before defining the contract or implementation, then read [design-exploration.md](references/design-exploration.md) once the capability is locked and substantial UI exploration is needed, and read [integration-gate.md](references/integration-gate.md) before UI implementation and final verification.
- **Visual-only or design-plus-integration change:** skip capability implementation only when behavior and contracts are unchanged. Read [design-exploration.md](references/design-exploration.md) for a new substantial direction and [integration-gate.md](references/integration-gate.md) before applying or verifying it. Confirm the diff does not touch locked contracts, core behavior, or existing contract tests.
- **Behavior bug or contract-preserving diagnosis:** treat the existing capability contract, core, and tests as the boundary. Read [capability-contract.md](references/capability-contract.md) to identify the locked behavior and [integration-gate.md](references/integration-gate.md) for regression checks. If the fix changes meaning, states, invariants, or outcomes, stop and create a Capability Change Request instead.

## Core workflow

1. Define a UI-free capability contract: user outcome, domain inputs/outputs, scenarios, states, errors, invariants, scale, observability, and a headless interface. Do not freeze UI mechanisms or nouns such as drag, modal, card, sidebar, or tabs unless the user explicitly requires one.
2. Implement the headless capability and contract tests without product UI. A temporary development harness may be used for exercising behavior, but do not show it as a design reference.
3. Run the contract tests. Only after implementation and tests pass, mark the capability implemented and lock it. A locked specification, core behavior, and existing contract tests must not be edited silently.
4. Build a Capability Pack from the locked contract, design principles, and any relevant screenshots or tokens. For substantial UI, assign design exploration to a different agent or context from the headless capability implementer when delegation is available. This separation is an anti-anchoring mechanism: the design explorer must receive only the Capability Pack and established design context, not implementation reasoning, guessed controls, or the temporary harness. If delegation is unavailable, run an explicit isolated design pass after lock with those same inputs and exclusions. Explore three structurally different design theses; vary the spatial model, primary object, action origin, state/result expression, and temporal/history representation. Start monochrome and defer the visual system until a structure is selected. Read [design-exploration.md](references/design-exploration.md) for the required artifact and selection output.
5. Have a human select a direction unless the user explicitly delegates that choice. Ask only about material capability ambiguity or direction selection, and bundle questions.
6. Implement the selected UI through adapters that bind to the locked headless capability. The UI implementer works only from the selected design artifact and locked capability; it may be another bounded implementation agent, but it may not edit locked specifications, core behavior, or existing contract tests. Do not add extra agents for tiny visual-only changes. Read [integration-gate.md](references/integration-gate.md) before this step.
7. Run the integration gate: existing and new contract tests, interaction coverage for states and errors, representative visual rendering at realistic scale, and relevant accessibility/keyboard checks. If the selected design requires missing behavior, stop and issue a Capability Change Request rather than changing the contract implicitly.

## Non-negotiable boundaries

- Design exploration may choose representation and interaction, but it may not redefine the locked capability.
- The main agent owns requirements, design-direction recommendation/selection review, and final acceptance. Delegated agents perform bounded implementation or exploration within the handoff boundaries.
- UI integration may add adapters and UI tests, but it may not silently change locked behavior.
- Existing contract tests are evidence of the locked behavior. Never rewrite or weaken them to make a change pass.
- A capability change requires explicit user authorization through the change-request protocol in [capability-contract.md](references/capability-contract.md).
