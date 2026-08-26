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
    expect(offsets).toEqual([6, 8, 10, 12, 14, 16, 18, 20, 22]);
    expect(new Set(offsets).size).toBe(9);

    const deepRow = document.querySelector<HTMLElement>("[data-row-id='deep-task-8']");
    expect(deepRow).toBeInTheDocument();
    expect(deepRow?.querySelector<HTMLElement>(".branch-rail")?.style.marginLeft).toBe("22px");

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
    expect(styles).toMatch(/\.history-row\.task-row \.row-actions\s*\{[^}]*top:\s*auto[^}]*height:\s*24px/);
    expect(styles).toMatch(/\.history-row\.task-row\.is-selected \.current-identity[^}]*padding-right:\s*8px/);
  });
});
