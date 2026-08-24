import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";
import { createFixtureUpdateApi, type FixtureUpdatePlan } from "./api/fixtureUpdateApi";
import type { AppliedUpdate, UpdateApi, UpdateCandidate, UpdateProgressObserver } from "./api/updateApi";

const candidate: UpdateCandidate = {
  id: "candidate-0.3.0",
  version: "0.3.0",
  notes: "一つ目の改善です。\n\n二つ目の改善です。",
  publishedAt: "2026-08-25T00:00:00.000Z",
};

function renderFixture(plan: FixtureUpdatePlan) {
  const updateApi = createFixtureUpdateApi({ currentVersion: "0.2.0", candidate, ...plan });
  render(<App api={createFixtureTaskApi("typical")} updateApi={updateApi} currentVersion="0.2.0" />);
  return updateApi;
}

async function availableReceipt() {
  return await screen.findByLabelText("アプリの更新", { selector: "aside" });
}

describe("application update edge receipt", () => {
  it("keeps an up-to-date startup check quiet", async () => {
    const updateApi = createFixtureUpdateApi({ currentVersion: "0.3.0", candidate: null });
    render(<App api={createFixtureTaskApi("typical")} updateApi={updateApi} currentVersion="0.3.0" />);
    await waitFor(() => expect(updateApi.calls.check).toBe(1));
    expect(document.querySelector("[data-update-state]")).toBeNull();
    expect(updateApi.calls.download).toBe(0);
    expect(updateApi.calls.relaunch).toBe(0);
  });

  it("announces availability without stealing focus and returns focus after notes", async () => {
    let resolveCheck!: (value: UpdateCandidate) => void;
    const updateApi: UpdateApi = {
      checkForUpdate: vi.fn(() => new Promise<UpdateCandidate>((resolve) => { resolveCheck = resolve; })),
      applyUpdate: vi.fn(),
      relaunchApplication: vi.fn(),
    };
    render(<App api={createFixtureTaskApi("typical")} updateApi={updateApi} currentVersion="0.2.0" />);
    const taskInput = screen.getByLabelText("新しいタスク");
    taskInput.focus();
    await act(async () => resolveCheck(candidate));
    await availableReceipt();
    expect(document.activeElement).toBe(taskInput);
    expect(screen.getByLabelText("現在のバージョン 0.2.0 から 0.3.0 へ")).toBeInTheDocument();

    const notesOrigin = screen.getByRole("button", { name: "リリースノート" });
    await userEvent.click(notesOrigin);
    const notes = screen.getByRole("dialog", { name: "リリースノート" });
    expect(screen.getByRole("heading", { name: "リリースノート" })).toHaveFocus();
    fireEvent.keyDown(notes, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "リリースノート" })).not.toBeInTheDocument());
    await waitFor(() => expect(notesOrigin).toHaveFocus());
  });

  it("postpones without applying or relaunching", async () => {
    const updateApi = renderFixture({});
    await availableReceipt();
    await userEvent.click(screen.getByRole("button", { name: "後で" }));
    expect(document.querySelector("[data-update-state]")).toBeNull();
    expect(updateApi.calls.download).toBe(0);
    expect(updateApi.calls.install).toBe(0);
    expect(updateApi.calls.relaunch).toBe(0);
  });

  it("shows unknown, known, and install progress, then relaunches only after apply", async () => {
    let observer: UpdateProgressObserver | undefined;
    let resolveApply!: (value: AppliedUpdate) => void;
    const applyPromise = new Promise<AppliedUpdate>((resolve) => { resolveApply = resolve; });
    const updateApi: UpdateApi = {
      checkForUpdate: vi.fn().mockResolvedValue(candidate),
      applyUpdate: vi.fn((_candidate, onProgress) => {
        observer = onProgress;
        return applyPromise;
      }),
      relaunchApplication: vi.fn().mockResolvedValue(undefined),
    };
    render(<App api={createFixtureTaskApi("typical")} updateApi={updateApi} currentVersion="0.2.0" />);
    await availableReceipt();
    await userEvent.click(screen.getByRole("button", { name: "更新して再起動" }));
    expect(screen.getByText("合計サイズを確認中")).toBeInTheDocument();
    expect(updateApi.relaunchApplication).not.toHaveBeenCalled();

    act(() => observer?.({ phase: "download", receivedBytes: 38, totalBytes: 100 }));
    await waitFor(() => expect(screen.getByText("38 B / 100 B")).toBeInTheDocument());
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "38");
    act(() => observer?.({ phase: "install", receivedBytes: 100, totalBytes: 100 }));
    expect(screen.getByText("インストール中")).toBeInTheDocument();
    expect(updateApi.relaunchApplication).not.toHaveBeenCalled();

    await act(async () => resolveApply({ version: candidate.version }));
    await waitFor(() => expect(updateApi.relaunchApplication).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector("[data-update-state]")).toBeNull());
  });

  it("recovers from a check failure by checking again", async () => {
    const updateApi: UpdateApi = {
      checkForUpdate: vi.fn()
        .mockRejectedValueOnce({ code: "check-failed", message: "オフラインです" })
        .mockResolvedValueOnce(candidate),
      applyUpdate: vi.fn(),
      relaunchApplication: vi.fn(),
    };
    render(<App api={createFixtureTaskApi("typical")} updateApi={updateApi} currentVersion="0.2.0" />);
    await waitFor(() => expect(document.querySelector(".update-error-title")).toHaveTextContent("更新を確認できませんでした"));
    await userEvent.click(screen.getByRole("button", { name: "もう一度確認" }));
    await availableReceipt();
    expect(updateApi.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("retries a failed download with the same explicit candidate", async () => {
    const updateApi = renderFixture({ downloadError: { code: "download-failed", message: "接続が切れました" } });
    await availableReceipt();
    await userEvent.click(screen.getByRole("button", { name: "更新して再起動" }));
    await waitFor(() => expect(document.querySelector(".update-error-title")).toHaveTextContent("更新をダウンロードできませんでした"));
    await userEvent.click(screen.getByRole("button", { name: "更新をもう一度試す" }));
    await waitFor(() => expect(updateApi.calls.download).toBe(2));
    expect(updateApi.calls.install).toBe(0);
    expect(updateApi.calls.relaunch).toBe(0);
  });

  it("returns an install failure to a fresh check path", async () => {
    const updateApi = renderFixture({ installError: { code: "install-failed", message: "署名を検証できません" } });
    await availableReceipt();
    await userEvent.click(screen.getByRole("button", { name: "更新して再起動" }));
    await waitFor(() => expect(document.querySelector(".update-error-title")).toHaveTextContent("更新をインストールできませんでした"));
    expect(updateApi.calls.relaunch).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "もう一度確認" }));
    await availableReceipt();
    expect(updateApi.calls.check).toBe(2);
  });

  it("keeps work open and gives manual guidance when relaunch fails", async () => {
    const updateApi = renderFixture({ relaunchError: { code: "relaunch-failed", message: "再起動要求を送れません" } });
    await availableReceipt();
    await userEvent.click(screen.getByRole("button", { name: "更新して再起動" }));
    await waitFor(() => expect(document.querySelector(".update-error-title")).toHaveTextContent("アプリを再起動できませんでした"));
    expect(screen.getByText(/アプリを閉じて手動で起動し直してください/)).toBeInTheDocument();
    expect(updateApi.calls.install).toBe(1);
    expect(updateApi.calls.relaunch).toBe(1);
    expect(screen.getByRole("heading", { name: "NOW 残っている仕事" })).toBeInTheDocument();
  });
});
