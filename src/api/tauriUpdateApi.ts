import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update as TauriUpdate,
} from "@tauri-apps/plugin-updater";
import {
  normalizeUpdateError,
  type AppliedUpdate,
  type UpdateApi,
  type UpdateCandidate,
  type UpdateProgressObserver,
} from "./updateApi";

type CandidateRecord = {
  candidate: UpdateCandidate;
  update: TauriUpdate;
};

function candidateId(sequence: number): string {
  return `update-candidate-${sequence}`;
}

/**
 * Desktop implementation of the update boundary.  Tauri's resource object is
 * deliberately kept private; callers only receive stable metadata and pass
 * that metadata back to applyUpdate.
 */
export class TauriUpdateApi implements UpdateApi {
  private nextCandidateId = 1;
  private readonly candidates = new Map<string, CandidateRecord>();
  private checkInFlight?: Promise<UpdateCandidate | null>;
  private applySucceeded = false;

  checkForUpdate(): Promise<UpdateCandidate | null> {
    if (this.checkInFlight) return this.checkInFlight;

    const operation = check()
      .then((update) => {
        if (!update) return null;
        const candidate: UpdateCandidate = {
          id: candidateId(this.nextCandidateId++),
          version: update.version,
          ...(update.body === undefined ? {} : { notes: update.body }),
          ...(update.date === undefined ? {} : { publishedAt: update.date }),
        };
        this.candidates.set(candidate.id, { candidate, update });
        return { ...candidate };
      })
      .catch((error: unknown) => {
        throw normalizeUpdateError(error, "check-failed", "Update check failed");
      });

    this.checkInFlight = operation;
    void operation.then(
      () => {
        if (this.checkInFlight === operation) this.checkInFlight = undefined;
      },
      () => {
        if (this.checkInFlight === operation) this.checkInFlight = undefined;
      },
    );
    return operation;
  }

  async applyUpdate(
    candidate: UpdateCandidate,
    onProgress?: UpdateProgressObserver,
  ): Promise<AppliedUpdate> {
    const record =
      candidate && typeof candidate.id === "string"
        ? this.candidates.get(candidate.id)
        : undefined;
    if (!record || record.candidate.version !== candidate?.version) {
      throw normalizeUpdateError(
        new Error("The update candidate is no longer available"),
        "download-failed",
        "Update candidate is unavailable",
      );
    }

    this.applySucceeded = false;
    let receivedBytes = 0;
    let totalBytes: number | undefined;
    const onEvent = (event: DownloadEvent) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength;
        onProgress?.({ phase: "download", receivedBytes: 0, ...(totalBytes === undefined ? {} : { totalBytes }) });
      } else if (event.event === "Progress") {
        receivedBytes += event.data.chunkLength;
        onProgress?.({ phase: "download", receivedBytes, ...(totalBytes === undefined ? {} : { totalBytes }) });
      } else {
        onProgress?.({
          phase: "download",
          receivedBytes,
          ...(totalBytes === undefined ? {} : { totalBytes }),
        });
      }
    };

    try {
      await record.update.download(onEvent);
    } catch (error: unknown) {
      throw normalizeUpdateError(error, "download-failed", "Update download failed");
    }

    onProgress?.({
      phase: "install",
      receivedBytes,
      ...(totalBytes === undefined ? {} : { totalBytes }),
    });
    try {
      await record.update.install();
    } catch (error: unknown) {
      throw normalizeUpdateError(error, "install-failed", "Update install failed");
    }
    this.applySucceeded = true;
    return { version: record.candidate.version };
  }

  async relaunchApplication(): Promise<void> {
    if (!this.applySucceeded) {
      throw normalizeUpdateError(
        new Error("Application relaunch requires a successfully applied update"),
        "relaunch-failed",
        "Application relaunch is not ready",
      );
    }
    try {
      await relaunch();
      this.applySucceeded = false;
    } catch (error: unknown) {
      throw normalizeUpdateError(error, "relaunch-failed", "Application relaunch failed");
    }
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
