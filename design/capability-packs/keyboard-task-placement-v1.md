# Capability Pack: keyboard-task-placement v1.0

- Capability status: implemented / locked
- Issue: #13
- Product surface: UI-neutral adapter capability for the local hierarchy app
- Selection authority: The product owner requested a non-pointer placement path with the same exact placement tuple used by the hierarchy adapter.

## Locked capability source

- `specs/capabilities/keyboard-task-placement.md`

The source contract is authoritative. This pack defines no product controls, visual treatment, DOM semantics, or hierarchy mutation implementation.

## Observable outcomes the adapter must expose

- A source task enters a four-phase placement operation: `idle`, `choosing`, `submitting`, or `failed`.
- The candidate list is adapter-validated before choosing begins; every invalid candidate has a stable reason.
- Ordered candidates are reachable through wrapped `next`/`previous` navigation without pointer input.
- Invalid confirmation remains in `choosing` with the candidate's reason and no mutation effect.
- Valid confirmation emits exactly `{ sourceTaskId, targetParentId?, beforeTaskId? }` in a `submit-placement` effect and retains it while pending.
- Cancel, success, and failure expose a stable `focus-return` effect for the original `returnFocusId`.
- Failed submission retains the current destination, candidates, pending placement, and error so an adapter can recover deliberately.

## Capability boundary

The module is pure and owns no task forest, persistence, DOM focus, pointer handling, visual design, or automatic retry. A caller submits the exact effect to the hierarchy domain and reports success or failure back to the controller.

## Contract evidence

- `src/keyboardTaskPlacement.test.ts` covers begin validation, wrapped navigation, invalid confirmation, exact placement emission, cancel/success/failure focus continuity, recovery, malformed input, and in-flight guards.
- The implementation is `src/keyboardTaskPlacement.ts`.
- Lock evidence: 10 focused Vitest contract tests and `npm run check` passed without changing existing locked contracts or tests.

## Host and scale assumptions

- Candidate identities and validation reasons come from a revisioned hierarchy adapter.
- The controller retains one source operation and its candidate list, not the whole task forest.
- The adapter remains responsible for depth/cycle/parent/anchor validation and atomic mutation.

## Exclusions

- No React/App.tsx integration.
- No CSS, design exploration, drag/drop mechanism, focus API, or screen-reader copy.
- No changes to existing hierarchy, lifecycle, reversible-operation, or task-detail-disclosure specs, cores, or tests.
