import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactElement } from "react";
import packageMetadata from "../package.json";
import { createFixtureTaskApi, previewVariantFromLocation, type PreviewVariant } from "./api/fixtureTaskApi";
import { createFixtureUpdateApi } from "./api/fixtureUpdateApi";
import { isTauriRuntime, TauriTaskApi } from "./api/tauriTaskApi";
import { TauriUpdateApi } from "./api/tauriUpdateApi";
import { isUpdateError, normalizeUpdateError, type UpdateApi, type UpdateCandidate, type UpdateError, type UpdateProgress } from "./api/updateApi";
import {
  type DomainError,
  type ActualHistorySummary,
  type HierarchyEntry,
  type ReversibleChangeResult,
  type TaskApi,
  type TaskForestSnapshot,
  type TaskSnapshot,
  type UndoStatus,
  normalizeDomainError,
} from "./api/types";
import {
  projectTaskDetailDisclosure,
  transitionTaskDetailDisclosure,
  type TaskDetailDisclosureIntent,
  type TaskDetailDisclosureState,
} from "./taskDetailDisclosure";
import {
  currentKeyboardTaskPlacementCandidate,
  initialKeyboardTaskPlacementState,
  transitionKeyboardTaskPlacement,
  type KeyboardTaskPlacementCandidate,
  type KeyboardTaskPlacementEffect,
  type KeyboardTaskPlacementState,
} from "./keyboardTaskPlacement";
import {
  createCompletedPocketWindow,
  projectCompletedPocketWindow,
  transitionCompletedPocketWindow,
  type CompletedPocketMember,
  type CompletedPocketWindowState,
} from "./completedPocketWindow";
import { UpdateReceipt, type UpdateReceiptState } from "./UpdateReceipt";
import "./index.css";

export type AppProps = { api?: TaskApi; updateApi?: UpdateApi; currentVersion?: string };
type CreateDraft = { parentTaskId: string; returnFocusId: string };
type Placement = { parentTaskId?: string; beforeTaskId?: string; label: string };
type DragState = { taskId: string; pointerId: number; placement?: Placement };
type DeleteConfirmation = { taskId: string; originFocusId: string; successFocusId: string };
type RangePreset = "24h" | "7d" | "30d" | "90d" | "all";
type RangeView = { preset: RangePreset; startMs: number; endMs: number; anchoredNow: boolean };
type ActualHistoryLoadState =
  | { status: "loading" }
  | { status: "ready"; summary: ActualHistorySummary }
  | { status: "error"; error: DomainError };

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
const MEMO_SCALAR_LIMIT = 4000;

function nextPreviewVersion(currentVersion: string): string {
  const [major = "0", minor = "0"] = currentVersion.replace(/^v/i, "").split(".");
  return `${Number(major) || 0}.${(Number(minor) || 0) + 1}.0`;
}

function previewUpdateRequested(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("update") === "available";
}

function updateFailure(error: unknown, fallbackCode: UpdateError["code"]): UpdateError {
  return isUpdateError(error)
    ? error
    : normalizeUpdateError(error, fallbackCode, "アプリの更新を完了できませんでした");
}

function requestUiFrame(callback: FrameRequestCallback): number {
  return typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => callback(Date.now()), 16);
}

function cancelUiFrame(handle: number): void {
  if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(handle);
  else window.clearTimeout(handle);
}

type MemoEditorState = {
  taskId: string;
  title: string;
  originFocusId: string;
  originLabel: string;
  baseVersion: number;
  initialMemo: string;
  draft: string;
  error: DomainError | null;
  reloadRequired: boolean;
  missing: boolean;
};

function memoScalarLength(value: string): number {
  return Array.from(value).length;
}

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

function formatActualDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}時間${minutes > 0 ? `${minutes}分` : ""}` : `${minutes}分`;
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
  ancestryPath?: string;
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
      <span className="ruler-side-label" aria-hidden="true">過去 / 履歴</span>
      <div className="ruler-ticks" aria-hidden="true">{ticks.map((tick, index) => <span key={`${tick.left}-${index}`} className="ruler-tick" style={{ left: `${tick.left}%` }}>{tick.label}</span>)}</div>
      <div className="range-bounds" aria-label={rangeLabel}><span>開始 {formatBounds(range.startMs)}</span><span>{range.anchoredNow ? "現在" : "終了"} {formatBounds(range.endMs)}</span></div>
    </div>
    <div className={`now-hinge-header ${nowIsBeyondPlot ? "is-discontinuous" : ""}`} aria-label="NOW" />
    <div className="identity-heading"><span className="identity-heading-title" aria-hidden="true">現在の仕事</span><span className="sr-only">現在のタスク。操作は右側から</span><div className="ruler-jumps"><button type="button" className="ruler-jump" aria-label={`現在のタスク ${remainingCount} 件へ移動`} onClick={onCurrentJump} disabled={remainingCount === 0}><span aria-hidden="true">現在 {remainingCount}</span></button><button type="button" className="ruler-jump" aria-label={`完了履歴 ${completedCount} 件へ移動`} onClick={onHistoryJump} disabled={completedCount === 0}><span aria-hidden="true">履歴 {completedCount}</span></button></div></div>
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
    <input id="top-task-title" data-focus-id="top-task-title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder="タスクを追加" maxLength={240} disabled={disabled} />
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

function HistoryMark({ entry, range, nowMs, selected, ancestryPath, onSelect, onFit }: HistoryMarkProps): ReactElement {
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
    {selected && ancestryPath && <span className="selected-ancestry-readout" data-ancestry-path={entry.task.id} tabIndex={0} title={ancestryPath} aria-label={`祖先を含む階層: ${ancestryPath}`}>階層 {ancestryPath}</span>}
    {selected && <span className="selected-lifetime-readout" data-lifetime-readout={entry.task.id}>
      {isRemainingTask
        ? `作成 ${formatExact(entry.task.createdAt)} → NOW ${formatExact(nowMs)}`
        : entry.task.completedAt
          ? `作成 ${formatExact(entry.task.createdAt)} → 完了 ${formatExact(entry.task.completedAt)}`
          : `作成 ${formatExact(entry.task.createdAt)} → 完了時刻なし`}
    </span>}
    <span className="sr-only" id={`lifetime-description-${entry.task.id}`}>{accessible}</span>
  </div>;
}

type HistoryPocketProps = {
  root: HierarchyEntry;
  members: HierarchyEntry[];
  range: RangeView;
  nowMs: number;
  expanded: boolean;
  windowState: CompletedPocketWindowState;
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onToggle: (taskId: string) => void;
  onLoadMore: () => void;
};

const COMPLETED_DISTRIBUTION_BUCKETS = 12;

function completedPocketDistribution(members: HierarchyEntry[], range: RangeView): number[] {
  const buckets = Array.from({ length: COMPLETED_DISTRIBUTION_BUCKETS }, () => 0);
  const span = Math.max(1, range.endMs - range.startMs);
  for (const member of members) {
    const createdMs = Date.parse(member.task.createdAt);
    const completedMs = member.task.completedAt ? Date.parse(member.task.completedAt) : createdMs;
    const timestamp = Number.isFinite(completedMs) ? completedMs : createdMs;
    const clamped = Math.min(range.endMs, Math.max(range.startMs, Number.isFinite(timestamp) ? timestamp : range.startMs));
    const position = (clamped - range.startMs) / span;
    const index = Math.min(COMPLETED_DISTRIBUTION_BUCKETS - 1, Math.max(0, Math.floor(position * COMPLETED_DISTRIBUTION_BUCKETS)));
    buckets[index] += 1;
  }
  return buckets;
}

function HistoryPocket({ root, members, range, nowMs, expanded, windowState, selectedTaskId, onSelect, onToggle, onLoadMore }: HistoryPocketProps): ReactElement {
  const rootLabel = `${root.task.title}の完了履歴 ${members.length}件`;
  const lanesId = `history-pocket-lanes-${root.task.id}`;
  const memberRecords = members.map((entry) => ({ id: entry.task.id, entry }));
  const projection = projectCompletedPocketWindow(memberRecords, windowState, selectedTaskId ?? undefined);
  const activeMemberId = projection.rendered.some(({ member }) => member.id === selectedTaskId) ? `history-member-row-${selectedTaskId}` : undefined;
  const distribution = completedPocketDistribution(members, range);
  const distributionPeak = Math.max(1, ...distribution);
  return <div className={`history-pocket ${expanded ? "is-expanded" : ""} ${members.some((entry) => entry.task.id === selectedTaskId) ? "is-selected" : ""}`} data-pocket-id={root.task.id}>
    <button id={`history-pocket-caption-${root.task.id}`} data-focus-id={`history-pocket-caption:${root.task.id}`} type="button" className="pocket-caption" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => onToggle(root.task.id)} aria-label={`${rootLabel}。${expanded ? `表示 ${projection.visiblePrefixCount}件。折りたたむ` : "期間分布を確認。展開"}`} aria-expanded={expanded} aria-controls={expanded ? lanesId : undefined}>
      <span className="pocket-caption-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      <span className="pocket-caption-title">{root.task.title}</span>
      <span className="pocket-caption-count">{members.length}件</span>
    </button>
    {!expanded && <div className="pocket-summary" role="img" aria-label={`${rootLabel}の期間分布`}>
      <span className="pocket-summary-kicker" aria-hidden="true">分布</span>
      <span className="pocket-summary-rail" aria-hidden="true">{distribution.map((count, index) => <span key={index} className="pocket-summary-bucket" data-bucket-count={count} style={{ left: `${(index / COMPLETED_DISTRIBUTION_BUCKETS) * 100}%`, height: `${Math.max(3, (count / distributionPeak) * 100)}%` }} />)}</span>
    </div>}
    {expanded && (
      <div id={lanesId} className="pocket-lanes" role="listbox" aria-label={rootLabel} aria-activedescendant={activeMemberId}>
        {projection.rendered.map(({ member, positionInSet, setSize, inclusion }) => {
          const entry = member.entry;
          const geometry = lifetimeGeometry(entry, range.startMs, range.endMs, nowMs);
          const position = geometry.kind === "before" ? 0 : geometry.kind === "after" ? 98 : geometry.left ?? 0;
          const width = geometry.kind === "interval" ? geometry.width ?? 0 : 0;
          const relativeDepth = Math.max(0, entry.depth - root.depth);
          const titleLeft = geometry.kind === "interval" ? Math.min(66, position + width + 2) : 4;
          const markerLabel = `${entry.task.title}。${timelineDescription(entry, nowMs)}`;
          return <div
            key={entry.task.id}
            id={`history-member-row-${entry.task.id}`}
            className={`pocket-member-row ${selectedTaskId === entry.task.id ? "is-selected" : ""}`}
            data-history-member-id={entry.task.id}
            data-pocket-inclusion={inclusion}
            data-depth={entry.depth}
            role="option"
            tabIndex={-1}
            aria-label={markerLabel}
            aria-selected={selectedTaskId === entry.task.id}
            aria-posinset={positionInSet}
            aria-setsize={setSize}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(entry.task.id)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onSelect(entry.task.id);
            }}
          >
            <div className="pocket-member-track" aria-hidden="true">
              <span id={`history-mark-${entry.task.id}`} className={`pocket-mark ${selectedTaskId === entry.task.id ? "is-selected" : ""} ${geometry.kind !== "interval" ? `is-${geometry.kind}` : ""} ${geometry.kind === "point" ? "is-closed" : ""} ${geometry.missingEnd ? "is-warning" : ""}`} data-history-mark={entry.task.id} data-timeline-cell={entry.task.id} data-start-ms={Date.parse(entry.task.createdAt)} data-end-ms={entry.task.completedAt ? Date.parse(entry.task.completedAt) : "missing"} style={{ left: `${position}%`, ...(geometry.kind === "interval" ? { width: `${width}%` } : {}) }}>{geometry.kind === "before" ? "◁" : geometry.kind === "after" ? "▷" : geometry.missingEnd ? "△" : geometry.kind === "point" ? "■" : "■"}</span>
              <span className="pocket-member-title" style={{ left: `${titleLeft}%`, paddingLeft: `${Math.min(relativeDepth, 8) * 10}px` }}><span className="pocket-member-branch">{relativeDepth > 0 ? "└" : "•"}</span>{entry.task.title}</span>
            </div>
          </div>;
        })}
        {projection.canLoadMore && <button type="button" className="pocket-more" onClick={onLoadMore} aria-label={`完了履歴をさらに${projection.nextBatchSize}件表示`}>さらに{projection.nextBatchSize}件表示</button>}
        <span className="pocket-window-status" role="status" aria-live="polite">表示 {projection.visiblePrefixCount} / 総 {projection.rendered.length + projection.omittedCount}件{projection.omittedCount > 0 ? `（残り${projection.omittedCount}件は未表示）` : ""}</span>
      </div>
    )}
  </div>;
}

function isRemaining(entry: HierarchyEntry): boolean {
  return entry.task.state !== "completed";
}

function boundedDepthOffset(depth: number): number {
  // Keep all nine supported depth cues distinct while reserving enough of the
  // narrow identity plane for a selected title.  The branch elbow still grows
  // through the same bounded CSS clamp, but remains subordinate to identity
  // even at the narrowest supported viewport.
  return Math.min(Math.max(depth, 0), 8) * 2 + 6;
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
    "invalid-memo": "メモは4,000 Unicodeスカラー以内で入力してください。",
    "invalid-effective-instant": "保存時刻が対象タスクの履歴境界より前です。",
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

/**
 * Keep the first completed entry as the durable before-anchor for the visible
 * end-of-current-work boundary. The mutation still receives the real hierarchy
 * scope and sibling id, so retained sibling order is never reconstructed.
 */
function firstCompletedSiblingOf(entries: HierarchyEntry[], parentTaskId?: string): HierarchyEntry | undefined {
  return projectedChildrenOf(entries, parentTaskId).find((entry) => !isRemaining(entry));
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
  if (kind === "root") return { label, beforeTaskId: target.dataset.dropBeforeId || undefined };
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
    if (!focusId || focusId.startsWith("drag-handle:")) return;
    const target = document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(focusId)}"]`);
    target?.focus({ preventScroll: true });
  }, [focusId]);
}

