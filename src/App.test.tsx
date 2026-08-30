import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";

function renderPreview(variant: "typical" | "dense" | "no-active" | "empty" | "error" | "only-completed" | "deep" = "typical") {
  const api = createFixtureTaskApi(variant);
  render(<App api={api} />);
  return api;
}

async function ready() {
  await screen.findByRole("heading", { name: "NOW 残っている仕事" });
}

function rowFor(title: string): HTMLElement {
  return screen.getByText(title, { selector: ".task-title" }).closest(".task-row")?.parentElement as HTMLElement;
}

function timelineCell(taskId: string): HTMLElement {
  return document.querySelector(`[data-timeline-cell="${taskId}"]`) as HTMLElement;
}

function pocketFor(taskId: string): HTMLElement {
  return document.querySelector(`.history-pocket[data-pocket-id="${taskId}"]`) as HTMLElement;
}

async function expandPocket(taskId: string): Promise<HTMLElement> {
  const pocket = pocketFor(taskId);
  if (!pocket.classList.contains("is-expanded")) await userEvent.click(pocket.querySelector(".pocket-caption") as HTMLElement);
  return pocket;
}

function timelineRuler(): HTMLElement {
  return document.querySelector(".timeline-ruler") as HTMLElement;
}

function pointAt(target: Element | null) {
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => target) });
}

function pointerDown(handle: HTMLElement, pointerId = 1) {
  fireEvent.pointerDown(handle, { pointerId, clientX: 10, clientY: 10, buttons: 1 });
}

function pointerMove(handle: HTMLElement, target: Element | null, pointerId = 1) {
  pointAt(target);
  fireEvent.pointerMove(handle, { pointerId, clientX: 80, clientY: 80, buttons: 1 });
}

function pointerUp(handle: HTMLElement, pointerId = 1) {
  fireEvent.pointerUp(handle, { pointerId, clientX: 80, clientY: 80, buttons: 0 });
}

function loadedStyles(): string {
  return Array.from(document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); } catch { return ""; }
  }).join("\n");
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "elementFromPoint");
  vi.restoreAllMocks();
});

