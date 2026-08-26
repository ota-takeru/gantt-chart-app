import { describe, expect, it } from "vitest";
import {
  projectTaskDetailDisclosure,
  transitionTaskDetailDisclosure,
  type TaskDetailDisclosureProjection,
  type TaskDetailDisclosureState,
} from "./taskDetailDisclosure";

const availableTaskIds = new Set(["task-a", "task-b", "task-c"]);

function restingProjection(): TaskDetailDisclosureProjection {
  return {
    essentialInformation: true,
    essentialLifecycle: true,
    secondaryInformation: false,
    secondaryActions: false,
    stableSelectionLink: false,
  };
}

function selectedProjection(): TaskDetailDisclosureProjection {
  return {
    essentialInformation: true,
    essentialLifecycle: true,
    secondaryInformation: true,
    secondaryActions: true,
    stableSelectionLink: true,
  };
}

describe("task-detail-disclosure contract", () => {
  it("S1 projects essential information, including lifecycle, at rest", () => {
    const resting: TaskDetailDisclosureState = {};

    for (const taskId of availableTaskIds) {
      expect(projectTaskDetailDisclosure(resting, taskId, availableTaskIds)).toEqual(restingProjection());
    }
  });

  it("S2 replaces any prior selection and discloses exactly one available task", () => {
    const selected = transitionTaskDetailDisclosure(
      { selectedTaskId: "task-a" },
      { type: "select", taskId: "task-b" },
      availableTaskIds,
    );

    expect(selected).toEqual({ selectedTaskId: "task-b" });
    expect(projectTaskDetailDisclosure(selected, "task-a", availableTaskIds)).toEqual(restingProjection());
    expect(projectTaskDetailDisclosure(selected, "task-b", availableTaskIds)).toEqual(selectedProjection());
    expect(projectTaskDetailDisclosure(selected, "task-c", availableTaskIds)).toEqual(restingProjection());
  });

  it("S3 makes keyboard focus equivalent to explicit selection", () => {
    const explicitlySelected = transitionTaskDetailDisclosure(
      {},
      { type: "select", taskId: "task-b" },
      availableTaskIds,
    );
    const focusSelected = transitionTaskDetailDisclosure(
      {},
      { type: "focus", taskId: "task-b" },
      availableTaskIds,
    );

    expect(focusSelected).toEqual(explicitlySelected);
    expect(projectTaskDetailDisclosure(focusSelected, "task-b", availableTaskIds)).toEqual(
      projectTaskDetailDisclosure(explicitlySelected, "task-b", availableTaskIds),
    );
  });

  it("S4 treats hover as a no-op and retains the selected disclosure", () => {
    const selected = { selectedTaskId: "task-a" } as const;
    const afterHover = transitionTaskDetailDisclosure(selected, { type: "hover", taskId: "task-b" }, availableTaskIds);

    expect(afterHover).toBe(selected);
    expect(projectTaskDetailDisclosure(afterHover, "task-a", availableTaskIds)).toEqual(selectedProjection());
    expect(projectTaskDetailDisclosure(afterHover, "task-b", availableTaskIds)).toEqual(restingProjection());

    const afterHoverLeave = transitionTaskDetailDisclosure(afterHover, { type: "hover" }, availableTaskIds);
    expect(afterHoverLeave).toBe(selected);
  });

  it("S5 clears a stale selection during reconciliation", () => {
    const remainingTaskIds = new Set(["task-a", "task-c"]);
    const reconciled = transitionTaskDetailDisclosure(
      { selectedTaskId: "task-b" },
      { type: "reconcile" },
      remainingTaskIds,
    );

    expect(reconciled).toEqual({});
    expect(projectTaskDetailDisclosure(reconciled, "task-a", remainingTaskIds)).toEqual(restingProjection());
    expect(projectTaskDetailDisclosure(reconciled, "task-c", remainingTaskIds)).toEqual(restingProjection());
  });

  it("preserves the prior valid selection for unavailable select and focus targets", () => {
    const selected = { selectedTaskId: "task-a" } as const;

    const afterUnavailableSelect = transitionTaskDetailDisclosure(
      selected,
      { type: "select", taskId: "task-missing" },
      availableTaskIds,
    );
    const afterUnavailableFocus = transitionTaskDetailDisclosure(
      selected,
      { type: "focus", taskId: "task-missing" },
      availableTaskIds,
    );

    expect(afterUnavailableSelect).toBe(selected);
    expect(afterUnavailableFocus).toBe(selected);
  });

  it("resets disclosure without changing task identifiers or their projection inputs", () => {
    const reset = transitionTaskDetailDisclosure(
      { selectedTaskId: "task-b" },
      { type: "reset" },
      availableTaskIds,
    );

    expect(reset).toEqual({});
    expect([...availableTaskIds]).toEqual(["task-a", "task-b", "task-c"]);
    expect(projectTaskDetailDisclosure(reset, "task-b", availableTaskIds)).toEqual(restingProjection());
  });

  it("keeps repeated selection idempotent and uses Set membership for dense projections", () => {
    const selected = transitionTaskDetailDisclosure(
      {},
      { type: "select", taskId: "task-b" },
      availableTaskIds,
    );
    const repeated = transitionTaskDetailDisclosure(
      selected,
      { type: "select", taskId: "task-b" },
      availableTaskIds,
    );
    const focusedAgain = transitionTaskDetailDisclosure(
      repeated,
      { type: "focus", taskId: "task-b" },
      availableTaskIds,
    );

    expect(repeated).toBe(selected);
    expect(focusedAgain).toBe(selected);

    const denseTaskIds = new Set(Array.from({ length: 5_000 }, (_, index) => `task-${index}`));
    const denseState = transitionTaskDetailDisclosure(
      {},
      { type: "focus", taskId: "task-4999" },
      denseTaskIds,
    );
    expect(denseState).toEqual({ selectedTaskId: "task-4999" });
    expect(projectTaskDetailDisclosure(denseState, "task-4999", denseTaskIds)).toEqual(selectedProjection());
    expect(projectTaskDetailDisclosure(denseState, "task-0", denseTaskIds)).toEqual(restingProjection());
  });
});
