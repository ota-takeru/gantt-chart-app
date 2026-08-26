import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";

async function ready(): Promise<void> {
  await screen.findByRole("heading", { name: "NOW 残っている仕事" });
}

function rowFor(taskTitle: string): HTMLElement {
  return screen.getByText(taskTitle, { selector: ".task-title" }).closest(".task-row") as HTMLElement;
}

async function openPlacement(taskTitle: string): Promise<HTMLElement> {
  const row = rowFor(taskTitle);
  const handle = within(row).getByRole("button", { name: /ドラッグして移動.*キーボード配置/ });
  handle.focus();
  fireEvent.keyDown(handle, { key: "Enter" });
  const chooser = await screen.findByRole("group", { name: "キーボードで移動先を選択" });
  await waitFor(() => expect(document.activeElement).toBe(within(chooser).getByRole("listbox", { name: "移動先候補" })));
  return chooser;
}

async function moveToCandidate(chooser: HTMLElement, matcher: RegExp, limit = 100): Promise<void> {
  const next = within(chooser).getByRole("button", { name: "次の候補" });
  for (let index = 0; index < limit; index += 1) {
    if (matcher.test(chooser.querySelector(".placement-current strong")?.textContent ?? "")) return;
    await userEvent.click(next);
  }
  throw new Error(`Candidate not found: ${matcher}`);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("keyboard task placement UI integration", () => {
  it("opens from the existing drag handle and exposes one non-modal chooser", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();
    const chooser = await openPlacement("再現条件をテストケースにする");

    expect(chooser).toHaveAttribute("data-keyboard-placement", "choosing");
    expect(chooser).not.toHaveAttribute("aria-modal");
    expect(chooser.querySelector("[role='listbox']")).toBeInTheDocument();
    expect(chooser.querySelectorAll("[role='option']").length).toBeGreaterThan(1);
    expect(chooser.querySelector(".placement-current-ordinal")).toHaveTextContent(/候補 1 \/ \d+/);
  });

  it("submits the same exact sibling placement tuple as pointer placement", async () => {
    const api = createFixtureTaskApi("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    render(<App api={api} />);
    await ready();
    const chooser = await openPlacement("再現条件をテストケースにする");
    await moveToCandidate(chooser, /SQLite migrationの失敗ケースを確認 の前/);
    fireEvent.keyDown(chooser, { key: "Enter" });

    await waitFor(() => expect(move).toHaveBeenCalledWith("task-next-1", "task-api", "task-next-2", 4, expect.any(String)));
    await waitFor(() => expect(screen.queryByRole("group", { name: "キーボードで移動先を選択" })).not.toBeInTheDocument());
  });

  it("submits a reparent placement and preserves the completed-boundary anchor model", async () => {
    const api = createFixtureTaskApi("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    render(<App api={api} />);
    await ready();
    const chooser = await openPlacement("レビューコメントへ返信");
    await moveToCandidate(chooser, /APIレスポンス遅延の原因を切り分ける の子の末尾（完了履歴の前）/);
    fireEvent.keyDown(chooser, { key: "Enter" });
    await waitFor(() => expect(move).toHaveBeenCalledWith("task-next-3", "task-api", "task-completed", 4, expect.any(String)));

    // The same candidate grammar names the root end immediately before the
    // first completed sibling, rather than inventing a free-floating append.
    const secondApi = createFixtureTaskApi("typical");
    const secondMove = vi.spyOn(secondApi, "moveTaskInHierarchy");
    cleanup();
    render(<App api={secondApi} />);
    await ready();
    const boundaryChooser = await openPlacement("再現条件をテストケースにする");
    await moveToCandidate(boundaryChooser, /最上位の末尾（完了履歴の前）/);
    fireEvent.keyDown(boundaryChooser, { key: "Enter" });
    await waitFor(() => expect(secondMove).toHaveBeenCalledWith("task-next-1", undefined, "task-no-session", 4, expect.any(String)));
  });

  it("keeps invalid destinations in choosing and does not mutate the hierarchy", async () => {
    const api = createFixtureTaskApi("typical");
    const move = vi.spyOn(api, "moveTaskInHierarchy");
    render(<App api={api} />);
    await ready();
    const chooser = await openPlacement("APIレスポンス遅延の原因を切り分ける");
    await moveToCandidate(chooser, /APIレスポンス遅延の原因を切り分ける ＞ 再現条件をテストケースにする の子の末尾/);
    expect(chooser.querySelector(".placement-current")).toHaveTextContent(/⛔/);
    fireEvent.keyDown(chooser, { key: "Enter" });
    expect(move).not.toHaveBeenCalled();
    expect(chooser).toHaveAttribute("data-keyboard-placement", "choosing");
    expect(chooser.querySelector(".placement-invalid-reason")).toHaveTextContent(/自分自身や子孫/);
  });

  it("cancels with Escape and restores the originating drag handle without scroll", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();
    const row = rowFor("再現条件をテストケースにする");
    const handle = within(row).getByRole("button", { name: /ドラッグして移動.*キーボード配置/ });
    const focusSpy = vi.spyOn(handle, "focus");
    const chooser = await openPlacement("再現条件をテストケースにする");
    fireEvent.keyDown(chooser, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("group", { name: "キーボードで移動先を選択" })).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(handle));
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("retains the failed chooser and returns focus to the origin", async () => {
    const api = createFixtureTaskApi("typical");
    vi.spyOn(api, "moveTaskInHierarchy").mockRejectedValue({ code: "stale-hierarchy", message: "階層が更新されています" });
    render(<App api={api} />);
    await ready();
    const row = rowFor("再現条件をテストケースにする");
    const handle = within(row).getByRole("button", { name: /ドラッグして移動.*キーボード配置/ });
    const focusSpy = vi.spyOn(handle, "focus");
    const chooser = await openPlacement("再現条件をテストケースにする");
    await moveToCandidate(chooser, /SQLite migrationの失敗ケースを確認 の前/);
    fireEvent.keyDown(chooser, { key: "Enter" });

    await waitFor(() => expect(chooser).toHaveAttribute("data-keyboard-placement", "failed"));
    expect(chooser.querySelector(".placement-error")).toHaveTextContent("階層が更新されています");
    expect(chooser.querySelector(".placement-current")).toHaveTextContent(/SQLite migrationの失敗ケースを確認/);
    await waitFor(() => expect(document.activeElement).toBe(handle));
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });
});
