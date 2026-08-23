# Design principles

Status: Provisional / Preferred

These principles are working design DNA for the Gantt chart app. They are intentionally not locked: they must be tested in a real screen with realistic data before being promoted. A new feature may challenge a principle when it provides a clear, domain-specific reason and preserves the capability contract.

## Product character

- Treat the product as a time-oriented work surface, not a generic SaaS dashboard. The main composition should help users reason about work across time, sequence, dependency, and change.
- Let the domain object lead the structure. Tasks are primarily rows and temporal objects; cards are not the default container for task information.
- Prefer a dense, calm, readable working surface over decorative whitespace or dashboard-style tile composition. Density must remain navigable and legible at realistic project scale.

## Information and time

- Keep current, past, and future meaning distinct. A user should not have to infer whether a mark describes what is true now, what was true, or what is planned.
- Do not visually confuse assignment/history with the schedule itself. Historical events and current schedule data may be related, but they need distinct representations and explanations.
- Preserve row alignment and temporal relationships when those relationships are central to a decision. Supporting details may be deferred, but not at the cost of losing the work surface’s context.

## Visual language

- Use color semantically for status, temporal meaning, alerts, selection, or other defined domain roles. Do not spend color on decoration when it competes with time and task interpretation.
- Keep hierarchy, state, and interaction understandable without color alone. Contrast, typography, position, and texture should carry meaning where needed.
- Establish visual styling after structural exploration. Typography, material, motion, and tokens should reinforce the selected representation rather than make a typical layout appear novel.

## Domain-specific distinction

- Give each major feature at least one domain-specific signature representation or interaction. The signature should make the feature’s underlying concept easier to understand or operate, and it must trace to a capability scenario or invariant.
- Typical patterns—cards, sidebars, modals, tabs, dashboards, and similar defaults—require a functional rationale. Explain the task or constraint they solve, what would fail without them, and why they fit the app’s density and temporal semantics.
- Originality should come from the way the app represents and lets users manipulate time-oriented work, not from arbitrary novelty that harms comprehension.

## Promoting a principle to Locked

After a principle has been exercised in a real screen with representative data and reviewed for comprehension, accessibility, density, and interaction quality:

1. Record the evidence and any known exceptions.
2. State the exact rule and scope; do not lock a vague aesthetic preference.
3. Get explicit product/design agreement in the relevant decision record.
4. Mark the principle `Locked` only after the review, and route later exceptions through an explicit change or supersession decision.

