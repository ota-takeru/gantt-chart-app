import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";
import { projectTaskIdentityPaletteIndex } from "./taskIdentityPalette";

function loadedStyles(): string {
  return Array.from(document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); } catch { return ""; }
  }).join("\n");
}

async function ready() {
  await screen.findByRole("heading", { name: "NOW 残っている仕事" });
}

function identityByTask(): Map<string, string> {
  const identities = new Map<string, string>();
  for (const element of document.querySelectorAll<HTMLElement>(".history-row.task-row, .history-pocket")) {
    const taskId = element.dataset.rowId ?? element.dataset.pocketId;
    const paletteIndex = element.dataset.taskIdentityPalette;
    if (taskId && paletteIndex) identities.set(taskId, paletteIndex);
  }
  return identities;
}

afterEach(() => cleanup());

describe("Issue #30 task identity palette", () => {
  it("assigns stable, distributed identity metadata to remaining rows", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();

    const rows = Array.from(document.querySelectorAll<HTMLElement>(".history-row.task-row"));
    expect(rows.length).toBeGreaterThan(1);
    const indexes = new Set(rows.map((row) => row.dataset.taskIdentityPalette));
    expect(indexes.size).toBeGreaterThanOrEqual(4);
    for (const row of rows) {
      const identity = row.querySelector<HTMLElement>(".current-identity");
      expect(row.dataset.taskIdentityPalette).toBe(identity?.dataset.taskIdentityPalette);
      expect(identity).toHaveAttribute("data-task-identity-palette", String(projectTaskIdentityPaletteIndex(row.dataset.rowId ?? "")));
    }
  });

  it("keeps identity accents stable after reload, rename, and hierarchy reorder", async () => {
    const api = createFixtureTaskApi("typical");
    const initialForest = await api.getTaskForest(5000);
    render(<App api={api} />);
    await ready();
    const initial = identityByTask();
    expect(initial.get("task-next-6")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "再読込" }));
    await waitFor(() => expect(identityByTask()).toEqual(initial));

    const title = screen.getByRole("button", { name: "明日の調査メモを残す" });
    await userEvent.click(title);
    const renameInput = screen.getByRole("textbox", { name: "明日の調査メモを残すの名前を変更" });
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "名前だけ変えたタスク");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "名前だけ変えたタスク" })).toBeInTheDocument());
    expect(identityByTask().get("task-next-6")).toBe(initial.get("task-next-6"));

    await api.moveTaskInHierarchy("task-next-6", "task-answer", undefined, initialForest.hierarchyRevision);
    await userEvent.click(screen.getByRole("button", { name: "再読込" }));
    await waitFor(() => expect(identityByTask().get("task-next-6")).toBe(initial.get("task-next-6")));
  });

  it("keeps identity paint separate from lifetime and NOW surfaces at dense scale", async () => {
    render(<App api={createFixtureTaskApi("dense")} />);
    await ready();

    const rows = Array.from(document.querySelectorAll<HTMLElement>(".history-row.task-row"));
    expect(rows.length).toBe(120);
    expect(rows.every((row) => getComputedStyle(row).height === "46px")).toBe(true);
    for (const row of rows.slice(0, 8)) {
      expect(row.querySelector(".history-mark-cell")).not.toHaveAttribute("data-task-identity-palette");
      expect(row.querySelector(".now-hinge-cell")).not.toHaveAttribute("data-task-identity-palette");
      expect(row.querySelector(".current-identity")).toHaveAttribute("data-task-identity-palette");
    }

    const styles = loadedStyles();
    expect(styles).toMatch(/\.current-identity\[data-task-identity-palette\]::before\s*\{[^}]*width: 4px/);
    expect(styles).not.toMatch(/\.history-mark-cell[^{}]*background[^{}]*var\(--task-identity-accent/);
    expect(styles).not.toMatch(/\.now-hinge-cell[^{}]*background[^{}]*var\(--task-identity-accent/);
  });

  it("applies the same id-derived identity channel to completed captions and members", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();

    const pocket = document.querySelector<HTMLElement>(".history-pocket");
    const caption = pocket?.querySelector<HTMLElement>(".pocket-caption");
    const captionTitle = caption?.querySelector<HTMLElement>(".pocket-caption-title");
    expect(pocket).toHaveAttribute("data-task-identity-palette", String(projectTaskIdentityPaletteIndex(pocket?.dataset.pocketId ?? "")));
    expect(caption).toHaveAttribute("data-task-identity-palette", pocket?.dataset.taskIdentityPalette);
    expect(captionTitle).toBeInTheDocument();
    expect(caption).toHaveAttribute("id", expect.stringMatching(/^history-pocket-caption-/));

    await userEvent.click(caption as HTMLElement);
    const members = Array.from(document.querySelectorAll<HTMLElement>(".pocket-member-title"));
    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      const memberRow = member.closest<HTMLElement>(".pocket-member-row");
      const taskId = memberRow?.dataset.historyMemberId ?? "";
      expect(member).toHaveAttribute("data-task-identity-palette", String(projectTaskIdentityPaletteIndex(taskId)));
      expect(memberRow?.querySelector(".pocket-mark")).not.toHaveAttribute("data-task-identity-palette");
    }
    const styles = loadedStyles();
    expect(styles).toMatch(/\.history-pocket \.pocket-caption\[data-task-identity-palette\] \.pocket-caption-title::before,\s*\.pocket-member-title\[data-task-identity-palette\]::before\s*\{[^}]*width: 3px/);
    expect(styles).not.toMatch(/\.history-pocket \.pocket-caption\[data-task-identity-palette\]::before/);
  });

  it("keeps task identity colors supplemental in dark and forced-color modes", async () => {
    render(<App api={createFixtureTaskApi("empty")} />);
    await ready();
    const styles = loadedStyles();
    expect(styles).toContain("--task-identity-accent-0: #2a6f68");
    expect(styles).toContain("--task-identity-accent-7: #9a5e2b");
    expect(styles).toContain("--task-identity-accent-0: #62d3c5");
    expect(styles).toContain("--task-identity-accent-7: #f2a16e");
    expect(styles).toMatch(/@media \(forced-colors: active\)[\s\S]*\.current-identity\[data-task-identity-palette\]::before[\s\S]*display: none/);
    expect(styles).toMatch(/@media \(forced-colors: active\)[\s\S]*\.history-pocket \.pocket-caption\[data-task-identity-palette\] \.pocket-caption-title::before[\s\S]*display: none/);
  });
});
