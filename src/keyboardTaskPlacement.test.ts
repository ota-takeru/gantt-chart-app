import { describe, expect, it } from "vitest";
import {
  currentKeyboardTaskPlacementCandidate,
  initialKeyboardTaskPlacementState,
  transitionKeyboardTaskPlacement,
  type KeyboardTaskPlacementCandidate,
  type KeyboardTaskPlacementState,
} from "./keyboardTaskPlacement";

const validRootAppend: KeyboardTaskPlacementCandidate = {
  id: "root-append",
  valid: true,
};

const invalidDepth: KeyboardTaskPlacementCandidate = {
  id: "too-deep",
  targetParentId: "parent-8",
  valid: false,
  reason: "深さの上限を超えます",
};

const validBeforeSibling: KeyboardTaskPlacementCandidate = {
  id: "before-sibling",
  targetParentId: "parent-1",
  beforeTaskId: "sibling-2",
  valid: true,
};

const beginIntent = {
  type: "begin" as const,
  sourceTaskId: "task-1",
  returnFocusId: "task-row-task-1",
  candidates: [validRootAppend, invalidDepth, validBeforeSibling],
};

const chooseValidBeforeSibling = (): KeyboardTaskPlacementState => {
  const choosing = transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, beginIntent).state;
  const onInvalid = transitionKeyboardTaskPlacement(choosing, { type: "navigate", direction: "next" }).state;
  return transitionKeyboardTaskPlacement(onInvalid, { type: "navigate", direction: "next" }).state;
};

