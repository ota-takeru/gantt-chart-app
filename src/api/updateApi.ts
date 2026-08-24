/**
 * UI-neutral boundary for application updates.
 *
 * Implementations may use the Tauri updater in the desktop runtime or the
 * deterministic fixture in previews and tests.  No implementation is allowed
 * to start an apply or relaunch operation from a check.
 */

export type UpdateErrorCode =
  | "check-failed"
  | "download-failed"
  | "install-failed"
  | "relaunch-failed";

export interface UpdateError {
  code: UpdateErrorCode;
  message: string;
  detail?: string;
}

export interface UpdateCandidate {
  /** Opaque adapter-local identity used to prevent applying an unrelated candidate. */
  id: string;
  version: string;
  notes?: string;
  publishedAt?: string;
}

export interface UpdateProgress {
  phase: "download" | "install";
  receivedBytes: number;
  totalBytes?: number;
}

export type UpdateProgressObserver = (progress: UpdateProgress) => void;

export interface AppliedUpdate {
  version: string;
}

export interface UpdateApi {
  /** Return the current candidate, or null when the application is up to date. */
  checkForUpdate(): Promise<UpdateCandidate | null>;

  /** Apply only the candidate explicitly supplied by the caller. */
  applyUpdate(
    candidate: UpdateCandidate,
    onProgress?: UpdateProgressObserver,
  ): Promise<AppliedUpdate>;

  /** Relaunch only after a successful apply. */
  relaunchApplication(): Promise<void>;
}

export function isUpdateError(value: unknown): value is UpdateError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<UpdateError>;
  return (
    (candidate.code === "check-failed" ||
      candidate.code === "download-failed" ||
      candidate.code === "install-failed" ||
      candidate.code === "relaunch-failed") &&
    typeof candidate.message === "string"
  );
}

export function normalizeUpdateError(
  error: unknown,
  code: UpdateErrorCode,
  fallbackMessage = "The application update could not be completed",
): UpdateError {
  if (isUpdateError(error)) {
    return { ...error, code };
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : undefined;
  return {
    code,
    message: message && message.trim().length > 0 ? message : fallbackMessage,
  };
}

/** Numeric semver comparison for fixture candidates and defensive metadata checks. */
export function compareUpdateVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const [core, preRelease = ""] = value.trim().replace(/^v/i, "").split("-", 2);
    const numbers = core.split(".").map((part) => {
      const match = /^(\d+)/.exec(part);
      return match ? Number(match[1]) : 0;
    });
    while (numbers.length < 3) numbers.push(0);
    return { numbers: numbers.slice(0, 3), preRelease };
  };

  const leftVersion = parse(left);
  const rightVersion = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftVersion.numbers[index] !== rightVersion.numbers[index]) {
      return leftVersion.numbers[index] > rightVersion.numbers[index] ? 1 : -1;
    }
  }
  if (leftVersion.preRelease === rightVersion.preRelease) return 0;
  if (!leftVersion.preRelease) return 1;
  if (!rightVersion.preRelease) return -1;

  const leftParts = leftVersion.preRelease.split(".");
  const rightParts = rightVersion.preRelease.split(".");
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) {
      return leftNumber > rightNumber ? 1 : -1;
    }
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}