type MemoDialogProps = {
  editor: MemoEditorState;
  pending: boolean;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onReload: () => void;
  onRetry: () => void;
};

function MemoDialog({ editor, pending, onDraftChange, onSave, onCancel, onReload, onRetry }: MemoDialogProps): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scalarCount = memoScalarLength(editor.draft);
  const overLimit = scalarCount > MEMO_SCALAR_LIMIT;
  const staleOrMissing = editor.reloadRequired || editor.missing;
  const canRetryPersistence = editor.error?.code === "persistence-failure";

  useEffect(() => {
    textareaRef.current?.focus();
  }, [editor.taskId]);

  const trapFocus = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!pending) {
        event.preventDefault();
        onCancel();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled])") ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onCancel, pending]);

  const handleBackdropPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    // The selected direction deliberately treats the outside surface as an
    // inert boundary. It never silently saves or discards the draft.
    if (event.target === event.currentTarget) event.preventDefault();
  }, []);

  return <div className="memo-modal-backdrop" data-memo-modal="true" onPointerDown={handleBackdropPointerDown} onClick={handleBackdropPointerDown}>
    <div ref={dialogRef} className="memo-dock" role="dialog" aria-modal="true" aria-labelledby="memo-dialog-title" aria-describedby="memo-dialog-description" tabIndex={-1} onKeyDown={trapFocus}>
      <div className="memo-dock-header">
        <div className="memo-origin-cue" aria-hidden="true"><span>NOW</span><span className="memo-origin-arrow">→</span></div>
        <div className="memo-dock-heading">
          <span className="memo-dock-kicker">現在側のメモ</span>
          <h2 id="memo-dialog-title">{editor.title}のメモ</h2>
        </div>
        <span className="memo-origin-label">{editor.originLabel}</span>
      </div>
      <p id="memo-dialog-description" className="memo-dialog-description">{editor.originLabel}から開いています。内容は保存するまで変更されません。</p>
      <label className="memo-textarea-label" htmlFor="memo-dialog-textarea">メモ本文</label>
      <textarea
        ref={textareaRef}
        id="memo-dialog-textarea"
        className="memo-textarea"
        value={editor.draft}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        disabled={pending}
        autoComplete="off"
        spellCheck="false"
      />
      <div className={`memo-scalar-count ${overLimit ? "is-invalid" : ""}`} data-memo-scalar-count={scalarCount} data-memo-scalar-limit={MEMO_SCALAR_LIMIT} role="status" aria-live="polite">
        文字数 {scalarCount} / {MEMO_SCALAR_LIMIT}（残り {Math.max(0, MEMO_SCALAR_LIMIT - scalarCount)}）
      </div>
      {overLimit && <p className="memo-dialog-status is-error" role="alert"><span aria-hidden="true">!</span>メモは4,000 Unicodeスカラー以内で入力してください。</p>}
      {!overLimit && editor.error && <div id="memo-dialog-status" className="memo-dialog-status is-error" role="alert">
        <span>{errorText(editor.error)}</span>
        {staleOrMissing && <button type="button" className="memo-recovery-action" onClick={onReload} disabled={pending}>最新の状態を再読込</button>}
        {canRetryPersistence && <button type="button" className="memo-recovery-action" onClick={onRetry} disabled={pending}>再試行</button>}
      </div>}
      {pending && <p className="memo-dialog-status is-pending" role="status">保存中…</p>}
      <div className="memo-dialog-actions">
        <button type="button" className="quiet-action" onClick={onCancel} disabled={pending}>キャンセル</button>
        <button type="button" className="memo-save-action" onClick={onSave} disabled={pending || overLimit || staleOrMissing}>{pending ? "保存中…" : "保存"}</button>
      </div>
    </div>
  </div>;
}

