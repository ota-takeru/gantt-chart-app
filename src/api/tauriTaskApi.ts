import { invoke } from "@tauri-apps/api/core";
import {
  type ActualHistoryPage,
  type ActualHistorySummary,
  type ArchiveSummaryPage,
  type DaySummaryPage,
  type FocusProjection,
  type HierarchyChangeResult,
  type LifecycleResult,
  type ProjectionLimits,
  type QueueChangeResult,
  type QueuePage,
  type QueuePlacement,
  type ReversibleChangeResult,
  type SwitchExpectedVersions,
  type TaskApi,
  type TaskSnapshot,
  type TaskForestSnapshot,
  type WorkSessionPage,
  type UndoStatus,
} from "./types";

function effectiveInstant(value?: string): string {
  return value ?? new Date().toISOString();
}

/**
 * The only production UI boundary that knows about Tauri's invoke API.
 * React components receive a typed TaskApi and never call invoke directly.
 */
export class TauriTaskApi implements TaskApi {
  createTask(title: string, instant?: string) {
    return invoke<TaskSnapshot>("create_task", {
      title,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  renameTask(taskId: string, title: string, expectedVersion: number, instant?: string) {
    return invoke<TaskSnapshot>("rename_task", {
      taskId,
      title,
      expectedVersion,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  updateTaskMemo(taskId: string, memo: string, expectedTaskVersion: number, instant?: string) {
    return invoke<ReversibleChangeResult>("update_task_memo", {
      taskId,
      memo,
      expectedTaskVersion,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  startTask(taskId: string, expectedVersion: number, instant?: string) {
    return invoke<LifecycleResult>("start_task", {
      taskId,
      expectedVersion,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  switchFocus(
    fromTaskId: string,
    toTaskId: string,
    expectedVersions: SwitchExpectedVersions,
    fromQueuePlacement?: QueuePlacement,
    expectedQueueRevision?: number,
    instant?: string,
  ) {
    return invoke<LifecycleResult>("switch_focus", {
      fromTaskId,
      toTaskId,
      expectedVersions,
      fromQueuePlacement,
      expectedQueueRevision,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  pauseTask(taskId: string, expectedVersion: number, queuePlacement?: QueuePlacement, instant?: string) {
    return invoke<LifecycleResult>("pause_task", {
      taskId,
      expectedVersion,
      queuePlacement,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  completeTask(taskId: string, expectedVersion: number, instant?: string) {
    return invoke<LifecycleResult>("complete_task", {
      taskId,
      expectedVersion,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  reopenTask(taskId: string, expectedVersion: number, queuePlacement?: QueuePlacement, instant?: string) {
    return invoke<LifecycleResult>("reopen_task", {
      taskId,
      expectedVersion,
      queuePlacement,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  getCurrentFocus() {
    return invoke<TaskSnapshot | null>("get_current_focus");
  }

  getTask(taskId: string) {
    return invoke<TaskSnapshot>("get_task", { taskId });
  }

  getNextQueue(afterCursor: string | undefined, limit: number) {
    return invoke<QueuePage>("get_next_queue", { afterCursor, limit });
  }

  moveQueuedTask(taskId: string, beforeTaskId: string | undefined, expectedQueueRevision: number, instant?: string) {
    return invoke<QueueChangeResult>("move_queued_task", {
      taskId,
      beforeTaskId,
      expectedQueueRevision,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  getTaskActualHistory(taskId: string) {
    return invoke<ActualHistorySummary>("get_task_actual_history", { taskId });
  }

  getTaskSessions(taskId: string, afterCursor: string | undefined, limit: number) {
    return invoke<WorkSessionPage>("get_task_sessions", { taskId, afterCursor, limit });
  }

  getHistoryByActualRange(rangeStart: string, rangeEnd: string, afterCursor: string | undefined, limit: number) {
    return invoke<ActualHistoryPage>("get_history_by_actual_range", {
      rangeStart,
      rangeEnd,
      afterCursor,
      limit,
    });
  }

  getFocusProjection(
    rangeStart: string,
    rangeEnd: string,
    currentInstant: string,
    nextCursor: string | undefined,
    limits: ProjectionLimits,
  ) {
    return invoke<FocusProjection>("get_focus_projection", {
      rangeStart,
      rangeEnd,
      currentInstant,
      nextCursor,
      limits,
    });
  }

  getDaySummary(localDate: string, timeZone: string, currentInstant: string, cursor: string | undefined, limit: number) {
    return invoke<DaySummaryPage>("get_day_summary", {
      localDate,
      timeZone,
      currentInstant,
      cursor,
      limit,
    });
  }

  getArchiveSummary(
    localDateStart: string,
    localDateEnd: string,
    timeZone: string,
    currentInstant: string,
    cursor: string | undefined,
    limit: number,
  ) {
    return invoke<ArchiveSummaryPage>("get_archive_summary", {
      localDateStart,
      localDateEnd,
      timeZone,
      currentInstant,
      cursor,
      limit,
    });
  }

  createTaskInHierarchy(
    title: string,
    targetParentTaskId: string | undefined,
    beforeTaskId: string | undefined,
    expectedHierarchyRevision: number,
    instant?: string,
  ) {
    return invoke<HierarchyChangeResult>("create_task_in_hierarchy", {
      title,
      targetParentTaskId,
      beforeTaskId,
      expectedHierarchyRevision,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  moveTaskInHierarchy(
    taskId: string,
    targetParentTaskId: string | undefined,
    beforeTaskId: string | undefined,
    expectedHierarchyRevision: number,
    instant?: string,
  ) {
    return invoke<HierarchyChangeResult>("move_task_in_hierarchy", {
      taskId,
      targetParentTaskId,
      beforeTaskId,
      expectedHierarchyRevision,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  completeHierarchyTask(taskId: string, expectedTaskVersion: number, instant?: string) {
    return invoke<HierarchyChangeResult>("complete_hierarchy_task", {
      taskId,
      expectedTaskVersion,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  reopenHierarchyTask(taskId: string, expectedTaskVersion: number, instant?: string) {
    return invoke<HierarchyChangeResult>("reopen_hierarchy_task", {
      taskId,
      expectedTaskVersion,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  getTaskForest(limit: number) {
    return invoke<TaskForestSnapshot>("get_task_forest", { limit });
  }

  deleteTaskSubtree(
    taskId: string,
    expectedTaskVersion: number,
    expectedHierarchyRevision: number,
    instant?: string,
  ) {
    return invoke<ReversibleChangeResult>("delete_task_subtree", {
      taskId,
      expectedTaskVersion,
      expectedHierarchyRevision,
      effectiveInstant: effectiveInstant(instant),
    });
  }

  getUndoStatus() {
    return invoke<UndoStatus>("get_undo_status");
  }

  undoLastTaskOperation(expectedOperationToken: string, instant?: string) {
    return invoke<ReversibleChangeResult>("undo_last_task_operation", {
      expectedOperationToken,
      effectiveInstant: effectiveInstant(instant),
    });
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
