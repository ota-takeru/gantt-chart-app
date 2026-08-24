import {
  compareUpdateVersions,
  normalizeUpdateError,
  type AppliedUpdate,
  type UpdateApi,
  type UpdateCandidate,
  type UpdateErrorCode,
  type UpdateProgress,
  type UpdateProgressObserver,
} from "./updateApi";

export interface FixtureUpdateCandidate {
  version: string;
  notes?: string;
  publishedAt?: string;
}

export interface FixtureUpdatePlan {
  currentVersion?: string;
  candidate?: FixtureUpdateCandidate | null;
  checkError?: unknown;
  downloadError?: unknown;
  installError?: unknown;
  relaunchError?: unknown;
  progress?: UpdateProgress[];
}

export interface FixtureUpdateCalls {
  check: number;
  download: number;
  install: number;
  relaunch: number;
}

function copyProgress(progress: UpdateProgress): UpdateProgress {
  return { ...progress };
}

/**
 * Deterministic update adapter for browser previews and tests.  It contains no
 * fetch, filesystem, Tauri, timer, or process calls.
 */
export class FixtureUpdateApi implements UpdateApi {
  readonly calls: FixtureUpdateCalls = { check: 0, download: 0, install: 0, relaunch: 0 };
  private readonly currentVersion: string;
  private readonly plan: FixtureUpdatePlan;
  private candidate?: UpdateCandidate;
  private checkInFlight?: Promise<UpdateCandidate | null>;
  private applySucceeded = false;

  constructor(plan: FixtureUpdatePlan = {}) {
    this.currentVersion = plan.currentVersion ?? "0.0.0";
    this.plan = plan;
  }

  checkForUpdate(): Promise<UpdateCandidate | null> {
    if (this.checkInFlight) return this.checkInFlight;
    const operation = Promise.resolve().then(() => {
      this.calls.check += 1;
      if (this.plan.checkError !== undefined) {
        throw normalizeUpdateError(this.plan.checkError, "check-failed", "Update check failed");
      }
      const configured = this.plan.candidate;
      if (!configured || compareUpdateVersions(configured.version, this.currentVersion) <= 0) {
        this.candidate = undefined;
        return null;
      }
      this.candidate = {
        id: `fixture-update-${this.calls.check}`,
        version: configured.version,
        ...(configured.notes === undefined ? {} : { notes: configured.notes }),
        ...(configured.publishedAt === undefined ? {} : { publishedAt: configured.publishedAt }),
      };
      return { ...this.candidate };
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
    if (
      !candidate ||
      !this.candidate ||
      this.candidate.id !== candidate.id ||
      this.candidate.version !== candidate.version
    ) {
      throw normalizeUpdateError(new Error("The update candidate is unavailable"), "download-failed", "Update candidate is unavailable");
    }
    this.applySucceeded = false;
    this.calls.download += 1;
    for (const progress of this.plan.progress ?? []) onProgress?.(copyProgress(progress));
    if (this.plan.downloadError !== undefined) {
      throw normalizeUpdateError(this.plan.downloadError, "download-failed", "Update download failed");
    }

    this.calls.install += 1;
    if (this.plan.installError !== undefined) {
      throw normalizeUpdateError(this.plan.installError, "install-failed", "Update install failed");
    }
    this.applySucceeded = true;
    return { version: this.candidate.version };
  }

  async relaunchApplication(): Promise<void> {
    this.calls.relaunch += 1;
    if (!this.applySucceeded) {
      throw normalizeUpdateError(new Error("Application relaunch requires a successfully applied update"), "relaunch-failed", "Application relaunch is not ready");
    }
    if (this.plan.relaunchError !== undefined) {
      throw normalizeUpdateError(this.plan.relaunchError, "relaunch-failed", "Application relaunch failed");
    }
    this.applySucceeded = false;
  }
}

export function createFixtureUpdateApi(plan: FixtureUpdatePlan = {}): FixtureUpdateApi {
  return new FixtureUpdateApi(plan);
}

export type FixtureFailureCode = UpdateErrorCode;
