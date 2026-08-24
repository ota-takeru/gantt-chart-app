# Capability Pack: application-update-delivery v1

## Locked capability

- Source: `specs/capabilities/application-update-delivery.md`
- Status/version: locked / 1.0
- Contract evidence: UpdateApi contract tests pass; full frontend and Rust suites pass at lock time.
- Required outcome: A user can discover a trusted newer version, choose when to interrupt work, observe application progress, recover from failure, and relaunch only after a successful install.

## Required scenarios and states

- Update check runs once at desktop startup without blocking workspace loading.
- Up-to-date is quiet and causes no task, process, filesystem, or DB mutation.
- Available update exposes version, optional release notes, and optional publication time.
- Apply begins only from explicit user intent; postponing preserves the current work surface.
- Download/install expose progress; failure keeps the current app open and offers a safe retry/check path.
- Successful install is the only state that permits relaunch.
- Browser preview/test mode performs no network or Tauri calls.

## Invariants to preserve in representation

- Checking is not applying.
- Availability is not urgency and must not impersonate a task-domain alert.
- No automatic download, install, or relaunch.
- Signature verification is mandatory but is a trust property, not a decorative security claim.
- Update UI must not obscure or reflow the row-aligned time/task work surface at dense realistic scale.
- State and recovery cannot depend on color alone; focus and live announcements must remain legible.

## Established design context

- Source: `design/principles.md`.
- The product is a dense, calm, time-oriented work surface rather than a dashboard.
- Tasks remain the primary rows and temporal objects; cards are not the default container.
- Color is semantic; hierarchy and state remain understandable without color.
- The existing primary screen has a compact top line, aligned history/NOW/task surface, transient operation feedback, and an undo receipt.
- Minimum supported product viewport is 960 × 640; representative desktop is 1280 × 800.

## Realistic content and scale

- Candidate version: `0.3.0` from current `0.2.0`.
- Notes may be absent, a single sentence, or several short release-note paragraphs.
- Published date may be absent.
- Download size may be unknown initially, then known; progress may range from 0 to hundreds of MB.
- Dense workspace: 80–200 hierarchy rows, with active inline editing or a task memo already open when availability becomes known.
- Failures: offline check, interrupted download, invalid signature/install failure, relaunch failure after install.

## Accessibility constraints

- All actions keyboard operable with visible focus.
- Availability, progress, success, and failure have appropriate polite/assertive announcements without repeated progress chatter.
- Notes and controls remain readable at 200% zoom and the minimum viewport.
- Forced-colors mode preserves borders, status distinction, and actionable controls.

## Exploration deliverable

- Use the four lenses and three structurally different theses required by the capability-locked UI workflow.
- Start monochrome; include all relevant states and recovery.
- Provide a traceability matrix, anti-template rationale, risks, and acceptance checks.
- The user accepted the referenced proposal's unobtrusive “available update + later / update and restart” direction. Treat that as human selection of the thesis that best preserves uninterrupted work, but still document three structural alternatives and explain the final mapping.
- Do not inspect or infer the headless implementation, temporary harness, or guessed source-level controls.
