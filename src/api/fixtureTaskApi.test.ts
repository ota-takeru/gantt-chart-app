import { describe, expect, it } from "vitest";
import { createFixtureTaskApi } from "./fixtureTaskApi";

describe("fixture reversible task operations", () => {
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
