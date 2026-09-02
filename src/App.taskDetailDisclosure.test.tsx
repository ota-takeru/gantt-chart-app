import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";

function rowFor(title: string): HTMLElement {
  return screen.getByText(title, { selector: ".task-title" }).closest(".task-row") as HTMLElement;
}

function timelineCell(taskId: string): HTMLElement {
  return document.querySelector(`[data-timeline-cell="${taskId}"]`) as HTMLElement;
}

async function ready(): Promise<void> {
  await screen.findByRole("heading", { name: "NOW 残っている仕事" });
}

async function renderTypicalWithMemos(memos: Record<string, string>): Promise<void> {
  const api = createFixtureTaskApi("typical");
  const initial = await api.getTaskForest(5000);
  vi.spyOn(api, "getTaskForest").mockResolvedValue({
    ...initial,
    entries: initial.entries.map((entry) => ({
      ...entry,
      task: { ...entry.task, memo: memos[entry.task.id] ?? entry.task.memo },
    })),
  });
  render(<App api={api} />);
  await ready();
}

function loadedStyles(): string {
  return Array.from(document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); } catch { return ""; }
  }).join("\n");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("task-detail-disclosure UI integration", () => {
  it("keeps resting rows calm while retaining lifecycle and essential hierarchy cues", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();

    const row = rowFor("再現条件をテストケースにする");
    expect(row).toHaveAttribute("data-disclosure-state", "resting");
    const taskMeta = row.querySelector(".task-meta") as HTMLElement;
    expect(taskMeta).toHaveTextContent("残り");
    expect(taskMeta).toHaveClass("sr-only");
    expect(getComputedStyle(taskMeta).position).toBe("absolute");
    expect(getComputedStyle(taskMeta).width).toBe("1px");
    expect(getComputedStyle(taskMeta).height).toBe("1px");
    const treeItem = row.closest("[role='treeitem']") as HTMLElement;
    expect(treeItem.getAttribute("aria-describedby")).toContain(taskMeta.id);
    expect(row.querySelector(".child-count")).toBeNull();
    expect(row.querySelector(".memo-presence")).toBeNull();
    expect(row.querySelector(".hierarchy-path")).toBeNull();
    expect(row.querySelector(".selected-lifetime-readout")).toBeNull();

    const actions = row.querySelector(".row-actions") as HTMLElement;
    const action = actions.querySelector("button") as HTMLElement;
    expect(actions).not.toHaveAttribute("aria-hidden", "true");
    expect(getComputedStyle(actions).visibility).toBe("hidden");
    expect(getComputedStyle(actions).opacity).toBe("0");
    expect(getComputedStyle(actions).pointerEvents).toBe("none");
    expect(getComputedStyle(action).pointerEvents).toBe("none");
  });

  it("discloses exactly one selected row with the open lifetime readout", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();

    await userEvent.click(timelineCell("task-api"));
    const selected = document.querySelector("[data-row-id='task-api']") as HTMLElement;
    expect(selected).toHaveAttribute("data-disclosure-state", "selected");
    expect(selected.querySelector("[data-lifetime-readout='task-api']")).toHaveTextContent(/作成 .* → NOW /);
    expect(selected.querySelector(".hierarchy-path")).toBeNull();
    expect(document.querySelectorAll("[data-disclosure-state='selected']")).toHaveLength(1);
    expect(selected.querySelector(".row-actions")).not.toHaveAttribute("aria-hidden", "true");
    expect(getComputedStyle(selected.querySelector(".row-actions") as HTMLElement).pointerEvents).toBe("auto");

    await userEvent.click(timelineCell("task-next-1"));
    expect(document.querySelectorAll("[data-disclosure-state='selected']")).toHaveLength(1);
    expect(document.querySelector("[data-row-id='task-api']")).toHaveAttribute("data-disclosure-state", "resting");
    expect(document.querySelector("[data-row-id='task-next-1']")).toHaveAttribute("data-disclosure-state", "selected");
  });

  it("keeps selection stable while hover projects pointer actions without keyboard disclosure", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();
    await userEvent.click(timelineCell("task-api"));

    const selected = document.querySelector("[data-row-id='task-api']") as HTMLElement;
    const hovered = document.querySelector("[data-row-id='task-answer']") as HTMLElement;
    const hoveredActions = hovered.querySelector(".row-actions") as HTMLElement;
    const hoveredButtons = Array.from(hoveredActions.querySelectorAll<HTMLButtonElement>("button"));
    expect(hoveredButtons).toHaveLength(3);
    expect(hoveredButtons.every((button) => button.tabIndex === -1)).toBe(true);
    expect(hoveredActions).not.toHaveAttribute("aria-hidden", "true");
    expect(getComputedStyle(hoveredActions).visibility).toBe("hidden");
    const styles = loadedStyles();
    expect(styles).toMatch(/\.history-row:not\(\.is-editing\):hover \.row-actions,[^{}]*\{[^}]*visibility:\s*visible[^}]*pointer-events:\s*auto/);
    expect(styles).toMatch(/\.history-row:not\(\.is-editing\):hover \.row-actions \.quiet-action,[^{}]*\{[^}]*pointer-events:\s*auto/);
    fireEvent.mouseEnter(hovered);
    expect(selected).toHaveAttribute("data-disclosure-state", "selected");
    expect(hovered).toHaveAttribute("data-disclosure-state", "resting");
    expect(hovered.querySelector(".selected-lifetime-readout")).toBeNull();
    expect(hoveredButtons.every((button) => button.tabIndex === -1)).toBe(true);
    fireEvent.mouseLeave(hovered);
    expect(selected).toHaveAttribute("data-disclosure-state", "selected");
    expect(hovered).toHaveAttribute("data-disclosure-state", "resting");
    expect(getComputedStyle(hoveredActions).visibility).toBe("hidden");
    expect(getComputedStyle(hoveredActions).pointerEvents).toBe("none");
  });

  it("makes focus entering a row produce the same disclosure as explicit selection", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();
    await userEvent.click(timelineCell("task-api"));
    await waitFor(() => expect(document.querySelector("[data-row-id='task-api']")).toHaveAttribute("data-disclosure-state", "selected"));
    const pointerProjection = document.querySelector("[data-row-id='task-api']") as HTMLElement;
    const pointerReadout = pointerProjection.querySelector("[data-lifetime-readout]")?.textContent;
    const pointerHadChildCount = Boolean(pointerProjection.querySelector(".child-count"));

    const focusTarget = withinRowButton("task-answer", /顧客向け回答の根拠を再確認を完了にする/);
    fireEvent.focus(focusTarget);
    await waitFor(() => expect(document.querySelector("[data-row-id='task-answer']")).toHaveAttribute("data-disclosure-state", "selected"));
    const focusProjection = document.querySelector("[data-row-id='task-answer']") as HTMLElement;
    expect(focusProjection.querySelector("[data-lifetime-readout]")).toHaveTextContent(/作成 .* → NOW /);
    expect(focusProjection.querySelector(".row-actions")).toBeTruthy();

    // Both paths expose the same structural fields; only the task identity and
    // exact timestamp values differ.
    expect(pointerReadout).toMatch(/作成 .* → NOW /);
    expect(Boolean(focusProjection.querySelector(".selected-lifetime-readout"))).toBe(true);
    expect(Boolean(focusProjection.querySelector(".child-count"))).toBe(pointerHadChildCount);
  });

  it("lets keyboard focus disclose a row before its secondary actions enter tab order", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();
    const row = rowFor("再現条件をテストケースにする");
    const action = row.querySelector(".row-actions button") as HTMLButtonElement;
    expect(getComputedStyle(action).pointerEvents).toBe("none");
    expect(action).toHaveAttribute("tabindex", "-1");
    fireEvent.focus(row.querySelector(".completion-box") as HTMLButtonElement);
    await waitFor(() => expect(row).toHaveAttribute("data-disclosure-state", "selected"));
    expect(getComputedStyle(action).pointerEvents).toBe("auto");
    expect(action).toHaveAttribute("tabindex", "0");
  });

  it("reconciles a selected task that disappears from the refreshed forest", async () => {
    const api = createFixtureTaskApi("typical");
    const initial = await api.getTaskForest(5000);
    const refreshed = {
      ...initial,
      entries: initial.entries.filter((entry) => entry.task.id !== "task-api"),
    };
    vi.spyOn(api, "getTaskForest").mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed);
    render(<App api={api} />);
    await ready();
    await userEvent.click(timelineCell("task-api"));
    expect(document.querySelector("[data-row-id='task-api']")).toHaveAttribute("data-disclosure-state", "selected");

    await userEvent.click(screen.getByRole("button", { name: "再読込" }));
    await waitFor(() => expect(document.querySelector("[data-disclosure-state='selected']")).toBeNull());
    expect(document.querySelector("[data-row-id='task-api']")).toBeNull();
  });

  it("keeps primary row geometry and the NOW hinge fixed across disclosure", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();
    const row = document.querySelector("[data-row-id='task-next-1']") as HTMLElement;
    const mark = row.querySelector(".history-mark-cell") as HTMLElement;
    const hinge = row.querySelector(".now-hinge-cell") as HTMLElement;
    const completion = row.querySelector(".completion-box") as HTMLElement;
    const snapshot = (element: HTMLElement) => ({
      height: getComputedStyle(element).height,
      minHeight: getComputedStyle(element).minHeight,
      width: getComputedStyle(element).width,
      minWidth: getComputedStyle(element).minWidth,
      position: getComputedStyle(element).position,
    });
    const before = [snapshot(row), snapshot(mark), snapshot(hinge), snapshot(completion)];

    await userEvent.click(timelineCell("task-next-1"));
    expect([snapshot(row), snapshot(mark), snapshot(hinge), snapshot(completion)]).toEqual(before);
    expect(getComputedStyle(row.querySelector(".row-actions") as HTMLElement).position).toBe("absolute");
    expect(getComputedStyle(row.querySelector(".current-identity") as HTMLElement).paddingRight).toBe("var(--selected-action-width)");
  });

  it("keeps the dense 120-row fixture to one disclosed row", async () => {
    render(<App api={createFixtureTaskApi("dense")} />);
    await ready();
    const rows = document.querySelectorAll(".task-row");
    expect(rows).toHaveLength(120);
    expect(document.querySelectorAll("[data-disclosure-state='selected']")).toHaveLength(0);

    await userEvent.click(timelineCell("dense-task-32"));
    expect(document.querySelectorAll("[data-disclosure-state='selected']")).toHaveLength(1);
    expect(document.querySelector("[data-row-id='dense-task-32']")).toHaveAttribute("data-disclosure-state", "selected");
    expect(document.querySelectorAll(".row-actions")).toHaveLength(120);
  });

  it("shows resting memo presence beside the title without exposing the memo body", async () => {
    const memoBody = "一覧には出さない本文";
    await renderTypicalWithMemos({ "task-next-1": memoBody });

    const presentRow = rowFor("再現条件をテストケースにする");
    const emptyRow = rowFor("SQLite migrationの失敗ケースを確認");
    const marker = presentRow.querySelector("[data-memo-presence='present']") as HTMLElement;

    expect(presentRow).toHaveAttribute("data-disclosure-state", "resting");
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveAttribute("role", "img");
    expect(marker).toHaveAttribute("aria-label", "メモあり");
    expect(marker).toHaveAttribute("title", "メモあり");
    expect(presentRow).not.toHaveTextContent(memoBody);
    expect(document.body).not.toHaveTextContent(memoBody);
    expect(emptyRow.querySelector("[data-memo-presence]")).toBeNull();
    expect(getComputedStyle(presentRow).height).toBe("46px");

    await userEvent.click(timelineCell("task-next-1"));
    expect(presentRow).toHaveAttribute("data-disclosure-state", "selected");
    expect(presentRow.querySelector("[data-memo-presence='present']")).toBeInTheDocument();
    expect(getComputedStyle(presentRow).height).toBe("46px");
  });

  it("shows memo presence for expanded completed members and selected detail without collapsed aggregation", async () => {
    const memoBody = "完了タスクの本文は一覧に出さない";
    await renderTypicalWithMemos({ "task-completed": memoBody });

    const completedPocket = document.querySelector("[data-pocket-id='task-completed']") as HTMLElement;
    expect(completedPocket.querySelector("[data-memo-presence]")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /ログのタイムアウト境界を確認の完了履歴/ }));
    const member = document.querySelector("[data-history-member-id='task-completed']") as HTMLElement;
    expect(member).toBeInTheDocument();
    expect(member).toHaveAttribute("aria-label", expect.stringContaining("メモあり"));
    expect(member.querySelector("[data-memo-presence='present']")).toBeInTheDocument();
    expect(member).not.toHaveTextContent(memoBody);

    await userEvent.click(member);
    const detail = document.querySelector("[data-selected-readout='task-completed']") as HTMLElement;
    await waitFor(() => expect(detail).toBeInTheDocument());
    expect(detail.querySelector("[data-memo-presence='present']")).toBeInTheDocument();
    expect(detail).not.toHaveTextContent(memoBody);
    expect(document.body).not.toHaveTextContent(memoBody);

    await userEvent.click(screen.getByRole("button", { name: /調査メモの表記を確認（記録なし完了）の完了履歴/ }));
    const emptyMember = document.querySelector("[data-history-member-id='task-no-session']") as HTMLElement;
    expect(emptyMember).toBeInTheDocument();
    expect(emptyMember.querySelector("[data-memo-presence]")).toBeNull();
  });

  it("updates resting memo presence after save and clears it again after undo", async () => {
    const api = createFixtureTaskApi("typical");
    const title = "再現条件をテストケースにする";
    const body = "保存後も本文は一覧に出さない";
    render(<App api={api} />);
    await ready();

    const row = () => rowFor(title);
    expect(row().querySelector("[data-memo-presence]")).toBeNull();
    await userEvent.click(timelineCell("task-next-1"));
    await userEvent.click(screen.getByRole("button", { name: `${title}のメモを編集` }));
    fireEvent.change(screen.getByRole("textbox", { name: "メモ本文" }), { target: { value: body } });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(row().querySelector("[data-memo-presence='present']")).toBeInTheDocument());
    expect(row()).not.toHaveTextContent(body);
    expect(document.body).not.toHaveTextContent(body);

    await userEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    await waitFor(() => expect(row().querySelector("[data-memo-presence]")).toBeNull());
  });
});

function withinRowButton(taskId: string, name: RegExp): HTMLButtonElement {
  const row = document.querySelector(`[data-row-id="${taskId}"]`) as HTMLElement;
  return Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find((button) => name.test(button.getAttribute("aria-label") ?? "")) as HTMLButtonElement;
}
