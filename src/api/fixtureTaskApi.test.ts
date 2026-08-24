import { describe, expect, it } from "vitest";
import { createFixtureTaskApi } from "./fixtureTaskApi";

describe("fixture reversible task operations", () => {
  it("stores exact memo text, records private audit metadata, and undoes atomically", async () => {
    const api = createFixtureTaskApi("typical");
    const before = await api.getTaskForest(5000);
    const task = before.entries.find((entry) => entry.task.id === "task-next-1")!.task;
    const memo = "  日本語🙂\n二行目  ";
    const saved = await api.updateTaskMemo(task.id, memo, task.version, "2026-08-23T06:20:00.000Z");

    expect(saved.sourceRevision).toBe(before.sourceRevision + 1);
    expect(saved.hierarchyRevision).toBe(before.hierarchyRevision);
    expect(saved.queueRevision).toBe(before.entries.length ? before.sourceRevision : before.sourceRevision);
    expect(saved.undoStatus.operationKind).toBe("memo-update");
    expect((await api.getTask(task.id)).memo).toBe(memo);

    const history = await api.getHistoryByActualRange("2026-08-23T06:19:00.000Z", "2026-08-23T06:21:00.000Z", undefined, 20);
    expect(history.events[0]).toMatchObject({ eventType: "task-memo-updated", payload: { hasMemo: true, scalarLength: Array.from(memo).length } });
    expect(JSON.stringify(history.events[0].payload)).not.toContain(memo);

    const noOp = await api.updateTaskMemo(task.id, memo, task.version + 1, "2026-08-23T06:21:00.000Z");
    expect(noOp.sourceRevision).toBe(saved.sourceRevision);
    expect(noOp.undoRevision).toBe(saved.undoRevision);
    expect((await api.getUndoStatus()).operationToken).toBe(saved.undoStatus.operationToken);

    await api.undoLastTaskOperation(saved.undoStatus.operationToken!, "2026-08-23T06:22:00.000Z");
    expect((await api.getTask(task.id)).memo).toBe("");
  });

  it("rejects stale, invalid, and over-limit memo writes without changing the fixture", async () => {
    const api = createFixtureTaskApi("typical");
    const task = (await api.getTask("task-next-1"));
    const before = await api.getTaskForest(5000);
    const token = (await api.getUndoStatus()).operationToken;
    await expect(api.updateTaskMemo(task.id, "memo", task.version - 1, "2026-08-23T06:20:00.000Z")).rejects.toMatchObject({ code: "stale-version" });
    await expect(api.updateTaskMemo(task.id, "memo", task.version, "invalid")).rejects.toMatchObject({ code: "invalid-effective-instant" });
    await expect(api.updateTaskMemo(task.id, "x".repeat(4001), task.version, "2026-08-23T06:20:00.000Z")).rejects.toMatchObject({ code: "invalid-memo" });
    expect(await api.getTask(task.id)).toEqual(task);
    expect(await api.getTaskForest(5000)).toMatchObject({ sourceRevision: before.sourceRevision, hierarchyRevision: before.hierarchyRevision });
    expect((await api.getUndoStatus()).operationToken).toBe(token);
  });

  it("sums closed fixture sessions and keeps no-session completion distinct", async () => {
    const api = createFixtureTaskApi("typical");
    await expect(api.getTaskActualHistory("task-completed")).resolves.toMatchObject({
      taskId: "task-completed",
      totalClosedDurationMs: 17 * 60 * 1000,
      sessionCount: 1,
    });
    await expect(api.getTaskActualHistory("task-no-session")).resolves.toMatchObject({
      taskId: "task-no-session",
      totalClosedDurationMs: 0,
      sessionCount: 0,
    });
  });

  it("keeps exact depth 0 through 8 and raw before-task anchors usable", async () => {
    const api = createFixtureTaskApi("deep");
    const before = await api.getTaskForest(5000);
    expect(before.entries.map((entry) => entry.depth)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const anchor = before.entries.find((entry) => entry.task.id === "deep-task-8")!;
    await api.createTaskInHierarchy("同じ階層のアンカー", "deep-task-7", anchor.task.id, before.hierarchyRevision);
    const after = await api.getTaskForest(5000);
    const inserted = after.entries.find((entry) => entry.task.title === "同じ階層のアンカー");
    expect(inserted).toMatchObject({ parentTaskId: "deep-task-7", depth: 8, position: 0 });
    expect(after.entries.find((entry) => entry.task.id === "deep-task-8")?.position).toBe(1);
  });

  it("deletes a complete subtree and restores it with one undo", async () => {
    const api = createFixtureTaskApi("typical");
    const before = await api.getTaskForest(5000);
    const root = before.entries.find((entry) => entry.task.id === "task-api")!;
    const descendants = before.entries.filter((entry) => entry.parentTaskId === root.task.id);

    const deleted = await api.deleteTaskSubtree(
      root.task.id,
      root.task.version,
      before.hierarchyRevision,
      "2026-08-23T06:13:00.000Z",
    );
    const afterDelete = await api.getTaskForest(5000);
    expect(afterDelete.entries.some((entry) => entry.task.id === root.task.id)).toBe(false);
    expect(descendants.every((child) => !afterDelete.entries.some((entry) => entry.task.id === child.task.id))).toBe(true);
    expect(deleted.undoStatus.operationKind).toBe("delete");

    await api.undoLastTaskOperation(deleted.undoStatus.operationToken!, "2026-08-23T06:14:00.000Z");
    const restored = await api.getTaskForest(5000);
    expect(restored.entries.map((entry) => entry.task.id)).toEqual(before.entries.map((entry) => entry.task.id));
    expect((await api.getTask(root.task.id)).version).toBeGreaterThan(root.task.version);
  });

  it("undoes mixed operations strictly latest-first and rejects a stale token", async () => {
    const api = createFixtureTaskApi("empty");
    const created = await api.createTaskInHierarchy("first", undefined, undefined, 0);
    const createToken = (await api.getUndoStatus()).operationToken!;
    const task = created.changedTasks[0];
    await api.renameTask(task.id, "renamed", task.version);
    const renameToken = (await api.getUndoStatus()).operationToken!;

    await expect(api.undoLastTaskOperation(createToken)).rejects.toMatchObject({ code: "stale-undo" });
    await api.undoLastTaskOperation(renameToken);
    expect((await api.getTask(task.id)).title).toBe("first");
    expect((await api.getUndoStatus()).operationToken).toBe(createToken);
    await api.undoLastTaskOperation(createToken);
    await expect(api.getTask(task.id)).rejects.toMatchObject({ code: "task-not-found" });
    expect((await api.getUndoStatus()).available).toBe(false);
  });

  it("retains only the newest 50 fixture operations", async () => {
    const api = createFixtureTaskApi("empty");
    let revision = 0;
    let firstToken = "";
    for (let index = 0; index < 51; index += 1) {
      const result = await api.createTaskInHierarchy(`task-${index}`, undefined, undefined, revision);
      revision = result.hierarchyRevision;
      if (index === 0) firstToken = (await api.getUndoStatus()).operationToken!;
    }
    await expect(api.undoLastTaskOperation(firstToken)).rejects.toMatchObject({ code: "stale-undo" });
    for (let index = 0; index < 50; index += 1) {
      const status = await api.getUndoStatus();
      expect(status.available).toBe(true);
      await api.undoLastTaskOperation(status.operationToken!);
    }
    expect((await api.getUndoStatus()).available).toBe(false);
  });
});
