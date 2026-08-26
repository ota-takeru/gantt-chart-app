/**
 * UI-neutral keyboard/non-pointer placement state machine.
 *
 * The controller owns only placement intent and recovery state. It emits an
 * exact placement request for an adapter to submit; it never mutates a task
 * hierarchy itself.
 */

export type KeyboardTaskPlacementPhase = "idle" | "choosing" | "submitting" | "failed";

export type KeyboardTaskPlacementDirection = "next" | "previous";

export type KeyboardTaskPlacementErrorCode =
  | "invalid-input"
  | "no-candidates"
  | "submission-failed";

export interface KeyboardTaskPlacement {
  readonly sourceTaskId: string;
  readonly targetParentId?: string;
  readonly beforeTaskId?: string;
}

export interface KeyboardTaskPlacementCandidate {
  /** Stable identity for this candidate seam or parent destination. */
  readonly id: string;
  readonly targetParentId?: string;
  readonly beforeTaskId?: string;
  /** The adapter's authoritative validation result. */
  readonly valid: boolean;
  /** Required explanation when `valid` is false. */
  readonly reason?: string;
}

export interface KeyboardTaskPlacementError {
  readonly code: KeyboardTaskPlacementErrorCode;
  readonly message: string;
}

export interface KeyboardTaskPlacementState {
  readonly phase: KeyboardTaskPlacementPhase;
  readonly sourceTaskId?: string;
  readonly candidates: readonly KeyboardTaskPlacementCandidate[];
  readonly selectedIndex?: number;
  /** Stable identity of the row/control that opened placement mode. */
  readonly returnFocusId?: string;
  /** Set when the selected candidate was invalidated at confirmation time. */
  readonly validationReason?: string;
  /** Exact request retained while the external mutation is pending. */
  readonly pendingPlacement?: KeyboardTaskPlacement;
  /** External submission error; the chooser remains recoverable. */
  readonly error?: KeyboardTaskPlacementError;
}

export type KeyboardTaskPlacementEffect =
  | {
      readonly type: "submit-placement";
      readonly placement: KeyboardTaskPlacement;
    }
  | {
      readonly type: "focus-return";
      readonly returnFocusId: string;
    };

export interface KeyboardTaskPlacementTransition {
  readonly state: KeyboardTaskPlacementState;
  readonly effect?: KeyboardTaskPlacementEffect;
}

export interface KeyboardTaskPlacementFailure {
  readonly message: string;
  readonly code?: Exclude<KeyboardTaskPlacementErrorCode, "invalid-input" | "no-candidates">;
}

export type KeyboardTaskPlacementIntent =
  | {
      readonly type: "begin";
      readonly sourceTaskId: string;
      readonly candidates: readonly KeyboardTaskPlacementCandidate[];
      readonly returnFocusId: string;
    }
  | {
      readonly type: "navigate";
      readonly direction: KeyboardTaskPlacementDirection;
    }
  | { readonly type: "confirm" }
  | { readonly type: "cancel" }
  | { readonly type: "success" }
  | {
      readonly type: "failure";
      readonly failure: KeyboardTaskPlacementFailure;
    };

export const initialKeyboardTaskPlacementState: KeyboardTaskPlacementState = {
  phase: "idle",
  candidates: [],
};

const noOp = (state: KeyboardTaskPlacementState): KeyboardTaskPlacementTransition => ({ state });

const focusReturn = (state: KeyboardTaskPlacementState): KeyboardTaskPlacementEffect | undefined =>
  state.returnFocusId
    ? {
        type: "focus-return",
        returnFocusId: state.returnFocusId,
      }
    : undefined;

const hasUniqueCandidateIds = (candidates: readonly KeyboardTaskPlacementCandidate[]): boolean => {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.id || ids.has(candidate.id)) {
      return false;
    }
    ids.add(candidate.id);
  }
  return true;
};

const hasReasonForInvalidCandidates = (candidates: readonly KeyboardTaskPlacementCandidate[]): boolean =>
  candidates.every((candidate) => candidate.valid || Boolean(candidate.reason));

const selectedCandidate = (state: KeyboardTaskPlacementState): KeyboardTaskPlacementCandidate | undefined =>
  state.selectedIndex === undefined ? undefined : state.candidates[state.selectedIndex];

const placementFor = (
  sourceTaskId: string,
  candidate: KeyboardTaskPlacementCandidate,
): KeyboardTaskPlacement => {
  const placement: KeyboardTaskPlacement = {
    sourceTaskId,
  };
  if (candidate.targetParentId !== undefined) {
    return {
      ...placement,
      targetParentId: candidate.targetParentId,
      ...(candidate.beforeTaskId === undefined ? {} : { beforeTaskId: candidate.beforeTaskId }),
    };
  }
  return {
    ...placement,
    ...(candidate.beforeTaskId === undefined ? {} : { beforeTaskId: candidate.beforeTaskId }),
  };
};

