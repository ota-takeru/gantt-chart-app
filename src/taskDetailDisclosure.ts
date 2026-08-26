/**
 * UI-neutral state and projection for progressive task-detail disclosure.
 *
 * The available-task input is a Set on purpose.  Disclosure transitions only
 * need membership checks, so selection and projection remain O(1) regardless
 * of the number of tasks in the current projection.
 */

export type AvailableTaskIds = ReadonlySet<string>;

export interface TaskDetailDisclosureState {
  /** The one task whose detail is stably disclosed, when one is selected. */
  readonly selectedTaskId?: string;
}

export type TaskDetailDisclosureIntent =
  | { readonly type: "select"; readonly taskId: string }
  | { readonly type: "focus"; readonly taskId: string }
  | { readonly type: "reconcile" }
  | { readonly type: "reset" }
  /** Pointer hover is intentionally presentation-only and never changes state. */
  | { readonly type: "hover"; readonly taskId?: string };

export interface TaskDetailDisclosureProjection {
  /** Task identity and the other essential information are always exposed. */
  readonly essentialInformation: true;
  /** Lifecycle state is part of the essential projection, never selection-only. */
  readonly essentialLifecycle: true;
  /** Richer context is exposed only for the stable selection. */
  readonly secondaryInformation: boolean;
  /** Non-primary task actions are exposed only for the stable selection. */
  readonly secondaryActions: boolean;
  /** Whether this task is linked to the stable disclosure selection. */
  readonly stableSelectionLink: boolean;
}

/**
 * Apply one disclosure intent without mutating task data or retaining state
 * for individual tasks.
 */
export function transitionTaskDetailDisclosure(
  state: TaskDetailDisclosureState,
  intent: TaskDetailDisclosureIntent,
  availableTaskIds: AvailableTaskIds,
): TaskDetailDisclosureState {
  switch (intent.type) {
    case "reset":
      return {};

    case "reconcile": {
      const selectedTaskId = state.selectedTaskId;
      if (selectedTaskId !== undefined && availableTaskIds.has(selectedTaskId)) {
        return state;
      }
      return {};
    }

    case "hover":
      // Hover is transient presentation input.  It cannot replace, clear, or
      // otherwise mutate the stable selection.
      return state;

    case "select":
    case "focus": {
      // An unavailable target is a no-op.  If a caller supplied stale state,
      // do not preserve that invalid selection as a new state.
      if (!availableTaskIds.has(intent.taskId)) {
        const selectedTaskId = state.selectedTaskId;
        return selectedTaskId !== undefined && availableTaskIds.has(selectedTaskId) ? state : {};
      }

      // Re-selecting the current task is idempotent and retains the existing
      // state object.  No per-task state is created.
      if (state.selectedTaskId === intent.taskId) return state;
      return { selectedTaskId: intent.taskId };
    }
  }
}

/**
 * Project one available task in constant time from the stable selection.
 * Callers should pass an identifier from the current available-task Set.
 */
export function projectTaskDetailDisclosure(
  state: TaskDetailDisclosureState,
  taskId: string,
  availableTaskIds: AvailableTaskIds,
): TaskDetailDisclosureProjection {
  const isStableSelection = state.selectedTaskId === taskId && availableTaskIds.has(taskId);
  return {
    essentialInformation: true,
    essentialLifecycle: true,
    secondaryInformation: isStableSelection,
    secondaryActions: isStableSelection,
    stableSelectionLink: isStableSelection,
  };
}
