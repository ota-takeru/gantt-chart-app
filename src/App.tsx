import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactElement } from "react";
import { createFixtureTaskApi, previewVariantFromLocation, type PreviewVariant } from "./api/fixtureTaskApi";
import { isTauriRuntime, TauriTaskApi } from "./api/tauriTaskApi";
import {
  type DomainError,
  type HierarchyEntry,
  type ReversibleChangeResult,
  type TaskApi,
  type TaskForestSnapshot,
  type TaskSnapshot,
  type UndoStatus,
  normalizeDomainError,
} from "./api/types";
import "./index.css";

type AppProps = { api?: TaskApi };
type CreateDraft = { parentTaskId: string; returnFocusId: string };
type Placement = { parentTaskId?: string; beforeTaskId?: string; label: string };
type DragState = { taskId: string; pointerId: number; placement?: Placement };
type KeyboardMove = { taskId: string; destinations: Placement[]; index: number; returnFocusId: string };
type DeleteConfirmation = { taskId: string; originFocusId: string; successFocusId: string };
type RangePreset = "24h" | "7d" | "30d" | "90d" | "all";
type RangeView = { preset: RangePreset; startMs: number; endMs: number; anchoredNow: boolean };

const FOREST_LIMIT = 5000;
const PREVIEW_NOW = "2026-08-23T06:12:00.000Z";
const EXACT_TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const EXACT_TIME_CACHE = new Map<number, string>();

function nowForApi(preview: boolean): string {
  return preview ? PREVIEW_NOW : new Date().toISOString();
}

const RANGE_DURATIONS: Record<Exclude<RangePreset, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

const RANGE_PRESETS: readonly RangePreset[] = ["24h", "7d", "30d", "90d", "all"];

function formatExact(instant: string | number): string {
  const date = new Date(instant);
  const time = date.getTime();
  if (Number.isNaN(time)) return "時刻不明";
  const cached = EXACT_TIME_CACHE.get(time);
  if (cached) return cached;
  const formatted = EXACT_TIME_FORMATTER.format(date);
  if (EXACT_TIME_CACHE.size >= FOREST_LIMIT * 4) EXACT_TIME_CACHE.clear();
  EXACT_TIME_CACHE.set(time, formatted);
  return formatted;
}

function formatBounds(instant: number): string {
  return formatExact(instant);
}

function timelineDescription(entry: HierarchyEntry, nowMs: number): string {
  const created = formatExact(entry.task.createdAt);
  if (entry.task.state !== "completed") return `作成 ${created} → NOW ${formatExact(nowMs)}。作業時間ではありません。`;
  if (!entry.task.completedAt) return `作成 ${created} → 完了時刻なし。保持データの警告です。作業時間ではありません。`;
  return `作成 ${created} → 完了 ${formatExact(entry.task.completedAt)}。作業時間ではありません。`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

type LifetimeGeometry = {
  kind: "interval" | "point" | "before" | "after";
  left?: number;
  width?: number;
  clippedLeft?: boolean;
  clippedRight?: boolean;
  missingEnd?: boolean;
};

// A percentage below this threshold is smaller than one CSS pixel on the
// normal history rail.  Keep it as a point so the visual does not invent a
// duration by applying a minimum bar width.
const POINT_PERCENT_THRESHOLD = 0.2;

function lifetimeGeometry(entry: HierarchyEntry, startMs: number, endMs: number, nowMs: number): LifetimeGeometry {
  const createdMs = Date.parse(entry.task.createdAt);
  const safeCreated = Number.isNaN(createdMs) ? nowMs : createdMs;
  const missingEnd = entry.task.state === "completed" && !entry.task.completedAt;
  const taskEnd = entry.task.state === "completed" ? (entry.task.completedAt ? Date.parse(entry.task.completedAt) : safeCreated) : nowMs;
  const safeEnd = Number.isNaN(taskEnd) ? safeCreated : taskEnd;
  const span = Math.max(1, endMs - startMs);
  if (missingEnd) {
    if (safeCreated < startMs) return { kind: "before", missingEnd: true };
    if (safeCreated > endMs) return { kind: "after", missingEnd: true };
    return { kind: "point", left: clampPercent(((safeCreated - startMs) / span) * 100), missingEnd: true };
  }
  if (safeEnd < startMs) return { kind: "before" };
  if (safeCreated > endMs) return { kind: "after" };
  const clippedLeft = safeCreated < startMs;
  const clippedRight = safeEnd > endMs;
  const left = clampPercent(((Math.max(safeCreated, startMs) - startMs) / span) * 100);
  const right = clampPercent(((Math.min(safeEnd, endMs) - startMs) / span) * 100);
  const width = Math.max(0, right - left);
  if (width < POINT_PERCENT_THRESHOLD) {
    return { kind: "point", left, clippedLeft, clippedRight };
  }
  return { kind: "interval", left, width, clippedLeft, clippedRight };
}

function relativeRulerLabel(instantMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - instantMs);
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const week = 7 * day;
  if (delta < 30 * 60 * 1000) return "現在";
  if (delta < 2 * day) return `${Math.max(1, Math.round(delta / hour))}時間前`;
  if (delta < 14 * day) return `${Math.max(1, Math.round(delta / day))}日前`;
  if (delta < 8 * week) return `${Math.max(1, Math.round(delta / week))}週間前`;
  return `${Math.max(1, Math.round(delta / (30 * day)))}か月前`;
}

function rulerTicks(startMs: number, endMs: number, nowMs: number, anchoredNow: boolean): Array<{ left: number; label: string }> {
  const span = Math.max(1, endMs - startMs);
  const count = span <= RANGE_DURATIONS["24h"] ? 5 : span <= 8 * RANGE_DURATIONS["24h"] ? 8 : 6;
  const useRelativeLabels = anchoredNow && span <= RANGE_DURATIONS["7d"];
  const dateFormatter = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" });
  const candidates = Array.from({ length: count }, (_, index) => {
    const left = (index / (count - 1)) * 100;
    const instant = startMs + (span * index) / (count - 1);
    const isCurrentEndpoint = anchoredNow && index === count - 1;
    const label = useRelativeLabels
      ? relativeRulerLabel(instant, nowMs)
      : isCurrentEndpoint
        ? "現在"
        : span <= RANGE_DURATIONS["24h"]
          ? formatExact(instant)
          : dateFormatter.format(new Date(instant));
    return { left, label };
  });
  // Calendar labels can collapse when a short range crosses a day boundary.
  // Keep the first occurrence and always retain the final NOW/end marker.
  const unique: Array<{ left: number; label: string }> = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const isLast = candidate === candidates[candidates.length - 1];
    if (!seen.has(candidate.label) || isLast) {
      if (isLast && seen.has(candidate.label)) {
        const previous = unique.findIndex((tick) => tick.label === candidate.label);
        if (previous >= 0) unique.splice(previous, 1);
      }
      unique.push(candidate);
      seen.add(candidate.label);
    }
  }
  return unique;
}

type HistoryMarkProps = {
  entry: HierarchyEntry;
  range: RangeView;
  nowMs: number;
  selected: boolean;
  onSelect: (taskId: string) => void;
  onFit: (taskId: string) => void;
};

type TimelineRulerProps = {
  range: RangeView;
  nowMs: number;
  remainingCount: number;
  completedCount: number;
  onCurrentJump: () => void;
  onHistoryJump: () => void;
};

function TimelineRuler({ range, nowMs, remainingCount, completedCount, onCurrentJump, onHistoryJump }: TimelineRulerProps): ReactElement {
  const ticks = rulerTicks(range.startMs, range.endMs, nowMs, range.anchoredNow);
  const nowIsBeyondPlot = nowMs > range.endMs;
  const rangeLabel = range.anchoredNow ? `表示範囲 開始 ${formatBounds(range.startMs)} 現在 ${formatBounds(range.endMs)}` : `表示範囲 開始 ${formatBounds(range.startMs)} 終了 ${formatBounds(range.endMs)}`;
  return <div className="history-ruler-grid timeline-ruler" data-range-start-ms={range.startMs} data-range-end-ms={range.endMs} data-now-ms={nowMs}>
    <div className="history-ruler-cell">
      <div className="ruler-ticks" aria-hidden="true">{ticks.map((tick, index) => <span key={`${tick.left}-${index}`} className="ruler-tick" style={{ left: `${tick.left}%` }}>{tick.label}</span>)}</div>
      <div className="range-bounds" aria-label={rangeLabel}><span>開始 {formatBounds(range.startMs)}</span><span>{range.anchoredNow ? "現在" : "終了"} {formatBounds(range.endMs)}</span></div>
    </div>
    <div className={`now-hinge-header ${nowIsBeyondPlot ? "is-discontinuous" : ""}`} aria-label="NOW" />
    <div className="identity-heading"><span className="sr-only">現在のタスク。操作は右側から</span><div className="ruler-jumps"><button type="button" className="ruler-jump" aria-label={`現在のタスク ${remainingCount} 件へ移動`} onClick={onCurrentJump} disabled={remainingCount === 0}><span aria-hidden="true">現在 {remainingCount}</span></button><button type="button" className="ruler-jump" aria-label={`完了履歴 ${completedCount} 件へ移動`} onClick={onHistoryJump} disabled={completedCount === 0}><span aria-hidden="true">履歴 {completedCount}</span></button></div></div>
  </div>;
}

