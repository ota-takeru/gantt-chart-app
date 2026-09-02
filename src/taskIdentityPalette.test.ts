import { describe, expect, it } from "vitest";
import { projectTaskIdentityPaletteIndex, TASK_IDENTITY_PALETTE_SIZE } from "./taskIdentityPalette";

describe("task identity palette projection", () => {
  it("returns a stable palette index for the same immutable task id", () => {
    expect(projectTaskIdentityPaletteIndex("task-stable-42")).toBe(projectTaskIdentityPaletteIndex("task-stable-42"));
  });

  it("distributes representative task ids across multiple palette entries", () => {
    const ids = ["task-api", "task-next-1", "task-next-2", "task-completed", "task-completed-child", "task-alpha", "task-beta", "task-gamma"];
    const indexes = new Set(ids.map(projectTaskIdentityPaletteIndex));
    expect(indexes.size).toBeGreaterThanOrEqual(4);
  });

  it("uses only the task id input, so titles and display order cannot affect the result", () => {
    const records = [
      { id: "task-order-a", title: "同じタイトル" },
      { id: "task-order-b", title: "別タイトル" },
      { id: "task-order-c", title: "あとで並べ替える" },
    ];
    const before = new Map(records.map(({ id }) => [id, projectTaskIdentityPaletteIndex(id)]));
    const after = new Map([...records].reverse().map(({ id }) => [id, projectTaskIdentityPaletteIndex(id)]));
    expect(after).toEqual(before);
    expect(projectTaskIdentityPaletteIndex.length).toBe(1);
  });

  it("always returns an index inside the fixed palette range", () => {
    expect(TASK_IDENTITY_PALETTE_SIZE).toBeGreaterThanOrEqual(8);
    for (const id of ["", "task-0", "日本語のtask", "x".repeat(5000)]) {
      const index = projectTaskIdentityPaletteIndex(id);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(TASK_IDENTITY_PALETTE_SIZE);
    }
  });
});