export default function App({ api: injectedApi, updateApi: injectedUpdateApi, currentVersion = packageMetadata.version }: AppProps) {
  const previewVariant: PreviewVariant | undefined = previewVariantFromLocation();
  const previewMode = Boolean(previewVariant);
  const [api] = useState<TaskApi>(() => injectedApi ?? (isTauriRuntime() ? new TauriTaskApi() : createFixtureTaskApi(previewVariant ?? "empty")));
  const [updateApi] = useState<UpdateApi>(() => injectedUpdateApi ?? (isTauriRuntime()
    ? new TauriUpdateApi()
    : createFixtureUpdateApi({
      currentVersion,
      candidate: previewMode && previewUpdateRequested() ? {
        version: nextPreviewVersion(currentVersion),
        notes: "作業中のメモを保ったまま更新できるようになりました。\n\n更新の確認と再起動の流れを改善しています。",
        publishedAt: "2026-08-25T00:00:00.000Z",
      } : null,
      progress: [
        { phase: "download", receivedBytes: 0 },
        { phase: "download", receivedBytes: 38 * 1024 * 1024, totalBytes: 112 * 1024 * 1024 },
        { phase: "install", receivedBytes: 112 * 1024 * 1024, totalBytes: 112 * 1024 * 1024 },
      ],
    })));
  const [updateState, setUpdateState] = useState<UpdateReceiptState>({ status: "hidden" });
  const updateCheckStartedRef = useRef(false);
  const updateCheckPendingRef = useRef(false);
  const updateApplyPendingRef = useRef(false);
  const updateProgressFrameRef = useRef<number | null>(null);
  const latestUpdateProgressRef = useRef<UpdateProgress | null>(null);
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
  const [completedPocketWindows, setCompletedPocketWindows] = useState<Map<string, CompletedPocketWindowState>>(() => new Map());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [keyboardPlacement, setKeyboardPlacement] = useState<KeyboardTaskPlacementState>(initialKeyboardTaskPlacementState);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [memoEditor, setMemoEditor] = useState<MemoEditorState | null>(null);
  const memoEditorRef = useRef<MemoEditorState | null>(null);
  const memoReturnFocusRef = useRef<string | null>(null);
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
  const [disclosureState, setDisclosureState] = useState<TaskDetailDisclosureState>({});
  const [actualHistoryByTask, setActualHistoryByTask] = useState<Record<string, ActualHistoryLoadState>>({});
  const [forestLoadToken, setForestLoadToken] = useState(0);
  const actualHistoryCacheRef = useRef(new Map<string, ActualHistorySummary>());
  const actualHistoryRequestRef = useRef(new Map<string, number>());
  const actualHistoryEpochRef = useRef(0);

  const checkForApplicationUpdate = useCallback(async () => {
    if (updateCheckPendingRef.current || updateApplyPendingRef.current) return;
    updateCheckPendingRef.current = true;
    try {
      const candidate = await updateApi.checkForUpdate();
      setUpdateState((current) => {
        if (candidate) return { status: "available", candidate };
        return current.status === "hidden" ? current : { status: "hidden" };
      });
    } catch (error: unknown) {
      setUpdateState({ status: "failed", error: updateFailure(error, "check-failed") });
    } finally {
      updateCheckPendingRef.current = false;
    }
  }, [updateApi]);

  const applyApplicationUpdate = useCallback(async (candidate: UpdateCandidate) => {
    if (updateApplyPendingRef.current || updateCheckPendingRef.current) return;
    updateApplyPendingRef.current = true;
    latestUpdateProgressRef.current = null;
    setUpdateState({ status: "applying", candidate, progress: { phase: "download", receivedBytes: 0 } });
    try {
      await updateApi.applyUpdate(candidate, (progress) => {
        latestUpdateProgressRef.current = progress;
        if (progress.phase === "install") {
          if (updateProgressFrameRef.current !== null) cancelUiFrame(updateProgressFrameRef.current);
          updateProgressFrameRef.current = null;
          setUpdateState({ status: "applying", candidate, progress });
          return;
        }
        if (updateProgressFrameRef.current !== null) return;
        updateProgressFrameRef.current = requestUiFrame(() => {
          updateProgressFrameRef.current = null;
          const latest = latestUpdateProgressRef.current;
          if (latest) setUpdateState({ status: "applying", candidate, progress: latest });
        });
      });
      if (updateProgressFrameRef.current !== null) cancelUiFrame(updateProgressFrameRef.current);
      updateProgressFrameRef.current = null;
      setUpdateState({ status: "relaunching", candidate });
      try {
        await updateApi.relaunchApplication();
        setUpdateState({ status: "hidden" });
      } catch (error: unknown) {
        setUpdateState({ status: "failed", candidate, error: updateFailure(error, "relaunch-failed") });
      }
    } catch (error: unknown) {
      if (updateProgressFrameRef.current !== null) cancelUiFrame(updateProgressFrameRef.current);
      updateProgressFrameRef.current = null;
      setUpdateState({ status: "failed", candidate, error: updateFailure(error, "download-failed") });
    } finally {
      updateApplyPendingRef.current = false;
    }
  }, [updateApi]);

  useFocusRestoration(focusReturnId);

  useEffect(() => {
    if (updateCheckStartedRef.current) return;
    updateCheckStartedRef.current = true;
    void checkForApplicationUpdate();
  }, [checkForApplicationUpdate]);

  useEffect(() => () => {
    if (updateProgressFrameRef.current !== null) cancelUiFrame(updateProgressFrameRef.current);
  }, []);

  useEffect(() => { editingTaskIdRef.current = editingTaskId; }, [editingTaskId]);
  useEffect(() => { memoEditorRef.current = memoEditor; }, [memoEditor]);
  useEffect(() => {
    if (!memoEditor) return;
    document.body.classList.add("memo-modal-open");
    return () => document.body.classList.remove("memo-modal-open");
  }, [memoEditor]);
  useEffect(() => {
    if (memoEditor) return;
    const returnFocusId = memoReturnFocusRef.current;
    if (!returnFocusId) return;
    memoReturnFocusRef.current = null;
    document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(returnFocusId)}"]`)?.focus();
  }, [memoEditor]);
  useLayoutEffect(() => {
    if (keyboardPlacement.phase === "choosing" || keyboardPlacement.phase === "submitting") {
      keyboardPlacementRef.current?.focus({ preventScroll: true });
    }
  }, [keyboardPlacement.phase]);

  useEffect(() => {
    if (!deleteConfirm) return;
    // Confirmation is deliberately non-destructive on entry.  Keeping focus
    // on the stable cancel action also makes Esc and screen-reader recovery
    // predictable while the inline scope is open.
    document.querySelector<HTMLElement>(`[data-focus-id="delete-cancel:${CSS.escape(deleteConfirm.taskId)}"]`)?.focus({ preventScroll: true });
  }, [deleteConfirm]);

  useLayoutEffect(() => {
    if (
      (keyboardPlacement.phase !== "idle" && keyboardPlacement.phase !== "failed") ||
      !focusReturnId?.startsWith("drag-handle:")
      || pending !== null
      || pendingRef.current !== null
      || loading
      || refreshing
    ) return;
    const target = document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(focusReturnId)}"]`);
    if (!target) return;
    target.focus({ preventScroll: true });
    setFocusReturnId((current) => current === focusReturnId ? null : current);
  }, [focusReturnId, keyboardPlacement.phase, loading, pending, refreshing, forest]);

  useEffect(() => {
    if (previewMode) return;
    const timer = window.setInterval(() => setDisplayNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [previewMode]);

  const entries = forest?.entries ?? [];
  const byId = useMemo(() => parentMap(entries), [entries]);
  const availableTaskIds = useMemo<ReadonlySet<string>>(() => new Set(entries.map((entry) => entry.task.id)), [entries]);
  const selectedTaskId = disclosureState.selectedTaskId ?? null;
  const remainingEntries = useMemo(() => entries.filter(isRemaining), [entries]);
  const completedEntries = useMemo(() => entries.filter((entry) => !isRemaining(entry)), [entries]);
  const remainingCount = remainingEntries.length;
  const selectedEntry = selectedTaskId ? byId.get(selectedTaskId) : undefined;
  const completedOnlyIds = useMemo(() => new Set(completedEntries.filter((entry) => !containsRemainingDescendant(entries, entry.task.id)).map((entry) => entry.task.id)), [completedEntries, entries]);
  const completedPocketRoots = useMemo(() => completedEntries.filter((entry) => completedOnlyIds.has(entry.task.id) && (!entry.parentTaskId || !completedOnlyIds.has(entry.parentTaskId))), [completedEntries, completedOnlyIds]);
  const membersForPocket = useCallback((rootTaskId: string): HierarchyEntry[] => {
    const root = completedPocketRoots.find((candidate) => candidate.task.id === rootTaskId);
    return root ? [root, ...descendantsOf(entries, root.task.id).filter((candidate) => completedOnlyIds.has(candidate.task.id))] : [];
  }, [completedOnlyIds, completedPocketRoots, entries]);

  useEffect(() => {
    setCompletedPocketWindows((current) => {
      const next = new Map<string, CompletedPocketWindowState>();
      let changed = current.size !== completedPocketRoots.length;
      for (const root of completedPocketRoots) {
        const members = membersForPocket(root.task.id);
        const existing = current.get(root.task.id);
        if (!existing) {
          changed = true;
          continue;
        }
        const reconciled = transitionCompletedPocketWindow(existing, { type: "reconcile" }, members.length);
        next.set(root.task.id, reconciled);
        changed = changed || reconciled !== existing;
      }
      if (!changed) return current;
      return next;
    });
  }, [completedPocketRoots, membersForPocket]);
  const selectedCompletedPocket = useMemo(() => {
    if (!selectedEntry || isRemaining(selectedEntry)) return undefined;
    return completedPocketRoots.find((candidate) => candidate.task.id === selectedEntry.task.id || descendantsOf(entries, candidate.task.id).some((entry) => entry.task.id === selectedEntry.task.id));
  }, [completedPocketRoots, entries, selectedEntry]);
  const activeHistoryDescendantId = selectedTaskId
    ? selectedEntry && isRemaining(selectedEntry)
      ? `history-task-${selectedTaskId}`
      : selectedCompletedPocket
        ? expandedPockets.has(selectedCompletedPocket.task.id) ? `history-member-row-${selectedTaskId}` : `history-pocket-caption-${selectedCompletedPocket.task.id}`
        : undefined
    : undefined;
  const selectedCompletedDetailId = selectedEntry && !isRemaining(selectedEntry) && selectedCompletedPocket && expandedPockets.has(selectedCompletedPocket.task.id)
    ? selectedEntry.task.id
    : null;

  // The adapter is the only owner of stable disclosure state.  Expansion is
  // still presentation-only and remains alongside the existing tree/pocket
  // behavior; it is deliberately not folded into the capability state.
  const applyDisclosureIntent = useCallback((intent: TaskDetailDisclosureIntent) => {
    setDisclosureState((current) => transitionTaskDetailDisclosure(current, intent, availableTaskIds));
  }, [availableTaskIds]);

  useEffect(() => {
    if (!forest) return;
    setDisclosureState((current) => transitionTaskDetailDisclosure(current, { type: "reconcile" }, availableTaskIds));
  }, [availableTaskIds, forest]);

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

  const revealTask = useCallback((taskId: string, intentType: "select" | "focus") => {
    applyDisclosureIntent({ type: intentType, taskId });
    if (!availableTaskIds.has(taskId)) return;
    startTransition(() => {
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
      setExpandedPockets((current) => new Set(current).add(pocket.task.id));
      setCompletedPocketWindows((current) => {
        if (current.has(pocket.task.id)) return current;
        const next = new Map(current);
        next.set(pocket.task.id, createCompletedPocketWindow(membersForPocket(pocket.task.id).length));
        return next;
      });
    });
  }, [applyDisclosureIntent, availableTaskIds, byId, completedPocketRoots, entries, expandedPockets, membersForPocket]);
  const selectTask = useCallback((taskId: string) => revealTask(taskId, "select"), [revealTask]);
  const focusTask = useCallback((taskId: string) => revealTask(taskId, "focus"), [revealTask]);
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
      ? document.getElementById(`history-member-row-${selectedCompleted}`) ?? (selectedCompletedPocket ? document.getElementById(`history-pocket-caption-${selectedCompletedPocket.task.id}`) : null)
      : completedPocketRoots[0]
        ? document.querySelector<HTMLElement>(`[data-pocket-id="${CSS.escape(completedPocketRoots[0].task.id)}"]`)
        : null;
    target?.scrollIntoView?.({ block: "start", inline: "nearest" });
  }, [completedPocketRoots, selectedCompletedPocket, selectedEntry]);

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
    selectTask(taskId);
    setRangeView({ preset: rangeView.preset, startMs, endMs, anchoredNow: false });
  }, [byId, displayNowMs, rangeView.preset, selectTask]);

  const invalidateActualHistory = useCallback(() => {
    actualHistoryEpochRef.current += 1;
    actualHistoryCacheRef.current.clear();
    actualHistoryRequestRef.current.clear();
    setActualHistoryByTask({});
  }, []);

  const loadForest = useCallback(async (restoreFocusId?: string) => {
    invalidateActualHistory();
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
      setForestLoadToken((current) => current + 1);
    } catch (reason) {
      setLoadError(normalizeDomainError(reason));
    } finally {
      startTransition(() => {
        setLoading(false);
        setRefreshing(false);
      });
    }
  }, [api, invalidateActualHistory]);

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

  const loadActualHistory = useCallback((taskId: string, force = false) => {
    const cached = actualHistoryCacheRef.current.get(taskId);
    if (!force && cached) {
      setActualHistoryByTask((current) => ({ ...current, [taskId]: { status: "ready", summary: cached } }));
      return;
    }
    const epoch = actualHistoryEpochRef.current;
    const requestId = (actualHistoryRequestRef.current.get(taskId) ?? 0) + 1;
    actualHistoryRequestRef.current.set(taskId, requestId);
    setActualHistoryByTask((current) => ({ ...current, [taskId]: { status: "loading" } }));
    void api.getTaskActualHistory(taskId).then((summary) => {
      if (actualHistoryEpochRef.current !== epoch || actualHistoryRequestRef.current.get(taskId) !== requestId) return;
      const currentForest = forestRef.current;
      if (currentForest && summary.sourceRevision !== currentForest.sourceRevision) {
        setActualHistoryByTask((current) => ({ ...current, [taskId]: { status: "error", error: { code: "version-conflict", message: "一覧が更新されています。再読込してからもう一度お試しください。" } } }));
        return;
      }
      actualHistoryCacheRef.current.set(taskId, summary);
      setActualHistoryByTask((current) => ({ ...current, [taskId]: { status: "ready", summary } }));
    }).catch((reason) => {
      if (actualHistoryEpochRef.current !== epoch || actualHistoryRequestRef.current.get(taskId) !== requestId) return;
      setActualHistoryByTask((current) => ({ ...current, [taskId]: { status: "error", error: normalizeDomainError(reason) } }));
    });
  }, [api]);

  useEffect(() => {
    if (!selectedCompletedDetailId || !forest) return;
    loadActualHistory(selectedCompletedDetailId);
  }, [forest, forestLoadToken, loadActualHistory, selectedCompletedDetailId]);

  const clearFeedback = useCallback(() => {
    setActionError(null);
    setNotice(null);
  }, []);

  const openMemo = useCallback((entry: HierarchyEntry) => {
    if (pendingRef.current) return;
    clearFeedback();
    const next: MemoEditorState = {
      taskId: entry.task.id,
      title: entry.task.title,
      originFocusId: `memo:${entry.task.id}`,
      originLabel: isRemaining(entry) ? "NOW / 現在側" : "履歴 / 現在側",
      baseVersion: entry.task.version,
      initialMemo: entry.task.memo,
      draft: entry.task.memo,
      error: null,
      reloadRequired: false,
      missing: false,
    };
    memoEditorRef.current = next;
    setMemoEditor(next);
    setFocusReturnId(null);
  }, [clearFeedback]);

  const closeMemo = useCallback(() => {
    const current = memoEditorRef.current;
    if (!current) return;
    memoReturnFocusRef.current = current.originFocusId;
    memoEditorRef.current = null;
    setMemoEditor(null);
    setFocusReturnId(current.originFocusId);
  }, []);

  const changeMemoDraft = useCallback((draft: string) => {
    setMemoEditor((current) => {
      if (!current) return current;
      const next = { ...current, draft };
      memoEditorRef.current = next;
      return next;
    });
  }, []);

  const saveMemo = useCallback(async () => {
    const current = memoEditorRef.current;
    if (!current || pendingRef.current) return;
    if (memoScalarLength(current.draft) > MEMO_SCALAR_LIMIT || current.reloadRequired || current.missing) return;
    if (current.draft === current.initialMemo) {
      closeMemo();
      return;
    }
    const key = `memo:${current.taskId}`;
    pendingRef.current = key;
    setPending(key);
    setActionError(null);
    setMemoEditor((value) => {
      if (!value) return value;
      const next = { ...value, error: null };
      memoEditorRef.current = next;
      return next;
    });
    try {
      await api.updateTaskMemo(current.taskId, current.draft, current.baseVersion, nowForApi(previewMode));
      invalidateActualHistory();
      await loadWorkspace();
      setNotice("メモを更新しました");
      closeMemo();
    } catch (reason) {
      const error = normalizeDomainError(reason);
      const reloadRequired = error.code === "stale-version" || error.code === "version-conflict" || error.code === "task-not-found";
      setMemoEditor((value) => {
        if (!value || value.taskId !== current.taskId) return value;
        const next = { ...value, error, reloadRequired, missing: error.code === "task-not-found" };
        memoEditorRef.current = next;
        return next;
      });
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
  }, [api, closeMemo, invalidateActualHistory, loadWorkspace, previewMode]);

  const reloadMemo = useCallback(async () => {
    const current = memoEditorRef.current;
    if (!current || pendingRef.current) return;
    const key = `memo-reload:${current.taskId}`;
    pendingRef.current = key;
    setPending(key);
    setMemoEditor((value) => {
      if (!value) return value;
      const next = { ...value, error: null };
      memoEditorRef.current = next;
      return next;
    });
    try {
      await loadWorkspace();
      const refreshed = forestRef.current?.entries.find((entry) => entry.task.id === current.taskId);
      if (!refreshed) {
        const error: DomainError = { code: "task-not-found", message: "対象が現在の一覧にありません。変更はありません" };
        setMemoEditor((value) => {
          if (!value || value.taskId !== current.taskId) return value;
          const next = { ...value, error, reloadRequired: true, missing: true };
          memoEditorRef.current = next;
          return next;
        });
      } else {
        setMemoEditor((value) => {
          if (!value || value.taskId !== current.taskId) return value;
          const next = {
            ...value,
            title: refreshed.task.title,
            baseVersion: refreshed.task.version,
            initialMemo: refreshed.task.memo,
            error: null,
            reloadRequired: false,
            missing: false,
          };
          memoEditorRef.current = next;
          return next;
        });
      }
    } catch (reason) {
      const error = normalizeDomainError(reason);
      setMemoEditor((value) => {
        if (!value || value.taskId !== current.taskId) return value;
        const next = { ...value, error };
        memoEditorRef.current = next;
        return next;
      });
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
  }, [loadWorkspace]);

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
      invalidateActualHistory();
      setNotice(success);
      await loadWorkspace(restoreFocusId);
      onSuccess?.();
      return result;
    } catch (reason) {
      const error = normalizeDomainError(reason);
      setActionError(error);
      if (error.code === "stale-hierarchy" || error.code === "version-conflict" || error.code === "stale-version" || error.code === "stale-undo" || error.code === "undo-not-available" || error.code === "undo-conflict") await loadWorkspace(restoreFocusId);
      onError?.(error);
      return undefined;
    } finally {
      pendingRef.current = null;
      startTransition(() => setPending(null));
    }
  }, [invalidateActualHistory, loadWorkspace]);

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
      `history-pocket-caption:${entry.task.id}`,
      () => selectTask(entry.task.id),
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
  }, [api, applyMutation, byId, entries, previewMode, selectTask]);

  const reopen = useCallback(async (entry: HierarchyEntry) => {
    await applyMutation(`reopen:${entry.task.id}`, () => api.reopenHierarchyTask(entry.task.id, entry.task.version, nowForApi(previewMode)), "NOWへ戻しました", `complete:${entry.task.id}`);
  }, [api, applyMutation, previewMode]);

  const deleteReturnFocusId = useCallback((entry: HierarchyEntry): string => {
    const deletedIds = new Set([entry, ...descendantsOf(entries, entry.task.id)].map((candidate) => candidate.task.id));
    const pocketRootByTaskId = new Map<string, HierarchyEntry>();
    for (const pocketRoot of completedPocketRoots) {
      for (const member of membersForPocket(pocketRoot.task.id)) pocketRootByTaskId.set(member.task.id, pocketRoot);
    }

    const isTreeVisible = (candidate: HierarchyEntry): boolean => {
      let parentId = candidate.parentTaskId;
      while (parentId) {
        if (collapsed.has(parentId)) return false;
        parentId = byId.get(parentId)?.parentTaskId;
      }
      return true;
    };

    const focusForCandidate = (candidate: HierarchyEntry): string | null => {
      if (deletedIds.has(candidate.task.id)) return null;
      if (isRemaining(candidate)) return isTreeVisible(candidate) ? `title:${candidate.task.id}` : null;
      const pocketRoot = pocketRootByTaskId.get(candidate.task.id);
      if (!pocketRoot || deletedIds.has(pocketRoot.task.id) || !isTreeVisible(pocketRoot)) return null;
      return `history-pocket-caption:${pocketRoot.task.id}`;
    };

    const entryPocketRoot = !isRemaining(entry) ? pocketRootByTaskId.get(entry.task.id) : undefined;
    // A completed member is represented by a single stable pocket caption;
    // its individual mark may be outside the 40-item window or be removed
    // together with a descendant subtree.
    if (entryPocketRoot && entryPocketRoot.task.id !== entry.task.id) return `history-pocket-caption:${entryPocketRoot.task.id}`;

    const entryIndex = entries.findIndex((candidate) => candidate.task.id === entry.task.id);
    if (entryIndex >= 0) {
      for (let index = entryIndex + 1; index < entries.length; index += 1) {
        const focusId = focusForCandidate(entries[index]);
        if (focusId) return focusId;
      }
      for (let index = entryIndex - 1; index >= 0; index -= 1) {
        const focusId = focusForCandidate(entries[index]);
        if (focusId) return focusId;
      }
    }
    return "top-task-title";
  }, [byId, collapsed, completedPocketRoots, entries, membersForPocket]);

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
      if (selectedTaskId === entry.task.id || descendantsOf(entries, entry.task.id).some((candidate) => candidate.task.id === selectedTaskId)) {
        applyDisclosureIntent({ type: "reset" });
      }
    } else {
      // A persistence failure leaves the last committed forest in place. Close
      // the transient confirmation and return to its stable origin so the
      // error readout cannot strand focus in a removed overlay.
      setDeleteConfirm(null);
      setFocusReturnId(deleteConfirm.originFocusId);
    }
  }, [api, applyMutation, applyDisclosureIntent, byId, deleteConfirm, entries, forest, pending, previewMode, selectedTaskId]);

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

  const destinationsFor = useCallback((sourceId: string): KeyboardTaskPlacementCandidate[] => {
    const candidates: KeyboardTaskPlacementCandidate[] = [];
    const add = (id: string, placement: Placement) => {
      const validation = validatePlacement(sourceId, placement);
      candidates.push({
        id,
        targetParentId: placement.parentTaskId,
        beforeTaskId: placement.beforeTaskId,
        valid: validation.valid,
        reason: validation.valid ? undefined : validation.reason ?? "移動先が不正です",
        // The label is presentation-only metadata retained by the adapter.
        ...(placement.label ? { label: placement.label } : {}),
      } as KeyboardTaskPlacementCandidate);
    };

    const firstCompletedAtRoot = firstCompletedSiblingOf(entries);
    add(
      `root:${firstCompletedAtRoot?.task.id ?? "append"}`,
      firstCompletedAtRoot
        ? { label: "最上位の末尾（完了履歴の前）", beforeTaskId: firstCompletedAtRoot.task.id }
        : { label: "最上位の末尾" },
    );

    for (const entry of entries) {
      if (!isRemaining(entry) || entry.task.id === sourceId) continue;
      add(`before:${entry.task.id}`, { label: `${pathLabel(entry, byId)} の前`, parentTaskId: entry.parentTaskId, beforeTaskId: entry.task.id });
      const firstCompleted = firstCompletedSiblingOf(entries, entry.task.id);
      add(
        `parent:${entry.task.id}:${firstCompleted?.task.id ?? "append"}`,
        firstCompleted
          ? {
          label: `${pathLabel(entry, byId)} の子の末尾（完了履歴の前）`,
          parentTaskId: entry.task.id,
          beforeTaskId: firstCompleted.task.id,
            }
          : { label: `${pathLabel(entry, byId)} の子の末尾`, parentTaskId: entry.task.id },
      );
    }
    return candidates;
  }, [byId, entries, validatePlacement]);

  const submitKeyboardPlacement = useCallback(async (placement: { sourceTaskId: string; targetParentId?: string; beforeTaskId?: string }) => {
    const returnFocusId = `drag-handle:${placement.sourceTaskId}`;
    const asPlacement: Placement = {
      label: "選択した移動先",
      parentTaskId: placement.targetParentId,
      beforeTaskId: placement.beforeTaskId,
    };
    if (!forest || forest.truncated) {
      setKeyboardPlacement((current) => transitionKeyboardTaskPlacement(current, { type: "failure", failure: { message: "一覧が完全に読み込まれていないため移動できません" } }).state);
      setFocusReturnId(returnFocusId);
      return;
    }
    const validation = validatePlacement(placement.sourceTaskId, asPlacement);
    if (!validation.valid) {
      setKeyboardPlacement((current) => transitionKeyboardTaskPlacement(current, { type: "failure", failure: { message: validation.reason ?? "移動先が不正です" } }).state);
      setFocusReturnId(returnFocusId);
      return;
    }
    if (validation.noOp) {
      setKeyboardPlacement((current) => transitionKeyboardTaskPlacement(current, { type: "success" }).state);
      setFocusReturnId(returnFocusId);
      return;
    }
    await applyMutation(
      `move:${placement.sourceTaskId}`,
      () => api.moveTaskInHierarchy(placement.sourceTaskId, placement.targetParentId, placement.beforeTaskId, forest.hierarchyRevision, nowForApi(previewMode)),
      "タスクを移動しました",
      returnFocusId,
      () => {
        setKeyboardPlacement((current) => transitionKeyboardTaskPlacement(current, { type: "success" }).state);
        setFocusReturnId(returnFocusId);
      },
      (error) => {
        setKeyboardPlacement((current) => transitionKeyboardTaskPlacement(current, { type: "failure", failure: { message: error.message } }).state);
        setFocusReturnId(returnFocusId);
      },
    );
  }, [api, applyMutation, forest, previewMode, validatePlacement]);

  const dispatchKeyboardPlacement = useCallback((intent: Parameters<typeof transitionKeyboardTaskPlacement>[1]) => {
    const transition = transitionKeyboardTaskPlacement(keyboardPlacement, intent);
    setKeyboardPlacement(transition.state);
    const effect: KeyboardTaskPlacementEffect | undefined = transition.effect;
    if (effect?.type === "focus-return") setFocusReturnId(effect.returnFocusId);
    if (effect?.type === "submit-placement") void submitKeyboardPlacement(effect.placement);
  }, [keyboardPlacement, submitKeyboardPlacement]);

  const beginKeyboardMove = useCallback((entry: HierarchyEntry) => {
    const destinations = destinationsFor(entry.task.id);
    clearFeedback();
    setFocusReturnId(null);
    setKeyboardPlacement(transitionKeyboardTaskPlacement(initialKeyboardTaskPlacementState, {
      type: "begin",
      sourceTaskId: entry.task.id,
      candidates: destinations,
      returnFocusId: `drag-handle:${entry.task.id}`,
    }).state);
  }, [clearFeedback, destinationsFor]);

  const handleKeyboardMoveKeys = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardPlacement.phase === "idle") return;
    if (event.key === "Escape") { event.preventDefault(); dispatchKeyboardPlacement({ type: "cancel" }); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); dispatchKeyboardPlacement({ type: "navigate", direction: "next" }); return; }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); dispatchKeyboardPlacement({ type: "navigate", direction: "previous" }); return; }
    if (event.key === "Enter") { event.preventDefault(); dispatchKeyboardPlacement({ type: "confirm" }); }
  }, [dispatchKeyboardPlacement, keyboardPlacement.phase]);

  const keyboardCandidateLabel = useCallback((candidate: KeyboardTaskPlacementCandidate): string => {
    const label = (candidate as KeyboardTaskPlacementCandidate & { label?: string }).label;
    if (label) return label;
    const anchor = candidate.beforeTaskId ? byId.get(candidate.beforeTaskId) : candidate.targetParentId ? byId.get(candidate.targetParentId) : undefined;
    if (anchor) return `${pathLabel(anchor, byId)}${candidate.beforeTaskId ? " の前" : " の子の末尾"}`;
    return candidate.beforeTaskId ? "選択した兄弟の前" : "最上位の末尾";
  }, [byId]);

  const renderKeyboardPlacement = (): ReactElement | null => {
    if (keyboardPlacement.phase === "idle") return null;
    const candidate = currentKeyboardTaskPlacementCandidate(keyboardPlacement);
    const candidateIndex = keyboardPlacement.selectedIndex ?? 0;
    const candidateId = candidate ? `keyboard-placement-option-${candidate.id}` : undefined;
    const candidateLabel = candidate ? keyboardCandidateLabel(candidate) : "移動先なし";
    return <section
      className={`keyboard-placement is-${keyboardPlacement.phase}`}
      data-keyboard-placement={keyboardPlacement.phase}
      role="group"
      aria-label="キーボードで移動先を選択"
      onKeyDown={handleKeyboardMoveKeys}
    >
      <div className="placement-heading">
        <strong>{keyboardPlacement.sourceTaskId ? `${byId.get(keyboardPlacement.sourceTaskId)?.task.title ?? keyboardPlacement.sourceTaskId}を移動` : "タスクを移動"}</strong>
        <span>{keyboardPlacement.phase === "submitting" ? "送信中…" : keyboardPlacement.phase === "failed" ? "失敗。移動先を選び直せます" : "移動先を選択"}</span>
      </div>
      {keyboardPlacement.error && <p className="placement-error" role="alert">{keyboardPlacement.error.message}</p>}
      <div className="placement-current" aria-live="polite">
        <span className="placement-current-ordinal">候補 {keyboardPlacement.candidates.length > 0 ? `${candidateIndex + 1} / ${keyboardPlacement.candidates.length}` : "0 / 0"}</span>
        <strong>{candidateLabel}</strong>
        {candidate && !candidate.valid && <span className="placement-invalid-reason">⛔ {candidate.reason ?? keyboardPlacement.validationReason ?? "この移動先は選べません"}</span>}
        {keyboardPlacement.validationReason && candidate?.valid !== false && <span className="placement-invalid-reason">⛔ {keyboardPlacement.validationReason}</span>}
      </div>
      <div ref={keyboardPlacementRef} className="placement-list" role="listbox" aria-label="移動先候補" aria-activedescendant={candidateId} tabIndex={-1}>
        {keyboardPlacement.candidates.map((option, index) => <div
          key={option.id}
          id={`keyboard-placement-option-${option.id}`}
          role="option"
          aria-selected={index === candidateIndex}
          aria-disabled={!option.valid}
          className={`${index === candidateIndex ? "is-selected" : ""} ${option.valid ? "" : "is-invalid"}`}
          data-placement-candidate-id={option.id}
          data-placement-parent-id={option.targetParentId ?? ""}
          data-placement-before-id={option.beforeTaskId ?? ""}
        >
          <span>{index + 1}. {keyboardCandidateLabel(option)}</span>
          {!option.valid && <span>⛔ {option.reason ?? "選択できません"}</span>}
        </div>)}
      </div>
      <div className="placement-actions">
        <button type="button" data-placement-action="previous" onClick={() => dispatchKeyboardPlacement({ type: "navigate", direction: "previous" })} disabled={keyboardPlacement.phase === "submitting"}>前の候補</button>
        <button type="button" data-placement-action="next" onClick={() => dispatchKeyboardPlacement({ type: "navigate", direction: "next" })} disabled={keyboardPlacement.phase === "submitting"}>次の候補</button>
        <button type="button" data-placement-action="confirm" onClick={() => dispatchKeyboardPlacement({ type: "confirm" })} disabled={keyboardPlacement.phase === "submitting"}>決定</button>
        <button type="button" data-placement-action="cancel" className="placement-cancel" onClick={() => dispatchKeyboardPlacement({ type: "cancel" })} disabled={keyboardPlacement.phase === "submitting"}>キャンセル</button>
      </div>
      <p className="placement-help">↑↓／←→で候補を移動、Enterで決定、Escで取消</p>
    </section>;
  };

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
    setExpandedPockets((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
    setCompletedPocketWindows((current) => {
      if (current.has(taskId)) return current;
      const next = new Map(current);
      next.set(taskId, createCompletedPocketWindow(membersForPocket(taskId).length));
      return next;
    });
  }, [membersForPocket]);

  const loadMorePocket = useCallback((taskId: string) => {
    const total = membersForPocket(taskId).length;
    setCompletedPocketWindows((current) => {
      const state = current.get(taskId) ?? createCompletedPocketWindow(total);
      const nextState = transitionCompletedPocketWindow(state, { type: "load-more" }, total);
      if (nextState === state) return current;
      const next = new Map(current);
      next.set(taskId, nextState);
      return next;
    });
  }, [membersForPocket]);

  const renderCompletedDetail = (entry: HierarchyEntry): ReactElement => {
    const actualHistory = actualHistoryByTask[entry.task.id];
    const actualWorkReadout = !actualHistory || actualHistory.status === "loading"
      ? <span className="actual-history-status" data-actual-history-state="loading" role="status">実作業時間を読み込み中…</span>
      : actualHistory.status === "error"
        ? <span className="actual-history-status actual-history-error" data-actual-history-state="error" role="alert">実作業時間を読み込めませんでした。{errorText(actualHistory.error)} <button type="button" className="actual-history-retry" aria-label={`${entry.task.title}の実績履歴を再試行`} onClick={() => loadActualHistory(entry.task.id, true)}>再試行</button></span>
        : actualHistory.summary.sessionCount === 0
          ? <span className="actual-history-status" data-actual-history-state="no-record"><strong>実作業時間</strong> 記録なし（セッション記録なし）</span>
          : <span className="actual-history-status" data-actual-history-state="ready" data-actual-duration-ms={actualHistory.summary.totalClosedDurationMs}><strong>実作業時間</strong> {formatActualDuration(actualHistory.summary.totalClosedDurationMs)}（記録済みセッション {actualHistory.summary.sessionCount}件）</span>;
    return <div className="history-detail-row history-detail-row-local" data-local-detail-for={entry.task.id} data-completed-task-context={entry.task.id}>
      <div className="history-detail" aria-label={`${pathLabel(entry, byId)}の完了履歴詳細`} data-selected-readout={entry.task.id}>
        <div className="history-detail-summary">
          <strong>{entry.task.title}</strong>
          <span className="history-detail-path" data-history-detail-path={entry.task.id} title={pathLabel(entry, byId)}>階層 {pathLabel(entry, byId)}</span>
          <span>{entry.task.completedAt ? `作成 ${formatExact(entry.task.createdAt)} → 完了 ${formatExact(entry.task.completedAt)}` : `作成 ${formatExact(entry.task.createdAt)} → 完了時刻なし`}</span>
          {actualWorkReadout}
        </div>
        <div className="history-detail-actions">
          <button type="button" className="quiet-action memo-action" data-focus-id={`memo:${entry.task.id}`} aria-label={`${entry.task.title}のメモを編集`} onClick={() => openMemo(entry)} disabled={pending !== null}>メモ</button>
          <button type="button" className="quiet-action" aria-label={`${entry.task.title}をNOWへ戻す`} data-focus-id={`reopen:${entry.task.id}`} onClick={() => void reopen(entry)} disabled={pending !== null}>戻す</button>
          <button type="button" className="quiet-action delete-action" data-focus-id={`delete:${entry.task.id}`} onClick={() => beginDelete(entry)} disabled={pending !== null}>削除</button>
        </div>
      </div>
      <div className="now-hinge-cell" aria-hidden="true" />
    </div>;
  };

  const renderCompletedBoundarySeam = (firstCompleted: HierarchyEntry): ReactElement | null => {
    if (!dragState) return null;
    const parent = firstCompleted.parentTaskId ? byId.get(firstCompleted.parentTaskId) : undefined;
    const boundaryLabel = parent
      ? `${pathLabel(parent, byId)} の子の末尾（完了履歴の前）`
      : "最上位の末尾（完了履歴の前）";
    const placement: Placement = {
      label: boundaryLabel,
      parentTaskId: firstCompleted.parentTaskId,
      beforeTaskId: firstCompleted.task.id,
    };
    const validation = validatePlacement(dragState.taskId, placement);
    const isCurrent = Boolean(
      dragState.placement &&
      dragState.placement.parentTaskId === placement.parentTaskId &&
      dragState.placement.beforeTaskId === placement.beforeTaskId,
    );
    return <div
      className={`drop-seam drop-seam-completed-boundary ${isCurrent ? "is-current" : ""} ${validation.valid ? "" : "is-invalid"}`}
      data-drop-target={`before:${firstCompleted.task.id}`}
      data-drop-kind="before"
      data-drop-boundary="remaining-completed"
      data-drop-parent-id={firstCompleted.parentTaskId ?? ""}
      data-drop-before-id={firstCompleted.task.id}
      data-drop-label={placement.label}
      aria-label={placement.label}
      aria-disabled={!validation.valid}
    >
      <span aria-hidden={!isCurrent}>{validation.valid ? "ここに挿入（末尾・完了履歴の前）" : `⛔ ${validation.reason}`}</span>
    </div>;
  };

  const renderPocket = (entry: HierarchyEntry): ReactElement => {
    const members = membersForPocket(entry.task.id);
    const expanded = expandedPockets.has(entry.task.id);
    const selectedCompleted = selectedEntry && !isRemaining(selectedEntry) && members.some((member) => member.task.id === selectedEntry.task.id) ? selectedEntry : null;
    const firstCompleted = firstCompletedSiblingOf(entries, entry.parentTaskId);
    const depthOffset = boundedDepthOffset(entry.depth);
    const depthStyle = { "--depth": entry.depth, "--depth-offset": `${depthOffset}px` } as CSSProperties;
    return <div key={`pocket:${entry.task.id}`} className={`tree-branch pocket-branch depth-${entry.depth}`} data-task-id={entry.task.id} data-depth={entry.depth} style={depthStyle} role="treeitem" aria-level={entry.depth + 1} aria-label={`${entry.task.title}の完了履歴 ${members.length}件`} aria-expanded={expanded} onFocusCapture={(event) => {
      const target = event.target as HTMLElement;
      const taskContext = target.closest<HTMLElement>("[data-completed-task-context]")?.getAttribute("data-completed-task-context");
      const detailId = target.closest<HTMLElement>("[data-selected-readout]")?.getAttribute("data-selected-readout");
      const markId = target.closest<HTMLElement>("[data-history-mark]")?.getAttribute("data-history-mark");
      const memberId = target.closest<HTMLElement>("[data-history-member-id]")?.getAttribute("data-history-member-id");
      focusTask(taskContext ?? detailId ?? markId ?? memberId ?? entry.task.id);
    }}>
      {firstCompleted?.task.id === entry.task.id && renderCompletedBoundarySeam(firstCompleted)}
      <div className="history-row pocket-row" data-row-id={`pocket:${entry.task.id}`}>
        <HistoryPocket root={entry} members={members} range={rangeView} nowMs={displayNowMs} expanded={expanded} windowState={completedPocketWindows.get(entry.task.id) ?? createCompletedPocketWindow(members.length)} selectedTaskId={selectedTaskId} onSelect={selectTask} onToggle={togglePocket} onLoadMore={() => loadMorePocket(entry.task.id)} />
        <div className="now-hinge-cell" aria-hidden="true" />
        <div className="pocket-right-spacer" aria-hidden="true" />
      </div>
      {expanded && selectedCompleted && <div className="completed-detail-anchor">
        {renderCompletedDetail(selectedCompleted)}
        {deleteConfirm?.taskId === selectedCompleted.task.id && renderDeleteConfirmation(selectedCompleted)}
      </div>}
    </div>;
  };

  const renderDeleteConfirmation = (entry: HierarchyEntry): ReactElement | null => {
    if (deleteConfirm?.taskId !== entry.task.id) return null;
    const descendants = descendantsOf(entries, entry.task.id);
    const deletionEntries = [entry, ...descendants];
    const isPendingDelete = pending === `delete:${entry.task.id}`;
    return <div className={`delete-confirm ${isRemaining(entry) ? "delete-confirm-current" : "delete-confirm-completed"}`} data-delete-confirm={entry.task.id} data-delete-root-id={entry.task.id} data-completed-task-context={!isRemaining(entry) ? entry.task.id : undefined} role="group" aria-label={`${pathLabel(entry, byId)}の削除確認（対象${deletionEntries.length}件）`}>
      <strong>{descendants.length === 0 ? `「${entry.task.title}」を削除します` : `「${entry.task.title}」と子孫${descendants.length}件を削除します`}</strong>
      <span className="delete-confirm-count" data-delete-target-count={deletionEntries.length}>削除対象: {deletionEntries.length}件</span>
      <span className="delete-confirm-root" data-delete-root-path={pathLabel(entry, byId)}>対象root: {pathLabel(entry, byId)}</span>
      <span>{descendants.length === 0 ? "タイムラインと通常履歴からも消えます。" : "子タスク・タイムライン・通常履歴からも消えます。"}</span>
      <ul aria-label={`削除対象の完全な階層パス（${deletionEntries.length}件）`}>
        {deletionEntries.map((candidate) => <li key={candidate.task.id} data-delete-path-id={candidate.task.id}>{pathLabel(candidate, byId)}</li>)}
      </ul>
      <div className="delete-confirm-actions">
        <button type="button" className="danger-action" data-focus-id={`delete-confirm:${entry.task.id}`} onClick={() => void confirmDelete()} disabled={pending !== null}>{isPendingDelete ? "削除中…" : "削除する"}</button>
        <button type="button" className="quiet-action" data-focus-id={`delete-cancel:${entry.task.id}`} onClick={cancelDelete} disabled={isPendingDelete}>キャンセル</button>
      </div>
    </div>;
  };

  const renderRow = (entry: HierarchyEntry): ReactElement => {
    const children = projectedChildrenOf(entries, entry.task.id);
    const remainingChildren = children.filter(isRemaining);
    const disclosure = projectTaskDetailDisclosure(disclosureState, entry.task.id, availableTaskIds);
    const isSelected = disclosure.stableSelectionLink;
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
    const depthOffset = boundedDepthOffset(entry.depth);
    const depthStyle = { "--depth": entry.depth, "--depth-offset": `${depthOffset}px` } as CSSProperties;
    return <div key={entry.task.id} id={`history-task-${entry.task.id}`} className={`tree-branch depth-${entry.depth} ${isCollapsed ? "is-collapsed" : ""}`} data-task-id={entry.task.id} data-depth={entry.depth} style={depthStyle} role="treeitem" aria-level={entry.depth + 1} aria-labelledby={`task-label-${entry.task.id}`} aria-describedby={`lifetime-description-${entry.task.id}`} aria-expanded={children.length > 0 ? !isCollapsed : undefined}>
      {dragState && <div className={`drop-seam ${isCurrentBefore ? "is-current" : ""} ${beforeValidation?.valid ? "" : "is-invalid"}`} data-drop-target={`before:${entry.task.id}`} data-drop-kind="before" data-drop-parent-id={entry.parentTaskId ?? ""} data-drop-before-id={entry.task.id} data-drop-label={beforePlacement.label} aria-label={`${entry.task.title} の前に配置`} aria-disabled={!beforeValidation?.valid}>
        <span aria-hidden={!isCurrentBefore}>{beforeValidation?.valid ? (dragState.taskId === entry.task.id ? "移動元" : "ここに挿入") : `⛔ ${beforeValidation?.reason}`}</span>
      </div>}
      <div className={`history-row task-row ${dragState?.taskId === entry.task.id ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""} ${editing ? "is-editing" : ""} ${stateCueClass}`} data-row-id={entry.task.id} data-state={entry.task.state} data-disclosure-state={isSelected ? "selected" : "resting"} onFocusCapture={() => focusTask(entry.task.id)}>
        <HistoryMark entry={entry} range={rangeView} nowMs={displayNowMs} selected={isSelected} ancestryPath={isSelected && entry.depth > 0 ? pathLabel(entry, byId) : undefined} onSelect={selectTask} onFit={fitSelected} />
        <div className={`now-hinge-cell ${isRemaining(entry) && rangeView.endMs < displayNowMs ? "is-discontinuous" : ""}`} aria-hidden="true">{isRemaining(entry) && rangeView.endMs < displayNowMs && <span>▷</span>}</div>
        <div className={`current-identity ${dragState ? `is-drop-target ${dropValidation?.valid ? "is-valid" : "is-invalid"} ${isCurrentParent ? "is-current" : ""}` : ""}`} data-drop-target={dragState ? `parent:${entry.task.id}` : undefined} data-drop-kind={dragState ? "parent" : undefined} data-drop-parent-id={dragState ? entry.task.id : undefined} data-drop-label={dragState ? dropPlacement.label : undefined} aria-label={dragState ? (dropValidation?.valid ? `${entry.task.title}の子の末尾に配置` : `${entry.task.title}には配置できません: ${dropValidation?.reason ?? "不正な移動先"}`) : undefined} aria-disabled={dragState ? !dropValidation?.valid : undefined} onClick={() => selectTask(entry.task.id)}>
          {dragState && isCurrentParent && <span className="identity-drop-cue" aria-hidden="true">{dropValidation?.valid ? `└ ${entry.task.title} の子の末尾` : `⛔ ${dropValidation?.reason ?? "配置できません"}`}</span>}
          <span className="branch-rail" aria-hidden="true" style={{ marginLeft: `${depthOffset}px` }} />
          <button type="button" className="drag-handle" aria-label={`${entry.task.title}をドラッグして移動（EnterまたはSpaceでキーボード配置）`} data-drag-handle="true" data-focus-id={`drag-handle:${entry.task.id}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); beginKeyboardMove(entry); } }} onPointerDown={(event) => startPointerDrag(event, entry)} onPointerMove={(event) => updatePointerTarget(event, entry)} onPointerUp={(event) => finishPointerDrag(event, entry)} onPointerCancel={(event) => cancelDrag(entry, event.pointerId)} onLostPointerCapture={() => cancelDrag(entry)} disabled={pending !== null || forest?.truncated}>⠿</button>
          {children.length > 0 ? <button type="button" className="disclosure" aria-label={`${entry.task.title}を${isCollapsed ? "展開" : "折りたたむ"}`} aria-expanded={!isCollapsed} onClick={() => toggleCollapse(entry.task.id)}>{isCollapsed ? "▸" : "▾"}</button> : <span className="disclosure-spacer" aria-hidden="true" />}
          <button type="button" className={`completion-box ${isCompleting ? "is-pending" : ""}`} data-focus-id={`complete:${entry.task.id}`} aria-label={isCompleting ? `${entry.task.title}を完了処理中` : `${entry.task.title}を完了にする`} onClick={() => void complete(entry)} disabled={pending !== null}><span className="completion-glyph" aria-hidden="true">{isCompleting ? "···" : "✓"}</span><span className="completion-intent" aria-hidden="true">{isCompleting ? "完了処理中" : "完了"}</span></button>
          <div className="task-copy">
            {editing ? <form ref={renameFormRef} className="rename-form" onBlur={(event) => { const next = event.relatedTarget; if (next instanceof Node && event.currentTarget.contains(next)) return; requestOutsideRename(entry, editingTitleRef.current); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditingTaskId(null); } }} onSubmit={(event) => { event.preventDefault(); void saveRename(entry); }}><input id={`task-label-${entry.task.id}`} aria-label={`${entry.task.title}の名前を変更`} defaultValue={entry.task.title} onChange={(event) => { editingTitleRef.current = event.currentTarget.value; }} autoFocus maxLength={240} /><button type="submit" disabled={pending !== null}>保存</button><button type="button" onClick={() => setEditingTaskId(null)}>取消</button></form> : <button id={`task-label-${entry.task.id}`} type="button" className="task-title" data-focus-id={`title:${entry.task.id}`} onDoubleClick={() => beginRename(entry)} onClick={() => beginRename(entry)}>{entry.task.title}</button>}
            <span className="task-meta"><span className={`state-dot state-${entry.task.state}`} aria-hidden="true" />{stateLabel(entry.task.state)}{isSelected && children.length > 0 && <span className="child-count">子 {remainingChildren.length}/{children.length}</span>}{isSelected && <span className={`memo-presence ${entry.task.memo ? "has-memo" : "is-empty"}`} data-memo-presence={entry.task.memo ? "present" : "empty"} title={entry.task.memo ? "メモあり" : "メモなし"}><span aria-hidden="true">{entry.task.memo ? "▣" : "□"}</span><span className="sr-only">{entry.task.memo ? "メモあり" : "メモなし"}</span></span>}</span>
          </div>
          <div className={`row-actions ${isSelected ? "is-disclosed" : ""} ${editing ? "is-suppressed" : ""}`} aria-hidden={!isSelected || editing || undefined}>
            <button type="button" className="quiet-action memo-action" data-focus-id={`memo:${entry.task.id}`} aria-label={`${entry.task.title}のメモを編集`} tabIndex={isSelected ? 0 : -1} onClick={() => openMemo(entry)} disabled={pending !== null}>メモ</button>
            <button type="button" className="quiet-action child-action" data-focus-id={`add-child:${entry.task.id}`} tabIndex={isSelected ? 0 : -1} onClick={() => toggleCreateChild(entry)} disabled={pending !== null}>＋子</button>
            <button type="button" className="quiet-action delete-action" data-focus-id={`delete:${entry.task.id}`} tabIndex={isSelected ? 0 : -1} onClick={() => beginDelete(entry)} disabled={pending !== null}>削除</button>
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
    <main className="work-surface" aria-hidden={memoEditor ? true : undefined} onKeyDown={handleMainKeyDown}>
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
          <div ref={historyCompositeRef} className="history-composite" role="tree" tabIndex={0} aria-activedescendant={activeHistoryDescendantId} onKeyDown={handleHistoryKeyDown}>
            <TimelineRuler range={rangeView} nowMs={displayNowMs} remainingCount={remainingCount} completedCount={completedEntries.length} onCurrentJump={jumpCurrent} onHistoryJump={jumpHistory} />
            <p className="range-legend sr-only" aria-label="作成から現在または完了までの記録。作業時間・進捗率・予定ではありません">作成から現在／完了までの記録 · 作業時間・進捗率・予定ではありません</p>
            <p className="history-help sr-only">履歴を選ぶと、その直下に正確な時刻と操作を表示します。</p>
            {entries.length === 0 && <div className="history-empty-row"><div className="history-empty-history">履歴はありません</div><div className="now-hinge-cell" aria-hidden="true" /><div className="current-empty"><strong>現在のタスクはありません</strong><span>上の入力欄から追加できます。</span></div></div>}
            {projectedChildrenOf(entries).map(renderVisibleEntry)}
            {entries.length > 0 && remainingEntries.length === 0 && <div className="history-empty-row"><div className="history-empty-history">完了した履歴を表示中</div><div className="now-hinge-cell" aria-hidden="true" /><div className="current-empty"><strong>現在のタスクはありません</strong><span>上の入力欄から新しい仕事を追加できます。</span></div></div>}
          </div>
          {renderKeyboardPlacement()}
        </section>
        {dragState && (() => {
          const firstCompleted = firstCompletedSiblingOf(entries);
          const rootPlacement: Placement = {
            label: firstCompleted ? "最上位の末尾（完了履歴の前）" : "最上位の末尾",
            beforeTaskId: firstCompleted?.task.id,
          };
          const validation = validatePlacement(dragState.taskId, rootPlacement);
          const isCurrentRoot = Boolean(
            dragState.placement &&
            !dragState.placement.parentTaskId &&
            dragState.placement.beforeTaskId === rootPlacement.beforeTaskId,
          );
          const rootLabel = `${rootPlacement.label}に配置`;
          return <div
            className={`root-landing-sill ${validation.valid ? "is-valid" : "is-invalid"} ${isCurrentRoot ? "is-current" : ""}`}
            data-drop-target="root-end"
            data-drop-kind="root"
            data-drop-boundary={firstCompleted ? "remaining-completed" : undefined}
            data-drop-before-id={rootPlacement.beforeTaskId}
            data-drop-label={rootPlacement.label}
            aria-disabled={!validation.valid}
            aria-label={validation.valid ? rootLabel : `最上位には配置できません: ${validation.reason ?? "不正な移動先"}`}
          >{validation.valid ? rootLabel : `⛔ ${validation.reason ?? "配置できません"}`}</div>;
        })()}
        {forest?.truncated && <p className="limit-note">表示上限に達しています。安全のため移動操作を停止しています。</p>}
      </>}
    </main>
    {memoEditor && <MemoDialog
      editor={memoEditor}
      pending={pending !== null}
      onDraftChange={changeMemoDraft}
      onSave={() => void saveMemo()}
      onCancel={closeMemo}
      onReload={() => void reloadMemo()}
      onRetry={() => void saveMemo()}
    />}
    <UpdateReceipt
      runningVersion={currentVersion}
      state={updateState}
      onLater={() => setUpdateState({ status: "hidden" })}
      onApply={(candidate) => void applyApplicationUpdate(candidate)}
      onCheckAgain={() => void checkForApplicationUpdate()}
    />
  </div>;
}