type TopCreateFormProps = {
  disabled: boolean;
  onSubmit: (title: string) => Promise<boolean>;
};

const TopCreateForm = memo(function TopCreateForm({ disabled, onSubmit }: TopCreateFormProps): ReactElement {
  const [title, setTitle] = useState("");

  const submit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = title.trim();
    if (disabled || !value) return;
    void onSubmit(value).then((saved) => { if (saved) setTitle(""); });
  }, [disabled, onSubmit, title]);

  return <form className="top-create" onSubmit={submit}>
    <label htmlFor="top-task-title">新しいタスク</label>
    <input id="top-task-title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder="タスクを追加" maxLength={240} disabled={disabled} />
    <button type="submit" aria-label="トップレベルに追加" disabled={disabled || !title.trim()}>＋</button>
  </form>;
});

type InlineSubtaskFormProps = {
  parentTaskId: string;
  parentTitle: string;
  returnFocusId: string;
  disabled: boolean;
  onSubmit: (parentTaskId: string, title: string, returnFocusId: string) => Promise<boolean>;
  onCancel: () => void;
};

const InlineSubtaskForm = memo(function InlineSubtaskForm({ parentTaskId, parentTitle, returnFocusId, disabled, onSubmit, onCancel }: InlineSubtaskFormProps): ReactElement {
  const [title, setTitle] = useState("");

  const submit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || !title.trim()) return;
    void onSubmit(parentTaskId, title, returnFocusId);
  }, [disabled, onSubmit, parentTaskId, returnFocusId, title]);

  return <form className="inline-create child-create" onSubmit={submit}>
    <span aria-hidden="true">└</span>
    <input autoFocus aria-label={`${parentTitle}のサブタスク`} value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder="サブタスクを入力" maxLength={240} />
    <button type="submit" disabled={disabled || !title.trim()}>追加</button>
    <button type="button" onClick={onCancel}>取消</button>
  </form>;
});

function HistoryMark({ entry, range, nowMs, selected, onSelect, onFit }: HistoryMarkProps): ReactElement {
  const geometry = lifetimeGeometry(entry, range.startMs, range.endMs, nowMs);
  const isRemainingTask = entry.task.state !== "completed";
  const endpointLabel = isRemainingTask ? `NOW ${formatExact(nowMs)}` : entry.task.completedAt ? `完了 ${formatExact(entry.task.completedAt)}` : "完了時刻なし";
  const nowOutsideRight = isRemainingTask && nowMs > range.endMs;
  const clippingLabel = nowOutsideRight ? "NOWは範囲外 →" : geometry.clippedLeft && geometry.clippedRight ? "左側から継続、右側まで継続" : geometry.clippedLeft ? "左側から継続" : geometry.clippedRight ? (isRemainingTask ? "NOWは範囲外 →" : "右側まで継続") : "";
  const accessible = `${entry.task.title}。${timelineDescription(entry, nowMs)}${clippingLabel ? ` ${clippingLabel}。` : ""}`;
  return <div className={`history-mark-cell timeline-cell ${selected ? "is-selected" : ""}`} data-timeline-cell={entry.task.id} data-history-mark={entry.task.id} data-start-ms={Date.parse(entry.task.createdAt)} data-end-ms={isRemainingTask ? nowMs : entry.task.completedAt ? Date.parse(entry.task.completedAt) : "missing"} role="group" aria-label={accessible} onClick={() => onSelect(entry.task.id)}>
    <div className="history-rail">
      {geometry.kind === "before" && <button type="button" className="timeline-locator" onClick={(event) => { event.stopPropagation(); onFit(entry.task.id); }}>{geometry.missingEnd ? "◁ 範囲外 · 完了時刻なし" : "◁ 範囲外"}</button>}
      {geometry.kind === "after" && <button type="button" className="timeline-locator" onClick={(event) => { event.stopPropagation(); onFit(entry.task.id); }}>{geometry.missingEnd ? "範囲外 ▷ · 完了時刻なし" : "範囲外 ▷"}</button>}
      {geometry.kind === "point" && <span className={`lifetime-point ${isRemainingTask ? "is-open" : "is-closed"} ${geometry.missingEnd ? "is-warning" : ""}`} style={{ left: `${geometry.left}%` }} title={endpointLabel} />}
      {geometry.kind === "interval" && <span className={`lifetime-bar ${isRemainingTask ? "is-open" : "is-closed"} ${geometry.clippedLeft ? "is-clipped-left" : ""} ${geometry.clippedRight ? "is-clipped-right" : ""}`} style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }} title={`${formatExact(entry.task.createdAt)} → ${endpointLabel}`}><span className="lifetime-start" />{geometry.clippedLeft && <span className="clip-chevron clip-left">‹</span>}{geometry.clippedRight && <span className="clip-chevron clip-right">›</span>}<span className="lifetime-end" /></span>}
      {geometry.missingEnd && geometry.kind === "point" && <span className="missing-end-label" style={{ left: `${geometry.left}%` }}>完了時刻なし</span>}
      {clippingLabel && geometry.kind === "interval" && <span className="clip-label">{clippingLabel}</span>}
      {nowOutsideRight && geometry.kind === "interval" && <span className="history-continuation">▷ 継続</span>}
    </div>
    <span className="sr-only" id={`lifetime-description-${entry.task.id}`}>{accessible}</span>
  </div>;
}

type HistoryPocketProps = {
  root: HierarchyEntry;
  members: HierarchyEntry[];
  range: RangeView;
  nowMs: number;
  expanded: boolean;
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onToggle: (taskId: string) => void;
};

function HistoryPocket({ root, members, range, nowMs, expanded, selectedTaskId, onSelect, onToggle }: HistoryPocketProps): ReactElement {
  const initialMemberLimit = members.length <= 5 ? members.length : 3;
  const visibleMembers = expanded ? members : members.slice(0, initialMemberLimit);
  const hiddenCount = Math.max(0, members.length - visibleMembers.length);
  const rootLabel = `${root.task.title}の完了履歴 ${members.length}件`;
  return <div className={`history-pocket ${expanded ? "is-expanded" : ""} ${members.some((entry) => entry.task.id === selectedTaskId) ? "is-selected" : ""}`} data-pocket-id={root.task.id}>
    <button type="button" className="pocket-caption" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => onToggle(root.task.id)} aria-label={`${rootLabel}${expanded ? "を折りたたむ" : "を展開"}`}>
      <span className="pocket-caption-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      <span className="pocket-caption-title">{root.task.title}</span>
      <span className="pocket-caption-count">{members.length}件</span>
    </button>
    <div className="pocket-lanes" aria-label={rootLabel}>
      {visibleMembers.map((entry) => {
        const geometry = lifetimeGeometry(entry, range.startMs, range.endMs, nowMs);
        const position = geometry.kind === "before" ? 0 : geometry.kind === "after" ? 98 : geometry.left ?? 0;
        const width = geometry.kind === "interval" ? geometry.width ?? 0 : 0;
        const relativeDepth = Math.max(0, entry.depth - root.depth);
        const titleLeft = geometry.kind === "interval" ? Math.min(66, position + width + 2) : 4;
        const markerLabel = `${entry.task.title}。${timelineDescription(entry, nowMs)}`;
        return <div key={entry.task.id} className={`pocket-member-row ${selectedTaskId === entry.task.id ? "is-selected" : ""}`} data-history-member-id={entry.task.id}>
          <div className="pocket-member-track" role="group" aria-label={markerLabel}>
            <button id={`history-mark-${entry.task.id}`} type="button" className={`pocket-mark ${selectedTaskId === entry.task.id ? "is-selected" : ""} ${geometry.kind !== "interval" ? `is-${geometry.kind}` : ""} ${geometry.kind === "point" ? "is-closed" : ""} ${geometry.missingEnd ? "is-warning" : ""}`} data-history-mark={entry.task.id} data-timeline-cell={entry.task.id} data-start-ms={Date.parse(entry.task.createdAt)} data-end-ms={entry.task.completedAt ? Date.parse(entry.task.completedAt) : "missing"} aria-label={markerLabel} tabIndex={-1} style={{ left: `${position}%`, ...(geometry.kind === "interval" ? { width: `${width}%` } : {}) }} onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(entry.task.id)}>{geometry.kind === "before" ? "◁" : geometry.kind === "after" ? "▷" : geometry.missingEnd ? "△" : geometry.kind === "point" ? "■" : "■"}</button>
            <button type="button" className="pocket-member-title" aria-label={`${entry.task.title}を選択`} tabIndex={-1} style={{ left: `${titleLeft}%`, paddingLeft: `${Math.min(relativeDepth, 4) * 14}px` }} onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(entry.task.id)}><span className="pocket-member-branch" aria-hidden="true">{relativeDepth > 0 ? "└" : "•"}</span>{entry.task.title}</button>
          </div>
        </div>;
      })}
      {hiddenCount > 0 && <button type="button" className="pocket-more" aria-label={`${rootLabel}を展開`} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => onToggle(root.task.id)}>＋{hiddenCount}件</button>}
    </div>
  </div>;
}

function isRemaining(entry: HierarchyEntry): boolean {
  return entry.task.state !== "completed";
}

function stateLabel(state: TaskSnapshot["state"]): string {
  if (state === "active") return "着手中";
  if (state === "paused") return "保留";
  if (state === "completed") return "完了";
  return "残り";
}

