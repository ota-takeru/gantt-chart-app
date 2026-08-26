export const DEFAULT_COMPLETED_POCKET_BATCH = 40;

export interface CompletedPocketMember {
  readonly id: string;
}

export interface CompletedPocketWindowState {
  readonly visiblePrefixCount: number;
  readonly batchSize: number;
}

export type CompletedPocketWindowIntent =
  | { readonly type: "load-more" }
  | { readonly type: "reset" }
  | { readonly type: "reconcile" };

export interface ProjectedCompletedPocketMember<T extends CompletedPocketMember> {
  readonly member: T;
  readonly positionInSet: number;
  readonly setSize: number;
  readonly inclusion: "prefix" | "selected-reveal";
}

export interface CompletedPocketWindowProjection<T extends CompletedPocketMember> {
  readonly rendered: readonly ProjectedCompletedPocketMember<T>[];
  readonly visiblePrefixCount: number;
  readonly omittedCount: number;
  readonly canLoadMore: boolean;
  readonly nextBatchSize: number;
}

function boundedBatchSize(batchSize: number): number {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) return DEFAULT_COMPLETED_POCKET_BATCH;
  return batchSize;
}

function boundedPrefix(count: number, total: number): number {
  if (!Number.isSafeInteger(count) || count <= 0 || total <= 0) return 0;
  return Math.min(count, total);
}

export function createCompletedPocketWindow(
  total: number,
  batchSize = DEFAULT_COMPLETED_POCKET_BATCH,
): CompletedPocketWindowState {
  const safeBatchSize = boundedBatchSize(batchSize);
  return {
    visiblePrefixCount: boundedPrefix(safeBatchSize, total),
    batchSize: safeBatchSize,
  };
}

export function transitionCompletedPocketWindow(
  state: CompletedPocketWindowState,
  intent: CompletedPocketWindowIntent,
  total: number,
): CompletedPocketWindowState {
  const batchSize = boundedBatchSize(state.batchSize);
  if (intent.type === "reset") return createCompletedPocketWindow(total, batchSize);
  const current = boundedPrefix(state.visiblePrefixCount, total);
  if (intent.type === "reconcile") {
    if (current === state.visiblePrefixCount && batchSize === state.batchSize) return state;
    return { visiblePrefixCount: current, batchSize };
  }
  const next = Math.min(Math.max(0, total), current + batchSize);
  if (next === state.visiblePrefixCount && batchSize === state.batchSize) return state;
  return { visiblePrefixCount: next, batchSize };
}

export function projectCompletedPocketWindow<T extends CompletedPocketMember>(
  members: readonly T[],
  state: CompletedPocketWindowState,
  selectedMemberId?: string,
): CompletedPocketWindowProjection<T> {
  const total = members.length;
  const visiblePrefixCount = boundedPrefix(state.visiblePrefixCount, total);
  const selectedIndex = selectedMemberId
    ? members.findIndex((member) => member.id === selectedMemberId)
    : -1;
  const renderedIndexes = Array.from({ length: visiblePrefixCount }, (_, index) => index);
  if (selectedIndex >= visiblePrefixCount) renderedIndexes.push(selectedIndex);
  const rendered = renderedIndexes.map((index) => ({
    member: members[index],
    positionInSet: index + 1,
    setSize: total,
    inclusion: index < visiblePrefixCount ? "prefix" as const : "selected-reveal" as const,
  }));
  const omittedCount = Math.max(0, total - rendered.length);
  return {
    rendered,
    visiblePrefixCount,
    omittedCount,
    canLoadMore: visiblePrefixCount < total,
    nextBatchSize: Math.min(boundedBatchSize(state.batchSize), Math.max(0, total - visiblePrefixCount)),
  };
}
