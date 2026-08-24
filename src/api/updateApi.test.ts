import { describe, expect, it } from "vitest";
import { createFixtureUpdateApi } from "./fixtureUpdateApi";
import { type UpdateProgress } from "./updateApi";

const candidate = {
  version: "0.3.0",
  notes: "Migration and reliability improvements",
  publishedAt: "2026-08-25T00:00:00Z",
};

describe("FixtureUpdateApi contract", () => {
  it("returns up-to-date without applying, relaunching, or doing external I/O", async () => {
    const api = createFixtureUpdateApi({ currentVersion: "0.3.0", candidate });

    await expect(api.checkForUpdate()).resolves.toBeNull();
    expect(api.calls).toEqual({ check: 1, download: 0, install: 0, relaunch: 0 });
  });

  it("preserves candidate metadata and coalesces concurrent checks", async () => {
    const api = createFixtureUpdateApi({ currentVersion: "0.2.0", candidate });
    const [first, second] = await Promise.all([api.checkForUpdate(), api.checkForUpdate()]);

    expect(first).toEqual({
      id: "fixture-update-1",
      version: candidate.version,
      notes: candidate.notes,
      publishedAt: candidate.publishedAt,
    });
    expect(second).toEqual(first);
    expect(api.calls.check).toBe(1);
  });

  it("reports download/install progress and never relaunches implicitly", async () => {
    const progress: UpdateProgress[] = [
      { phase: "download", receivedBytes: 0, totalBytes: 100 },
      { phase: "download", receivedBytes: 100, totalBytes: 100 },
    ];
    const api = createFixtureUpdateApi({ currentVersion: "0.2.0", candidate, progress });
    const seen: UpdateProgress[] = [];
    const available = (await api.checkForUpdate())!;

    await expect(api.applyUpdate(available, (event) => seen.push(event))).resolves.toEqual({ version: "0.3.0" });
    expect(seen).toEqual(progress);
    expect(api.calls).toEqual({ check: 1, download: 1, install: 1, relaunch: 0 });

    await expect(api.relaunchApplication()).resolves.toBeUndefined();
    expect(api.calls.relaunch).toBe(1);
  });

  it("normalizes each failure stage and leaves retry/relaunch under caller control", async () => {
    const checkApi = createFixtureUpdateApi({ currentVersion: "0.2.0", candidate, checkError: new Error("offline") });
    await expect(checkApi.checkForUpdate()).rejects.toMatchObject({ code: "check-failed" });

    const downloadApi = createFixtureUpdateApi({ currentVersion: "0.2.0", candidate, downloadError: "timeout" });
    const downloadCandidate = (await downloadApi.checkForUpdate())!;
    await expect(downloadApi.applyUpdate(downloadCandidate)).rejects.toMatchObject({ code: "download-failed" });
    expect(downloadApi.calls.install).toBe(0);
    expect(downloadApi.calls.relaunch).toBe(0);

    const installApi = createFixtureUpdateApi({ currentVersion: "0.2.0", candidate, installError: new Error("invalid signature") });
    const installCandidate = (await installApi.checkForUpdate())!;
    await expect(installApi.applyUpdate(installCandidate)).rejects.toMatchObject({ code: "install-failed" });
    expect(installApi.calls.relaunch).toBe(0);

    const relaunchApi = createFixtureUpdateApi({ currentVersion: "0.2.0", candidate, relaunchError: new Error("cannot restart") });
    await expect(relaunchApi.relaunchApplication()).rejects.toMatchObject({ code: "relaunch-failed" });
    expect(relaunchApi.calls.relaunch).toBe(1);
    const relaunchCandidate = (await relaunchApi.checkForUpdate())!;
    await relaunchApi.applyUpdate(relaunchCandidate);
    await expect(relaunchApi.relaunchApplication()).rejects.toMatchObject({ code: "relaunch-failed" });
  });

  it("rejects a candidate from a different check without installing it", async () => {
    const api = createFixtureUpdateApi({ currentVersion: "0.2.0", candidate });
    const available = (await api.checkForUpdate())!;
    const unrelated = { ...available, id: "other-adapter-candidate" };

    await expect(api.applyUpdate(unrelated)).rejects.toMatchObject({ code: "download-failed" });
    expect(api.calls.install).toBe(0);
    await expect(api.applyUpdate(undefined as never)).rejects.toMatchObject({ code: "download-failed" });
  });
});