function errorText(error: DomainError): string {
  const messages: Record<string, string> = {
    "incomplete-descendants": "未完了の子タスクがあります。先に子タスクを完了してください。",
    "stale-hierarchy": "一覧が更新されています。最新の状態を読み込みました。移動先を選び直してください。",
    "version-conflict": "タスクが更新されています。最新の状態を読み込みました。",
    "parent-completed": "完了済みの親には追加・移動できません。親を再開してから試してください。",
    "hierarchy-cycle": "自分自身や子孫の中には移動できません。",
    "hierarchy-depth-exceeded": "階層は8段までです。もう少し浅い場所を選んでください。",
    "invalid-title": "タイトルは1〜240文字で入力してください。",
    "tree-limit-exceeded": "タスクが多すぎるため、一覧を絞ってから操作してください。",
    "persistence-failure": "保存／読込に失敗しました。以前の状態は保持されています。",
    "undo-not-available": "元に戻せる操作はありません。現在の状態はそのままです。",
    "stale-undo": "元に戻す対象が更新されています。最新の操作を確認してください。",
    "undo-conflict": "元に戻す対象が別の変更と競合しました。最新の状態を確認してください。",
    "task-not-found": "対象のタスクはすでに一覧から外れています。最新の状態を読み込みました。",
    "stale-version": "タスクが更新されています。最新の状態を読み込みました。",
    "anchor-scope-mismatch": "挿入位置が現在の階層と一致しません。移動先を選び直してください。",
  };
  return messages[error.code] ?? error.message;
}

function parentMap(entries: HierarchyEntry[]): Map<string, HierarchyEntry> {
  return new Map(entries.map((entry) => [entry.task.id, entry]));
}

function pathLabel(entry: HierarchyEntry, byId: Map<string, HierarchyEntry>): string {
  const segments = [entry.task.title];
  let parentId = entry.parentTaskId;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent) break;
    segments.unshift(parent.task.title);
    parentId = parent.parentTaskId;
  }
  return segments.join(" ＞ ");
}

function childrenOf(entries: HierarchyEntry[], parentTaskId?: string): HierarchyEntry[] {
  return entries.filter((entry) => entry.parentTaskId === parentTaskId).sort((left, right) => left.position - right.position);
}

/**
 * Status is a presentation concern only.  Keep childrenOf() as the raw
 * position-ordered source for mutation anchors and placement validation, and
 * use this projection exclusively when rendering/navigation needs a calm
 * remaining-first surface.
 */
function projectedChildrenOf(entries: HierarchyEntry[], parentTaskId?: string): HierarchyEntry[] {
  return childrenOf(entries, parentTaskId).sort((left, right) => {
    const statusOrder = Number(!isRemaining(left)) - Number(!isRemaining(right));
    return statusOrder || left.position - right.position;
  });
}

function projectedForestOrder(entries: HierarchyEntry[]): string[] {
  const result: string[] = [];
  const visit = (parentTaskId?: string) => {
    for (const entry of projectedChildrenOf(entries, parentTaskId)) {
      result.push(entry.task.id);
      visit(entry.task.id);
    }
  };
  visit();
  return result;
}

function descendantsOf(entries: HierarchyEntry[], taskId: string): HierarchyEntry[] {
  const result: HierarchyEntry[] = [];
  const visit = (parent: string) => {
    for (const child of childrenOf(entries, parent)) {
      result.push(child);
      visit(child.task.id);
    }
  };
  visit(taskId);
  return result;
}

function placementFromDropTarget(target: HTMLElement | null): Placement | null {
  if (!target) return null;
  const kind = target.dataset.dropKind;
  const label = target.dataset.dropLabel ?? target.getAttribute("aria-label") ?? "移動先";
  if (kind === "root") return { label };
  if (kind === "parent") {
    const parentTaskId = target.dataset.dropParentId;
    return parentTaskId ? { label, parentTaskId } : null;
  }
  if (kind === "before") {
    const beforeTaskId = target.dataset.dropBeforeId;
    if (!beforeTaskId) return null;
    return { label, parentTaskId: target.dataset.dropParentId || undefined, beforeTaskId };
  }
  return null;
}

function containsRemainingDescendant(entries: HierarchyEntry[], taskId: string): boolean {
  return descendantsOf(entries, taskId).some(isRemaining);
}

function useFocusRestoration(focusId: string | null) {
  useEffect(() => {
    if (!focusId) return;
    const target = document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(focusId)}"]`);
    target?.focus();
  }, [focusId]);
}