const begin = (
  sourceTaskId: string,
  candidatesInput: readonly KeyboardTaskPlacementCandidate[],
  returnFocusId: string,
): KeyboardTaskPlacementTransition => {
  const candidates = [...candidatesInput];

  if (!sourceTaskId || !returnFocusId || !hasUniqueCandidateIds(candidates) || !hasReasonForInvalidCandidates(candidates)) {
    return {
      state: {
        phase: "failed",
        sourceTaskId: sourceTaskId || undefined,
        candidates,
        returnFocusId: returnFocusId || undefined,
        error: {
          code: "invalid-input",
          message: "Placement requires a source, a return focus identity, unique candidates, and invalid reasons.",
        },
      },
    };
  }

  if (candidates.length === 0) {
    return {
      state: {
        phase: "failed",
        sourceTaskId,
        candidates,
        returnFocusId,
        error: {
          code: "no-candidates",
          message: "No placement candidates are available.",
        },
      },
    };
  }

  return {
    state: {
      phase: "choosing",
      sourceTaskId,
      candidates,
      selectedIndex: 0,
      returnFocusId,
    },
  };
};

const navigate = (
  state: KeyboardTaskPlacementState,
  direction: KeyboardTaskPlacementDirection,
): KeyboardTaskPlacementTransition => {
  if (state.phase !== "choosing" && state.phase !== "failed") {
    return noOp(state);
  }

  if (state.candidates.length === 0) {
    return noOp(state);
  }

  const currentIndex = state.selectedIndex ?? 0;
  const step = direction === "next" ? 1 : -1;
  // Navigation wraps so every supplied candidate is reachable without
  // requiring pointer interaction or an out-of-band hierarchy lookup.
  const selectedIndex = (currentIndex + step + state.candidates.length) % state.candidates.length;

  return {
    state: {
      ...state,
      phase: "choosing",
      selectedIndex,
      validationReason: undefined,
      error: undefined,
      pendingPlacement: undefined,
    },
  };
};

const confirm = (state: KeyboardTaskPlacementState): KeyboardTaskPlacementTransition => {
  if (state.phase !== "choosing" && state.phase !== "failed") {
    return noOp(state);
  }

  const candidate = selectedCandidate(state);
  if (!candidate || !candidate.valid || !state.sourceTaskId) {
    return {
      state: {
        ...state,
        phase: "choosing",
        validationReason: candidate?.reason || "Choose a valid placement destination before confirming.",
        error: undefined,
        pendingPlacement: undefined,
      },
    };
  }

  const placement = placementFor(state.sourceTaskId, candidate);
  return {
    state: {
      ...state,
      phase: "submitting",
      validationReason: undefined,
      pendingPlacement: placement,
      error: undefined,
    },
    effect: {
      type: "submit-placement",
      placement,
    },
  };
};

const cancel = (state: KeyboardTaskPlacementState): KeyboardTaskPlacementTransition => {
  if (state.phase === "idle" || state.phase === "submitting") {
    return noOp(state);
  }

  return {
    state: initialKeyboardTaskPlacementState,
    effect: focusReturn(state),
  };
};

const success = (state: KeyboardTaskPlacementState): KeyboardTaskPlacementTransition => {
  if (state.phase !== "submitting") {
    return noOp(state);
  }

  return {
    state: initialKeyboardTaskPlacementState,
    effect: focusReturn(state),
  };
};

const failure = (
  state: KeyboardTaskPlacementState,
  result: KeyboardTaskPlacementFailure,
): KeyboardTaskPlacementTransition => {
  if (state.phase !== "submitting") {
    return noOp(state);
  }

  return {
    state: {
      ...state,
      phase: "failed",
      error: {
        code: result.code || "submission-failed",
        message: result.message,
      },
    },
    effect: focusReturn(state),
  };
};

/** Apply one pure intent and return the next state plus an adapter effect. */
export function transitionKeyboardTaskPlacement(
  state: KeyboardTaskPlacementState,
  intent: KeyboardTaskPlacementIntent,
): KeyboardTaskPlacementTransition {
  switch (intent.type) {
    case "begin":
      // A pending external mutation cannot be replaced by a second chooser.
      return state.phase === "submitting" ? noOp(state) : begin(intent.sourceTaskId, intent.candidates, intent.returnFocusId);
    case "navigate":
      return navigate(state, intent.direction);
    case "confirm":
      return confirm(state);
    case "cancel":
      return cancel(state);
    case "success":
      return success(state);
    case "failure":
      return failure(state, intent.failure);
  }
}

export function currentKeyboardTaskPlacementCandidate(
  state: KeyboardTaskPlacementState,
): KeyboardTaskPlacementCandidate | undefined {
  return selectedCandidate(state);
}
