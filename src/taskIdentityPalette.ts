/**
 * The identity palette is presentation metadata only.  Keep the projection
 * keyed exclusively by the immutable task id so a rename, reorder, or reload
 * cannot change the assigned accent.
 */
export const TASK_IDENTITY_PALETTE_SIZE = 8 as const;

export type TaskIdentityPaletteIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function projectTaskIdentityPaletteIndex(taskId: string): TaskIdentityPaletteIndex {
  // FNV-1a gives short, stable ids a useful spread while remaining fully
  // deterministic and independent of display order or task contents.
  let hash = 2_166_136_261;
  for (let index = 0; index < taskId.length; index += 1) {
    hash ^= taskId.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % TASK_IDENTITY_PALETTE_SIZE as TaskIdentityPaletteIndex;
}