describe("history-left / NOW-right surface", () => {
  it("keeps the established light semantic palette as the baseline", async () => {
    renderPreview("empty");
    await ready();
    const styles = loadedStyles();
    expect(styles).toMatch(/--background:\s*#f4f6f2/);
    expect(styles).toMatch(/--surface:\s*#fbfcfa/);
    expect(styles).toMatch(/--soft-surface:\s*#eaf0eb/);
    expect(styles).toMatch(/--text:\s*#1f2a2d/);
    expect(styles).toMatch(/--lines:\s*#d8dfda/);
    expect(styles).toContain("color-scheme: light");
  });

  it("defines the selected OS dark palette without adding a theme control", async () => {
    renderPreview("empty");
    await ready();
    const styles = loadedStyles();
    expect(styles).toContain("@media (prefers-color-scheme: dark)");
    expect(styles).toMatch(/--background:\s*#0e1214/);
    expect(styles).toMatch(/--surface:\s*#151b1e/);
    expect(styles).toMatch(/--soft-surface:\s*#1e282b/);
    expect(styles).toMatch(/--lines:\s*#5a6b70/);
    expect(styles).toMatch(/--accent:\s*#62d3c5/);
    expect(styles).toMatch(/--danger-soft:\s*#3b2527/);
    expect(styles).toMatch(/--selected-border:\s*var\(--accent\)/);
    expect(styles).toContain("color-scheme: dark");
    expect(screen.queryByRole("button", { name: /テーマ|ダーク|ライト/ })).not.toBeInTheDocument();
  });

  it("routes dark-covered paint roles through semantic tokens", async () => {
    renderPreview("empty");
    await ready();
    const styles = loadedStyles();
    expect(styles).toContain("background: var(--background)");
    expect(styles).toContain("background: var(--row-surface)");
    expect(styles).toContain("background: var(--timeline-surface)");
    expect(styles).toContain("background: var(--hinge-surface)");
    expect(styles).toContain("background: var(--pocket-caption-surface)");
    expect(styles).toContain("background: var(--accent-surface)");
    expect(styles).toContain("outline: 1px dashed var(--drop-target)");
    expect(styles).toContain("background: var(--danger-soft)");
    expect(styles).toContain("border: 1px solid var(--warning-border)");
    expect(styles).toContain("box-shadow: 0 10px 30px var(--surface-shadow)");
    expect(styles).toContain("outline: 3px solid var(--focus)");
    expect(styles).toContain("background: var(--active)");
    expect(styles).toContain("background: var(--paused)");
    expect(styles).toContain("color: var(--queued)");
    const groupedMarkRule = styles.match(/\.history-row:hover \.history-mark-cell,\s*\.history-row:focus-within \.history-mark-cell\s*\{[^}]+\}/)?.[0] ?? "";
    const groupedHingeRule = styles.match(/\.history-row:hover \.now-hinge-cell,\s*\.history-row:focus-within \.now-hinge-cell\s*\{[^}]+\}/)?.[0] ?? "";
    expect(groupedMarkRule).toContain("background-color: var(--selected-mark)");
    expect(groupedMarkRule).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
    expect(groupedHingeRule).toContain("background-color: var(--selected-hinge)");
    expect(groupedHingeRule).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });

  it("keeps the daily surface compact and shows completed work in a left pocket", async () => {
    renderPreview("typical");
    await ready();
    expect(screen.getByText("NOW")).toBeInTheDocument();
    expect(screen.getByText("残っている仕事")).toBeInTheDocument();
    expect(screen.queryByText("NEXT", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText("HISTORY", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText("時間の継ぎ目", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /完了済み/ })).not.toBeInTheDocument();
    expect(screen.queryByText("ログのタイムアウト境界を確認", { selector: ".completed-title" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ログのタイムアウト境界を確認の完了履歴/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /調査メモの表記を確認（記録なし完了）の完了履歴/ })).toBeInTheDocument();
  });

  it("keeps dense completed history pocketed and locally expandable", async () => {
    renderPreview("dense");
    await ready();
    expect(document.querySelectorAll(".history-pocket").length).toBe(20);
    expect(document.querySelectorAll(".history-pocket .pocket-member-row").length).toBe(0);
    expect(document.querySelectorAll(".history-pocket .pocket-summary .pocket-mark").length).toBe(20);
    expect(screen.queryByRole("button", { name: /完了済み/ })).not.toBeInTheDocument();
    await expandPocket("dense-completed-root-1");
    expect(document.querySelectorAll(".history-pocket.is-expanded .pocket-mark").length).toBe(30);
  });

  it("renders a compact pocket heading with geometry-neutral member lanes", async () => {
    renderPreview("typical");
    await ready();
    const pocket = document.querySelector(".history-pocket") as HTMLElement;
    const caption = pocket.querySelector(".pocket-caption") as HTMLElement;
    expect(caption).toBe(pocket.firstElementChild);
    expect(caption.querySelector(".pocket-caption-chevron")).toHaveTextContent("▸");
    expect(caption.querySelector(".pocket-caption-title")).toHaveTextContent(/.+/);
    expect(caption.querySelector(".pocket-caption-count")).toHaveTextContent(/\d+件/);
    expect(caption.textContent).not.toContain("完了");
    expect(caption).toHaveAttribute("aria-expanded", "false");
    expect(caption).toHaveAttribute("id", "history-pocket-caption-task-completed");
    expect(caption).toHaveAccessibleName(/作成 \d+\/\d+ \d{1,2}:40 → 完了 \d+\/\d+ \d{1,2}:57/);
    expect(caption).toHaveAccessibleName(/展開して各タスクの期間を表示/);
    expect(pocket.querySelector(".pocket-lanes")).toBeNull();
    expect(pocket.querySelectorAll(".pocket-member-row")).toHaveLength(0);
    const collapsedRootMark = pocket.querySelector(".pocket-summary .pocket-mark") as HTMLElement;
    expect(collapsedRootMark).toHaveAttribute("data-history-mark", "task-completed");
    expect(collapsedRootMark).toHaveAttribute("data-lifetime-kind");

    await userEvent.click(caption);
    expect(pocket).toHaveClass("is-expanded");
    expect(caption.querySelector(".pocket-caption-chevron")).toHaveTextContent("▾");
    expect(caption).toHaveAttribute("aria-expanded", "true");
    const lanes = pocket.querySelector(".pocket-lanes") as HTMLElement;
    expect(lanes).toBe(caption.nextElementSibling);
    expect(getComputedStyle(lanes).marginLeft).toBe("");
    expect(getComputedStyle(lanes).borderLeftWidth).toBe("");
    expect(getComputedStyle(lanes).paddingLeft).toBe("0px");
    expect(getComputedStyle(lanes).paddingRight).toBe("0px");
    const expandedRootMark = pocket.querySelector("[data-history-member-id='task-completed'] .pocket-mark") as HTMLElement;
    expect(expandedRootMark).toHaveAttribute("data-history-mark", "task-completed");
    expect(expandedRootMark.className).toBe(collapsedRootMark.className);
    expect(expandedRootMark.style.left).toBe(collapsedRootMark.style.left);
    expect(expandedRootMark.style.width).toBe(collapsedRootMark.style.width);
    expect(expandedRootMark.dataset.startMs).toBe(collapsedRootMark.dataset.startMs);
    expect(expandedRootMark.dataset.endMs).toBe(collapsedRootMark.dataset.endMs);
    const styles = loadedStyles();
    const laneRule = styles.match(/\.history-pocket \.pocket-lanes\s*\{[^}]+\}/)?.[0] ?? "";
    expect(laneRule).toContain("width: 100%");
    expect(laneRule).not.toMatch(/margin-left|padding-left|padding-right|border-left/);
    const overlayRule = styles.match(/\.history-pocket \.pocket-lanes::before\s*\{[^}]+\}/)?.[0] ?? "";
    expect(overlayRule).toContain("position: absolute");
    expect(overlayRule).toContain("inset: 0");
  });

  it("keeps the dense pocket heading and lane grouping bounded for every pocket", async () => {
    renderPreview("dense");
    await ready();
    const pockets = Array.from(document.querySelectorAll<HTMLElement>(".history-pocket"));
    expect(pockets).toHaveLength(20);
    expect(pockets.every((pocket) => pocket.firstElementChild?.matches(".pocket-caption"))).toBe(true);
    expect(pockets.every((pocket) => pocket.querySelector(".pocket-caption-count")?.textContent?.match(/^\d+件$/))).toBe(true);
    expect(pockets.every((pocket) => pocket.querySelector(".pocket-lanes") === null)).toBe(true);
    expect(pockets.every((pocket) => pocket.querySelectorAll(".pocket-member-row").length === 0)).toBe(true);
    const expandedPocket = await expandPocket("dense-completed-root-1");
    expect(expandedPocket.querySelector(".pocket-caption")?.nextElementSibling?.matches(".pocket-lanes")).toBe(true);
    expect(getComputedStyle(expandedPocket.querySelector(".pocket-lanes") as HTMLElement).marginLeft).toBe("");
  });

  it("keeps completed pocket tracks aligned with ordinary rails while retaining percentage geometry", async () => {
    const api = createFixtureTaskApi("typical");
    const originalLoad = api.getTaskForest.bind(api);
    const now = Date.now();
    vi.spyOn(api, "getTaskForest").mockImplementation(async (limit) => {
      const snapshot = await originalLoad(limit);
      return {
        ...snapshot,
        entries: snapshot.entries.map((entry) => entry.task.id === "task-completed"
          ? { ...entry, task: { ...entry.task, createdAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(), completedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() } }
          : entry),
      };
    });
    render(<App api={api} />);
    await ready();
    await expandPocket("task-completed");

    const ordinaryRail = timelineCell("task-api").querySelector(".history-rail") as HTMLElement;
    const pocketMark = timelineCell("task-completed");
    const pocketTrack = pocketMark.closest(".pocket-member-track") as HTMLElement;
    const lanes = pocketTrack.closest(".pocket-lanes") as HTMLElement;
    expect(getComputedStyle(ordinaryRail).width).toBe("100%");
    expect(getComputedStyle(pocketTrack).width).toBe("100%");
    expect(getComputedStyle(timelineCell("task-api")).paddingLeft).toBe(getComputedStyle(pocketFor("task-completed")).paddingLeft);
    expect(Number.parseFloat(getComputedStyle(timelineCell("task-api")).borderLeftWidth) || 0).toBe(0);
    expect(Number.parseFloat(getComputedStyle(pocketFor("task-completed")).borderLeftWidth) || 0).toBe(0);
    expect(Number.parseFloat(getComputedStyle(timelineCell("task-api")).borderRightWidth) || 0).toBe(0);
    expect(Number.parseFloat(getComputedStyle(pocketFor("task-completed")).borderRightWidth) || 0).toBe(0);
    expect(getComputedStyle(lanes).paddingLeft).toBe("0px");
    expect(getComputedStyle(lanes).paddingRight).toBe("0px");

    const rangeStart = Number(timelineRuler().dataset.rangeStartMs);
    const rangeEnd = Number(timelineRuler().dataset.rangeEndMs);
    const span = rangeEnd - rangeStart;
    const created = Number(pocketMark.dataset.startMs);
    const completed = Number(pocketMark.dataset.endMs);
    expect(pocketMark.style.left).toMatch(/%$/);
    expect(pocketMark.style.width).toMatch(/%$/);
    expect(Number.parseFloat(pocketMark.style.left)).toBeCloseTo(((created - rangeStart) / span) * 100, 10);
    expect(Number.parseFloat(pocketMark.style.width)).toBeCloseTo(((completed - created) / span) * 100, 10);
  });

  it("uses the root lifetime when collapsed and each member lifetime when expanded", async () => {
    renderPreview("only-completed");
    await ready();
    await userEvent.selectOptions(screen.getByLabelText("時間範囲"), "all");

    const pocket = pocketFor("only-completed-root");
    const ruler = timelineRuler();
    const rangeStart = Number(ruler.dataset.rangeStartMs);
    const rangeEnd = Number(ruler.dataset.rangeEndMs);
    const span = rangeEnd - rangeStart;
    const summaryRail = pocket.querySelector(".pocket-summary-rail") as HTMLElement;
    const collapsedRoot = summaryRail.querySelector(".pocket-mark") as HTMLElement;
    expect(collapsedRoot).toHaveAttribute("data-lifetime-kind", "interval");
    expect(collapsedRoot.dataset.startMs).toBe(String(Date.parse("2026-08-22T03:10:00.000Z")));
    expect(collapsedRoot.dataset.endMs).toBe(String(Date.parse("2026-08-22T05:20:00.000Z")));
    expect(Number.parseFloat(collapsedRoot.style.left)).toBeCloseTo(((Date.parse("2026-08-22T03:10:00.000Z") - rangeStart) / span) * 100, 10);
    expect(Number.parseFloat(collapsedRoot.style.width)).toBeCloseTo(((Date.parse("2026-08-22T05:20:00.000Z") - Date.parse("2026-08-22T03:10:00.000Z")) / span) * 100, 10);
    expect(getComputedStyle(summaryRail).width).toBe("100%");
    expect(getComputedStyle(summaryRail).paddingLeft).toBe("0px");
    expect(getComputedStyle(summaryRail).paddingRight).toBe("0px");

    await userEvent.click(pocket.querySelector(".pocket-caption") as HTMLElement);
    const lanes = pocket.querySelector(".pocket-lanes") as HTMLElement;
    const rootTrack = pocket.querySelector("[data-history-member-id='only-completed-root'] .pocket-member-track") as HTMLElement;
    const expandedRoot = pocket.querySelector("[data-history-member-id='only-completed-root'] .pocket-mark") as HTMLElement;
    const childMark = pocket.querySelector("[data-history-member-id='only-completed-child'] .pocket-mark") as HTMLElement;
    expect(getComputedStyle(lanes).width).toBe("100%");
    expect(getComputedStyle(rootTrack).width).toBe(getComputedStyle(summaryRail).width);
    expect(getComputedStyle(lanes).paddingLeft).toBe("0px");
    expect(getComputedStyle(lanes).paddingRight).toBe("0px");
    expect(expandedRoot.style.left).toBe(collapsedRoot.style.left);
    expect(expandedRoot.style.width).toBe(collapsedRoot.style.width);
    expect(expandedRoot.className).toBe(collapsedRoot.className);
    expect(childMark).toHaveAttribute("data-lifetime-kind", "interval");
    expect(childMark.dataset.startMs).toBe(String(Date.parse("2026-08-22T03:30:00.000Z")));
    expect(childMark.dataset.endMs).toBe(String(Date.parse("2026-08-22T04:05:00.000Z")));
    expect(Number.parseFloat(childMark.style.left)).toBeCloseTo(((Date.parse("2026-08-22T03:30:00.000Z") - rangeStart) / span) * 100, 10);
    expect(Number.parseFloat(childMark.style.width)).toBeCloseTo(((Date.parse("2026-08-22T04:05:00.000Z") - Date.parse("2026-08-22T03:30:00.000Z")) / span) * 100, 10);
    expect(childMark.style.left).not.toBe(expandedRoot.style.left);
    expect(childMark.style.width).not.toBe(expandedRoot.style.width);
  });

  it("keeps add, range, and reload in one desktop tab order with a two-tier narrow layout", async () => {
    renderPreview("typical");
    await ready();
    const header = document.querySelector(".compact-topline") as HTMLElement;
    expect(header.querySelector(".top-create")).toBe(header.firstElementChild?.nextElementSibling);
    expect(header.querySelector(".range-controls")).toBe(header.querySelector(".top-create")?.nextElementSibling);
    expect(header.querySelector(".top-action")).toBe(header.querySelector(".range-controls")?.nextElementSibling);
    expect(getComputedStyle(header).display).toBe("flex");
    const styles = loadedStyles();
    expect(styles).toContain('grid-template-areas: "primary primary" "secondary reload"');
    expect(styles).toContain("grid-area: primary");
    expect(styles).toContain("grid-area: secondary");
    expect(styles).toContain("grid-area: reload");
  });

  it("keeps active and paused cues inline with non-color state shapes", async () => {
    renderPreview("typical");
    await ready();
    const activeRow = rowFor("APIレスポンス遅延の原因を切り分ける").querySelector(".task-row") as HTMLElement;
    const pausedRow = rowFor("顧客向け回答の根拠を再確認").querySelector(".task-row") as HTMLElement;
    expect(activeRow).toHaveClass("is-active");
    expect(activeRow).toHaveAttribute("data-state", "active");
    expect(within(activeRow).getByText("着手中")).toBeInTheDocument();
    expect(pausedRow).toHaveClass("is-paused");
    expect(pausedRow).toHaveAttribute("data-state", "paused");
    expect(within(pausedRow).getByText("保留")).toBeInTheDocument();
    const pausedDot = pausedRow.querySelector(".state-dot") as HTMLElement;
    expect(getComputedStyle(pausedDot).borderRadius).toBe("2px");
    expect(getComputedStyle(pausedDot).transform).toContain("rotate");
  });

  it("paints the selected remaining row across mark, NOW, identity, and bar", async () => {
    renderPreview("typical");
    await ready();
    const mark = timelineCell("task-api");
    await userEvent.click(mark);
    const row = mark.closest(".history-row") as HTMLElement;
    const hinge = row.querySelector(".now-hinge-cell") as HTMLElement;
    const identity = row.querySelector(".current-identity") as HTMLElement;
    const bar = row.querySelector(".lifetime-bar") as HTMLElement;
    expect(row).toHaveClass("is-selected");
    expect(getComputedStyle(mark).backgroundColor).toBe("var(--task-selected-mark)");
    const restingHinge = timelineCell("task-answer").closest(".history-row")?.querySelector(".now-hinge-cell") as HTMLElement;
    expect(getComputedStyle(hinge).backgroundColor).toBe("var(--task-selected-hinge)");
    expect(getComputedStyle(hinge).backgroundColor).not.toBe(getComputedStyle(restingHinge).backgroundColor);
    expect(getComputedStyle(identity).boxShadow).toContain("inset");
    expect(getComputedStyle(bar).boxShadow).toContain("0 0 0 1px");
  });

  it("keeps only-completed history visible while the current side stays quiet and actionable", async () => {
    renderPreview("only-completed");
    await ready();
    expect(screen.getByText("現在のタスクはありません")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "新しいタスク" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /完了した調査をまとめるの完了履歴/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /完了済み/ })).not.toBeInTheDocument();
  });

  it("stacks completed pocket members with their titles and hierarchy marks", async () => {
    renderPreview("only-completed");
    await ready();
    const pocket = pocketFor("only-completed-root");
    expect(pocket.querySelectorAll(".pocket-member-row")).toHaveLength(0);
    expect(pocket.querySelectorAll(".pocket-summary .pocket-mark")).toHaveLength(1);
    expect(pocket.querySelectorAll(".pocket-member-title")).toHaveLength(0);
    await expandPocket("only-completed-root");
    expect(pocket.querySelectorAll(".pocket-member-row")).toHaveLength(2);
    expect(within(pocket).getByRole("option", { name: /完了した調査をまとめる。/ })).toBeInTheDocument();
    expect(within(pocket).getByRole("option", { name: /完了した確認項目。/ })).toBeInTheDocument();
    expect(within(pocket).getByRole("option", { name: /完了した確認項目。/ })).toHaveTextContent("└完了した確認項目");
    expect(timelineCell("only-completed-child")).toHaveAttribute("data-start-ms", String(Date.parse("2026-08-22T03:30:00.000Z")));
  });

  it("expands a collapsed pocket when keyboard selection enters a hidden member", async () => {
    renderPreview("only-completed");
    await ready();
    const history = screen.getByRole("tree");
    const pocket = pocketFor("only-completed-root");
    history.focus();
    fireEvent.keyDown(history, { key: "Home" });
    expect(pocket).not.toHaveClass("is-expanded");
    expect(history).toHaveAttribute("aria-activedescendant", "history-pocket-caption-only-completed-root");
    fireEvent.keyDown(history, { key: "ArrowDown" });
    expect(pocket).toHaveClass("is-expanded");
    expect(history).toHaveAttribute("aria-activedescendant", "history-member-row-only-completed-child");
    expect(document.querySelector("[data-selected-readout='only-completed-child']")).toBeInTheDocument();
  });

  it("navigates history as one keyboard composite without adding a tab stop per mark", async () => {
    renderPreview("typical");
    await ready();
    await expandPocket("task-completed");
    const history = screen.getByRole("tree");
    const marks = Array.from(document.querySelectorAll<HTMLElement>(".pocket-mark"));
    const members = Array.from(document.querySelectorAll<HTMLElement>(".pocket-member-row"));
    expect(marks.length).toBeGreaterThan(0);
    expect(members.every((member) => member.tabIndex === -1)).toBe(true);
    expect(members.every((member) => member.querySelectorAll("button").length === 0)).toBe(true);
    expect(marks.every((mark) => !mark.hasAttribute("tabindex"))).toBe(true);
    history.focus();
    fireEvent.keyDown(history, { key: "Home" });
    fireEvent.keyDown(history, { key: "ArrowDown" });
    fireEvent.keyDown(history, { key: "ArrowDown" });
    fireEvent.keyDown(history, { key: "ArrowDown" });
    expect(screen.getByText("ログのタイムアウト境界を確認", { selector: "[data-selected-readout] strong" })).toBeInTheDocument();
    expect(document.activeElement).toBe(history);
  });

  it("creates a top-level task through the hierarchy adapter", async () => {
    const api = renderPreview("empty");
    const create = vi.spyOn(api, "createTaskInHierarchy");
    await ready();
    const input = screen.getByLabelText("新しいタスク");
    await userEvent.type(input, "調査の切り分け");
    await userEvent.click(screen.getByRole("button", { name: "トップレベルに追加" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("調査の切り分け", undefined, undefined, 0, expect.any(String)));
    await waitFor(() => expect(screen.getByText("調査の切り分け", { selector: ".task-title" })).toBeInTheDocument());
  });

  it("creates a direct subtask inline from its parent row", async () => {
    const api = renderPreview("typical");
    const create = vi.spyOn(api, "createTaskInHierarchy");
    await ready();
    const parent = rowFor("APIレスポンス遅延の原因を切り分ける");
    await userEvent.click(timelineCell("task-api"));
    await userEvent.click(within(parent.querySelector(".task-row") as HTMLElement).getByRole("button", { name: "＋子" }));
    const input = within(parent).getByRole("textbox", { name: "APIレスポンス遅延の原因を切り分けるのサブタスク" });
    await userEvent.type(input, "キャッシュの再現条件を確認");
    await userEvent.click(within(parent).getByRole("button", { name: "追加" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("キャッシュの再現条件を確認", "task-api", "task-next-1", 4, expect.any(String)));
    expect(await screen.findByText("キャッシュの再現条件を確認", { selector: ".task-title" })).toBeInTheDocument();
  });

  it("inserts a new root before the first raw sibling anchor", async () => {
    const api = renderPreview("typical");
    const create = vi.spyOn(api, "createTaskInHierarchy");
    await ready();
    const input = screen.getByLabelText("新しいタスク");
    await userEvent.type(input, "最上位の先頭に置く");
    await userEvent.click(screen.getByRole("button", { name: "トップレベルに追加" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("最上位の先頭に置く", undefined, "task-api", 4, expect.any(String)));
  });

  it("keeps one latest undo receipt through repeated undo and restores focus to its fixed position", async () => {
    const api = renderPreview("empty");
    const undoCall = vi.spyOn(api, "undoLastTaskOperation");
    const statusCall = vi.spyOn(api, "getUndoStatus");
    await ready();
    const receipt = document.querySelector("[data-focus-id='undo-receipt']") as HTMLElement;
    expect(within(receipt).getByText("元に戻せる操作はありません")).toBeInTheDocument();

    const input = screen.getByLabelText("新しいタスク");
    await userEvent.type(input, "一つ目");
    await userEvent.click(screen.getByRole("button", { name: "トップレベルに追加" }));
    await waitFor(() => expect(within(receipt).getByText(/「一つ目」を作成/)).toBeInTheDocument());
    expect(statusCall.mock.calls.length).toBeGreaterThanOrEqual(1);
    await userEvent.click(within(receipt).getByRole("button", { name: "元に戻す" }));
    await waitFor(() => expect(within(receipt).getByText("元に戻せる操作はありません")).toBeInTheDocument());
    expect(document.activeElement).toBe(receipt);

    await userEvent.type(input, "二つ目");
    await userEvent.click(screen.getByRole("button", { name: "トップレベルに追加" }));
    await waitFor(() => expect(screen.getByText("二つ目", { selector: ".task-title" })).toBeInTheDocument());
    await userEvent.click(screen.getByText("二つ目", { selector: ".task-title" }));
    const renameInput = screen.getByRole("textbox", { name: "二つ目の名前を変更" });
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "二つ目を更新");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(within(receipt).getByText(/「二つ目」の名前変更/)).toBeInTheDocument());

    await userEvent.click(within(receipt).getByRole("button", { name: "元に戻す" }));
    await waitFor(() => expect(within(receipt).getByText(/「二つ目」を作成/)).toBeInTheDocument());
    const nextUndo = await waitFor(() => {
      const button = within(receipt).getByRole("button", { name: "元に戻す" });
      expect(button).toBeEnabled();
      return button;
    });
    await waitFor(() => expect(document.activeElement).toBe(nextUndo));
    await userEvent.click(nextUndo);
    await waitFor(() => expect(within(receipt).getByText("元に戻せる操作はありません")).toBeInTheDocument());
    expect(document.activeElement).toBe(receipt);
    expect(undoCall).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("二つ目", { selector: ".task-title" })).not.toBeInTheDocument();
  });

  it("retains the last known undo label when the next status read fails", async () => {
    const api = renderPreview("empty");
    const status = vi.spyOn(api, "getUndoStatus");
    await ready();
    const receipt = document.querySelector("[data-focus-id='undo-receipt']") as HTMLElement;
    const input = screen.getByLabelText("新しいタスク");
    await userEvent.type(input, "保持する操作");
    await userEvent.click(screen.getByRole("button", { name: "トップレベルに追加" }));
    await waitFor(() => expect(within(receipt).getByText(/「保持する操作」を作成/)).toBeInTheDocument());

    status.mockRejectedValueOnce({ code: "persistence-failure", message: "status unavailable" });
    await userEvent.click(await screen.findByText("保持する操作", { selector: ".task-title" }));
    const renameInput = screen.getByRole("textbox", { name: "保持する操作の名前を変更" });
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "更新後の操作");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByText("更新後の操作", { selector: ".task-title" })).toBeInTheDocument());
    expect(within(receipt).getByText(/「保持する操作」を作成/)).toBeInTheDocument();
    expect(within(receipt).getByRole("button", { name: "元に戻す" })).toBeDisabled();
    expect(within(receipt).getByText(/保存／読込に失敗/)).toBeInTheDocument();
    expect(status).toHaveBeenCalled();
  });

  it("autosaves a changed inline rename when focus leaves the form", async () => {
    const api = renderPreview("empty");
    const rename = vi.spyOn(api, "renameTask");
    await ready();
    const topInput = screen.getByRole("textbox", { name: "新しいタスク" });
    await userEvent.type(topInput, "外側保存前");
    await userEvent.click(screen.getByRole("button", { name: "トップレベルに追加" }));
    await screen.findByText("外側保存前", { selector: ".task-title" });
    const row = rowFor("外側保存前");
    const taskRow = row.querySelector(".task-row") as HTMLElement;
    const taskId = taskRow.dataset.rowId as string;
    await userEvent.click(within(row).getByRole("button", { name: "外側保存前" }));
    const renameInput = screen.getByRole("textbox", { name: "外側保存前の名前を変更" });
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "外側保存後");
    await userEvent.click(topInput);
    await waitFor(() => expect(rename).toHaveBeenCalledWith(taskId, "外側保存後", expect.any(Number), expect.any(String)));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "外側保存前の名前を変更" })).not.toBeInTheDocument());
    expect(screen.getByText("外側保存後", { selector: ".task-title" })).toBeInTheDocument();
  });

  it("closes an unchanged inline rename on outside focus without mutating", async () => {
    const api = renderPreview("typical");
    const rename = vi.spyOn(api, "renameTask");
    await ready();
    const row = rowFor("明日の調査メモを残す");
    await userEvent.click(within(row).getByRole("button", { name: "明日の調査メモを残す" }));
    expect(screen.getByRole("textbox", { name: "明日の調査メモを残すの名前を変更" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("textbox", { name: "新しいタスク" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "明日の調査メモを残すの名前を変更" })).not.toBeInTheDocument());
    expect(rename).not.toHaveBeenCalled();
  });

  it("keeps a failed outside autosave editor open for recovery", async () => {
    const api = renderPreview("typical");
    const rename = vi.spyOn(api, "renameTask").mockRejectedValueOnce({ code: "invalid-title", message: "タイトルは1〜240文字で入力してください" });
    await ready();
    const row = rowFor("明日の調査メモを残す");
    await userEvent.click(within(row).getByRole("button", { name: "明日の調査メモを残す" }));
    const renameInput = screen.getByRole("textbox", { name: "明日の調査メモを残すの名前を変更" });
    await userEvent.clear(renameInput);
    await userEvent.click(screen.getByRole("textbox", { name: "新しいタスク" }));
    await waitFor(() => expect(rename).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox", { name: "明日の調査メモを残すの名前を変更" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("タイトルは1〜240文字で入力してください");
  });

  it("suppresses row actions and releases identity width while renaming", async () => {
    renderPreview("typical");
    await ready();
    const row = rowFor("明日の調査メモを残す");
    const taskCopy = row.querySelector(".task-copy") as HTMLElement;
    expect(getComputedStyle(taskCopy).display).toBe("grid");
    expect(getComputedStyle(taskCopy).gridTemplateRows).toBe("minmax(0, 1fr)");
    const styles = loadedStyles();
    expect(styles).toMatch(/\.history-row\.task-row \.task-copy\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\)/);
    expect(styles).toMatch(/\.history-row\.task-row \.task-title\s*\{[^}]*grid-row:\s*1/);
    expect(styles).not.toMatch(/\.history-row\.task-row \.task-copy\s*\{[^}]*grid-template-rows:\s*18px 15px/);
    await userEvent.click(within(row).getByRole("button", { name: "明日の調査メモを残す" }));
    const taskRow = row.querySelector(".task-row") as HTMLElement;
    const actions = taskRow.querySelector(".row-actions") as HTMLElement;
    const identity = taskRow.querySelector(".current-identity") as HTMLElement;
    const renameForm = taskRow.querySelector(".rename-form") as HTMLElement;
    const renameInput = renameForm.querySelector("input") as HTMLElement;
    const taskMeta = taskRow.querySelector(".task-meta") as HTMLElement;
    const rowHeight = getComputedStyle(taskRow).height;
    expect(taskRow).toHaveClass("is-editing");
    expect(actions).toHaveClass("is-suppressed");
    expect(getComputedStyle(actions).visibility).toBe("hidden");
    expect(getComputedStyle(actions).pointerEvents).toBe("none");
    expect(getComputedStyle(taskRow).height).toBe(rowHeight);
    expect(getComputedStyle(identity).paddingRight).toBe("8px");
    expect(Number.parseFloat(getComputedStyle(renameForm).minWidth)).toBe(0);
    expect(Number.parseFloat(getComputedStyle(renameInput).minWidth)).toBe(0);
    expect(getComputedStyle(renameForm).alignItems).toBe("center");
    expect(getComputedStyle(renameForm).flexWrap).toBe("nowrap");
    expect(getComputedStyle(renameForm).gridRow).toBe("1");
    expect(styles).toMatch(/\.history-row\.task-row\.is-editing \.rename-form\s*\{[^}]*animation:\s*none/);
    expect(getComputedStyle(renameInput).height).toBe("30px");
    const saveButton = within(renameForm).getByRole("button", { name: "保存" });
    const cancelButton = within(renameForm).getByRole("button", { name: "取消" });
    expect(saveButton).toHaveAccessibleName("保存");
    expect(cancelButton).toHaveAccessibleName("取消");
    expect(Array.from(renameForm.querySelectorAll("button")).every((button) => getComputedStyle(button).height === "30px")).toBe(true);
    expect(styles).toMatch(/@media \(max-width:\s*520px\)[\s\S]*\.history-row\.task-row\.is-editing \.rename-form button\s*\{[^}]*flex:\s*0 0 30px[^}]*width:\s*30px[^}]*min-width:\s*30px/);
    expect(styles).toMatch(/\.history-row\.task-row\.is-editing \.rename-form button\[type="submit"\]::before\s*\{[^}]*content:\s*"✓"/);
    expect(styles).toMatch(/\.history-row\.task-row\.is-editing \.rename-form button\[type="button"\]::before\s*\{[^}]*content:\s*"×"/);
    expect(getComputedStyle(taskMeta).display).toBe("none");
    await userEvent.click(within(renameForm).getByRole("button", { name: "取消" }));
    expect(row.querySelector(".task-title")).toBeInTheDocument();
    expect(getComputedStyle(taskCopy).gridTemplateRows).toBe("minmax(0, 1fr)");
  });

  it("anchors current delete confirmation to the row without changing flow", async () => {
    renderPreview("typical");
    await ready();
    const row = rowFor("APIレスポンス遅延の原因を切り分ける");
    await userEvent.click(timelineCell("task-api"));
    const deleteButton = within(row.querySelector(".task-row") as HTMLElement).getByRole("button", { name: "削除" });
    await userEvent.click(deleteButton);
    const confirmation = document.querySelector("[data-delete-confirm='task-api']") as HTMLElement;
    expect(confirmation).toHaveClass("delete-confirm-current");
    expect(getComputedStyle(confirmation).position).toBe("absolute");
    expect(confirmation.previousElementSibling).toHaveAttribute("data-row-id", "task-api");
    const impactList = confirmation.querySelector("ul") as HTMLElement;
    expect(getComputedStyle(impactList).overflowY).toBe("auto");
    await userEvent.click(within(confirmation).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(document.activeElement).toBe(deleteButton));
  });

  it("uses a deliberate inline delete scope, leaves no tombstone, and restores through the receipt", async () => {
    const api = renderPreview("typical");
    const deleteCall = vi.spyOn(api, "deleteTaskSubtree");
    await ready();
    const leaf = rowFor("明日の調査メモを残す");
    await userEvent.click(timelineCell("task-next-6"));
    const leafDelete = within(leaf.querySelector(".task-row") as HTMLElement).getByRole("button", { name: "削除" });
    await userEvent.click(leafDelete);
    expect(screen.getByText("「明日の調査メモを残す」を削除します")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(document.activeElement).toBe(leafDelete));
    expect(deleteCall).not.toHaveBeenCalled();
    expect(rowFor("明日の調査メモを残す")).toBeInTheDocument();

    const parent = rowFor("APIレスポンス遅延の原因を切り分ける");
    await userEvent.click(timelineCell("task-api"));
    const parentDelete = within(parent.querySelector(".task-row") as HTMLElement).getByRole("button", { name: "削除" });
    await userEvent.click(parentDelete);
    expect(screen.getByText(/「APIレスポンス遅延の原因を切り分ける」と子孫3件を削除します/)).toBeInTheDocument();
    expect(screen.getByText(/APIレスポンス遅延の原因を切り分ける ＞ 再現条件をテストケースにする/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "キャンセル" }), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(parentDelete));

    await userEvent.click(timelineCell("task-next-6"));
    await userEvent.click(within(rowFor("明日の調査メモを残す").querySelector(".task-row") as HTMLElement).getByRole("button", { name: "削除" }));
    await userEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(deleteCall).toHaveBeenCalledWith("task-next-6", 1, 4, expect.any(String)));
    await waitFor(() => expect(document.querySelector("#history-task-task-next-6")).toBeNull());
    expect(document.querySelector("[data-history-member-id='task-next-6']")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    await waitFor(() => expect(screen.getByText("明日の調査メモを残す", { selector: ".task-title" })).toBeInTheDocument());
  });

  it("deletes a selected completed task from its attached detail without leaving ordinary history", async () => {
    const api = renderPreview("typical");
    const deleteCall = vi.spyOn(api, "deleteTaskSubtree");
    await ready();
    const leaf = rowFor("明日の調査メモを残す");
    await userEvent.click(within(leaf).getByRole("button", { name: /明日の調査メモを残すを完了にする/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /明日の調査メモを残すの完了履歴/ })).toBeInTheDocument());
    expect(document.querySelector("[data-selected-readout='task-next-6']")).toBeNull();
    expect(screen.getByRole("tree")).toHaveAttribute("aria-activedescendant", "history-pocket-caption-task-next-6");
    await expandPocket("task-next-6");
    await userEvent.click(screen.getByRole("option", { name: /明日の調査メモを残す。作成/ }));
    const detail = document.querySelector("[data-selected-readout='task-next-6']") as HTMLElement;
    await userEvent.click(within(detail).getByRole("button", { name: "削除" }));
    expect(screen.getByText("「明日の調査メモを残す」を削除します")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(deleteCall).toHaveBeenCalledWith("task-next-6", 2, 4, expect.any(String)));
    await waitFor(() => expect(document.querySelector("[data-history-member-id='task-next-6']")).toBeNull());
    expect(screen.queryByText("明日の調査メモを残す", { selector: ".task-title" })).not.toBeInTheDocument();
  });

  it("completes a leaf into a pocket and reopens it from attached history detail", async () => {
    const api = renderPreview("typical");
    const complete = vi.spyOn(api, "completeHierarchyTask");
    const reopen = vi.spyOn(api, "reopenHierarchyTask");
    await ready();
    const leaf = rowFor("明日の調査メモを残す");
    await userEvent.click(within(leaf).getByRole("button", { name: /明日の調査メモを残すを完了にする/ }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith("task-next-6", 1, expect.any(String)));
    await waitFor(() => expect(screen.getByRole("button", { name: /明日の調査メモを残すの完了履歴/ })).toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(pocketFor("task-next-6").querySelector(".pocket-caption")));
    await expandPocket("task-next-6");
    await userEvent.click(screen.getByRole("option", { name: /明日の調査メモを残す。作成/ }));
    expect(screen.getByText("明日の調査メモを残す", { selector: "[data-selected-readout] strong" })).toBeInTheDocument();
    const completed = screen.getByRole("button", { name: "明日の調査メモを残すをNOWへ戻す" });
    await userEvent.click(completed);
    await waitFor(() => expect(reopen).toHaveBeenCalledWith("task-next-6", 2, expect.any(String)));
    await waitFor(() => expect(screen.getByText("明日の調査メモを残す", { selector: ".task-title" })).toBeInTheDocument());
  });

  it("does not partially complete a parent and reveals the recovery child", async () => {
    const api = renderPreview("typical");
    const complete = vi.spyOn(api, "completeHierarchyTask");
    await ready();
    const parent = rowFor("APIレスポンス遅延の原因を切り分ける");
    await userEvent.click(within(parent).getByRole("button", { name: /APIレスポンス遅延の原因を切り分けるを完了にする/ }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith("task-api", 4, expect.any(String)));
    expect(await screen.findByText("未完了の子タスクがあります。先に子タスクを完了してください。", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("再現条件をテストケースにする", { selector: ".task-title" })).toBeInTheDocument();
  });

  it("moves a task into another parent with a pointer drop basin", async () => {
    const api = renderPreview("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const source = rowFor("明日の調査メモを残す");
    const lifetimeBefore = timelineCell("task-next-6");
    const startBefore = lifetimeBefore.dataset.startMs;
    const endBefore = lifetimeBefore.dataset.endMs;
    const handle = within(source).getByRole("button", { name: /明日の調査メモを残すをドラッグして移動/ });
    pointerDown(handle);
    const target = screen.getByLabelText("顧客向け回答の根拠を再確認の子の末尾に配置");
    pointerMove(handle, target);
    pointerUp(handle);
    await waitFor(() => expect(move).toHaveBeenCalledWith("task-next-6", "task-answer", undefined, 4, expect.any(String)));
    await waitFor(() => expect(timelineCell("task-next-6").dataset.startMs).toBe(startBefore));
    expect(timelineCell("task-next-6").dataset.endMs).toBe(endBefore);
  });

  it("uses the whole current identity as a child basin for a nested source", async () => {
    const api = renderPreview("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const source = rowFor("再現条件をテストケースにする");
    const handle = within(source).getByRole("button", { name: /再現条件をテストケースにするをドラッグして移動/ });
    pointerDown(handle);
    const target = screen.getByLabelText("顧客向け回答の根拠を再確認の子の末尾に配置");
    pointerMove(handle, target);
    expect(target).toHaveClass("is-drop-target", "is-valid");
    pointerUp(handle);
    await waitFor(() => expect(move).toHaveBeenCalledWith("task-next-1", "task-answer", undefined, 4, expect.any(String)));
    expect(move.mock.calls[0][2]).toBeUndefined();
  });

  it("moves a nested task to the explicit root-end basin", async () => {
    const api = renderPreview("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const source = rowFor("再現条件をテストケースにする");
    const handle = within(source).getByRole("button", { name: /再現条件をテストケースにするをドラッグして移動/ });
    pointerDown(handle);
    const rootEnd = document.querySelector(".root-landing-sill") as HTMLElement;
    expect(rootEnd).toHaveAttribute("aria-label", "最上位の末尾（完了履歴の前）に配置");
    expect(rootEnd).toHaveTextContent("最上位の末尾（完了履歴の前）に配置");
    expect(rootEnd).toHaveAttribute("data-drop-before-id", "task-no-session");
    expect(getComputedStyle(rootEnd).position).toBe("fixed");
    pointerMove(handle, rootEnd);
    pointerUp(handle);
    await waitFor(() => expect(move).toHaveBeenCalledWith("task-next-1", undefined, "task-no-session", 4, expect.any(String)));
  });

  it("starts edge autoscroll for ordinary targets but stops it at the fixed root sill", async () => {
    renderPreview("typical");
    await ready();
    const source = rowFor("再現条件をテストケースにする");
    const handle = within(source).getByRole("button", { name: /再現条件をテストケースにするをドラッグして移動/ });
    const frame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(41);
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    pointerDown(handle);
    const parent = screen.getByLabelText("顧客向け回答の根拠を再確認の子の末尾に配置");
    pointAt(parent);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 80, clientY: 1, buttons: 1 });
    expect(frame).toHaveBeenCalledTimes(1);

    const rootEnd = document.querySelector(".root-landing-sill") as HTMLElement;
    pointAt(rootEnd);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 80, clientY: 767, buttons: 1 });
    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(scrollBy).not.toHaveBeenCalled();
    fireEvent.pointerCancel(handle, { pointerId: 1, clientX: 80, clientY: 767 });
  });

  it("moves across parents through a sibling-before seam without falling through to root", async () => {
    const api = renderPreview("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const source = rowFor("レビューコメントへ返信");
    const handle = within(source).getByRole("button", { name: /レビューコメントへ返信をドラッグして移動/ });
    pointerDown(handle);
    const seam = screen.getByLabelText("再現条件をテストケースにする の前に配置");
    pointerMove(handle, seam);
    pointerUp(handle);
    await waitFor(() => expect(move).toHaveBeenCalledWith("task-next-3", "task-api", "task-next-1", 4, expect.any(String)));
    expect(move.mock.calls[0][1]).toBe("task-api");
    expect(move.mock.calls[0][2]).toBe("task-next-1");
  });

  it("moves a nested task to the end of a sibling scope before completed history", async () => {
    const api = renderPreview("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const source = rowFor("レビューコメントへ返信");
    const handle = within(source).getByRole("button", { name: /レビューコメントへ返信をドラッグして移動/ });
    pointerDown(handle);
    const boundary = screen.getByLabelText("APIレスポンス遅延の原因を切り分ける の子の末尾（完了履歴の前）");
    expect(boundary).toHaveAttribute("data-drop-kind", "before");
    expect(boundary).toHaveAttribute("data-drop-boundary", "remaining-completed");
    expect(boundary).toHaveAttribute("data-drop-parent-id", "task-api");
    expect(boundary).toHaveAttribute("data-drop-before-id", "task-completed");
    pointerMove(handle, boundary);
    pointerUp(handle);
    await waitFor(() => expect(move).toHaveBeenCalledWith("task-next-3", "task-api", "task-completed", 4, expect.any(String)));
  });

  it("moves a top-level task to the current top-level boundary before completed history", async () => {
    const api = renderPreview("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const source = rowFor("再現条件をテストケースにする");
    const handle = within(source).getByRole("button", { name: /再現条件をテストケースにするをドラッグして移動/ });
    pointerDown(handle);
    const boundary = screen.getByLabelText("最上位の末尾（完了履歴の前）");
    expect(getComputedStyle(boundary).height).toBe("0px");
    expect(getComputedStyle(boundary.querySelector("span") as HTMLElement).position).toBe("absolute");
    pointerMove(handle, boundary);
    pointerUp(handle);
    await waitFor(() => expect(move).toHaveBeenCalledWith("task-next-1", undefined, "task-no-session", 4, expect.any(String)));
  });

  it("keeps drag affordances dimension-neutral and highlights only the hovered basin", async () => {
    renderPreview("typical");
    await ready();
    const source = rowFor("明日の調査メモを残す");
    const handle = within(source).getByRole("button", { name: /明日の調査メモを残すをドラッグして移動/ });
    pointerDown(handle);
    const seams = Array.from(document.querySelectorAll<HTMLElement>(".drop-seam"));
    expect(seams.length).toBeGreaterThan(0);
    expect(seams.every((seam) => getComputedStyle(seam).height === "0px")).toBe(true);
    expect(seams.every((seam) => getComputedStyle(seam.querySelector("span") as HTMLElement).position === "absolute")).toBe(true);
    const target = screen.getByLabelText("顧客向け回答の根拠を再確認の子の末尾に配置");
    const other = screen.getByLabelText("APIレスポンス遅延の原因を切り分けるの子の末尾に配置");
    expect(target).not.toHaveClass("is-current");
    pointerMove(handle, target);
    expect(target).toHaveClass("is-current");
    expect(other).not.toHaveClass("is-current");
    expect(getComputedStyle(target).margin).not.toContain("2px");
    expect(getComputedStyle(target).border).not.toContain("1px");
  });

  it("cancels an invalid pointer drop without calling the hierarchy adapter", async () => {
    const api = renderPreview("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const source = rowFor("APIレスポンス遅延の原因を切り分ける");
    const handle = within(source).getByRole("button", { name: /APIレスポンス遅延の原因を切り分けるをドラッグして移動/ });
    pointerDown(handle);
    const invalid = screen.getByLabelText("APIレスポンス遅延の原因を切り分けるには配置できません: 自分自身や子孫の中には移動できません");
    pointerMove(handle, invalid);
    expect(invalid).toHaveClass("is-drop-target", "is-invalid");
    pointerUp(handle);
    expect(move).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("APIレスポンス遅延の原因を切り分ける", { selector: ".task-title" })).toBeInTheDocument();
  });

  it("treats dropping at the current parent end as a neutral no-op", async () => {
    const api = renderPreview("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const source = rowFor("レビューコメントへ返信");
    const handle = within(source).getByRole("button", { name: /レビューコメントへ返信をドラッグして移動/ });
    pointerDown(handle);
    const target = screen.getByLabelText("顧客向け回答の根拠を再確認の子の末尾に配置");
    pointerMove(handle, target);
    expect(target).toHaveClass("is-drop-target", "is-valid");
    expect(target).not.toHaveClass("is-invalid");
    pointerUp(handle);
    expect(move).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cancels pointercancel without a speculative move", async () => {
    const api = renderPreview("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const source = rowFor("明日の調査メモを残す");
    const handle = within(source).getByRole("button", { name: /明日の調査メモを残すをドラッグして移動/ });
    pointerDown(handle);
    fireEvent.pointerCancel(handle, { pointerId: 1, clientX: 80, clientY: 80 });
    expect(move).not.toHaveBeenCalled();
    expect(document.querySelector(".root-landing-sill")).not.toBeInTheDocument();
  });

  it("recovers a stale pointer placement without speculative commit", async () => {
    const api = renderPreview("typical");
    const load = vi.spyOn(api, "getTaskForest");
    const move = vi.spyOn(api, "moveTaskInHierarchy").mockRejectedValueOnce({ code: "stale-hierarchy", message: "stale" });
    await ready();
    const source = rowFor("明日の調査メモを残す");
    const handle = within(source).getByRole("button", { name: /明日の調査メモを残すをドラッグして移動/ });
    pointerDown(handle);
    const target = screen.getByLabelText("顧客向け回答の根拠を再確認の子の末尾に配置");
    pointerMove(handle, target);
    pointerUp(handle);
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/一覧が更新されています/)).toBeInTheDocument();
    expect(screen.getByText("明日の調査メモを残す", { selector: ".task-title" })).toBeInTheDocument();
  });

  it("hides manual keyboard placement while preserving pointer drag controls", async () => {
    renderPreview("typical");
    await ready();
    expect(screen.queryByRole("button", { name: "移動" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "キーボードで移動先を選択" })).not.toBeInTheDocument();
    expect(within(rowFor("明日の調査メモを残す")).getByRole("button", { name: /明日の調査メモを残すをドラッグして移動/ })).toBeInTheDocument();
  });

  it("hides manual placement from completed history details", async () => {
    renderPreview("typical");
    await ready();
    await expandPocket("task-completed");
    await userEvent.click(timelineCell("task-completed"));
    const detail = document.querySelector("[data-selected-readout='task-completed']") as HTMLElement;
    expect(detail).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: "配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "キーボードで移動先を選択" })).not.toBeInTheDocument();
  });

  it("maps remaining lifetimes to NOW and completed lifetimes to completedAt", async () => {
    renderPreview("typical");
    await ready();
    expect(screen.getByLabelText("時間範囲")).toHaveValue("24h");
    const active = timelineCell("task-api");
    const ruler = timelineRuler();
    expect(active.dataset.startMs).toBe(String(Date.parse("2026-08-22T23:42:00.000Z")));
    expect(active.dataset.endMs).toBe(ruler.dataset.nowMs);
    expect(active.querySelector(".lifetime-bar")).toHaveClass("is-open");
    expect(document.querySelector('[data-row-id="task-api"] .now-hinge-cell')).toBeInTheDocument();

    await expandPocket("task-completed");
    const completed = timelineCell("task-completed");
    expect(completed.dataset.startMs).toBe(String(Date.parse("2026-08-23T03:40:00.000Z")));
    expect(completed.dataset.endMs).toBe(String(Date.parse("2026-08-23T03:57:00.000Z")));
    expect(completed).toHaveClass("pocket-mark");
  });

  it("uses relative major labels for NOW-anchored ranges and only two exact endpoints", async () => {
    renderPreview("typical");
    await ready();
    const ruler = timelineRuler();
    expect(screen.getByText("24時間前", { selector: ".ruler-tick" })).toBeInTheDocument();
    expect(screen.getByText("18時間前", { selector: ".ruler-tick" })).toBeInTheDocument();
    expect(screen.getByText("12時間前", { selector: ".ruler-tick" })).toBeInTheDocument();
    expect(screen.getByText("6時間前", { selector: ".ruler-tick" })).toBeInTheDocument();
    expect(screen.getByText("現在", { selector: ".ruler-tick" })).toBeInTheDocument();
    const endpoints = Array.from(ruler.querySelectorAll(".range-bounds > span"));
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toHaveTextContent(/^開始 /);
    expect(endpoints[1]).toHaveTextContent(/^現在 /);
    expect(ruler.querySelector(".range-separator")).toBeNull();
    expect(Number(ruler.dataset.rangeEndMs)).toBeLessThanOrEqual(Number(ruler.dataset.nowMs));

    await userEvent.click(screen.getByRole("button", { name: "前へ" }));
    const pannedLabels = Array.from(timelineRuler().querySelectorAll<HTMLElement>(".ruler-tick"), (tick) => tick.textContent ?? "");
    expect(pannedLabels).toHaveLength(5);
    expect(pannedLabels.every((label) => /^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/.test(label))).toBe(true);
    expect(pannedLabels).not.toContain("現在");
    expect(Number(timelineRuler().dataset.rangeEndMs)).toBeLessThanOrEqual(Number(timelineRuler().dataset.nowMs));
  });

  it("uses unique calendar dates instead of rounded week labels for a 30-day range", async () => {
    renderPreview("dense");
    await ready();
    await userEvent.selectOptions(screen.getByLabelText("時間範囲"), "30d");

    const labels = Array.from(timelineRuler().querySelectorAll<HTMLElement>(".ruler-tick"), (tick) => tick.textContent ?? "");
    expect(labels.at(-1)).toBe("現在");
    expect(labels.slice(0, -1).every((label) => /^\d{1,2}\/\d{1,2}$/.test(label))).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.some((label) => label.includes("週間前"))).toBe(false);
  });

  it("shows a warning instead of fabricating a completed endpoint", async () => {
    renderPreview("typical");
    await ready();
    await expandPocket("task-no-session");
    const missing = timelineCell("task-no-session");
    expect(missing.dataset.endMs).toBe("missing");
    expect(missing).toHaveClass("pocket-mark", "is-warning");
    await userEvent.click(missing);
    expect(screen.getByText(/完了時刻なし/)).toBeInTheDocument();
  });

  it("uses visible locators for clipped, out-of-range, and missing-end lifetimes", async () => {
    const api = createFixtureTaskApi("typical");
    const originalLoad = api.getTaskForest.bind(api);
    const now = Date.now();
    vi.spyOn(api, "getTaskForest").mockImplementation(async (limit) => {
      const snapshot = await originalLoad(limit);
      return {
        ...snapshot,
        entries: snapshot.entries.map((entry) => {
          if (entry.task.id === "task-api") return { ...entry, task: { ...entry.task, createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString() } };
          if (entry.task.id === "task-completed") return { ...entry, task: { ...entry.task, createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(), completedAt: new Date(now - 13 * 24 * 60 * 60 * 1000).toISOString() } };
          if (entry.task.id === "task-no-session") return { ...entry, task: { ...entry.task, createdAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(), completedAt: undefined } };
          return entry;
        }),
      };
    });
    render(<App api={api} />);
    await ready();
    expect(timelineCell("task-api").querySelector(".lifetime-bar")).toHaveClass("is-clipped-left");
    await expandPocket("task-completed");
    await expandPocket("task-no-session");
    expect(timelineCell("task-completed")).toHaveClass("pocket-mark", "is-before");
    expect(timelineCell("task-completed")).toHaveTextContent("◁");
    expect(timelineCell("task-no-session")).toHaveClass("pocket-mark", "is-after");
    expect(timelineCell("task-no-session")).toHaveTextContent("▷");
    await userEvent.click(timelineCell("task-no-session"));
    expect(screen.getByText(/完了時刻なし/)).toBeInTheDocument();
  });

  it("keeps range controls presentation-only and can fit a selection or return to current", async () => {
    const api = renderPreview("typical");
    const load = vi.spyOn(api, "getTaskForest");
    const create = vi.spyOn(api, "createTaskInHierarchy");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    await ready();
    const loadCallsBeforeRangeControls = load.mock.calls.length;
    const ruler = timelineRuler();
    const initialNow = ruler.dataset.nowMs;
    await userEvent.selectOptions(screen.getByLabelText("時間範囲"), "24h");
    await userEvent.click(screen.getByRole("button", { name: "前へ" }));
    await userEvent.click(screen.getByRole("button", { name: "次へ" }));
    const rangeBeforeFitStart = timelineRuler().dataset.rangeStartMs;
    expect(load).toHaveBeenCalledTimes(loadCallsBeforeRangeControls);
    expect(create).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();

    await userEvent.click(timelineCell("task-api"));
    expect(screen.queryByText("APIレスポンス遅延の原因を切り分ける", { selector: "[data-selected-readout] strong" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "選択を表示" }));
    await waitFor(() => expect(Number(timelineRuler().dataset.rangeStartMs)).not.toBe(Number(rangeBeforeFitStart)));
    await userEvent.click(screen.getByRole("button", { name: "前へ" }));
    await userEvent.click(screen.getByRole("button", { name: "現在へ" }));
    await waitFor(() => expect(timelineRuler().dataset.rangeEndMs).toBe(timelineRuler().dataset.nowMs));
    expect(timelineRuler().dataset.nowMs).toBe(initialNow);

    for (const preset of ["7d", "30d", "90d", "all"] as const) {
      await userEvent.selectOptions(screen.getByLabelText("時間範囲"), preset);
      expect(Number(timelineRuler().dataset.rangeEndMs)).toBeLessThanOrEqual(Number(timelineRuler().dataset.nowMs));
      await userEvent.click(screen.getByRole("button", { name: "前へ" }));
      expect(Number(timelineRuler().dataset.rangeEndMs)).toBeLessThanOrEqual(Number(timelineRuler().dataset.nowMs));
      await userEvent.click(screen.getByRole("button", { name: "次へ" }));
      expect(Number(timelineRuler().dataset.rangeEndMs)).toBeLessThanOrEqual(Number(timelineRuler().dataset.nowMs));
    }
  });

  it("steps adjacent time ranges with select wheel and blocks page scrolling", async () => {
    renderPreview("typical");
    await ready();
    const select = screen.getByLabelText("時間範囲");

    const longer = createEvent.wheel(select, { deltaY: 1 });
    const longerPrevent = vi.spyOn(longer, "preventDefault");
    fireEvent(select, longer);
    expect(longerPrevent).toHaveBeenCalledTimes(1);
    expect(select).toHaveValue("7d");

    const shorter = createEvent.wheel(select, { deltaY: -1 });
    const shorterPrevent = vi.spyOn(shorter, "preventDefault");
    fireEvent(select, shorter);
    expect(shorterPrevent).toHaveBeenCalledTimes(1);
    expect(select).toHaveValue("24h");

    await userEvent.selectOptions(select, "all");
    const endBoundary = createEvent.wheel(select, { deltaY: 1 });
    const endBoundaryPrevent = vi.spyOn(endBoundary, "preventDefault");
    fireEvent(select, endBoundary);
    expect(endBoundaryPrevent).toHaveBeenCalledTimes(1);
    expect(select).toHaveValue("all");

    await userEvent.selectOptions(select, "24h");
    const startBoundary = createEvent.wheel(select, { deltaY: -1 });
    const startBoundaryPrevent = vi.spyOn(startBoundary, "preventDefault");
    fireEvent(select, startBoundary);
    expect(startBoundaryPrevent).toHaveBeenCalledTimes(1);
    expect(select).toHaveValue("24h");

    const neutral = createEvent.wheel(select, { deltaY: 0 });
    const neutralPrevent = vi.spyOn(neutral, "preventDefault");
    fireEvent(select, neutral);
    expect(neutralPrevent).not.toHaveBeenCalled();
    expect(select).toHaveValue("24h");
  });

  it("registers and cleans up the non-passive range wheel listener", async () => {
    const addListener = vi.spyOn(HTMLSelectElement.prototype, "addEventListener");
    const removeListener = vi.spyOn(HTMLSelectElement.prototype, "removeEventListener");
    const api = createFixtureTaskApi("typical");
    const view = render(<App api={api} />);
    await ready();
    const registration = addListener.mock.calls.find(([type]) => type === "wheel");
    expect(registration?.[2]).toEqual({ passive: false });
    view.unmount();
    expect(removeListener.mock.calls.some(([type, handler]) => type === "wheel" && handler === registration?.[1])).toBe(true);
  });

  it("provides counted current/history jumps with reset and scroll targets", async () => {
    renderPreview("typical");
    await ready();
    if (!HTMLElement.prototype.scrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);

    const currentJump = screen.getByRole("button", { name: "現在のタスク 8 件へ移動" });
    const historyJump = screen.getByRole("button", { name: "完了履歴 2 件へ移動" });
    expect(currentJump).toHaveTextContent("現在 8");
    expect(historyJump).toHaveTextContent("履歴 2");
    await userEvent.click(screen.getByRole("button", { name: "前へ" }));
    await userEvent.click(currentJump);
    expect(timelineRuler().dataset.rangeEndMs).toBe(timelineRuler().dataset.nowMs);
    expect(scroll.mock.instances.at(-1)).toHaveAttribute("id", "history-task-task-api");

    await expandPocket("task-completed");
    await userEvent.click(timelineCell("task-completed"));
    await userEvent.click(historyJump);
    expect(scroll.mock.instances.at(-1)).toHaveAttribute("id", "history-member-row-task-completed");
  });

  it("disables counted jumps when their surface has no matching entries", async () => {
    renderPreview("only-completed");
    await ready();
    expect(screen.getByRole("button", { name: "現在のタスク 0 件へ移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "完了履歴 3 件へ移動" })).not.toBeDisabled();
  });

  it("keeps the ruler sticky and row controls fixed without changing the completion cell", async () => {
    renderPreview("typical");
    await ready();
    expect(getComputedStyle(timelineRuler()).position).toBe("sticky");
    expect(getComputedStyle(timelineRuler()).scrollMarginTop).toBe("56px");

    const row = rowFor("明日の調査メモを残す");
    const actions = row.querySelector(".row-actions") as HTMLElement;
    expect(getComputedStyle(actions).position).toBe("absolute");
    expect(getComputedStyle(actions).opacity).toBe("0");
    expect(getComputedStyle(actions).pointerEvents).toBe("none");
    const completion = within(row.querySelector(".task-row") as HTMLElement).getByRole("button", { name: /明日の調査メモを残すを完了にする/ });
    expect(getComputedStyle(completion).width).toBe("40px");
    expect(getComputedStyle(completion).height).toBe("40px");
    fireEvent.mouseEnter(completion);
    expect(getComputedStyle(completion).width).toBe("40px");
    completion.focus();
    expect(getComputedStyle(completion).width).toBe("40px");
    expect(getComputedStyle(within(completion).getByText("完了", { selector: ".completion-intent" })).display).toBe("none");
  });

  it("keeps row actions on a full-height state-matched rail without a seam", async () => {
    renderPreview("typical");
    await ready();
    const styles = loadedStyles();
    const actions = rowFor("明日の調査メモを残す").querySelector(".row-actions") as HTMLElement;
    expect(getComputedStyle(actions).top).toBe("0px");
    expect(getComputedStyle(actions).bottom).toBe("0px");
    expect(getComputedStyle(actions).height).toBe("100%");
    expect(styles).toMatch(/\.row-actions\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/);
    expect(styles).toMatch(/\.history-row\.task-row:not\(\.is-selected\):hover \.row-actions,[^{}]*\{[^}]*background:\s*var\(--task-hover-surface\)[^}]*box-shadow:\s*none/);
    expect(styles).toMatch(/\.history-row\.task-row\.is-selected \.row-actions\s*\{[^}]*background:\s*var\(--task-selected-surface\)[^}]*box-shadow:\s*none/);
    expect(styles).toMatch(/\.history-row\.task-row:not\(\.is-editing\):hover \.current-identity,[\s\S]*\.history-row\.task-row:not\(\.is-editing\)\.is-selected \.current-identity\s*\{[^}]*padding-right:\s*var\(--selected-action-width\)/);
    expect(styles).toMatch(/\.history-row\.task-row\.is-editing \.current-identity\s*\{[^}]*padding-right:\s*8px/);
    expect(styles).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.history-row\.task-row\s*\{[^}]*--selected-action-width:\s*84px/);
    expect(styles).toMatch(/@media \(max-width:\s*520px\)[\s\S]*\.history-row\.task-row\s*\{[^}]*--selected-action-width:\s*78px/);
    expect(styles).not.toMatch(/\.row-actions[^{}]*linear-gradient/);
  });

  it("keeps completion hover and keyboard focus paint on the inner glyph", async () => {
    renderPreview("typical");
    await ready();
    const styles = loadedStyles();
    expect(styles).toMatch(/\.history-row\.task-row \.completion-box:hover,[^{}]*\.completion-box:focus-visible\s*\{[^}]*outline:\s*none[^}]*box-shadow:\s*none/);
    expect(styles).toMatch(/\.history-row\.task-row \.completion-box:focus-visible \.completion-glyph\s*\{[^}]*outline:\s*3px solid var\(--focus\)/);
  });

  it("separates hierarchy cues from completion and selection at rest", async () => {
    renderPreview("typical");
    await ready();

    const parentRow = rowFor("APIレスポンス遅延の原因を切り分ける").querySelector(".task-row") as HTMLElement;
    const childRow = rowFor("再現条件をテストケースにする").querySelector(".task-row") as HTMLElement;
    const standaloneRow = rowFor("明日の調査メモを残す").querySelector(".task-row") as HTMLElement;

    expect(parentRow).toHaveClass("is-parent");
    expect(parentRow).not.toHaveClass("is-standalone");
    expect(parentRow).toHaveAttribute("data-hierarchy-kind", "parent");
    expect(parentRow.querySelector(".child-count")).toHaveTextContent("子3・未完了2");
    const parentCopy = parentRow.querySelector(".task-copy") as HTMLElement;
    expect(parentCopy.querySelector(".disclosure")?.nextElementSibling).toBe(parentCopy.querySelector(".task-title"));
    expect(getComputedStyle(parentRow.querySelector(".task-title") as HTMLElement).fontWeight).toBe("800");

    expect(childRow).toHaveClass("is-child");
    expect(childRow).toHaveAttribute("data-hierarchy-kind", "child");
    expect(childRow.querySelector(".branch-rail")).toBeInTheDocument();
    expect(childRow.querySelector(".branch-rail")).toHaveStyle({ marginLeft: "22px" });
    expect(childRow.querySelector(".task-copy")).toHaveClass("is-child-leaf");
    expect(getComputedStyle(childRow.querySelector(".task-copy") as HTMLElement).paddingLeft).toBe("26px");

    expect(standaloneRow).toHaveClass("is-standalone");
    expect(standaloneRow).toHaveAttribute("data-hierarchy-kind", "standalone");
    expect(standaloneRow.querySelector(".disclosure")).toBeNull();
    expect(standaloneRow.querySelector(".disclosure-spacer")).toBeNull();
    expect(standaloneRow.querySelector(".branch-rail")).toBeNull();

    const completion = within(standaloneRow).getByRole("button", { name: /明日の調査メモを残すを完了にする/ });
    expect(completion.textContent).not.toContain("✓");
    expect(completion).toHaveAttribute("data-completion-state", "incomplete");
    expect(getComputedStyle(completion).width).toBe("40px");
    expect(getComputedStyle(completion).height).toBe("40px");
    expect(getComputedStyle(completion.querySelector(".completion-glyph") as HTMLElement).width).toBe("22px");
  });

  it("keeps localized top and child create forms on the existing hierarchy contract", async () => {
    const api = renderPreview("empty");
    const create = vi.spyOn(api, "createTaskInHierarchy");
    await ready();
    await userEvent.type(screen.getByRole("textbox", { name: "新しいタスク" }), "親タスク");
    await userEvent.click(screen.getByRole("button", { name: "トップレベルに追加" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("親タスク", undefined, undefined, 0, expect.any(String)));
    await screen.findByText("親タスク", { selector: ".task-title" });

    const parent = rowFor("親タスク");
    await userEvent.click(timelineCell("preview-created-1"));
    await userEvent.click(within(parent).getByRole("button", { name: "＋子" }));
    await userEvent.type(within(parent).getByRole("textbox", { name: "親タスクのサブタスク" }), "子タスク ");
    await userEvent.click(within(parent).getByRole("button", { name: "追加" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("子タスク ", "preview-created-1", undefined, 1, expect.any(String)));
  });

  it("uses tokenized compositor-only motion with a reduced-motion escape hatch", async () => {
    renderPreview("typical");
    await ready();
    const rootStyle = getComputedStyle(document.documentElement);
    const styles = loadedStyles();
    expect(rootStyle.getPropertyValue("--duration-fast").trim()).toBe("120ms");
    expect(rootStyle.getPropertyValue("--duration-standard").trim()).toBe("180ms");
    expect(rootStyle.getPropertyValue("--duration-emphasized").trim()).toBe("260ms");
    expect(rootStyle.getPropertyValue("--ease-enter")).toContain("cubic-bezier");

    const actions = rowFor("明日の調査メモを残す").querySelector(".row-actions") as HTMLElement;
    expect(getComputedStyle(actions).transform).toContain("translateX");
    expect(getComputedStyle(actions).transition).toContain("opacity");
    expect(getComputedStyle(actions).transition).toContain("transform");
    expect(styles).not.toMatch(/transition\s*:\s*all/i);
    expect(styles).not.toMatch(/transition(?:-property)?\s*:[^;]*(?:width|height|left|top|max-width)/i);
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("scroll-behavior: auto !important");
    expect(styles).toContain("animation: none !important");
  });

  it("uses points for subpixel lifetimes in both the remaining rail and completed pocket", async () => {
    const api = createFixtureTaskApi("typical");
    const originalLoad = api.getTaskForest.bind(api);
    const now = Date.now();
    vi.spyOn(api, "getTaskForest").mockImplementation(async (limit) => {
      const snapshot = await originalLoad(limit);
      return {
        ...snapshot,
        entries: snapshot.entries.map((entry) => {
          if (entry.task.id === "task-next-6") return { ...entry, task: { ...entry.task, createdAt: new Date(now - 1).toISOString() } };
          if (entry.task.id === "task-completed") return { ...entry, task: { ...entry.task, createdAt: new Date(now - 100).toISOString(), completedAt: new Date(now - 50).toISOString() } };
          return entry;
        }),
      };
    });
    render(<App api={api} />);
    await ready();
    expect(timelineCell("task-next-6").querySelector(".lifetime-point")).toHaveClass("is-open");
    await expandPocket("task-completed");
    const completedPoint = timelineCell("task-completed");
    expect(completedPoint).toHaveClass("is-point", "is-closed");
    expect(completedPoint?.getAttribute("style")).not.toContain("width");
  });

  it("keeps tick labels unique across long calendar ranges", async () => {
    renderPreview("dense");
    await ready();
    for (const preset of ["30d", "90d", "all"] as const) {
      await userEvent.selectOptions(screen.getByLabelText("時間範囲"), preset);
      const labels = Array.from(timelineRuler().querySelectorAll<HTMLElement>(".ruler-tick"), (tick) => tick.textContent ?? "");
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("keeps remaining selection without a readout and attaches completed detail locally", async () => {
    renderPreview("typical");
    await ready();
    await userEvent.click(timelineCell("task-api"));
    expect(document.querySelector("[data-selected-readout]")).toBeNull();

    await expandPocket("task-completed");
    await userEvent.click(timelineCell("task-completed"));
    const detail = document.querySelector("[data-selected-readout='task-completed']") as HTMLElement;
    expect(detail).toBeInTheDocument();
    expect(detail.closest(".pocket-branch")).toBeInTheDocument();
    expect(detail.closest(".history-detail-row")).toHaveClass("history-detail-row-local");
    expect(detail.closest(".completed-detail-anchor")?.previousElementSibling).toHaveAttribute("data-row-id", "pocket:task-completed");
    expect(within(detail).getByText(/作成 .* → 完了 /)).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "ログのタイムアウト境界を確認をNOWへ戻す" })).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: "配置" })).not.toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "削除" })).toBeInTheDocument();
    await userEvent.click(within(detail).getByRole("button", { name: "削除" }));
    const confirmation = document.querySelector("[data-delete-confirm='task-completed']");
    expect(confirmation).toBeInTheDocument();
    expect(confirmation?.previousElementSibling).toBe(detail.closest(".history-detail-row"));
  });

  it("moves the local completed detail when a different pocket is selected", async () => {
    renderPreview("typical");
    await ready();
    await expandPocket("task-completed");
    await expandPocket("task-no-session");
    await userEvent.click(timelineCell("task-completed"));
    expect(document.querySelector("[data-selected-readout='task-completed']")).toBeInTheDocument();

    await userEvent.click(timelineCell("task-no-session"));
    expect(document.querySelector("[data-selected-readout='task-completed']")).toBeNull();
    const detail = document.querySelector("[data-selected-readout='task-no-session']") as HTMLElement;
    expect(detail.closest(".pocket-branch")).toHaveAttribute("data-task-id", "task-no-session");
    expect(detail.querySelector(".history-detail-path")).toHaveTextContent("階層 調査メモの表記を確認（記録なし完了）");
  });

  it("keeps completed detail delete confirmation in its existing local flow", async () => {
    renderPreview("typical");
    await ready();
    await expandPocket("task-completed");
    await userEvent.click(timelineCell("task-completed"));
    const detail = document.querySelector("[data-selected-readout='task-completed']") as HTMLElement;
    await userEvent.click(within(detail).getByRole("button", { name: "削除" }));
    const confirmation = document.querySelector("[data-delete-confirm='task-completed']") as HTMLElement;
    expect(confirmation).toHaveClass("delete-confirm-completed");
    expect(getComputedStyle(confirmation).position).toBe("absolute");
    expect(confirmation.previousElementSibling).toBe(detail.closest(".history-detail-row"));
  });

  it("shows the same local detail when keyboard navigation selects completed history", async () => {
    renderPreview("typical");
    await ready();
    await expandPocket("task-completed");
    const history = screen.getByRole("tree");
    history.focus();
    fireEvent.keyDown(history, { key: "Home" });
    fireEvent.keyDown(history, { key: "ArrowDown" });
    fireEvent.keyDown(history, { key: "ArrowDown" });
    fireEvent.keyDown(history, { key: "ArrowDown" });
    const detail = document.querySelector("[data-selected-readout='task-completed']") as HTMLElement;
    expect(detail).toBeInTheDocument();
    expect(detail.closest(".pocket-branch")).toBeInTheDocument();
    expect(document.querySelector("[data-selected-readout='task-api']")).toBeNull();
  });

  it("loads actual work lazily and distinguishes a zero aggregate from no session record", async () => {
    const api = createFixtureTaskApi("typical");
    const history = vi.spyOn(api, "getTaskActualHistory");
    render(<App api={api} />);
    await ready();
    expect(history).not.toHaveBeenCalled();

    await expandPocket("task-completed");
    await userEvent.click(timelineCell("task-completed"));
    await waitFor(() => expect(history).toHaveBeenCalledWith("task-completed"));
    await waitFor(() => expect(document.querySelector("[data-selected-readout='task-completed'] [data-actual-history-state='ready']")).toHaveTextContent("17分"));
    expect(document.querySelector("[data-selected-readout='task-completed'] [data-actual-duration-ms='1020000']")).toBeInTheDocument();

    await expandPocket("task-no-session");
    await userEvent.click(timelineCell("task-no-session"));
    await waitFor(() => expect(document.querySelector("[data-selected-readout='task-no-session'] [data-actual-history-state='no-record']")).toHaveTextContent("記録なし"));
    expect(document.querySelector("[data-selected-readout='task-no-session'] [data-actual-history-state='no-record']")).not.toHaveTextContent("0分");
  });

  it("keeps the completed detail while actual history fails and supports retry", async () => {
    const api = createFixtureTaskApi("typical");
    const original = api.getTaskActualHistory.bind(api);
    const history = vi.spyOn(api, "getTaskActualHistory");
    history.mockRejectedValueOnce({ code: "persistence-failure", message: "履歴サービス停止" }).mockImplementationOnce(original);
    render(<App api={api} />);
    await ready();
    await expandPocket("task-completed");
    await userEvent.click(timelineCell("task-completed"));
    const detail = () => document.querySelector("[data-selected-readout='task-completed']") as HTMLElement;
    await waitFor(() => expect(detail().querySelector("[data-actual-history-state='error']")).toBeInTheDocument());
    expect(detail()).toBeInTheDocument();
    await userEvent.click(within(detail()).getByRole("button", { name: "ログのタイムアウト境界を確認の実績履歴を再試行" }));
    await waitFor(() => expect(detail().querySelector("[data-actual-history-state='ready']")).toHaveTextContent("17分"));
    expect(history).toHaveBeenCalledTimes(2);
  });

  it("keeps depth 0 through 8 distinct without visible numbers and exposes the selected deep ancestry", async () => {
    renderPreview("deep");
    await ready();
    const branches = Array.from(document.querySelectorAll<HTMLElement>(".tree-branch[data-depth]"));
    expect(new Set(branches.map((branch) => branch.dataset.depth))).toEqual(new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8"]));
    expect(new Set(branches.map((branch) => branch.getAttribute("aria-level")))).toEqual(new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9"]));
    expect(branches.every((branch) => branch.querySelector(".depth-cue") === null)).toBe(true);
    expect(new Set(branches.map((branch) => branch.style.getPropertyValue("--depth-offset"))).size).toBe(9);
    const ownRail = (branch: HTMLElement): HTMLElement | null => {
      const row = branch.querySelector<HTMLElement>(`[data-row-id="${branch.dataset.taskId}"]`);
      return row?.querySelector<HTMLElement>(".branch-rail") ?? null;
    };
    expect(ownRail(branches[0])).toBeNull();
    expect(branches.slice(1).every((branch) => ownRail(branch) !== null)).toBe(true);
    expect(loadedStyles()).toMatch(/\.branch-rail::after\s*\{[^}]*width:\s*clamp\(/);
    const deepRow = document.querySelector("[data-row-id='deep-task-8']") as HTMLElement;
    expect(deepRow).toBeInTheDocument();
    expect(deepRow.closest(".tree-branch")).toHaveClass("depth-8");
    expect(deepRow.closest(".tree-branch")).toHaveAttribute("data-depth", "8");
    expect(deepRow.querySelector(".depth-cue")).toBeNull();

    await userEvent.click(timelineCell("deep-task-8"));
    const path = document.querySelector("[data-ancestry-path='deep-task-8']") as HTMLElement;
    expect(path).toBeInTheDocument();
    expect(path.textContent).toContain("深い階層の調査パッケージ");
    expect(path.textContent).toContain("深度 1");
    expect(path.textContent).toContain("深度 7");
  });

  it("uses the fluid surface and one shared widened column split", async () => {
    renderPreview("empty");
    await ready();
    const styles = loadedStyles();
    expect(styles).not.toContain("1120px");
    expect(styles).toMatch(/\.history-composite\s*\{[^}]*--history-left:\s*calc\(58% - 18px\)[^}]*--history-right:\s*calc\(42% - 18px\)/);
    expect(styles).toMatch(/\.undo-receipt\s*\{[^}]*--history-left:\s*calc\(58% - 18px\)[^}]*--history-right:\s*calc\(42% - 18px\)/);
  });

  it("opens one memo dock from remaining and completed current-side origins with exact prefill", async () => {
    const api = createFixtureTaskApi("typical");
    const originalForest = await api.getTaskForest(5000);
    const exactMemo = "  先頭の空白\n二行目🙂\t ";
    vi.spyOn(api, "getTaskForest").mockResolvedValue({
      ...originalForest,
      entries: originalForest.entries.map((entry) => entry.task.id === "task-next-1" ? { ...entry, task: { ...entry.task, memo: exactMemo } } : entry),
    });
    render(<App api={api} />);
    await ready();

    await userEvent.click(timelineCell("task-next-1"));
    const remainingAction = screen.getByRole("button", { name: "再現条件をテストケースにするのメモを編集" });
    expect(rowFor("再現条件をテストケースにする").querySelector("[data-memo-presence='present']")).toBeInTheDocument();
    await userEvent.click(remainingAction);
    expect(document.querySelectorAll("[data-memo-modal]")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "再現条件をテストケースにするのメモ" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "メモ本文" })).toHaveValue(exactMemo);
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    await expandPocket("task-completed");
    await userEvent.click(timelineCell("task-completed"));
    const completedAction = screen.getByRole("button", { name: "ログのタイムアウト境界を確認のメモを編集" });
    expect(completedAction.closest(".history-detail-row")).toBeInTheDocument();
    await userEvent.click(completedAction);
    expect(screen.getByRole("dialog", { name: "ログのタイムアウト境界を確認のメモ" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "メモ本文" })).toHaveValue("");
  });

  it("counts Unicode scalars, blocks 4,001 locally, and keeps unchanged save a no-op", async () => {
    const api = renderPreview("typical");
    const update = vi.spyOn(api, "updateTaskMemo");
    await ready();
    await userEvent.click(timelineCell("task-next-1"));
    const origin = screen.getByRole("button", { name: "再現条件をテストケースにするのメモを編集" });
    await userEvent.click(origin);
    const textarea = screen.getByRole("textbox", { name: "メモ本文" });
    const count = document.querySelector("[data-memo-scalar-count]") as HTMLElement;

    fireEvent.change(textarea, { target: { value: "🙂".repeat(4000) } });
    expect(count).toHaveAttribute("data-memo-scalar-count", "4000");
    expect(screen.getByRole("button", { name: "保存" })).not.toBeDisabled();
    fireEvent.change(textarea, { target: { value: "🙂".repeat(4001) } });
    expect(count).toHaveAttribute("data-memo-scalar-count", "4001");
    expect(screen.getByText(/4,000 Unicodeスカラー以内/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await userEvent.click(origin);
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(update).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(origin));
  });

  it("saves a changed memo, exposes the body-free undo receipt, clears, and undoes", async () => {
    const api = renderPreview("typical");
    const update = vi.spyOn(api, "updateTaskMemo");
    await ready();
    await userEvent.click(timelineCell("task-next-1"));
    const origin = screen.getByRole("button", { name: "再現条件をテストケースにするのメモを編集" });
    await userEvent.click(origin);
    const textarea = screen.getByRole("textbox", { name: "メモ本文" });
    fireEvent.change(textarea, { target: { value: "保存するメモ\n二行目" } });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("task-next-1", "保存するメモ\n二行目", 1, expect.any(String)));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(/メモを更新しました/)).toBeInTheDocument();
    expect(screen.getByText(/「再現条件をテストケースにする」のメモを更新/)).toBeInTheDocument();
    expect(screen.queryByText("保存するメモ\n二行目", { exact: true })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    await waitFor(async () => expect((await api.getTask("task-next-1")).memo).toBe(""));

    await userEvent.click(origin);
    fireEvent.change(screen.getByRole("textbox", { name: "メモ本文" }), { target: { value: "消して保存" } });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("prevents duplicate pending saves and supports persistence retry with the same draft", async () => {
    const api = renderPreview("typical");
    const originalUpdate = api.updateTaskMemo.bind(api);
    let resolveUpdate: ((result: Awaited<ReturnType<typeof originalUpdate>>) => void) | undefined;
    const update = vi.spyOn(api, "updateTaskMemo").mockImplementation((...args) => new Promise((resolve, reject) => {
      resolveUpdate = resolve;
      void args;
      void reject;
    }));
    await ready();
    await userEvent.click(timelineCell("task-next-1"));
    const origin = screen.getByRole("button", { name: "再現条件をテストケースにするのメモを編集" });
    await userEvent.click(origin);
    fireEvent.change(screen.getByRole("textbox", { name: "メモ本文" }), { target: { value: "pending memo" } });
    const save = screen.getByRole("button", { name: "保存" });
    await userEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    await userEvent.click(save);
    expect(update).toHaveBeenCalledTimes(1);
    resolveUpdate?.(await originalUpdate("task-next-1", "pending memo", 1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(origin);
    fireEvent.change(screen.getByRole("textbox", { name: "メモ本文" }), { target: { value: "retry memo" } });
    update.mockRejectedValueOnce({ code: "persistence-failure", message: "保存失敗" }).mockImplementation(originalUpdate);
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "メモ本文" })).toHaveValue("retry memo");
    await userEvent.click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("retains a stale draft until explicit reload, then saves with the refreshed base version", async () => {
    const api = renderPreview("typical");
    const originalUpdate = api.updateTaskMemo.bind(api);
    const update = vi.spyOn(api, "updateTaskMemo").mockRejectedValueOnce({ code: "stale-version", message: "stale" }).mockImplementation(originalUpdate);
    await ready();
    await userEvent.click(timelineCell("task-next-1"));
    const origin = screen.getByRole("button", { name: "再現条件をテストケースにするのメモを編集" });
    await userEvent.click(origin);
    const textarea = screen.getByRole("textbox", { name: "メモ本文" });
    fireEvent.change(textarea, { target: { value: "draft kept across reload" } });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "最新の状態を再読込" })).toBeInTheDocument());
    expect(textarea).toHaveValue("draft kept across reload");
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "最新の状態を再読込" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).not.toBeDisabled());
    expect(screen.getByRole("textbox", { name: "メモ本文" })).toHaveValue("draft kept across reload");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("expands and restores the same live editor instance without losing the draft", async () => {
    renderPreview("typical");
    await ready();
    await userEvent.click(timelineCell("task-next-1"));
    await userEvent.click(screen.getByRole("button", { name: "再現条件をテストケースにするのメモを編集" }));

    const editor = screen.getByRole("textbox", { name: "メモ本文" });
    fireEvent.change(editor, { target: { value: "# live draft\n\n**same editor**" } });
    const editorNode = document.querySelector(".cm-editor");
    expect(editorNode).toBeInTheDocument();
    expect(editor).toHaveValue("# live draft\n\n**same editor**");

    await userEvent.click(screen.getByRole("button", { name: "拡大表示" }));
    expect(screen.getByRole("dialog")).toHaveClass("is-expanded");
    expect(document.querySelector(".cm-editor")).toBe(editorNode);
    expect(screen.getByRole("textbox", { name: "メモ本文" })).toHaveValue("# live draft\n\n**same editor**");

    await userEvent.click(screen.getByRole("button", { name: "元のサイズに戻す" }));
    expect(screen.getByRole("dialog")).not.toHaveClass("is-expanded");
    expect(document.querySelector(".cm-editor")).toBe(editorNode);
    expect(screen.getByRole("textbox", { name: "メモ本文" })).toHaveValue("# live draft\n\n**same editor**");
  });

  it("does not dismiss or save while IME composition is active", async () => {
    const api = renderPreview("typical");
    const update = vi.spyOn(api, "updateTaskMemo");
    await ready();
    await userEvent.click(timelineCell("task-next-1"));
    const origin = screen.getByRole("button", { name: "再現条件をテストケースにするのメモを編集" });
    await userEvent.click(origin);
    const dialog = screen.getByRole("dialog");
    const editor = screen.getByRole("textbox", { name: "メモ本文" });
    const save = screen.getByRole("button", { name: "保存" });

    fireEvent.compositionStart(editor);
    expect(save).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    fireEvent.compositionEnd(editor);
    await waitFor(() => expect(save).not.toBeDisabled());
  });

  it("keeps outside clicks inert, traps Tab, and returns focus on Cancel or Escape", async () => {
    renderPreview("typical");
    await ready();
    await userEvent.click(timelineCell("task-next-1"));
    const origin = screen.getByRole("button", { name: "再現条件をテストケースにするのメモを編集" });
    await userEvent.click(origin);
    const dialog = screen.getByRole("dialog");
    const textarea = screen.getByRole("textbox", { name: "メモ本文" });
    const size = screen.getByRole("button", { name: "拡大表示" });
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(size);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(textarea);
    const modal = document.querySelector("[data-memo-modal]") as HTMLElement;
    fireEvent.pointerDown(modal);
    fireEvent.click(modal);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(origin));

    await userEvent.click(origin);
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(document.activeElement).toBe(origin));
  });
});
