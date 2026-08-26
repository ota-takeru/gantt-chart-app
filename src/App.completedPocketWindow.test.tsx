import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";

async function ready(): Promise<void> {
  await screen.findByRole("heading", { name: "NOW 残っている仕事" });
}

async function expandedPocket() {
  const pocket = document.querySelector(".history-pocket[data-pocket-id='pocket-window-root']") as HTMLElement;
  await userEvent.click(pocket.querySelector(".pocket-caption") as HTMLElement);
  await waitFor(() => expect(pocket).toHaveClass("is-expanded"));
  return pocket;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("completed pocket window UI integration", () => {
  it("mounts only the initial 40 members with retained ordinal/set metadata", async () => {
    render(<App api={createFixtureTaskApi("pocket-window")} />);
    await ready();
    const pocket = await expandedPocket();
    const members = pocket.querySelectorAll(".pocket-member-row");

    expect(members).toHaveLength(40);
    expect(pocket.querySelectorAll("[data-pocket-inclusion='prefix']")).toHaveLength(40);
    expect(members[0]).toHaveAttribute("aria-posinset", "1");
    expect(members[0]).toHaveAttribute("aria-setsize", "600");
    expect(members[39]).toHaveAttribute("aria-posinset", "40");
    expect(pocket.querySelectorAll('[role="option"]')).toHaveLength(40);
    expect(pocket.querySelectorAll('[role="option"] button')).toHaveLength(0);
    expect(pocket.querySelectorAll(".pocket-more")).toHaveLength(1);
    expect(pocket.querySelector(".pocket-window-status")).toHaveTextContent("表示 40 / 総 600件");
  });

  it("loads one bounded batch, preserves the window across range changes, and eventually reaches the end", async () => {
    render(<App api={createFixtureTaskApi("pocket-window")} />);
    await ready();
    const pocket = await expandedPocket();
    await userEvent.click(within(pocket).getByRole("button", { name: "完了履歴をさらに40件表示" }));
    expect(pocket.querySelectorAll(".pocket-member-row")).toHaveLength(80);
    expect(pocket.querySelector(".pocket-window-status")).toHaveTextContent("表示 80 / 総 600件");

    fireEvent.change(screen.getByRole("combobox", { name: "時間範囲" }), { target: { value: "7d" } });
    expect(pocket.querySelectorAll(".pocket-member-row")).toHaveLength(80);

    for (let batch = 0; batch < 13; batch += 1) {
      const more = pocket.querySelector(".pocket-more") as HTMLButtonElement | null;
      if (!more) break;
      await userEvent.click(more);
    }
    expect(pocket.querySelectorAll(".pocket-member-row")).toHaveLength(600);
    expect(pocket.querySelector(".pocket-more")).toBeNull();
  });

  it("reveals one selected off-prefix member without mounting the omitted interval", async () => {
    render(<App api={createFixtureTaskApi("pocket-window")} />);
    await ready();
    const pocket = await expandedPocket();
    const history = screen.getByRole("tree");
    history.focus();
    fireEvent.keyDown(history, { key: "Home" });
    for (let index = 0; index < 50; index += 1) fireEvent.keyDown(history, { key: "ArrowDown" });

    await waitFor(() => expect(pocket.querySelector("[data-history-member-id='pocket-window-member-50']")).toBeInTheDocument());
    expect(pocket.querySelectorAll(".pocket-member-row")).toHaveLength(41);
    expect(pocket.querySelectorAll("[data-pocket-inclusion='prefix']")).toHaveLength(40);
    const selected = pocket.querySelector("[data-history-member-id='pocket-window-member-50']") as HTMLElement;
    expect(selected).toHaveAttribute("data-pocket-inclusion", "selected-reveal");
    expect(selected).toHaveAttribute("aria-posinset", "51");
    expect(selected).toHaveAttribute("aria-setsize", "600");
    expect(history).toHaveAttribute("aria-activedescendant", "history-member-row-pocket-window-member-50");
    expect(pocket.querySelector('[role="listbox"]')).toHaveAttribute("aria-activedescendant", "history-member-row-pocket-window-member-50");
    expect(selected.querySelectorAll("button")).toHaveLength(0);
    expect(document.getElementById("history-member-row-pocket-window-member-50")).toBeInTheDocument();
  });

  it("keeps a completed detail selection when its controls receive focus", async () => {
    render(<App api={createFixtureTaskApi("pocket-window")} />);
    await ready();
    const pocket = await expandedPocket();
    await userEvent.click(pocket.querySelector("[data-history-member-id='pocket-window-member-2'] .pocket-mark") as HTMLElement);
    const detail = document.querySelector("[data-selected-readout='pocket-window-member-2']") as HTMLElement;
    expect(detail).toBeInTheDocument();
    const memo = within(detail).getByRole("button", { name: "完了履歴メンバー 002のメモを編集" });
    memo.focus();
    await waitFor(() => expect(document.querySelector("[data-selected-readout='pocket-window-member-2']")).toBeInTheDocument());
    expect(document.querySelector("[data-selected-readout='pocket-window-root']")).toBeNull();
  });

  it("reconciles a removed selected off-prefix member without retaining an invalid active descendant", async () => {
    const api = createFixtureTaskApi("pocket-window");
    const initial = await api.getTaskForest(5000);
    const refreshed = { ...initial, entries: initial.entries.filter((entry) => entry.task.id !== "pocket-window-member-50") };
    vi.spyOn(api, "getTaskForest").mockResolvedValueOnce(initial).mockResolvedValue(refreshed);
    render(<App api={api} />);
    await ready();
    const pocket = await expandedPocket();
    const history = screen.getByRole("tree");
    history.focus();
    fireEvent.keyDown(history, { key: "Home" });
    for (let index = 0; index < 50; index += 1) fireEvent.keyDown(history, { key: "ArrowDown" });
    await waitFor(() => expect(document.querySelector("[data-history-member-id='pocket-window-member-50']")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "再読込" }));
    await waitFor(() => expect(document.querySelector("[data-history-member-id='pocket-window-member-50']")).toBeNull());
    expect(history.getAttribute("aria-activedescendant")).not.toBe("history-member-row-pocket-window-member-50");
  });
});