export default function App({ api: injectedApi }: AppProps) {
  const previewVariant: PreviewVariant | undefined = previewVariantFromLocation();
  const previewMode = Boolean(previewVariant);
  const [api] = useState<TaskApi>(() => injectedApi ?? (isTauriRuntime() ? new TauriTaskApi() : createFixtureTaskApi(previewVariant ?? "empty")));
  const [forest, setForest] = useState<TaskForestSnapshot | null>(null);
  const forestRef = useRef<TaskForestSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<DomainError | null>(null);
  const [undoStatus, setUndoStatus] = useState<UndoStatus | null>(null);
  const [undoLoading, setUndoLoading] = useState(true);
  const [undoError, setUndoError] = useState<DomainError | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<DomainError | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const editingTaskIdRef = useRef<string | null>(null);
  const editingTitleRef = useRef("");
  const renameFormRef = useRef<HTMLFormElement>(null);
  const renameSessionRef = useRef(0);
  const renameOutsideRequestRef = useRef<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expandedPockets, setExpandedPockets] = useState<Set<string>>(() => new Set());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [keyboardMove, setKeyboardMove] = useState<KeyboardMove | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [focusReturnId, setFocusReturnId] = useState<string | null>(null);
  const liveStatusRef = useRef<HTMLParagraphElement>(null);
  const keyboardPlacementRef = useRef<HTMLDivElement>(null);
  const historyCompositeRef = useRef<HTMLDivElement>(null);
  const historySurfaceRef = useRef<HTMLElement>(null);
  const rangeSelectRef = useRef<HTMLSelectElement>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const initialNowMs = Date.parse(nowForApi(previewMode));
  const [displayNowMs, setDisplayNowMs] = useState(initialNowMs);
  const [rangeView, setRangeView] = useState<RangeView>(() => ({ preset: "24h", startMs: initialNowMs - RANGE_DURATIONS["24h"], endMs: initialNowMs, anchoredNow: true }));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useFocusRestoration(focusReturnId);

  useEffect(() => { editingTaskIdRef.current = editingTaskId; }, [editingTaskId]);
  useEffect(() => {
    if (keyboardMove) keyboardPlacementRef.current?.focus();
  }, [keyboardMove]);

  useEffect(() => {
    if (!deleteConfirm) return;
    // Confirmation is deliberately non-destructive on entry.  Keeping focus
    // on the stable cancel action also makes Esc and screen-reader recovery
    // predictable while the inline scope is open.
    document.querySelector<HTMLElement>(`[data-focus-id="delete-cancel:${CSS.escape(deleteConfirm.taskId)}"]`)?.focus();
  }, [deleteConfirm]);

  useEffect(() => {
    if (keyboardMove || !focusReturnId) return;
    document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(focusReturnId)}"]`)?.focus();
  }, [focusReturnId, keyboardMove]);

  useEffect(() => {
    if (previewMode) return;
    const timer = window.setInterval(() => setDisplayNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [previewMode]);

  const entries = forest?.entries ?? [];
  const byId = useMemo(() => parentMap(entries), [entries]);
  const remainingEntries = useMemo(() => entries.filter(isRemaining), [entries]);
  const completedEntries = useMemo(() => entries.filter((entry) => !isRemaining(entry)), [entries]);
  const remainingCount = remainingEntries.length;
  const selectedEntry = selectedTaskId ? byId.get(selectedTaskId) : undefined;
  const completedOnlyIds = useMemo(() => new Set(completedEntries.filter((entry) => !containsRemainingDescendant(entries, entry.task.id)).map((entry) => entry.task.id)), [completedEntries, entries]);
  const completedPocketRoots = useMemo(() => completedEntries.filter((entry) => completedOnlyIds.has(entry.task.id) && (!entry.parentTaskId || !completedOnlyIds.has(entry.parentTaskId))), [completedEntries, completedOnlyIds]);

  useEffect(() => {
    setRangeView((current) => {
      if (!current.anchoredNow) return current;
      if (current.preset === "all") {
        return { ...current, endMs: displayNowMs };
      }
      const duration = RANGE_DURATIONS[current.preset];
      return { ...current, startMs: displayNowMs - duration, endMs: displayNowMs };
    });
  }, [displayNowMs]);

  const selectTask = useCallback((taskId: string) => {
    startTransition(() => {
      setSelectedTaskId(taskId);
      setCollapsed((current) => {
        const next = new Set(current);
        let changed = false;
        let parentId = byId.get(taskId)?.parentTaskId;
        while (parentId) {
          changed = next.delete(parentId) || changed;
          parentId = byId.get(parentId)?.parentTaskId;
        }
        return changed ? next : current;
      });
      const pocket = completedPocketRoots.find((candidate) => candidate.task.id === taskId || descendantsOf(entries, candidate.task.id).some((entry) => entry.task.id === taskId));
      if (!pocket || expandedPockets.has(pocket.task.id) || pocket.task.id === taskId) return;
      const visibleIds = [pocket, ...descendantsOf(entries, pocket.task.id).filter((entry) => completedOnlyIds.has(entry.task.id))].slice(0, 3).map((entry) => entry.task.id);
      if (visibleIds.includes(taskId)) return;
      setExpandedPockets((current) => new Set(current).add(pocket.task.id));
    });
  }, [byId, completedOnlyIds, completedPocketRoots, entries, expandedPockets]);
  const historyItemIds = useMemo(() => projectedForestOrder(entries), [entries]);
  const handleHistoryKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (historyItemIds.length === 0) return;
    const currentIndex = selectedTaskId ? historyItemIds.indexOf(selectedTaskId) : -1;
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      selectTask(event.key === "Home" ? historyItemIds[0] : historyItemIds[historyItemIds.length - 1]);
      return;
    }
    if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(historyItemIds.length - 1, (currentIndex < 0 ? (delta > 0 ? -1 : historyItemIds.length) : currentIndex) + delta));
      selectTask(historyItemIds[nextIndex]);
      return;
    }
    if (event.key === "Enter" && selectedTaskId) {
      const pocket = completedPocketRoots.find((candidate) => candidate.task.id === selectedTaskId || descendantsOf(entries, candidate.task.id).some((entry) => entry.task.id === selectedTaskId));
      if (pocket) {
        event.preventDefault();
        setExpandedPockets((current) => { const next = new Set(current); if (next.has(pocket.task.id)) next.delete(pocket.task.id); else next.add(pocket.task.id); return next; });
      }
    }
  }, [completedPocketRoots, entries, historyItemIds, selectTask, selectedTaskId]);

  const allRange = useCallback((nowMs: number): { startMs: number; endMs: number } => {
    const created = entries.map((entry) => Date.parse(entry.task.createdAt)).filter((value) => Number.isFinite(value));
    const startMs = created.length > 0 ? Math.min(nowMs, ...created) : nowMs - RANGE_DURATIONS["7d"];
    const endMs = nowMs;
    return { startMs, endMs };
  }, [entries]);

  const changeRangePreset = useCallback((preset: RangePreset) => {
    if (preset === "all") {
      const bounds = allRange(displayNowMs);
      setRangeView({ preset, ...bounds, anchoredNow: true });
      return;
    }
    const duration = RANGE_DURATIONS[preset];
    if (rangeView.anchoredNow) {
      setRangeView({ preset, startMs: displayNowMs - duration, endMs: displayNowMs, anchoredNow: true });
      return;
    }
    const center = (rangeView.startMs + rangeView.endMs) / 2;
    const endMs = Math.min(displayNowMs, center + duration / 2);
    setRangeView({ preset, startMs: endMs - duration, endMs, anchoredNow: false });
  }, [allRange, displayNowMs, rangeView]);

  const handleRangeWheel = useCallback((event: globalThis.WheelEvent) => {
    if (event.deltaY === 0) return;
    event.preventDefault();
    const currentIndex = RANGE_PRESETS.indexOf(rangeView.preset);
    const nextIndex = Math.max(0, Math.min(RANGE_PRESETS.length - 1, currentIndex + (event.deltaY > 0 ? 1 : -1)));
    if (nextIndex === currentIndex) return;
    changeRangePreset(RANGE_PRESETS[nextIndex]);
  }, [changeRangePreset, rangeView.preset]);

  useEffect(() => {
    const select = rangeSelectRef.current;
    if (!select) return;
    select.addEventListener("wheel", handleRangeWheel, { passive: false });
    return () => select.removeEventListener("wheel", handleRangeWheel);
  }, [handleRangeWheel]);

  const panRange = useCallback((direction: -1 | 1) => {
    setRangeView((current) => {
      const currentDuration = Math.max(1, current.endMs - current.startMs);
      const shift = currentDuration * 0.8 * direction;
      const proposedEnd = current.endMs + shift;
      const nextEnd = Math.min(displayNowMs, proposedEnd);
      return { ...current, startMs: nextEnd - currentDuration, endMs: nextEnd, anchoredNow: false };
    });
  }, [displayNowMs]);

  const goCurrent = useCallback(() => {
    if (rangeView.preset === "all") {
      setRangeView({ preset: "all", ...allRange(displayNowMs), anchoredNow: true });
      return;
    }
    const duration = RANGE_DURATIONS[rangeView.preset];
    setRangeView({ preset: rangeView.preset, startMs: displayNowMs - duration, endMs: displayNowMs, anchoredNow: true });
  }, [allRange, displayNowMs, rangeView.preset]);

  const jumpCurrent = useCallback(() => {
    goCurrent();
    const target = remainingEntries[0]
      ? document.getElementById(`history-task-${remainingEntries[0].task.id}`)
      : historySurfaceRef.current;
    target?.scrollIntoView?.({ block: "start", inline: "nearest" });
  }, [goCurrent, remainingEntries]);

  const jumpHistory = useCallback(() => {
    const selectedCompleted = selectedEntry && !isRemaining(selectedEntry) ? selectedEntry.task.id : null;
    const target = selectedCompleted
      ? document.getElementById(`history-mark-${selectedCompleted}`)
      : completedPocketRoots[0]
        ? document.querySelector<HTMLElement>(`[data-pocket-id="${CSS.escape(completedPocketRoots[0].task.id)}"]`)
        : null;
    target?.scrollIntoView?.({ block: "start", inline: "nearest" });
  }, [completedPocketRoots, selectedEntry]);

  const fitSelected = useCallback((taskId: string) => {
    const entry = byId.get(taskId);
    if (!entry) return;
    const createdMs = Date.parse(entry.task.createdAt);
    if (!Number.isFinite(createdMs)) return;
    const isOpen = entry.task.state !== "completed";
    const completedMs = entry.task.completedAt ? Date.parse(entry.task.completedAt) : createdMs;
    const knownEnd = Math.min(displayNowMs, isOpen || !Number.isFinite(completedMs) ? displayNowMs : completedMs);
    const lifetime = Math.max(60 * 60 * 1000, knownEnd - createdMs);
    const padding = lifetime * 0.1;
    const minimumDuration = 60 * 60 * 1000;
    const startMs = Math.min(createdMs - padding, displayNowMs - minimumDuration);
    const endMs = Math.min(displayNowMs, Math.max(startMs + minimumDuration, isOpen ? displayNowMs : knownEnd + padding));
    setSelectedTaskId(taskId);
    setRangeView({ preset: rangeView.preset, startMs, endMs, anchoredNow: false });
  }, [byId, displayNowMs, rangeView.preset]);

  const loadForest = useCallback(async (restoreFocusId?: string) => {
    const hasCommittedForest = forestRef.current !== null;
    startTransition(() => { if (hasCommittedForest) setRefreshing(true); else setLoading(true); });
    setLoadError(null);
    try {
      const snapshot = await api.getTaskForest(FOREST_LIMIT);
      forestRef.current = snapshot;
      startTransition(() => {
        setForest(snapshot);
        setFocusReturnId(restoreFocusId ?? null);
      });
    } catch (reason) {
      setLoadError(normalizeDomainError(reason));
    } finally {
      startTransition(() => {
        setLoading(false);
        setRefreshing(false);
      });
    }
  }, [api]);

  const loadUndoStatus = useCallback(async () => {
    setUndoLoading(true);
    setUndoError(null);
    try {
      setUndoStatus(await api.getUndoStatus());
    } catch (reason) {
      // Undo status is a recovery affordance, not the source of truth for
      // the forest.  Preserve the last committed forest when this read fails.
      setUndoError(normalizeDomainError(reason));
    } finally {
      setUndoLoading(false);
    }
  }, [api]);

  const loadWorkspace = useCallback(async (restoreFocusId?: string) => {
    // Both reads are part of one refresh boundary. Each loader owns its
    // failure state so an unavailable undo receipt cannot erase committed UI.
    await Promise.all([loadForest(restoreFocusId), loadUndoStatus()]);
  }, [loadForest, loadUndoStatus]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const clearFeedback = useCallback(() => {
    setActionError(null);
    setNotice(null);
  }, []);

  const applyMutation = useCallback(async <T,>(key: string, action: () => Promise<T>, success: string, restoreFocusId?: string, onSuccess?: () => void, onError?: (error: DomainError) => void): Promise<T | undefined> => {
    if (pendingRef.current) return undefined;
    pendingRef.current = key;
    setActionError(null);
    setNotice(null);
    startTransition(() => {
      setPending(key);
    });
    try {
      const result = await action();
      setNotice(success);
      onSuccess?.();
      await loadWorkspace(restoreFocusId);
      return result;
    } catch (reason) {
      const error = normalizeDomainError(reason);
      setActionError(error);
      onError?.(error);
      if (error.code === "stale-hierarchy" || error.code === "version-conflict" || error.code === "stale-version" || error.code === "stale-undo" || error.code === "undo-not-available" || error.code === "undo-conflict") await loadWorkspace(restoreFocusId);
      return undefined;
    } finally {
      pendingRef.current = null;
      startTransition(() => setPending(null));
    }
  }, [loadWorkspace]);

  const submitTopLevel = useCallback(async (title: string): Promise<boolean> => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !forest) return false;
    const firstRawSiblingId = childrenOf(entries).at(0)?.task.id;
    const result = await applyMutation("create-top", () => api.createTaskInHierarchy(trimmedTitle, undefined, firstRawSiblingId, forest.hierarchyRevision, nowForApi(previewMode)), "タスクを追加しました");
    return Boolean(result);
  }, [api, applyMutation, entries, forest, previewMode]);

  const submitSubtask = useCallback(async (parentTaskId: string, title: string, returnFocusId: string): Promise<boolean> => {
    if (!title.trim() || !forest) return false;
    const firstRawSiblingId = childrenOf(entries, parentTaskId)[0]?.task.id;
    const result = await applyMutation(`create-child:${parentTaskId}`, () => api.createTaskInHierarchy(title, parentTaskId, firstRawSiblingId, forest.hierarchyRevision, nowForApi(previewMode)), "サブタスクを追加しました", returnFocusId);
    if (result) setCreateDraft(null);
    return Boolean(result);
  }, [api, applyMutation, entries, forest, previewMode]);

  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  const beginRename = useCallback((entry: HierarchyEntry) => {
    clearFeedback();
    renameSessionRef.current += 1;
    editingTaskIdRef.current = entry.task.id;
    editingTitleRef.current = entry.task.title;
    renameOutsideRequestRef.current = null;
    startTransition(() => setEditingTaskId(entry.task.id));
  }, [clearFeedback]);

  const saveRename = useCallback(async (entry: HierarchyEntry, requestedTitle = editingTitleRef.current, restoreFocusId: string | null = `title:${entry.task.id}`, sessionId = renameSessionRef.current): Promise<boolean> => {
    const trimmedTitle = requestedTitle.trim();
    if (trimmedTitle === entry.task.title) {
      if (editingTaskIdRef.current === entry.task.id && renameSessionRef.current === sessionId) setEditingTaskId(null);
      return true;
    }
    const result = await applyMutation(
      `rename:${entry.task.id}`,
      () => api.renameTask(entry.task.id, requestedTitle, entry.task.version, nowForApi(previewMode)),
      "名称を更新しました",
      restoreFocusId ?? undefined,
    );
    if (result && editingTaskIdRef.current === entry.task.id && renameSessionRef.current === sessionId) setEditingTaskId(null);
    return Boolean(result);
  }, [api, applyMutation, previewMode]);

  const requestOutsideRename = useCallback((entry: HierarchyEntry, requestedTitle: string, sessionId = renameSessionRef.current) => {
    const requestKey = `${sessionId}:${entry.task.id}`;
    if (renameOutsideRequestRef.current === requestKey) return;
    renameOutsideRequestRef.current = requestKey;
    void saveRename(entry, requestedTitle, null, sessionId).then((saved) => {
      if (!saved && editingTaskIdRef.current === entry.task.id && renameSessionRef.current === sessionId) renameOutsideRequestRef.current = null;
    });
  }, [saveRename]);

  useEffect(() => {
    if (!editingTaskId) return;
    const handleOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && renameFormRef.current?.contains(target)) return;
      const taskId = editingTaskIdRef.current;
      const entry = taskId ? byId.get(taskId) : undefined;
      if (!entry) return;
      requestOutsideRename(entry, editingTitleRef.current);
    };
    document.addEventListener("pointerdown", handleOutside, true);
    document.addEventListener("focusin", handleOutside, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside, true);
      document.removeEventListener("focusin", handleOutside, true);
    };
  }, [byId, editingTaskId, requestOutsideRename]);

  const complete = useCallback(async (entry: HierarchyEntry) => {
    await applyMutation(
      `complete:${entry.task.id}`,
      () => api.completeHierarchyTask(entry.task.id, entry.task.version, nowForApi(previewMode)),
      "完了にしました",
      `reopen:${entry.task.id}`,
      () => setSelectedTaskId(entry.task.id),
      (error) => {
        if (error.code !== "incomplete-descendants") return;
        const firstRemaining = descendantsOf(entries, entry.task.id).find(isRemaining);
        if (!firstRemaining) return;
        setCollapsed((current) => {
          const next = new Set(current);
          let parent = firstRemaining.parentTaskId;
          while (parent) { next.delete(parent); parent = byId.get(parent)?.parentTaskId; }
          return next;
        });
        setFocusReturnId(`complete:${firstRemaining.task.id}`);
      },
    );
  }, [api, applyMutation, byId, entries, previewMode]);

  const reopen = useCallback(async (entry: HierarchyEntry) => {
    await applyMutation(`reopen:${entry.task.id}`, () => api.reopenHierarchyTask(entry.task.id, entry.task.version, nowForApi(previewMode)), "NOWへ戻しました", `complete:${entry.task.id}`);
  }, [api, applyMutation, previewMode]);

  const deleteReturnFocusId = useCallback((entry: HierarchyEntry): string => {
    const siblings = projectedChildrenOf(entries, entry.parentTaskId);
    const index = siblings.findIndex((candidate) => candidate.task.id === entry.task.id);
    const next = siblings[index + 1] ?? siblings[index - 1];
    if (next) return isRemaining(next) ? `title:${next.task.id}` : `history-mark-${next.task.id}`;
    if (entry.parentTaskId) {
      const parent = byId.get(entry.parentTaskId);
      if (parent) return isRemaining(parent) ? `title:${parent.task.id}` : `history-mark-${parent.task.id}`;
    }
    return "top-task-title";
  }, [byId, entries]);

  const beginDelete = useCallback((entry: HierarchyEntry) => {
    if (pending || forest?.truncated) return;
    clearFeedback();
    setDeleteConfirm({ taskId: entry.task.id, originFocusId: `delete:${entry.task.id}`, successFocusId: deleteReturnFocusId(entry) });
  }, [clearFeedback, deleteReturnFocusId, forest?.truncated, pending]);

  const cancelDelete = useCallback(() => {
    const returnFocusId = deleteConfirm?.originFocusId;
    setDeleteConfirm(null);
    setFocusReturnId(returnFocusId ?? null);
  }, [deleteConfirm]);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm || !forest || pending) return;
    const entry = byId.get(deleteConfirm.taskId);
    if (!entry) {
      setDeleteConfirm(null);
      setFocusReturnId(deleteConfirm.originFocusId);
      return;
    }
    const result = await applyMutation(
      `delete:${entry.task.id}`,
      () => api.deleteTaskSubtree(entry.task.id, entry.task.version, forest.hierarchyRevision, nowForApi(previewMode)),
      `「${entry.task.title}」を削除しました`,
      deleteConfirm.successFocusId,
    );
    if (result) {
      setDeleteConfirm(null);
      if (selectedTaskId === entry.task.id || descendantsOf(entries, entry.task.id).some((candidate) => candidate.task.id === selectedTaskId)) setSelectedTaskId(null);
    }
  }, [api, applyMutation, byId, deleteConfirm, entries, forest, pending, previewMode, selectedTaskId]);

  const undo = useCallback(async () => {
    if (!undoStatus?.available || !undoStatus.operationToken || pending) return;
    const token = undoStatus.operationToken;
    const result = await applyMutation<ReversibleChangeResult>(
      `undo:${token}`,
      () => api.undoLastTaskOperation(token, nowForApi(previewMode)),
      "操作を元に戻しました",
      undefined,
    );
    if (result) setFocusReturnId(result.undoStatus.available && result.undoStatus.operationToken ? "undo-action" : "undo-receipt");
  }, [api, applyMutation, pending, previewMode, undoStatus]);

  const validatePlacement = useCallback((sourceId: string, placement: Placement): { valid: boolean; reason?: string; noOp?: boolean } => {
    const source = byId.get(sourceId);
    if (!source) return { valid: false, reason: "元のタスクが見つかりません" };
    if (placement.parentTaskId === sourceId || (placement.parentTaskId && descendantsOf(entries, sourceId).some((entry) => entry.task.id === placement.parentTaskId))) return { valid: false, reason: "自分自身や子孫の中には移動できません" };
    if (placement.parentTaskId) {
      const parent = byId.get(placement.parentTaskId);
      if (!parent) return { valid: false, reason: "親タスクが見つかりません" };
      if (!isRemaining(parent)) return { valid: false, reason: "完了済みの親には移動できません" };
    }
    if (placement.beforeTaskId) {
      const anchor = byId.get(placement.beforeTaskId);
      if (!anchor) return { valid: false, reason: "挿入先が見つかりません" };
      if (anchor.parentTaskId !== placement.parentTaskId) return { valid: false, reason: "兄弟の前にだけ配置できます" };
      if (anchor.task.id === sourceId || descendantsOf(entries, sourceId).some((entry) => entry.task.id === anchor.task.id)) return { valid: false, reason: "自身の配下には配置できません" };
    }
    const movingDepth = source.depth;
    const targetDepth = placement.parentTaskId ? (byId.get(placement.parentTaskId)?.depth ?? -1) + 1 : 0;
    const subtreeDepth = descendantsOf(entries, sourceId).reduce((max, entry) => Math.max(max, entry.depth - source.depth), 0);
    if (targetDepth + subtreeDepth > 8) return { valid: false, reason: "階層は8段までです" };
    if (placement.parentTaskId === source.parentTaskId && !placement.beforeTaskId) {
      const siblings = childrenOf(entries, source.parentTaskId);
      if (siblings[siblings.length - 1]?.task.id === sourceId) return { valid: true, noOp: true };
    }
    void movingDepth;
    return { valid: true };
  }, [byId, entries]);

  const stopAutoScroll = useCallback(() => {
    autoScrollDirectionRef.current = 0;
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  const updateAutoScroll = useCallback((clientY: number) => {
    const viewportHeight = Number.isFinite(window.innerHeight) && window.innerHeight > 0 ? window.innerHeight : 768;
    const pointerY = Number.isFinite(clientY) ? clientY : 0;
    const edge = Math.min(72, Math.max(44, viewportHeight * 0.12));
    const nextDirection: -1 | 0 | 1 = pointerY <= edge ? -1 : pointerY >= viewportHeight - edge ? 1 : 0;
    autoScrollDirectionRef.current = nextDirection;
    if (nextDirection === 0) {
      stopAutoScroll();
      return;
    }
    if (autoScrollFrameRef.current !== null) return;
    const tick = () => {
      if (autoScrollDirectionRef.current === 0) {
        autoScrollFrameRef.current = null;
        return;
      }
      window.scrollBy({ top: autoScrollDirectionRef.current * 12, behavior: "auto" });
      autoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }, [stopAutoScroll]);

  useEffect(() => {
    if (!dragState) return;
    const handleViewportLeave = () => stopAutoScroll();
    window.addEventListener("pointerleave", handleViewportLeave);
    return () => window.removeEventListener("pointerleave", handleViewportLeave);
  }, [dragState, stopAutoScroll]);

  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  const commitMove = useCallback(async (sourceId: string, placement: Placement, returnFocusId: string) => {
    if (!forest || forest.truncated) return;
    const validation = validatePlacement(sourceId, placement);
    if (!validation.valid) {
      setActionError({ code: "invalid-placement", message: validation.reason ?? "移動先が不正です" });
      setFocusReturnId(returnFocusId);
      return;
    }
    if (validation.noOp) {
      setFocusReturnId(returnFocusId);
      return;
    }
    await applyMutation(`move:${sourceId}`, () => api.moveTaskInHierarchy(sourceId, placement.parentTaskId, placement.beforeTaskId, forest.hierarchyRevision, nowForApi(previewMode)), "タスクを移動しました", returnFocusId);
  }, [api, applyMutation, forest, previewMode, validatePlacement]);

  const startPointerDrag = useCallback((event: PointerEvent<HTMLButtonElement>, entry: HierarchyEntry) => {
    if (pendingRef.current || pending || forest?.truncated) { event.preventDefault(); return; }
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* WebView/test shims may not expose capture. */ }
    setActionError(null);
    setDragState({ taskId: entry.task.id, pointerId: event.pointerId });
  }, [forest?.truncated, pending]);

  const updatePointerTarget = useCallback((event: PointerEvent<HTMLButtonElement>, entry: HierarchyEntry) => {
    if (!dragState || dragState.taskId !== entry.task.id || dragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    const pointed = typeof document.elementFromPoint === "function" ? document.elementFromPoint(event.clientX, event.clientY) : null;
    const target = pointed?.closest<HTMLElement>("[data-drop-target]") ?? null;
    if (target?.dataset.dropKind === "root") stopAutoScroll();
    else updateAutoScroll(event.clientY);
    const placement = placementFromDropTarget(target);
    setDragState((current) => {
      if (!current || current.taskId !== entry.task.id || current.pointerId !== event.pointerId) return current;
      // Keep the last deliberate destination while crossing a gap between
      // targets. A new seam/basin/root sill is the only thing that changes it.
      if (!target || !placement) return current;
      const currentKey = current.placement ? `${current.placement.parentTaskId ?? "root"}:${current.placement.beforeTaskId ?? "end"}` : "none";
      const nextKey = placement ? `${placement.parentTaskId ?? "root"}:${placement.beforeTaskId ?? "end"}` : "none";
      return currentKey === nextKey ? current : { ...current, placement: placement ?? undefined };
    });
  }, [dragState, stopAutoScroll, updateAutoScroll]);

  const finishPointerDrag = useCallback((event: PointerEvent<HTMLButtonElement>, entry: HierarchyEntry) => {
    if (!dragState || dragState.taskId !== entry.task.id || dragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    stopAutoScroll();
    const sourceId = dragState?.taskId;
    const placement = dragState.placement;
    setDragState(null);
    if (!sourceId) return;
    setFocusReturnId(`drag-handle:${sourceId}`);
    if (!placement) return;
    const validation = validatePlacement(sourceId, placement);
    if (!validation.valid) return;
    if (validation.noOp) return;
    void commitMove(sourceId, placement, `drag-handle:${sourceId}`);
  }, [commitMove, dragState, stopAutoScroll, validatePlacement]);

  const cancelDrag = useCallback((entry?: HierarchyEntry, pointerId?: number) => {
    if (entry && dragState && (dragState.taskId !== entry.task.id || (pointerId !== undefined && dragState.pointerId !== pointerId))) return;
    const sourceId = dragState?.taskId ?? entry?.task.id;
    stopAutoScroll();
    setDragState(null);
    if (sourceId) setFocusReturnId(`drag-handle:${sourceId}`);
  }, [dragState, stopAutoScroll]);

  const destinationsFor = useCallback((sourceId: string): Placement[] => {
    const source = byId.get(sourceId);
    const destinations: Placement[] = [{ label: "最上位の末尾", parentTaskId: undefined }];
    for (const entry of entries) {
      if (entry.task.id === sourceId) continue;
      destinations.push({ label: `${pathLabel(entry, byId)} の前`, parentTaskId: entry.parentTaskId, beforeTaskId: entry.task.id });
      if (isRemaining(entry)) destinations.push({ label: `${pathLabel(entry, byId)} の子の末尾`, parentTaskId: entry.task.id });
    }
    return destinations;
  }, [byId, entries, validatePlacement]);

  const beginKeyboardMove = useCallback((entry: HierarchyEntry) => {
    const destinations = destinationsFor(entry.task.id);
    setKeyboardMove({ taskId: entry.task.id, destinations, index: 0, returnFocusId: `move:${entry.task.id}` });
    clearFeedback();
  }, [clearFeedback, destinationsFor]);

  const cancelKeyboardMove = useCallback(() => {
    const returnFocusId = keyboardMove?.returnFocusId;
    setKeyboardMove(null);
    setFocusReturnId(returnFocusId ?? null);
  }, [keyboardMove]);

  const handleKeyboardMoveKeys = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!keyboardMove) return;
    if (event.key === "Escape") { event.preventDefault(); cancelKeyboardMove(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); setKeyboardMove((current) => current ? { ...current, index: Math.min(current.destinations.length - 1, current.index + 1) } : current); return; }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); setKeyboardMove((current) => current ? { ...current, index: Math.max(0, current.index - 1) } : current); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      const destination = keyboardMove.destinations[keyboardMove.index];
      if (!destination) return;
      const validation = validatePlacement(keyboardMove.taskId, destination);
      if (!validation.valid) {
        setActionError({ code: "invalid-placement", message: validation.reason ?? "移動先が不正です" });
        return;
      }
      setKeyboardMove(null);
      void commitMove(keyboardMove.taskId, destination, keyboardMove.returnFocusId);
    }
  }, [cancelKeyboardMove, commitMove, keyboardMove, validatePlacement]);

  const handleMainKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && deleteConfirm) { event.preventDefault(); cancelDelete(); return; }
    if (event.key === "Escape" && dragState) { event.preventDefault(); cancelDrag(); }
  }, [cancelDelete, cancelDrag, deleteConfirm, dragState]);

  const toggleCreateChild = useCallback((entry: HierarchyEntry) => {
    setCreateDraft((current) => current?.parentTaskId === entry.task.id ? null : { parentTaskId: entry.task.id, returnFocusId: `add-child:${entry.task.id}` });
    clearFeedback();
  }, [clearFeedback]);

  const cancelCreateChild = useCallback(() => setCreateDraft(null), []);

  const togglePocket = useCallback((taskId: string) => {
    setExpandedPockets((current) => { const next = new Set(current); if (next.has(taskId)) next.delete(taskId); else next.add(taskId); return next; });
  }, []);

  const renderCompletedDetail = (entry: HierarchyEntry): ReactElement => {
    return <div className="history-detail-row history-detail-row-local" data-local-detail-for={entry.task.id}>
      <div className="history-detail" aria-label={`${pathLabel(entry, byId)}の完了履歴詳細`} data-selected-readout={entry.task.id}>
        <div className="history-detail-summary">
          <strong>{entry.task.title}</strong>
          <span>{entry.task.completedAt ? `作成 ${formatExact(entry.task.createdAt)} → 完了 ${formatExact(entry.task.completedAt)}` : `作成 ${formatExact(entry.task.createdAt)} → 完了時刻なし`}</span>
        </div>
        <div className="history-detail-actions">
          <button type="button" className="quiet-action" aria-label={`${entry.task.title}をNOWへ戻す`} data-focus-id={`reopen:${entry.task.id}`} onClick={() => void reopen(entry)} disabled={pending !== null}>戻す</button>
          <button type="button" className="quiet-action delete-action" data-focus-id={`delete:${entry.task.id}`} onClick={() => beginDelete(entry)} disabled={pending !== null}>削除</button>
        </div>
      </div>
      <div className="now-hinge-cell" aria-hidden="true" />
    </div>;
  };

  const renderPocket = (entry: HierarchyEntry): ReactElement => {
    const members = [entry, ...descendantsOf(entries, entry.task.id).filter((candidate) => completedOnlyIds.has(candidate.task.id))];
    const selectedCompleted = selectedEntry && !isRemaining(selectedEntry) && members.some((member) => member.task.id === selectedEntry.task.id) ? selectedEntry : null;
    return <div key={`pocket:${entry.task.id}`} className={`tree-branch pocket-branch depth-${Math.min(entry.depth, 4)}`} data-task-id={entry.task.id} role="treeitem" aria-level={entry.depth + 1} aria-label={`${entry.task.title}の完了履歴 ${members.length}件`} aria-expanded={members.length > 3 ? expandedPockets.has(entry.task.id) : undefined} onFocusCapture={() => selectTask(entry.task.id)}>
      <div className="history-row pocket-row" data-row-id={`pocket:${entry.task.id}`}>
        <HistoryPocket root={entry} members={members} range={rangeView} nowMs={displayNowMs} expanded={expandedPockets.has(entry.task.id)} selectedTaskId={selectedTaskId} onSelect={selectTask} onToggle={togglePocket} />
        <div className="now-hinge-cell" aria-hidden="true" />
        <div className="pocket-right-spacer" aria-hidden="true" />
      </div>
      {selectedCompleted && renderCompletedDetail(selectedCompleted)}
      {selectedCompleted && deleteConfirm?.taskId === selectedCompleted.task.id && renderDeleteConfirmation(selectedCompleted)}
    </div>;
  };

  const renderDeleteConfirmation = (entry: HierarchyEntry): ReactElement | null => {
    if (deleteConfirm?.taskId !== entry.task.id) return null;
    const descendants = descendantsOf(entries, entry.task.id);
    const previewPaths = descendants.slice(0, 3).map((candidate) => pathLabel(candidate, byId));
    const otherCount = Math.max(0, descendants.length - previewPaths.length);
    const isPendingDelete = pending === `delete:${entry.task.id}`;
    return <div className={`delete-confirm ${isRemaining(entry) ? "delete-confirm-current" : "delete-confirm-completed"}`} data-delete-confirm={entry.task.id} role="group" aria-label={`${entry.task.title}の削除確認`}>
      <strong>{descendants.length === 0 ? `「${entry.task.title}」を削除します` : `「${entry.task.title}」と子孫${descendants.length}件を削除します`}</strong>
      <span>{descendants.length === 0 ? "タイムラインと通常履歴からも消えます。" : "子タスク・タイムライン・通常履歴からも消えます。"}</span>
      {previewPaths.length > 0 && <ul>{previewPaths.map((path) => <li key={path}>{path}</li>)}{otherCount > 0 && <li>その他 {otherCount}件</li>}</ul>}
      <div className="delete-confirm-actions">
        <button type="button" className="danger-action" data-focus-id={`delete-confirm:${entry.task.id}`} onClick={() => void confirmDelete()} disabled={pending !== null}>{isPendingDelete ? "削除中…" : "削除する"}</button>
        <button type="button" className="quiet-action" data-focus-id={`delete-cancel:${entry.task.id}`} onClick={cancelDelete} disabled={isPendingDelete}>キャンセル</button>
      </div>
    </div>;
  };

  const renderRow = (entry: HierarchyEntry): ReactElement => {
    const children = projectedChildrenOf(entries, entry.task.id);
    const remainingChildren = children.filter(isRemaining);
    const isCollapsed = collapsed.has(entry.task.id);
    const editing = editingTaskId === entry.task.id;
    const dropPlacement: Placement = { label: `${pathLabel(entry, byId)} の子の末尾`, parentTaskId: entry.task.id };
    const dropValidation = dragState ? validatePlacement(dragState.taskId, dropPlacement) : null;
    const beforePlacement: Placement = { label: `${entry.task.title} の前`, parentTaskId: entry.parentTaskId, beforeTaskId: entry.task.id };
    const beforeValidation = dragState ? validatePlacement(dragState.taskId, beforePlacement) : null;
    const isCurrentParent = Boolean(dragState?.placement && dragState.placement.parentTaskId === dropPlacement.parentTaskId && !dragState.placement.beforeTaskId);
    const isCurrentBefore = Boolean(dragState?.placement && dragState.placement.parentTaskId === beforePlacement.parentTaskId && dragState.placement.beforeTaskId === beforePlacement.beforeTaskId);
    const isCompleting = pending === `complete:${entry.task.id}`;
    const stateCueClass = entry.task.state === "active" ? "is-active" : entry.task.state === "paused" ? "is-paused" : "";
    return <div key={entry.task.id} id={`history-task-${entry.task.id}`} className={`tree-branch depth-${Math.min(entry.depth, 4)} ${isCollapsed ? "is-collapsed" : ""}`} data-task-id={entry.task.id} role="treeitem" aria-level={entry.depth + 1} aria-labelledby={`task-label-${entry.task.id}`} aria-describedby={`lifetime-description-${entry.task.id}`} aria-expanded={children.length > 0 ? !isCollapsed : undefined}>
      {dragState && <div className={`drop-seam ${isCurrentBefore ? "is-current" : ""} ${beforeValidation?.valid ? "" : "is-invalid"}`} data-drop-target={`before:${entry.task.id}`} data-drop-kind="before" data-drop-parent-id={entry.parentTaskId ?? ""} data-drop-before-id={entry.task.id} data-drop-label={beforePlacement.label} aria-label={`${entry.task.title} の前に配置`} aria-disabled={!beforeValidation?.valid}>
        <span aria-hidden={!isCurrentBefore}>{beforeValidation?.valid ? (dragState.taskId === entry.task.id ? "移動元" : "ここに挿入") : `⛔ ${beforeValidation?.reason}`}</span>
      </div>}
      <div className={`history-row task-row ${dragState?.taskId === entry.task.id ? "is-dragging" : ""} ${selectedTaskId === entry.task.id ? "is-selected" : ""} ${editing ? "is-editing" : ""} ${stateCueClass}`} data-row-id={entry.task.id} data-state={entry.task.state} onFocusCapture={() => selectTask(entry.task.id)}>
        <HistoryMark entry={entry} range={rangeView} nowMs={displayNowMs} selected={selectedTaskId === entry.task.id} onSelect={selectTask} onFit={fitSelected} />
        <div className={`now-hinge-cell ${isRemaining(entry) && rangeView.endMs < displayNowMs ? "is-discontinuous" : ""}`} aria-hidden="true">{isRemaining(entry) && rangeView.endMs < displayNowMs && <span>▷</span>}</div>
        <div className={`current-identity ${dragState ? `is-drop-target ${dropValidation?.valid ? "is-valid" : "is-invalid"} ${isCurrentParent ? "is-current" : ""}` : ""}`} data-drop-target={dragState ? `parent:${entry.task.id}` : undefined} data-drop-kind={dragState ? "parent" : undefined} data-drop-parent-id={dragState ? entry.task.id : undefined} data-drop-label={dragState ? dropPlacement.label : undefined} aria-label={dragState ? (dropValidation?.valid ? `${entry.task.title}の子の末尾に配置` : `${entry.task.title}には配置できません: ${dropValidation?.reason ?? "不正な移動先"}`) : undefined} aria-disabled={dragState ? !dropValidation?.valid : undefined}>
          {dragState && isCurrentParent && <span className="identity-drop-cue" aria-hidden="true">{dropValidation?.valid ? `└ ${entry.task.title} の子の末尾` : `⛔ ${dropValidation?.reason ?? "配置できません"}`}</span>}
          <span className="branch-rail" aria-hidden="true" />
          <button type="button" className="drag-handle" aria-label={`${entry.task.title}をドラッグして移動`} data-drag-handle="true" data-focus-id={`drag-handle:${entry.task.id}`} onPointerDown={(event) => startPointerDrag(event, entry)} onPointerMove={(event) => updatePointerTarget(event, entry)} onPointerUp={(event) => finishPointerDrag(event, entry)} onPointerCancel={(event) => cancelDrag(entry, event.pointerId)} onLostPointerCapture={() => cancelDrag(entry)} disabled={pending !== null || forest?.truncated}>⠿</button>
          {children.length > 0 ? <button type="button" className="disclosure" aria-label={`${entry.task.title}を${isCollapsed ? "展開" : "折りたたむ"}`} aria-expanded={!isCollapsed} onClick={() => toggleCollapse(entry.task.id)}>{isCollapsed ? "▸" : "▾"}</button> : <span className="disclosure-spacer" aria-hidden="true" />}
          <button type="button" className={`completion-box ${isCompleting ? "is-pending" : ""}`} data-focus-id={`complete:${entry.task.id}`} aria-label={isCompleting ? `${entry.task.title}を完了処理中` : `${entry.task.title}を完了にする`} onClick={() => void complete(entry)} disabled={pending !== null}><span className="completion-glyph" aria-hidden="true">{isCompleting ? "···" : "✓"}</span><span className="completion-intent" aria-hidden="true">{isCompleting ? "完了処理中" : "完了"}</span></button>
          <div className="task-copy">
            {editing ? <form ref={renameFormRef} className="rename-form" onBlur={(event) => { const next = event.relatedTarget; if (next instanceof Node && event.currentTarget.contains(next)) return; requestOutsideRename(entry, editingTitleRef.current); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditingTaskId(null); } }} onSubmit={(event) => { event.preventDefault(); void saveRename(entry); }}><input id={`task-label-${entry.task.id}`} aria-label={`${entry.task.title}の名前を変更`} defaultValue={entry.task.title} onChange={(event) => { editingTitleRef.current = event.currentTarget.value; }} autoFocus maxLength={240} /><button type="submit" disabled={pending !== null}>保存</button><button type="button" onClick={() => setEditingTaskId(null)}>取消</button></form> : <button id={`task-label-${entry.task.id}`} type="button" className="task-title" data-focus-id={`title:${entry.task.id}`} onDoubleClick={() => beginRename(entry)} onClick={() => beginRename(entry)}>{entry.task.title}</button>}
            <span className="task-meta"><span className={`state-dot state-${entry.task.state}`} aria-hidden="true" />{stateLabel(entry.task.state)}{children.length > 0 && <span className="child-count">子 {remainingChildren.length}/{children.length}</span>}</span>
          </div>
          <div className={`row-actions ${editing ? "is-suppressed" : ""}`} aria-hidden={editing || undefined}>
            <button type="button" className="quiet-action" data-focus-id={`add-child:${entry.task.id}`} onClick={() => toggleCreateChild(entry)} disabled={pending !== null}>＋子</button>
            <button type="button" className="quiet-action delete-action" data-focus-id={`delete:${entry.task.id}`} onClick={() => beginDelete(entry)} disabled={pending !== null}>削除</button>
          </div>
        </div>
      </div>
      {renderDeleteConfirmation(entry)}
      {createDraft?.parentTaskId === entry.task.id && <InlineSubtaskForm parentTaskId={entry.task.id} parentTitle={entry.task.title} returnFocusId={createDraft.returnFocusId} disabled={pending !== null} onSubmit={submitSubtask} onCancel={cancelCreateChild} />}
      {!isCollapsed && children.length > 0 && <div className="tree-children" role="group">{children.map(renderVisibleEntry)}</div>}
    </div>;
  };

  const renderVisibleEntry = (entry: HierarchyEntry): ReactElement => isRemaining(entry) ? renderRow(entry) : renderPocket(entry);

  return <div className="app-shell" data-preview={previewVariant ?? "tauri"}>
    {previewVariant && <p className="preview-strip" role="note">プレビュー: {previewVariant}</p>}
    <main className="work-surface" onKeyDown={handleMainKeyDown}>
      <header className="compact-topline">
        <div className="now-label sr-only"><span className="now-kicker">NOW</span><span className="now-count">{forest ? remainingCount : "…"}</span><span className="now-caption">残っている仕事</span></div>
        <TopCreateForm disabled={pending !== null} onSubmit={submitTopLevel} />
        <div className="range-controls" aria-label="ライフタイム時間軸の表示範囲">
          <label className="range-select"><span className="sr-only">範囲</span><select ref={rangeSelectRef} aria-label="時間範囲" value={rangeView.preset} onChange={(event) => changeRangePreset(event.target.value as RangePreset)}><option value="24h">24時間</option><option value="7d">7日</option><option value="30d">30日</option><option value="90d">90日</option><option value="all">全期間</option></select></label>
          <button type="button" className="range-action" title="前の表示範囲へ移動" aria-label="前へ" onClick={() => panRange(-1)} disabled={!forest}>‹</button>
          <button type="button" className="range-action" title="次の表示範囲へ移動" aria-label="次へ" onClick={() => panRange(1)} disabled={!forest}>›</button>
          <button type="button" className="range-action range-current" title="現在へ戻る" aria-label="現在へ" onClick={goCurrent} disabled={!forest} />
          <button type="button" className="range-action" aria-label="選択を表示" onClick={() => selectedEntry && fitSelected(selectedEntry.task.id)} disabled={!selectedEntry}>選択</button>
        </div>
        <button type="button" className="top-action" title="最新の状態を再読込" aria-label="再読込" onClick={() => void loadWorkspace()} disabled={loading || pending !== null}>↻</button>
      </header>
      <section className="undo-receipt" data-focus-id="undo-receipt" tabIndex={-1} aria-label="直前の操作を元に戻す" aria-live="polite">
        <div className="undo-receipt-left"><span className="undo-receipt-kicker sr-only">直前の操作</span></div>
        <div className="undo-receipt-hinge" aria-hidden="true" />
        <div className="undo-receipt-right">
          <span className="undo-receipt-label">{undoLoading ? "確認中…" : undoStatus?.available ? (undoStatus.label ?? "操作") : "元に戻せる操作はありません"}</span>
          {undoError && <span className="undo-receipt-error">{errorText(undoError)}</span>}
          {undoStatus?.available && undoStatus.operationToken && <button type="button" className="undo-action" data-focus-id="undo-action" onClick={() => void undo()} disabled={pending !== null || undoLoading || Boolean(undoError)}>{pending?.startsWith("undo:") ? "元に戻しています…" : "元に戻す"}</button>}
        </div>
      </section>
      {notice && <p className="feedback success" role="status">{notice}</p>}
      {actionError && <div className="feedback error" role="alert" aria-label="操作エラー"><strong>{errorText(actionError)}</strong>{actionError.code === "incomplete-descendants" && <span>未完了の子タスクへ移動して、完了後にもう一度お試しください。</span>}<button type="button" onClick={() => { setActionError(null); if (["stale-hierarchy", "version-conflict", "stale-version", "stale-undo", "undo-not-available", "undo-conflict"].includes(actionError.code)) void loadWorkspace(); }}>閉じる</button></div>}
      {refreshing && <p className="updating-marker" role="status">最新の状態を確認中…</p>}
      <p ref={liveStatusRef} className="sr-only" role="status" aria-live="polite">{pending ? "処理中です" : ""}</p>
      {loading && !forest && <div className="empty-state" role="status"><span className="loader-mark" aria-hidden="true">·</span><p>タスクを読み込み中…</p></div>}
      {!loading && loadError && !forest && <div className="empty-state error-state" role="alert"><strong>読み込めませんでした</strong><p>{errorText(loadError)}</p><button type="button" onClick={() => void loadWorkspace()}>再読込</button></div>}
      {!loading && loadError && forest && <div className="feedback error" role="alert"><strong>更新できませんでした</strong><span>{errorText(loadError)}</span><button type="button" onClick={() => void loadWorkspace()}>再試行</button></div>}
      {forest && <>
        <section ref={historySurfaceRef} className="history-surface" aria-labelledby="remaining-title">
          <h1 id="remaining-title" className="sr-only">NOW 残っている仕事</h1>
          <div ref={historyCompositeRef} className="history-composite" role="tree" tabIndex={0} aria-activedescendant={selectedTaskId ? (selectedEntry && isRemaining(selectedEntry) ? `history-task-${selectedTaskId}` : `history-mark-${selectedTaskId}`) : undefined} onKeyDown={handleHistoryKeyDown}>
            <TimelineRuler range={rangeView} nowMs={displayNowMs} remainingCount={remainingCount} completedCount={completedEntries.length} onCurrentJump={jumpCurrent} onHistoryJump={jumpHistory} />
            <p className="range-legend sr-only" aria-label="作成から現在または完了までの記録。作業時間・進捗率・予定ではありません">作成から現在／完了までの記録 · 作業時間・進捗率・予定ではありません</p>
            <p className="history-help sr-only">履歴を選ぶと、その直下に正確な時刻と操作を表示します。</p>
            {entries.length === 0 && <div className="history-empty-row"><div className="history-empty-history">履歴はありません</div><div className="now-hinge-cell" aria-hidden="true" /><div className="current-empty"><strong>現在のタスクはありません</strong><span>上の入力欄から追加できます。</span></div></div>}
            {projectedChildrenOf(entries).map(renderVisibleEntry)}
            {entries.length > 0 && remainingEntries.length === 0 && <div className="history-empty-row"><div className="history-empty-history">完了した履歴を表示中</div><div className="now-hinge-cell" aria-hidden="true" /><div className="current-empty"><strong>現在のタスクはありません</strong><span>上の入力欄から新しい仕事を追加できます。</span></div></div>}
          </div>
        </section>
        {dragState && (() => { const rootPlacement: Placement = { label: "最上位の末尾" }; const validation = validatePlacement(dragState.taskId, rootPlacement); const isCurrentRoot = Boolean(dragState.placement && !dragState.placement.parentTaskId && !dragState.placement.beforeTaskId); return <div className={`root-landing-sill ${validation.valid ? "is-valid" : "is-invalid"} ${isCurrentRoot ? "is-current" : ""}`} data-drop-target="root-end" data-drop-kind="root" data-drop-label={rootPlacement.label} aria-disabled={!validation.valid} aria-label={validation.valid ? "最上位の末尾に配置" : `最上位には配置できません: ${validation.reason ?? "不正な移動先"}`}>{validation.valid ? "最上位の末尾に配置" : `⛔ ${validation.reason ?? "配置できません"}`}</div>; })()}
        {forest?.truncated && <p className="limit-note">表示上限に達しています。安全のため移動操作を停止しています。</p>}
      </>}
      {/* Manual keyboard placement is intentionally unavailable in this UI. Pointer drag/drop remains available. */}
    </main>
  </div>;
}
