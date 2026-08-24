import { beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { TauriUpdateApi } from "./tauriUpdateApi";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

const checkMock = vi.mocked(check);
const relaunchMock = vi.mocked(relaunch);

beforeEach(() => {
  checkMock.mockReset();
  relaunchMock.mockReset();
  relaunchMock.mockResolvedValue(undefined);
});

describe("TauriUpdateApi contract", () => {
  it("maps updater metadata and download events, then installs", async () => {
    const download = vi.fn(async (onEvent?: (event: unknown) => void) => {
      onEvent?.({ event: "Started", data: { contentLength: 30 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 10 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 20 } });
      onEvent?.({ event: "Finished" });
    });
    const install = vi.fn().mockResolvedValue(undefined);
    checkMock.mockResolvedValue({ version: "0.3.0", body: "Notes", date: "2026-08-25T00:00:00Z", download, install } as never);
    const api = new TauriUpdateApi();
    const progress: unknown[] = [];

    await expect(api.relaunchApplication()).rejects.toMatchObject({ code: "relaunch-failed" });
    const available = await api.checkForUpdate();
    expect(available).toMatchObject({ version: "0.3.0", notes: "Notes", publishedAt: "2026-08-25T00:00:00Z" });
    await expect(api.applyUpdate(available!, (event) => progress.push(event))).resolves.toEqual({ version: "0.3.0" });
    expect(download).toHaveBeenCalledOnce();
    expect(install).toHaveBeenCalledOnce();
    expect(progress).toEqual([
      { phase: "download", receivedBytes: 0, totalBytes: 30 },
      { phase: "download", receivedBytes: 10, totalBytes: 30 },
      { phase: "download", receivedBytes: 30, totalBytes: 30 },
      { phase: "download", receivedBytes: 30, totalBytes: 30 },
      { phase: "install", receivedBytes: 30, totalBytes: 30 },
    ]);
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("coalesces checks and normalizes download, install, and relaunch failures", async () => {
    const api = new TauriUpdateApi();
    const update = {
      version: "0.3.0",
      download: vi.fn().mockRejectedValue(new Error("network")),
      install: vi.fn(),
    };
    checkMock.mockResolvedValue(update as never);
    const [first, second] = await Promise.all([api.checkForUpdate(), api.checkForUpdate()]);
    expect(first).toEqual(second);
    expect(checkMock).toHaveBeenCalledOnce();
    await expect(api.applyUpdate(first!)).rejects.toMatchObject({ code: "download-failed" });

    const installFailure = {
      version: "0.3.0",
      download: vi.fn().mockResolvedValue(undefined),
      install: vi.fn().mockRejectedValue(new Error("signature")),
    };
    checkMock.mockResolvedValue(installFailure as never);
    const next = await api.checkForUpdate();
    await expect(api.applyUpdate(next!)).rejects.toMatchObject({ code: "install-failed" });

    relaunchMock.mockRejectedValue(new Error("restart"));
    await expect(api.relaunchApplication()).rejects.toMatchObject({ code: "relaunch-failed" });
  });
});
