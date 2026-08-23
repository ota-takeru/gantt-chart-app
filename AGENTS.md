# Project instructions

## Capability-locked UI workflow

- Use `$capability-locked-ui` before implementing any new or substantially changed user-facing capability, screen flow, or interaction. A change is substantial when it changes a user outcome, domain state, persistence/history, error behavior, or interaction semantics.
- Small visual-only changes may skip capability implementation, but they must not edit locked capability contracts, locked core behavior, or existing contract tests. If a visual change reveals a behavior or contract gap, route it through the full workflow.
- Keep capability definition and headless implementation independent from UI design exploration. A development harness may exercise the headless behavior, but it is not product UI and must not become a design reference.
- For substantial UI, when delegation is available, assign capability implementation and design exploration to different agents or contexts. This is an anti-anchoring boundary, not merely workload distribution: the design explorer receives the Capability Pack and established design context, not implementation reasoning, guessed controls, or the temporary harness. If delegation is unavailable, perform an explicit isolated design pass after lock with those same inputs and exclusions.
- Locked capability specifications and existing contract tests are immutable unless the user explicitly authorizes a Capability Change Request. Never weaken or edit tests merely to make them pass.
- If integration discovers behavior that the locked capability does not provide, stop integration and produce a Capability Change Request; do not silently change the capability or add a UI workaround that changes its meaning.
- The main agent owns requirements, product/design choices, and final review. Bounded code edits and focused tests may be delegated, with the main agent checking the resulting diff and validation.
- Human checkpoints should be limited to material capability ambiguity and design-direction selection; bundle questions instead of stopping after every phase.