describe("keyboard task placement contract", () => {
  it("begins in choosing with a stable return focus identity and a copied candidate list", () => {
    const candidates = [...beginIntent.candidates];
    const result = transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, {
      ...beginIntent,
      candidates,
    });

    expect(result.effect).toBeUndefined();
    expect(result.state.phase).toBe("choosing");
    expect(result.state.sourceTaskId).toBe("task-1");
    expect(result.state.returnFocusId).toBe("task-row-task-1");
    expect(result.state.selectedIndex).toBe(0);
    expect(result.state.candidates).toEqual(candidates);
    expect(result.state.candidates).not.toBe(candidates);
    expect(candidates).toEqual(beginIntent.candidates);
  });

  it("wraps navigation so the first and last candidates are both reachable", () => {
    const choosing = transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, beginIntent).state;

    const previous = transitionKeyboardTaskPlacement(choosing, {
      type: "navigate",
      direction: "previous",
    }).state;
    expect(previous.phase).toBe("choosing");
    expect(previous.selectedIndex).toBe(2);
    expect(currentKeyboardTaskPlacementCandidate(previous)).toBe(validBeforeSibling);

    const next = transitionKeyboardTaskPlacement(previous, {
      type: "navigate",
      direction: "next",
    }).state;
    expect(next.selectedIndex).toBe(0);
    expect(currentKeyboardTaskPlacementCandidate(next)).toBe(validRootAppend);
  });

  it("keeps an invalid destination in choosing and exposes its adapter reason", () => {
    const choosing = transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, beginIntent).state;
    const invalid = transitionKeyboardTaskPlacement(choosing, {
      type: "navigate",
      direction: "next",
    }).state;
    expect(invalid.selectedIndex).toBe(1);

    const result = transitionKeyboardTaskPlacement(invalid, { type: "confirm" });

    expect(result.effect).toBeUndefined();
    expect(result.state.phase).toBe("choosing");
    expect(result.state.selectedIndex).toBe(1);
    expect(result.state.validationReason).toBe("深さの上限を超えます");
    expect(result.state.pendingPlacement).toBeUndefined();
    expect(result.state.error).toBeUndefined();
  });

  it("confirms a valid candidate with the exact placement effect and pending state", () => {
    const choosing = chooseValidBeforeSibling();
    const confirmed = transitionKeyboardTaskPlacement(choosing, { type: "confirm" });

    const expectedPlacement = {
      sourceTaskId: "task-1",
      targetParentId: "parent-1",
      beforeTaskId: "sibling-2",
    };
    expect(confirmed.state.phase).toBe("submitting");
    expect(confirmed.state.pendingPlacement).toEqual(expectedPlacement);
    expect(confirmed.effect).toEqual({
      type: "submit-placement",
      placement: expectedPlacement,
    });
  });

  it("cancels from the chooser and emits focus-return for the original control", () => {
    const choosing = transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, beginIntent).state;
    const cancelled = transitionKeyboardTaskPlacement(choosing, { type: "cancel" });

    expect(cancelled.state).toEqual(initialKeyboardTaskPlacementState);
    expect(cancelled.effect).toEqual({
      type: "focus-return",
      returnFocusId: "task-row-task-1",
    });
  });

  it("closes successfully and returns focus using the same stable identity", () => {
    const choosing = transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, beginIntent).state;
    const submitting = transitionKeyboardTaskPlacement(choosing, { type: "confirm" }).state;
    const succeeded = transitionKeyboardTaskPlacement(submitting, { type: "success" });

    expect(succeeded.state).toEqual(initialKeyboardTaskPlacementState);
    expect(succeeded.effect).toEqual({
      type: "focus-return",
      returnFocusId: "task-row-task-1",
    });
  });

  it("preserves the chooser and current destination on external failure", () => {
    const choosing = chooseValidBeforeSibling();
    const submitting = transitionKeyboardTaskPlacement(choosing, { type: "confirm" });
    const failed = transitionKeyboardTaskPlacement(submitting.state, {
      type: "failure",
      failure: {
        code: "submission-failed",
        message: "最新の階層リビジョンでは配置先が古くなっています",
      },
    });

    expect(failed.state.phase).toBe("failed");
    expect(failed.state.selectedIndex).toBe(2);
    expect(currentKeyboardTaskPlacementCandidate(failed.state)).toBe(validBeforeSibling);
    expect(failed.state.candidates).toEqual(choosing.candidates);
    expect(failed.state.pendingPlacement).toEqual(submitting.state.pendingPlacement);
    expect(failed.state.error).toEqual({
      code: "submission-failed",
      message: "最新の階層リビジョンでは配置先が古くなっています",
    });
    expect(failed.effect).toEqual({
      type: "focus-return",
      returnFocusId: "task-row-task-1",
    });
  });

  it("can recover a failed submission by navigating, then submit the newly selected valid candidate", () => {
    const choosing = chooseValidBeforeSibling();
    const submitting = transitionKeyboardTaskPlacement(choosing, { type: "confirm" }).state;
    const failed = transitionKeyboardTaskPlacement(submitting, {
      type: "failure",
      failure: { message: "stale placement" },
    }).state;
    const recovered = transitionKeyboardTaskPlacement(failed, {
      type: "navigate",
      direction: "next",
    });

    expect(recovered.state.phase).toBe("choosing");
    expect(recovered.state.error).toBeUndefined();
    expect(recovered.state.selectedIndex).toBe(0);
    expect(transitionKeyboardTaskPlacement(recovered.state, { type: "confirm" }).effect).toEqual({
      type: "submit-placement",
      placement: { sourceTaskId: "task-1" },
    });
  });

  it("rejects an empty or malformed candidate list without emitting a placement mutation", () => {
    const empty = transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, {
      ...beginIntent,
      candidates: [],
    });
    expect(empty.state.phase).toBe("failed");
    expect(empty.state.error?.code).toBe("no-candidates");
    expect(empty.effect).toBeUndefined();

    const malformed = transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, {
      ...beginIntent,
      candidates: [
        { id: "duplicate", valid: true },
        { id: "duplicate", valid: true },
      ],
    });
    expect(malformed.state.phase).toBe("failed");
    expect(malformed.state.error?.code).toBe("invalid-input");
    expect(malformed.effect).toBeUndefined();
  });

  it("does not replace an in-flight submission with a second begin or cancel", () => {
    const choosing = transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, beginIntent).state;
    const submitting = transitionKeyboardTaskPlacement(choosing, { type: "confirm" }).state;

    expect(transitionKeyboardTaskPlacement(submitting, { ...beginIntent }).state).toBe(submitting);
    expect(transitionKeyboardTaskPlacement(submitting, { type: "cancel" }).state).toBe(submitting);
  });
});
