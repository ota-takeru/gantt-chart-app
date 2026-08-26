import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";

async function ready() {
  await screen.findByRole("heading", { name: "NOW 残っている仕事" });
}

function timelineCell(taskId: string): HTMLElement {
  return document.querySelector(`[data-timeline-cell="${taskId}"]`) as HTMLElement;
}

function deleteOrigin(taskId: string): HTMLElement {
  return document.querySelector(`[data-focus-id="delete:${taskId}"]`) as HTMLElement;
}

async function selectTask(taskId: string) {
  await userEvent.click(timelineCell(taskId));
  await waitFor(() => expect(deleteOrigin(taskId)).toBeVisible());
}

async function expandPocket(taskId: string) {
  const pocket = document.querySelector(`.history-pocket[data-pocket-id="${taskId}"]`) as HTMLElement;
  await userEvent.click(pocket.querySelector(".pocket-caption") as HTMLElement);
}

async function confirmDelete(taskId: string) {
  await waitFor(() => expect(deleteOrigin(taskId)).toBeInTheDocument());
  const origin = deleteOrigin(taskId);
  await userEvent.click(origin);
  await waitFor(() => expect(document.querySelector(`[data-delete-confirm="${taskId}"]`)).toBeInTheDocument());
  await userEvent.click(document.querySelector(`[data-delete-confirm="${taskId}"] .danger-action`) as HTMLElement);
  return origin;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("delete confirmation scope", () => {
  it("renders the root and every descendant path while keeping actions outside the scrolling list", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();
    await selectTask("task-api");

    await userEvent.click(deleteOrigin("task-api"));
    const confirmation = document.querySelector("[data-delete-confirm='task-api']") as HTMLElement;
    const paths = Array.from(confirmation.querySelectorAll<HTMLElement>("[data-delete-path-id]"));

    expect(confirmation).toHaveAttribute("data-delete-root-id", "task-api");
    expect(confirmation.querySelector("[data-delete-root-path]")).toHaveTextContent("対象root: APIレスポンス遅延の原因を切り分ける");
    expect(confirmation.querySelector("[data-delete-target-count]")).toHaveAttribute("data-delete-target-count", "4");
    expect(paths.map((path) => path.dataset.deletePathId)).toEqual([
      "task-api",
      "task-next-1",
      "task-next-2",
      "task-completed",
    ]);
    expect(paths.map((path) => path.textContent)).toEqual([
      "APIレスポンス遅延の原因を切り分ける",
      "APIレスポンス遅延の原因を切り分ける ＞ 再現条件をテストケースにする",
      "APIレスポンス遅延の原因を切り分ける ＞ SQLite migrationの失敗ケースを確認",
      "APIレスポンス遅延の原因を切り分ける ＞ ログのタイムアウト境界を確認",
    ]);
    expect(confirmation.querySelector("ul")).toHaveAccessibleName("削除対象の完全な階層パス（4件）");
    expect(getComputedStyle(confirmation.querySelector("ul") as HTMLElement).overflowY).toBe("auto");
    expect(confirmation.querySelector(".delete-confirm-actions")?.parentElement).toBe(confirmation);
    expect(confirmation.querySelector(".delete-confirm-actions")?.closest("ul")).toBeNull();
  });

  it("anchors completed confirmation absolutely to its selected detail without a flow sibling", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();
    await expandPocket("task-completed");
    await userEvent.click(timelineCell("task-completed"));
    const detail = document.querySelector("[data-selected-readout='task-completed']") as HTMLElement;
    const origin = detail.querySelector("[data-focus-id='delete:task-completed']") as HTMLElement;

    await userEvent.click(origin);
    const anchor = detail.closest(".completed-detail-anchor") as HTMLElement;
    const confirmation = anchor.querySelector("[data-delete-confirm='task-completed']") as HTMLElement;

    expect(anchor).toBeInTheDocument();
    expect(anchor.previousElementSibling).toHaveAttribute("data-row-id", "pocket:task-completed");
    expect(confirmation.previousElementSibling).toBe(detail.closest(".history-detail-row"));
    expect(getComputedStyle(anchor).position).toBe("relative");
    expect(getComputedStyle(confirmation).position).toBe("absolute");
    expect(getComputedStyle(confirmation).top).toBe("100%");

    await userEvent.click(confirmation.querySelector("[data-focus-id^='delete-cancel:']") as HTMLElement);
    await waitFor(() => expect(document.activeElement).toBe(origin));
  });

  it("closes a failed confirmation, keeps the committed forest, and restores origin focus", async () => {
    const api = createFixtureTaskApi("typical");
    vi.spyOn(api, "deleteTaskSubtree").mockRejectedValueOnce({ code: "persistence-failure", message: "注入失敗" });
    render(<App api={api} />);
    await ready();
    await selectTask("task-api");
    const origin = deleteOrigin("task-api");

    await userEvent.click(origin);
    await userEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(document.querySelector("[data-delete-confirm='task-api']")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(origin));
    expect(document.querySelector("#history-task-task-api")).toBeInTheDocument();
    expect(screen.getByRole("alert", { name: "操作エラー" })).toBeInTheDocument();
  });

  it("returns an intermediate completed member deletion to its stable pocket caption", async () => {
    const api = createFixtureTaskApi("only-completed");
    const deleteCall = vi.spyOn(api, "deleteTaskSubtree");
    render(<App api={api} />);
    await ready();
    await expandPocket("only-completed-root");
    await userEvent.click(document.querySelector("[data-history-mark='only-completed-child']") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-selected-readout='only-completed-child']")).toBeInTheDocument());

    await confirmDelete("only-completed-child");
    await waitFor(() => expect(deleteCall).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector("[data-focus-id='history-pocket-caption:only-completed-root']")));
    expect(document.querySelector("[data-history-member-id='only-completed-root']")).toBeInTheDocument();
    expect(document.querySelector("[data-history-member-id='only-completed-child']")).toBeNull();
  });

  it("returns a prefix-outside member in a 600-item pocket to the stable caption", async () => {
    const api = createFixtureTaskApi("pocket-window");
    const deleteCall = vi.spyOn(api, "deleteTaskSubtree");
    render(<App api={api} />);
    await ready();
    await expandPocket("pocket-window-root");

    const history = screen.getByRole("tree");
    history.focus();
    fireEvent.keyDown(history, { key: "Home" });
    for (let index = 0; index < 40; index += 1) fireEvent.keyDown(history, { key: "ArrowDown" });
    await waitFor(() => expect(document.querySelector("[data-selected-readout='pocket-window-member-40']")).toBeInTheDocument());
    expect(document.querySelector("[data-pocket-inclusion='selected-reveal']")).toHaveAttribute("data-history-member-id", "pocket-window-member-40");

    await confirmDelete("pocket-window-member-40");
    await waitFor(() => expect(deleteCall).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector("[data-focus-id='history-pocket-caption:pocket-window-root']")));
    expect(document.querySelector("[data-history-member-id='pocket-window-member-40']")).toBeNull();
  });

  it("skips a deleted pocket subtree and returns a root deletion to the next pocket caption", async () => {
    const api = createFixtureTaskApi("only-completed");
    const deleteCall = vi.spyOn(api, "deleteTaskSubtree");
    render(<App api={api} />);
    await ready();
    await expandPocket("only-completed-root");
    await userEvent.click(document.querySelector("[data-history-mark='only-completed-root']") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-selected-readout='only-completed-root']")).toBeInTheDocument());

    await confirmDelete("only-completed-root");
    await waitFor(() => expect(deleteCall).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector("[data-focus-id='history-pocket-caption:only-completed-standalone']")));
    expect(document.querySelector("[data-pocket-id='only-completed-root']")).toBeNull();
  });

  it("falls back to the top input when no focusable sibling survives root deletion", async () => {
    const api = createFixtureTaskApi("only-completed");
    const originalGetForest = api.getTaskForest.bind(api);
    vi.spyOn(api, "getTaskForest").mockImplementation(async (limit) => {
      const snapshot = await originalGetForest(limit);
      return { ...snapshot, entries: snapshot.entries.filter((entry) => entry.task.id === "only-completed-root") };
    });
    render(<App api={api} />);
    await ready();
    await expandPocket("only-completed-root");
    await userEvent.click(document.querySelector("[data-history-mark='only-completed-root']") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-selected-readout='only-completed-root']")).toBeInTheDocument());

    await confirmDelete("only-completed-root");
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector("[data-focus-id='top-task-title']")));
  });
});
