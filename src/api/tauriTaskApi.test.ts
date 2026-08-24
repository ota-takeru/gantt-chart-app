import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TauriTaskApi } from "./tauriTaskApi";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const instant = "2026-08-23T06:12:00.000Z";
const placement = { beforeTaskId: "task-anchor" };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({} as never);
});

describe("TauriTaskApi command boundary", () => {
  it("sends camelCase payloads for every lifecycle and queue mutation", async () => {
    const api = new TauriTaskApi();

    await api.createTask("新しい作業", instant);
    expect(invokeMock).toHaveBeenLastCalledWith("create_task", {
      title: "新しい作業",
      effectiveInstant: instant,
    });

    await api.renameTask("task-1", "名前変更", 3, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("rename_task", {
      taskId: "task-1",
      title: "名前変更",
      expectedVersion: 3,
      effectiveInstant: instant,
    });

    await api.updateTaskMemo("task-1", "  exact\nメモ  ", 4, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("update_task_memo", {
      taskId: "task-1",
      memo: "  exact\nメモ  ",
      expectedTaskVersion: 4,
      effectiveInstant: instant,
    });

    await api.startTask("task-1", 3, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("start_task", {
      taskId: "task-1",
      expectedVersion: 3,
      effectiveInstant: instant,
    });

    await api.switchFocus("task-1", "task-2", { fromVersion: 3, toVersion: 2 }, placement, 17, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("switch_focus", {
      fromTaskId: "task-1",
      toTaskId: "task-2",
      expectedVersions: { fromVersion: 3, toVersion: 2 },
      fromQueuePlacement: placement,
      expectedQueueRevision: 17,
      effectiveInstant: instant,
    });

    await api.pauseTask("task-1", 4, placement, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("pause_task", {
      taskId: "task-1",
      expectedVersion: 4,
      queuePlacement: placement,
      effectiveInstant: instant,
    });

    await api.completeTask("task-1", 5, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("complete_task", {
      taskId: "task-1",
      expectedVersion: 5,
      effectiveInstant: instant,
    });

    await api.reopenTask("task-1", 6, placement, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("reopen_task", {
      taskId: "task-1",
      expectedVersion: 6,
      queuePlacement: placement,
      effectiveInstant: instant,
    });

    await api.moveQueuedTask("task-2", "task-3", 18, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("move_queued_task", {
      taskId: "task-2",
      beforeTaskId: "task-3",
      expectedQueueRevision: 18,
      effectiveInstant: instant,
    });
  });

  it("sends camelCase payloads for every read command", async () => {
    const api = new TauriTaskApi();

    await api.getCurrentFocus();
    expect(invokeMock).toHaveBeenLastCalledWith("get_current_focus");

    await api.getTask("task-1");
    expect(invokeMock).toHaveBeenLastCalledWith("get_task", { taskId: "task-1" });

    await api.getNextQueue("queue-cursor", 12);
    expect(invokeMock).toHaveBeenLastCalledWith("get_next_queue", { afterCursor: "queue-cursor", limit: 12 });

    await api.getTaskActualHistory("task-1");
    expect(invokeMock).toHaveBeenLastCalledWith("get_task_actual_history", { taskId: "task-1" });

    await api.getTaskSessions("task-1", "session-cursor", 50);
    expect(invokeMock).toHaveBeenLastCalledWith("get_task_sessions", { taskId: "task-1", afterCursor: "session-cursor", limit: 50 });

    await api.getHistoryByActualRange("2026-08-23T03:12:00.000Z", instant, "history-cursor", 200);
    expect(invokeMock).toHaveBeenLastCalledWith("get_history_by_actual_range", {
      rangeStart: "2026-08-23T03:12:00.000Z",
      rangeEnd: instant,
      afterCursor: "history-cursor",
      limit: 200,
    });

    await api.getFocusProjection("2026-08-23T03:12:00.000Z", instant, instant, "next-cursor", { segmentLimit: 200, nextWorkLimit: 12 });
    expect(invokeMock).toHaveBeenLastCalledWith("get_focus_projection", {
      rangeStart: "2026-08-23T03:12:00.000Z",
      rangeEnd: instant,
      currentInstant: instant,
      nextCursor: "next-cursor",
      limits: { segmentLimit: 200, nextWorkLimit: 12 },
    });

    await api.getDaySummary("2026-08-23", "Asia/Tokyo", instant, "day-cursor", 50);
    expect(invokeMock).toHaveBeenLastCalledWith("get_day_summary", {
      localDate: "2026-08-23",
      timeZone: "Asia/Tokyo",
      currentInstant: instant,
      cursor: "day-cursor",
      limit: 50,
    });

    await api.getArchiveSummary("2026-08-17", "2026-08-23", "Asia/Tokyo", instant, "archive-cursor", 50);
    expect(invokeMock).toHaveBeenLastCalledWith("get_archive_summary", {
      localDateStart: "2026-08-17",
      localDateEnd: "2026-08-23",
      timeZone: "Asia/Tokyo",
      currentInstant: instant,
      cursor: "archive-cursor",
      limit: 50,
    });
  });

  it("sends camelCase payloads for hierarchy reads and mutations", async () => {
    const api = new TauriTaskApi();

    await api.getTaskForest(5000);
    expect(invokeMock).toHaveBeenLastCalledWith("get_task_forest", { limit: 5000 });

    await api.createTaskInHierarchy("子タスク", "parent-1", "sibling-2", 11, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("create_task_in_hierarchy", {
      title: "子タスク",
      targetParentTaskId: "parent-1",
      beforeTaskId: "sibling-2",
      expectedHierarchyRevision: 11,
      effectiveInstant: instant,
    });

    await api.moveTaskInHierarchy("task-1", undefined, undefined, 12, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("move_task_in_hierarchy", {
      taskId: "task-1",
      targetParentTaskId: undefined,
      beforeTaskId: undefined,
      expectedHierarchyRevision: 12,
      effectiveInstant: instant,
    });

    await api.completeHierarchyTask("task-1", 4, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("complete_hierarchy_task", {
      taskId: "task-1",
      expectedTaskVersion: 4,
      effectiveInstant: instant,
    });

    await api.reopenHierarchyTask("task-1", 5, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("reopen_hierarchy_task", {
      taskId: "task-1",
      expectedTaskVersion: 5,
      effectiveInstant: instant,
    });

    await api.deleteTaskSubtree("task-1", 5, 13, instant);
    expect(invokeMock).toHaveBeenLastCalledWith("delete_task_subtree", {
      taskId: "task-1",
      expectedTaskVersion: 5,
      expectedHierarchyRevision: 13,
      effectiveInstant: instant,
    });

    await api.getUndoStatus();
    expect(invokeMock).toHaveBeenLastCalledWith("get_undo_status");

    await api.undoLastTaskOperation("operation-token", instant);
    expect(invokeMock).toHaveBeenLastCalledWith("undo_last_task_operation", {
      expectedOperationToken: "operation-token",
      effectiveInstant: instant,
    });
  });
});
