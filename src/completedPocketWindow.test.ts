import { describe, expect, it } from "vitest";
import {
  createCompletedPocketWindow,
  projectCompletedPocketWindow,
  transitionCompletedPocketWindow,
} from "./completedPocketWindow";

const members = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `task-${index}`, order: index }));

describe("completed-pocket-window contract", () => {
  it("S1 mounts only the initial ordered prefix", () => {
    const all = members(600);
    const state = createCompletedPocketWindow(all.length);
    const projection = projectCompletedPocketWindow(all, state);
    expect(projection.rendered).toHaveLength(40);
    expect(projection.rendered.map(({ member }) => member.id)).toEqual(all.slice(0, 40).map(({ id }) => id));
    expect(projection.omittedCount).toBe(560);
    expect(projection.canLoadMore).toBe(true);
  });

  it("S2 advances by bounded batches until every retained member is reachable", () => {
    const all = members(95);
    let state = createCompletedPocketWindow(all.length);
    state = transitionCompletedPocketWindow(state, { type: "load-more" }, all.length);
    expect(projectCompletedPocketWindow(all, state).rendered).toHaveLength(80);
    state = transitionCompletedPocketWindow(state, { type: "load-more" }, all.length);
    const complete = projectCompletedPocketWindow(all, state);
    expect(complete.rendered).toHaveLength(95);
    expect(complete.canLoadMore).toBe(false);
    expect(complete.nextBatchSize).toBe(0);
  });

  it("S3 includes a selected off-prefix member without mounting the omitted range", () => {
    const all = members(600);
    const state = createCompletedPocketWindow(all.length);
    const projection = projectCompletedPocketWindow(all, state, "task-599");
    expect(projection.rendered).toHaveLength(41);
    expect(projection.rendered.at(-1)).toMatchObject({
      member: { id: "task-599" },
      positionInSet: 600,
      setSize: 600,
      inclusion: "selected-reveal",
    });
    expect(projection.omittedCount).toBe(559);
  });

  it("S4 preserves retained order and coherent set positions", () => {
    const all = members(100);
    const projection = projectCompletedPocketWindow(all, createCompletedPocketWindow(100), "task-73");
    expect(projection.rendered.map(({ positionInSet }) => positionInSet)).toEqual([
      ...Array.from({ length: 40 }, (_, index) => index + 1),
      74,
    ]);
    expect(projection.rendered.every(({ setSize }) => setSize === 100)).toBe(true);
  });

  it("S5 reconciles shrinkage and reset without per-member state", () => {
    let state = createCompletedPocketWindow(600);
    state = transitionCompletedPocketWindow(state, { type: "load-more" }, 600);
    const reconciled = transitionCompletedPocketWindow(state, { type: "reconcile" }, 20);
    expect(reconciled).toEqual({ visiblePrefixCount: 20, batchSize: 40 });
    expect(transitionCompletedPocketWindow(reconciled, { type: "reset" }, 600)).toEqual({
      visiblePrefixCount: 40,
      batchSize: 40,
    });
  });

  it("normalizes invalid batch inputs and projects 5,000 members without mounting them", () => {
    const all = members(5_000);
    const state = createCompletedPocketWindow(all.length, 0);
    const projection = projectCompletedPocketWindow(all, state, "task-4999");
    expect(state.batchSize).toBe(40);
    expect(projection.rendered).toHaveLength(41);
    expect(projection.rendered.at(-1)?.positionInSet).toBe(5_000);
  });

  it("treats a missing selection as the ordinary prefix", () => {
    const all = members(60);
    const state = createCompletedPocketWindow(all.length);
    expect(projectCompletedPocketWindow(all, state, "missing").rendered).toHaveLength(40);
  });
});
