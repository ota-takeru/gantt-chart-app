import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";

async function ready(): Promise<void> {
  await screen.findByRole("heading", { name: "NOW 残っている仕事" });
}

function dragHandle(taskId: string): HTMLButtonElement {
  return document.querySelector(`[data-focus-id="drag-handle:${taskId}"]`) as HTMLButtonElement;
}

async function openPlacement(taskId: string): Promise<HTMLElement> {
  const handle = dragHandle(taskId);
  handle.focus();
  fireEvent.keyDown(handle, { key: "Enter" });
  return screen.findByRole("group", { name: "キーボードで移動先を選択" });
}

async function selectCandidate(surface: HTMLElement, label: string): Promise<HTMLElement> {
  const options = within(surface).getAllByRole("option");
  const targetIndex = options.findIndex((option) => option.textContent?.includes(label));
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  const next = within(surface).getByRole("button", { name: "次の候補" });
  for (let index = 0; index < targetIndex; index += 1) await userEvent.click(next);
  await waitFor(() => expect(options[targetIndex]).toHaveAttribute("aria-selected", "true"));
  return options[targetIndex];
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("keyboard task placement UI integration", () => {
  it("reorders a sibling without pointer input and returns focus", async () => {
    const api = createFixtureTaskApi("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    render(<App api={api} />);
    await ready();
    const origin = dragHandle("task-next-6");
    const surface = await openPlacement("task-next-6");
    await selectCandidate(surface, "顧客向け回答の根拠を再確認 の前");
    await userEvent.click(within(surface).getByRole("button", { name: "決定" }));
    await waitFor(() => expect(move).toHaveBeenCalledWith(
      "task-next-6",
      undefined,
      "task-answer",
      expect.any(Number),
      expect.any(String),
    ));
    await waitFor(() => expect(screen.queryByRole("group", { name: "キーボードで移動先を選択" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(dragHandle("task-next-6")));
  });

  it("uses the same retained completed-boundary tuple as pointer placement", async () => {
    const api = createFixtureTaskApi("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    render(<App api={api} />);
    await ready();
    const handle = dragHandle("task-next-6");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 10, buttons: 1 });
    const pointerBoundary = document.querySelector("[data-drop-boundary='remaining-completed'][data-drop-parent-id='task-api']") as HTMLElement;
    expect(pointerBoundary).toHaveAttribute("data-drop-before-id", "task-completed");
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    const surface = await openPlacement("task-next-6");
    const option = await selectCandidate(surface, "APIレスポンス遅延の原因を切り分ける の子の末尾（完了履歴の前）");
    expect(option).toHaveAttribute("data-placement-parent-id", pointerBoundary.dataset.dropParentId);
    expect(option).toHaveAttribute("data-placement-before-id", pointerBoundary.dataset.dropBeforeId);
    await userEvent.click(within(surface).getByRole("button", { name: "決定" }));
    await waitFor(() => expect(move).toHaveBeenCalledWith(
      "task-next-6",
      "task-api",
      "task-completed",
      expect.any(Number),
      expect.any(String),
    ));
  });

  it("keeps an invalid cyclic destination identifiable and mutation-free", async () => {
    const api = createFixtureTaskApi("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    render(<App api={api} />);
    await ready();
    const surface = await openPlacement("task-api");
    const option = await selectCandidate(surface, "再現条件をテストケースにする の子の末尾");
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent("⛔");
    await userEvent.click(within(surface).getByRole("button", { name: "決定" }));
    expect(move).not.toHaveBeenCalled();
    expect(surface).toHaveAttribute("data-keyboard-placement", "choosing");
    expect(surface.querySelector(".placement-invalid-reason")).toHaveTextContent("⛔");
  });

  it("cancels with Escape without mutation and restores focus without scrolling", async () => {
    const api = createFixtureTaskApi("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    render(<App api={api} />);
    await ready();
    const origin = dragHandle("task-next-6");
    const surface = await openPlacement("task-next-6");
    const listbox = within(surface).getByRole("listbox", { name: "移動先候補" });
    fireEvent.keyDown(listbox, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("group", { name: "キーボードで移動先を選択" })).toBeNull());
    expect(move).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(dragHandle("task-next-6")));
  });

  it("preserves the committed forest and restores origin focus after submission failure", async () => {
    const api = createFixtureTaskApi("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy").mockRejectedValueOnce({ code: "persistence-failure", message: "injected" });
    render(<App api={api} />);
    await ready();
    const origin = dragHandle("task-next-6");
    const surface = await openPlacement("task-next-6");
    await selectCandidate(surface, "顧客向け回答の根拠を再確認 の前");
    await userEvent.click(within(surface).getByRole("button", { name: "決定" }));
    await waitFor(() => expect(surface).toHaveAttribute("data-keyboard-placement", "failed"));
    expect(screen.getByText("明日の調査メモを残す", { selector: ".task-title" })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(dragHandle("task-next-6")));
    expect(within(surface).getByRole("alert")).toHaveTextContent("injected");
  });
});
