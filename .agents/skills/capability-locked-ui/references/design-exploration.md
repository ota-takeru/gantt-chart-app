# Design exploration

Read this reference after a capability is locked and a substantial user-facing UI or flow must be designed, or when a visual-only request needs a genuinely new structural direction. The design explorer receives a Capability Pack and returns an exploration artifact; it does not change the capability or implement product UI.

## Inputs and independence

The Capability Pack contains:

- the locked capability contract and contract-test coverage;
- relevant design principles;
- existing product screenshots, tokens, or accessibility constraints when they are needed for compatibility;
- realistic data shape and scale.

Do not use a temporary or development-harness UI as a design reference. It is an implementation probe, not an established product decision. Keep the design exploration independent from the headless implementer’s guessed controls so familiar mechanisms do not become accidental requirements.

## Anti-anchoring assignment

For substantial UI, assign the design explorer to a different agent or context from the headless capability implementer whenever delegation is available. This separation exists to prevent implementation guesses from anchoring the design, not merely to distribute workload. Give the design explorer only the Capability Pack plus established design context: relevant principles, screenshots, tokens, accessibility constraints, and realistic data shape or scale. Deliberately withhold implementation reasoning, source-level control guesses, and the temporary harness UI.

If delegation is unavailable, the main agent must perform an explicit isolated design pass after the capability is locked, using only those same Capability Pack and established-context inputs while deliberately excluding the temporary harness and implementer’s guessed controls. The main agent remains responsible for requirements, selection/recommendation review, and final acceptance.

## Keep the lenses separate

Use four distinct lenses, then combine their conclusions in one exploration artifact:

- **Information:** what must be visible together, what can be deferred, and how current, future, past, or derived information is distinguished.
- **Interaction:** where an action starts, what the user perceives while acting, all relevant states, confirmation or cancellation, errors, recovery, and undo.
- **Layout:** the spatial model, alignment, hierarchy, density, navigation, and relationship between the primary object and supporting context.
- **Visual:** typography, color semantics, material, contrast, motion, and other styling. Do not let this lens decide structure prematurely.

The lenses may disagree. Record the tradeoff instead of letting one lens silently redefine the locked capability.

## Three structural theses

For substantial UI, produce three directions that differ in structure, not three themes of the same screen. Each direction must vary, where relevant:

- spatial model and information grouping;
- primary object the user thinks about;
- action origin and how the user initiates the operation;
- expression of pending, success, failure, cancellation, and undo;
- representation of time, sequence, or history.

Color swaps, light/dark themes, different corner radii, or alternate icon sets do not count as separate directions. If two directions can be implemented by changing tokens alone, they are one direction.

For each thesis, document:

```md
### Direction <A/B/C>: <thesis name>

- Thesis: <the domain-specific idea>
- Spatial model: <layout and relationships>
- Primary object: <what is made central>
- Action origin: <where/how an operation begins>
- State/result expression: <pending, success, failure, recovery, undo>
- Temporal/history representation: <how time or history is understood>
- Domain signature: <one distinctive representation or interaction>
- Capability traceability: <scenarios, outputs, and invariants addressed>
- Risks and scale concerns: <failure modes>
- Typical-pattern rationale: <why any card/sidebar/modal/tabs/dashboard pattern is functionally necessary>
```

## Monochrome first

Start with grayscale structure or equivalent low-fidelity representation. Establish hierarchy, density, alignment, states, movement, and temporal relationships before choosing the visual system. Do not use color, gradients, decorative illustration, shadows, or styling novelty to disguise an unresolved structural difference.

After a direction is selected, add the visual system and verify that color remains semantic and accessible. The visual system may refine the selected structure but must not turn the three directions into superficial theme variants.

## Domain signature and anti-template check

Every major feature needs at least one domain-specific signature representation or interaction: something that helps the user understand or manipulate the domain, not merely a branded color or decorative shape. Trace that signature to a locked capability scenario or invariant.

Typical patterns are allowed when they serve a demonstrated function. Whenever a card, sidebar, modal, tabs, or dashboard-like grouping appears, state:

1. what user task or constraint requires it;
2. what would fail without it;
3. how it preserves the capability’s semantics and scale;
4. why a less typical structure was rejected or is unnecessary.

Do not ban a pattern by taste alone, but do not accept it by habit alone.

## Exploration artifact and selection output

Return one artifact with the four lens notes, all three structural theses, a capability traceability matrix, scale/accessibility risks, and the anti-template rationale. End with:

```md
## Direction selection

- Selected direction: <A/B/C or delegated choice>
- Selection owner: <human or explicit delegation>
- Why it was selected: <fit to capability, domain signature, comprehension, and scale>
- Rejected directions: <what was learned from each>
- Structural decisions now fixed: <list>
- Visual decisions still open: <list>
- Integration questions: <only questions that could expose missing capability>
- Acceptance checks: <observable interaction and visual checks>
```

The human selects a direction unless the user explicitly delegates selection. Ask only about material ambiguity or the direction choice, and bundle those questions. If a direction exposes missing capability, do not patch the UI around it; stop and use the Capability Change Request protocol.

After selection, hand the selected design artifact and locked Capability Pack to the UI implementer. The implementer may be another bounded implementation agent, but it must not redesign the selected direction or change locked behavior; integration is through adapters. Do not introduce additional agents for tiny visual-only changes.
