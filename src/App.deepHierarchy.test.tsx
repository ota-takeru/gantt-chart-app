import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";

afterEach(() => cleanup());

function loadedStyles(): string {
  return Array.from(document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); } catch { return ""; }
  }).join("\n");
}

describe("deep hierarchy identity budget", () => {
  it("keeps every depth cue distinct while capping the depth-eight rail for selected titles", async () => {
    render(<App api={createFixtureTaskApi("deep")} />);
    await screen.findByRole("heading", { name: "NOW 残っている仕事" });

    const branches = Array.from(document.querySelectorAll<HTMLElement>(".tree-branch[data-depth]"));
    const offsets = branches.map((branch) => Number.parseFloat(branch.style.getPropertyValue("--depth-offset")));
    expect(offsets).toEqual([0, 22, 42, 60, 72, 80, 86, 92, 96]);
    expect(new Set(offsets).size).toBe(9);

    const ownRail = (branch: HTMLElement): HTMLElement | null => {
      const row = branch.querySelector<HTMLElement>(`[data-row-id="${branch.dataset.taskId}"]`);
      return row?.querySelector<HTMLElement>(".branch-rail") ?? null;
    };
    expect(ownRail(branches[0])).toBeNull();
    expect(branches.slice(1).every((branch) => ownRail(branch) !== null)).toBe(true);
    expect(ownRail(branches.at(-1)!)).toHaveClass("is-last-visible-child");

    const deepRow = document.querySelector<HTMLElement>("[data-row-id='deep-task-8']");
    expect(deepRow).toBeInTheDocument();
    expect(deepRow?.querySelector<HTMLElement>(".branch-rail")?.style.marginLeft).toBe("96px");
    expect(deepRow?.querySelector(".task-copy")).toHaveClass("is-child-leaf");
    expect(getComputedStyle(deepRow?.querySelector(".task-copy") as HTMLElement).paddingLeft).toBe("42px");

    await userEvent.click(document.querySelector<HTMLElement>("[data-timeline-cell='deep-task-8']")!);
    const selectedTitle = deepRow?.querySelector<HTMLElement>(".task-title");
    expect(deepRow).toHaveClass("is-selected");
    expect(selectedTitle).toBeInTheDocument();
    expect(selectedTitle?.textContent?.length).toBeGreaterThan(0);
    const taskCopy = selectedTitle?.closest(".task-copy");
    expect(taskCopy).toBeInTheDocument();
    expect(taskCopy?.nextElementSibling).toHaveClass("row-actions");

    const styles = loadedStyles();
    expect(styles).toContain("--selected-action-width: 124px");
    expect(styles).toMatch(/\.history-row\.task-row \.row-actions\s*\{[^}]*top:\s*0[^}]*bottom:\s*0[^}]*height:\s*100%/);
    expect(styles).toMatch(/\.history-row\.task-row:not\(\.is-editing\):hover \.current-identity,[^}]*\.history-row\.task-row:not\(\.is-editing\)\.is-selected \.current-identity[^}]*padding-right:\s*var\(--selected-action-width\)/);
  });
});
