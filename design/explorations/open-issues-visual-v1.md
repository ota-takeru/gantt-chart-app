# Design exploration: open-issues-visual-v1

- Inputs: `design/capability-packs/open-issues-visual-v1.md`, `design/principles.md`, established history-left/NOW-right surface.
- Selection owner: User delegated completion and release of all open issues; main agent selected the recommended direction.

## Four lenses

- Information: hierarchy lineage, lifetime, actual-work aggregate, and current identity must stay semantically distinct. Aggregate work time is deferred to selected completed detail; hierarchy remains visible at rest.
- Interaction: existing row actions, collapse, selection, range controls, and local completed detail remain the action origins. Resize is passive and cannot mutate or reset view state.
- Layout: retain one aligned left-history/NOW/right-current row. Use fluid outer width, favor extra width for the time plane, and compress rather than merge deep hierarchy levels.
- Visual: use indentation, rails/elbows, text weight, a numeric depth cue, and ancestry text as non-color signals. Existing semantic palette remains authoritative.

## Structural theses

### Direction A: Elastic time field and lineage ladder

- Thesis: Keep the task row as the primary object while making its complete ancestry and time resolution legible.
- Spatial model: Fluid viewport surface; extra desktop width primarily enlarges history, the right identity plane stays readable, and depth 1–8 receives bounded distinct offsets/rails.
- Primary object: One task across lifetime, NOW hinge, and current identity.
- Action origin: Existing row and completed-detail actions.
- State/result expression: Selection strengthens lineage and exposes a compact full path; collapse and errors remain local.
- Temporal/history representation: Preset dates do not change on resize; actual-work total appears as labeled text in completed detail.
- Domain signature: A lineage ladder aligned to a lifetime row, with work duration explicitly separate from lifetime.
- Capability traceability: Hierarchy depth/order/collapse; session total/no-record; explicit range preservation.
- Risks and scale concerns: Deep titles can lose width, so levels 5–8 compress and selection supplies full ancestry.
- Typical-pattern rationale: No new card/sidebar/dashboard; attached detail remains necessary to avoid N+1 history loading and time-semantic confusion.

### Direction B: Proportional twin plane and branch bands

- Thesis: Make each parent branch the primary visual package.
- Spatial model: Both planes grow proportionally and parent rows create bounded branch bands.
- Primary object: Parent branch/work package.
- Action origin: Rows inside branch bands.
- State/result expression: Branch perimeter plus selected row.
- Temporal/history representation: Same range with branch-grouped completed marks.
- Domain signature: Time-aligned branch bands.
- Capability traceability: Parent/descendant scope and retained completion hierarchy.
- Risks and scale concerns: Bands become card-like and noisy at 120/600 scale.
- Typical-pattern rationale: Rejected because containment decoration competes with dense temporal alignment.

### Direction C: Compressed forest and focus-path lens

- Thesis: Keep the forest uniformly compact until selection reveals ancestry.
- Spatial model: Minimal resting indent and an inline path strip only for the selected row.
- Primary object: Current ancestry path.
- Action origin: Selected row.
- State/result expression: Focus opens the path lens; blur returns to compact form.
- Temporal/history representation: Selected lifetime receives contextual emphasis.
- Domain signature: On-demand ancestry lens.
- Capability traceability: Exact parent path and selection.
- Risks and scale concerns: Hierarchy remains weak at first glance and under-serves issue #1.
- Typical-pattern rationale: Rejected because it defers the information the issue asks to see continuously.

## Traceability and risks

| Required behavior | Direction A expression | Acceptance evidence |
|---|---|---|
| Depth 0–8 remains distinct | Compressed lineage ladder plus exact depth cue | Depth fixture and rendered inspection |
| Selected deep path is understandable | Full ancestry readout on selection/focus | Interaction test and 240-character title render |
| Fullscreen uses more width | Fluid surface, extra width biased to time plane | 1280/1600/1920 geometry measurements |
| Range meaning is stable | Resize changes pixels, never dates | Dataset bounds and zero API mutation check |
| Completed actual work remains visible | Lazy aggregate in attached detail | 17-minute, multi-session, and no-record tests |
| Lifetime is not effort | Existing lifetime geometry/ARIA unchanged | Regression assertions |

## Direction selection

- Selected direction: A — Elastic time field and lineage ladder.
- Selection owner: Delegated choice by the main agent.
- Why it was selected: It directly fixes deep hierarchy and fullscreen use while preserving the established domain-specific row/hinge structure and keeping actual work semantically separate from lifetime.
- Rejected directions: B adds noisy branch containers at scale; C hides hierarchy until interaction.
- Structural decisions now fixed: Fluid surface; unchanged range dates; extra width biased toward history; distinct bounded depth 0–8 cues; selected ancestry readout; lazy actual-work aggregate in completed detail.
- Visual decisions still open: Exact rail weights, compact spacing, and typography may use existing tokens after rendered QA.
- Integration questions: None; all required reads already exist in locked APIs.
- Acceptance checks: Representative 960/1280/1920 and dense/deep/only-completed renders; alignment, no horizontal overflow, keyboard/focus, ARIA validity, actual-duration/no-record/error states, and unchanged lifetime/range behavior.
