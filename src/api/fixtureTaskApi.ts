import {
  type ActualHistoryPage,
  type ActualHistorySummary,
  type ArchiveSummaryPage,
  type DaySummaryPage,
  type FocusProjection,
  type HierarchyChangeResult,
  type HierarchyEntry,
  type LifecycleEvent,
  type LifecycleResult,
  type QueueChangeResult,
  type QueuePage,
  type QueuePlacement,
  type ReversibleChangeResult,
  type SwitchExpectedVersions,
  type TaskApi,
  type TaskForestSnapshot,
  type TaskSnapshot,
  type UndoOperationKind,
  type UndoStatus,
  type WorkSession,
  type WorkSessionPage,
} from "./types";

export type PreviewVariant = "typical" | "dense" | "no-active" | "empty" | "error" | "only-completed" | "deep";

const PREVIEW_NOW = "2026-08-23T06:12:00.000Z";
const DEFAULT_DATE = "2026-08-23T00:00:00.000Z";

type StaticFixture = {
  tasks: TaskSnapshot[];
  entries: HierarchyEntry[];
  sessions: WorkSession[];
  events: LifecycleEvent[];
  queueRevision: number;
  sourceRevision: number;
  hierarchyRevision: number;
};

function copy<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeTask(id: string, title: string, state: TaskSnapshot["state"], version = 1, extra: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return { id, title, state, version, createdAt: DEFAULT_DATE, memo: "", ...extra };
}

function makeSession(id: string, taskId: string, startedAt: string, endedAt?: string, endReason?: WorkSession["endReason"]): WorkSession {
  return { id, taskId, startedAt, endedAt, endReason, operationId: `preview-op-${id}` };
}

function makeEvent(id: string, taskId: string | undefined, eventType: string, occurredAt: string, payload: Record<string, unknown> = {}): LifecycleEvent {
  return { id, taskId, eventType, occurredAt, payload, operationId: `preview-op-${id}` };
}

function buildEntries(tasks: TaskSnapshot[], parentById: Record<string, string | undefined> = {}): HierarchyEntry[] {
  const children = new Map<string | undefined, string[]>();
  for (const task of tasks) {
    const parent = parentById[task.id];
    const bucket = children.get(parent) ?? [];
    bucket.push(task.id);
    children.set(parent, bucket);
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const result: HierarchyEntry[] = [];
  const visit = (parentTaskId: string | undefined, depth: number) => {
    for (const [position, taskId] of (children.get(parentTaskId) ?? []).entries()) {
      const task = byId.get(taskId);
      if (!task) continue;
      result.push({ task: copy(task), parentTaskId, position, depth });
      visit(taskId, depth + 1);
    }
  };
  visit(undefined, 0);
  return result;
}

function buildTypical(): StaticFixture {
  const active = makeTask("task-api", "APIレスポンス遅延の原因を切り分ける", "active", 4, { createdAt: "2026-08-22T23:42:00.000Z", actualStartAt: "2026-08-23T04:42:00.000Z" });
  const paused = makeTask("task-answer", "顧客向け回答の根拠を再確認", "paused", 3, { createdAt: "2026-08-23T01:12:00.000Z", actualStartAt: "2026-08-23T03:12:00.000Z" });
  const nextTitles = ["再現条件をテストケースにする", "SQLite migrationの失敗ケースを確認", "レビューコメントへ返信", "ログ採取手順を短くまとめる", "リリースノートの表現を確認", "明日の調査メモを残す"];
  const next = nextTitles.map((title, index) => makeTask(`task-next-${index + 1}`, title, "queued"));
  const completed = makeTask("task-completed", "ログのタイムアウト境界を確認", "completed", 2, { createdAt: "2026-08-23T03:40:00.000Z", actualStartAt: "2026-08-23T03:40:00.000Z", completedAt: "2026-08-23T03:57:00.000Z" });
  const completionOnly = makeTask("task-no-session", "調査メモの表記を確認（記録なし完了）", "completed", 2, { createdAt: "2026-08-23T04:06:00.000Z" });
  const tasks = [active, paused, ...next, completed, completionOnly];
  const parentById: Record<string, string | undefined> = {
    "task-next-1": active.id,
    "task-next-2": active.id,
    "task-completed": active.id,
    "task-next-3": paused.id,
  };
  const sessions = [
    makeSession("session-api-1", active.id, "2026-08-23T04:42:00.000Z", "2026-08-23T05:01:00.000Z", "switched"),
    makeSession("session-api-2", active.id, "2026-08-23T05:38:00.000Z"),
    makeSession("session-answer-1", paused.id, "2026-08-23T03:12:00.000Z", "2026-08-23T03:29:00.000Z", "paused"),
    makeSession("session-complete-1", completed.id, "2026-08-23T03:40:00.000Z", "2026-08-23T03:57:00.000Z", "completed"),
  ];
  const events = [
    makeEvent("event-completion", completed.id, "task-completed", "2026-08-23T03:57:00.000Z"),
    makeEvent("event-completion-only", completionOnly.id, "task-completed", "2026-08-23T04:06:00.000Z", { withoutSession: true }),
  ];
  return buildFixture(tasks, sessions, events, 42, parentById);
}

function buildNoActive(): StaticFixture {
  const completed = makeTask("task-completed", "API調査の結果を共有する", "completed", 2, { completedAt: "2026-08-23T06:10:00.000Z" });
  const next = [makeTask("task-next-1", "再現条件をテストケースにする", "queued"), makeTask("task-next-2", "顧客向け回答の根拠を再確認", "paused", 3), makeTask("task-next-3", "SQLite migrationの失敗ケースを確認", "queued")];
  return buildFixture([completed, ...next], [], [makeEvent("event-completed", completed.id, "task-completed", "2026-08-23T06:10:00.000Z")], 27, { "task-next-2": "task-next-1" });
}

function buildOnlyCompleted(): StaticFixture {
  const root = makeTask("only-completed-root", "完了した調査をまとめる", "completed", 2, { createdAt: "2026-08-22T03:10:00.000Z", completedAt: "2026-08-22T05:20:00.000Z" });
  const child = makeTask("only-completed-child", "完了した確認項目", "completed", 1, { createdAt: "2026-08-22T03:30:00.000Z", completedAt: "2026-08-22T04:05:00.000Z" });
  const standalone = makeTask("only-completed-standalone", "完了した共有", "completed", 2, { createdAt: "2026-08-23T01:00:00.000Z", completedAt: "2026-08-23T01:45:00.000Z" });
  return buildFixture([root, child, standalone], [], [makeEvent("only-completed-root-event", root.id, "task-completed", root.completedAt ?? PREVIEW_NOW), makeEvent("only-completed-child-event", child.id, "task-completed", child.completedAt ?? PREVIEW_NOW), makeEvent("only-completed-standalone-event", standalone.id, "task-completed", standalone.completedAt ?? PREVIEW_NOW)], 64, { [child.id]: root.id });
}

function buildDense(): StaticFixture {
  const tasks: TaskSnapshot[] = [];
  const events: LifecycleEvent[] = [];
  const parentById: Record<string, string | undefined> = {};
  for (let index = 0; index < 120; index += 1) {
    const active = index === 31;
    const paused = !active && index % 6 === 0;
    const state = active ? "active" : paused ? "paused" : "queued";
    const value = makeTask(`dense-task-${index + 1}`, index % 4 === 0 ? `long mixed 日本語 / incident-${String(index + 1).padStart(2, "0")} を確認する` : `調査タスク ${String(index + 1).padStart(2, "0")} の残作業`, state, active || paused ? 2 : 1, { createdAt: new Date(Date.parse(PREVIEW_NOW) - (index % 18) * 60 * 60 * 1000).toISOString() });
    tasks.push(value);
    const candidateParent = tasks[Math.floor(index / 5) * 5];
    if (index > 0 && index % 5 !== 0 && candidateParent?.state !== "completed") parentById[value.id] = candidateParent.id;
  }
  for (let pocketIndex = 0; pocketIndex < 20; pocketIndex += 1) {
    const root = makeTask(`dense-completed-root-${pocketIndex + 1}`, `完了履歴グループ ${String(pocketIndex + 1).padStart(2, "0")}`, "completed", 2, { createdAt: new Date(Date.parse(PREVIEW_NOW) - (pocketIndex + 1) * 24 * 60 * 60 * 1000).toISOString(), completedAt: PREVIEW_NOW });
    tasks.push(root);
    events.push(makeEvent(`dense-event-root-${pocketIndex + 1}`, root.id, "task-completed", PREVIEW_NOW));
    for (let childIndex = 0; childIndex < 29; childIndex += 1) {
      const child = makeTask(`dense-completed-${pocketIndex + 1}-${childIndex + 1}`, `完了履歴 ${pocketIndex + 1}-${childIndex + 1}`, "completed", 1, { createdAt: new Date(Date.parse(PREVIEW_NOW) - (pocketIndex + 1) * 24 * 60 * 60 * 1000 - childIndex * 15 * 60 * 1000).toISOString(), completedAt: PREVIEW_NOW });
      tasks.push(child);
      parentById[child.id] = root.id;
      events.push(makeEvent(`dense-event-${pocketIndex + 1}-${childIndex + 1}`, child.id, "task-completed", PREVIEW_NOW));
    }
  }
  return buildFixture(tasks, [], events, 902, parentById);
}

function buildDeep(): StaticFixture {
  const longTitle = "深い階層の長い日本語タイトル。設計レビューの観点と検証手順を確認するためのサンプル作業。".repeat(4).slice(0, 240);
  const tasks = Array.from({ length: 9 }, (_, depth) => makeTask(
    `deep-task-${depth}`,
    depth === 0 ? "深い階層の調査パッケージ" : depth === 8 ? longTitle : `深度 ${depth} の確認作業`,
    depth === 0 ? "active" : "queued",
    1,
    { createdAt: new Date(Date.parse(PREVIEW_NOW) - (depth + 1) * 60 * 60 * 1000).toISOString() },
  ));
  const parentById: Record<string, string | undefined> = {};
  for (let depth = 1; depth < tasks.length; depth += 1) parentById[tasks[depth].id] = tasks[depth - 1].id;
  const sessions = [makeSession("session-deep-root", tasks[0].id, "2026-08-23T04:12:00.000Z")];
  return buildFixture(tasks, sessions, [], 128, parentById);
}

function buildFixture(tasks: TaskSnapshot[], sessions: WorkSession[], events: LifecycleEvent[], sourceRevision: number, parentById: Record<string, string | undefined> = {}): StaticFixture {
  return { tasks: copy(tasks), entries: buildEntries(tasks, parentById), sessions: copy(sessions), events: copy(events), queueRevision: sourceRevision, sourceRevision, hierarchyRevision: sourceRevision === 0 ? 0 : Math.max(1, Math.floor(sourceRevision / 10)) };
}

function staticError(code: string, message: string, detail?: string): never {
  throw { code, message, detail };
}

function validateFixtureInstant(value: string, task: TaskSnapshot, events: LifecycleEvent[]): void {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) staticError("invalid-effective-instant", "Instant must be RFC3339", value);
  const createdAt = Date.parse(task.createdAt);
  if (Number.isFinite(createdAt) && instant < createdAt) {
    staticError("invalid-effective-instant", "Effective instant precedes the task creation boundary");
  }
  for (const event of events.filter((candidate) => candidate.taskId === task.id)) {
    const occurredAt = Date.parse(event.occurredAt);
    if (Number.isFinite(occurredAt) && instant < occurredAt) {
      staticError("invalid-effective-instant", "Effective instant precedes an affected event boundary");
    }
  }
}

function isRemaining(task: TaskSnapshot): boolean {
  return task.state !== "completed";
}

class StaticFixtureTaskApi implements TaskApi {
  private undoRevision = 0;
  private operationSequence = 0;
  private readonly undoJournal: Array<{
    token: string;
    kind: UndoOperationKind;
    label: string;
    committedAt: string;
    affectedTaskIds: string[];
    snapshot: StaticFixture;
  }> = [];

  constructor(private readonly variant: PreviewVariant, private readonly fixture: StaticFixture) {}

  private recordUndo(kind: UndoOperationKind, label: string, affectedTaskIds: string[], snapshot: StaticFixture): void {
    this.operationSequence += 1;
    this.undoRevision += 1;
    this.undoJournal.push({
      token: `preview-undo-${this.operationSequence}`,
      kind,
      label,
      committedAt: PREVIEW_NOW,
      affectedTaskIds: copy(affectedTaskIds),
      snapshot,
    });
    if (this.undoJournal.length > 50) this.undoJournal.splice(0, this.undoJournal.length - 50);
  }

  private undoStatus(): UndoStatus {
    const latest = this.undoJournal.at(-1);
    return latest
      ? { available: true, operationToken: latest.token, operationKind: latest.kind, label: latest.label, committedAt: latest.committedAt, undoRevision: this.undoRevision }
      : { available: false, undoRevision: this.undoRevision };
  }

  private reversibleResult(operationId: string, affectedTaskIds: string[]): ReversibleChangeResult {
    return {
      operationId,
      sourceRevision: this.fixture.sourceRevision,
      hierarchyRevision: this.fixture.hierarchyRevision,
      queueRevision: this.fixture.queueRevision,
      undoRevision: this.undoRevision,
      affectedTaskIds: copy(affectedTaskIds),
      undoStatus: this.undoStatus(),
    };
  }

  private controlledFailure(): void {
    if (this.variant === "error") staticError("persistence-failure", "保存／読込に失敗。以前の状態は保持されています");
  }

  private task(taskId: string): TaskSnapshot {
    const entry = this.fixture.entries.find((value) => value.task.id === taskId);
    if (!entry) staticError("task-not-found", "対象が現在の一覧にありません。変更はありません");
    return entry.task;
  }

  private entry(taskId: string): HierarchyEntry {
    const value = this.fixture.entries.find((entry) => entry.task.id === taskId);
    if (!value) staticError("task-not-found", "対象が現在の一覧にありません。変更はありません");
    return value;
  }

  private normalize(): void {
    const byParent = new Map<string | undefined, HierarchyEntry[]>();
    for (const entry of this.fixture.entries) {
      const list = byParent.get(entry.parentTaskId) ?? [];
      list.push(entry);
      byParent.set(entry.parentTaskId, list);
    }
    for (const list of byParent.values()) list.sort((left, right) => left.position - right.position || left.task.id.localeCompare(right.task.id));
    const ordered: HierarchyEntry[] = [];
    const visit = (parentTaskId: string | undefined, depth: number) => {
      for (const [position, entry] of (byParent.get(parentTaskId) ?? []).entries()) {
        entry.position = position;
        entry.depth = depth;
        ordered.push(entry);
        visit(entry.task.id, depth + 1);
      }
    };
    visit(undefined, 0);
    this.fixture.entries = ordered;
  }

  private descendants(taskId: string): HierarchyEntry[] {
    const result: HierarchyEntry[] = [];
    const visit = (parent: string) => {
      for (const child of this.fixture.entries.filter((entry) => entry.parentTaskId === parent)) {
        result.push(child);
        visit(child.task.id);
      }
    };
    visit(taskId);
    return result;
  }

  private ancestors(taskId: string): HierarchyEntry[] {
    const result: HierarchyEntry[] = [];
    let parent = this.entry(taskId).parentTaskId;
    while (parent) {
      const entry = this.entry(parent);
      result.push(entry);
      parent = entry.parentTaskId;
    }
    return result;
  }

  private result(changedTaskIds: string[] = [], changedEntryIds = changedTaskIds): HierarchyChangeResult {
    return {
      operationId: "preview-operation",
      hierarchyRevision: this.fixture.hierarchyRevision,
      sourceRevision: this.fixture.sourceRevision,
      changedEntries: changedEntryIds.map((id) => copy(this.entry(id))),
      changedTasks: changedTaskIds.map((id) => copy(this.task(id))),
    };
  }

  private syncTasks(): void {
    this.fixture.tasks = this.fixture.entries.map((entry) => copy(entry.task));
  }

  async createTask(title: string): Promise<TaskSnapshot> { this.controlledFailure(); return makeTask("legacy-preview-created", title.trim(), "queued"); }
  async renameTask(taskId: string, title: string, expectedVersion: number): Promise<TaskSnapshot> {
    this.controlledFailure();
    const value = this.task(taskId);
    if (value.version !== expectedVersion) staticError("stale-version", "Task version is stale");
    const before = copy(this.fixture);
    const previousTitle = value.title;
    value.title = title.trim();
    value.version += 1;
    this.fixture.sourceRevision += 1;
    this.recordUndo("rename", `「${previousTitle}」の名前変更`, [taskId], before);
    return copy(value);
  }
  async updateTaskMemo(taskId: string, memo: string, expectedTaskVersion: number, instant = PREVIEW_NOW): Promise<ReversibleChangeResult> {
    this.controlledFailure();
    if (Array.from(memo).length > 4000) staticError("invalid-memo", "Memo must contain at most 4000 Unicode scalar values");
    const value = this.task(taskId);
    if (value.version !== expectedTaskVersion) staticError("stale-version", "Task version is stale");
    validateFixtureInstant(instant, value, this.fixture.events);
    this.syncTasks();
    const sourceRevision = this.fixture.sourceRevision;
    const hierarchyRevision = this.fixture.hierarchyRevision;
    const queueRevision = this.fixture.queueRevision;
    if (value.memo === memo) {
      return this.reversibleResult("preview-memo-noop", [taskId]);
    }
    const before = copy(this.fixture);
    const operationId = `preview-memo-${this.operationSequence + 1}`;
    value.memo = memo;
    value.version += 1;
    this.fixture.events.push({
      id: `preview-event-${operationId}`,
      taskId,
      operationId,
      eventType: "task-memo-updated",
      occurredAt: instant,
      payload: { hasMemo: memo.length > 0, scalarLength: Array.from(memo).length },
    });
    this.fixture.sourceRevision += 1;
    this.syncTasks();
    this.recordUndo("memo-update", `「${value.title}」のメモを更新`, [taskId], before);
    const result = this.reversibleResult(operationId, [taskId]);
    // A memo update is a source-only mutation; retain the hierarchy and queue
    // revisions from before the save in the returned result.
    result.hierarchyRevision = hierarchyRevision;
    result.queueRevision = queueRevision;
    result.sourceRevision = sourceRevision + 1;
    return result;
  }
  async startTask(taskId: string): Promise<LifecycleResult> { this.controlledFailure(); const value = this.task(taskId); value.state = "active"; value.version += 1; return { operationId: "preview-operation", changedTasks: [copy(value)], queueRevision: this.fixture.queueRevision, sourceRevision: this.fixture.sourceRevision }; }
  async switchFocus(fromTaskId: string, toTaskId: string, _expectedVersions: SwitchExpectedVersions, _placement?: QueuePlacement, _expectedQueueRevision?: number): Promise<LifecycleResult> { this.controlledFailure(); return { operationId: "preview-operation", changedTasks: [copy(this.task(fromTaskId)), copy(this.task(toTaskId))], queueRevision: this.fixture.queueRevision, sourceRevision: this.fixture.sourceRevision }; }
  async pauseTask(taskId: string): Promise<LifecycleResult> { this.controlledFailure(); const value = this.task(taskId); value.state = "paused"; value.version += 1; return { operationId: "preview-operation", changedTasks: [copy(value)], queueRevision: this.fixture.queueRevision, sourceRevision: this.fixture.sourceRevision }; }
  async completeTask(taskId: string): Promise<LifecycleResult> { const value = await this.completeHierarchyTask(taskId, this.task(taskId).version); return { operationId: value.operationId, changedTasks: value.changedTasks, queueRevision: this.fixture.queueRevision, sourceRevision: value.sourceRevision }; }
  async reopenTask(taskId: string): Promise<LifecycleResult> { const value = await this.reopenHierarchyTask(taskId, this.task(taskId).version); return { operationId: value.operationId, changedTasks: value.changedTasks, queueRevision: this.fixture.queueRevision, sourceRevision: value.sourceRevision }; }
  async getCurrentFocus() { return copy(this.fixture.entries.find((entry) => entry.task.state === "active")?.task ?? null); }
  async getTask(taskId: string) { return copy(this.task(taskId)); }
  async getNextQueue(_afterCursor: string | undefined, limit: number): Promise<QueuePage> { const entries = this.fixture.entries.filter((entry) => isRemaining(entry.task)).slice(0, limit).map((entry, index) => ({ taskId: entry.task.id, task: copy(entry.task), position: index + 1 })); return { entries, taskIds: entries.map((entry) => entry.taskId), queueRevision: this.fixture.queueRevision, sourceRevision: this.fixture.sourceRevision }; }
  async moveQueuedTask(taskId: string, _beforeTaskId: string | undefined, _expectedQueueRevision: number): Promise<QueueChangeResult> { this.controlledFailure(); return { operationId: "preview-operation", taskId, position: this.entry(taskId).position, queueRevision: this.fixture.queueRevision, sourceRevision: this.fixture.sourceRevision }; }
  async getTaskActualHistory(taskId: string): Promise<ActualHistorySummary> {
    const sessions = this.fixture.sessions.filter((value) => value.taskId === taskId);
    const totalClosedDurationMs = sessions.reduce((total, session) => {
      if (!session.endedAt) return total;
      const startedMs = Date.parse(session.startedAt);
      const endedMs = Date.parse(session.endedAt);
      return Number.isFinite(startedMs) && Number.isFinite(endedMs) ? total + Math.max(0, endedMs - startedMs) : total;
    }, 0);
    return { taskId, actualStartAt: sessions[0]?.startedAt, latestCompletionAt: this.task(taskId).completedAt, totalClosedDurationMs, currentOpenSession: copy(sessions.find((value) => !value.endedAt)), sessionCount: sessions.length, sourceRevision: this.fixture.sourceRevision };
  }
  async getTaskSessions(taskId: string, _afterCursor: string | undefined, limit: number): Promise<WorkSessionPage> { return { sessions: copy(this.fixture.sessions.filter((value) => value.taskId === taskId).slice(0, limit)), sourceRevision: this.fixture.sourceRevision }; }
  async getHistoryByActualRange(rangeStart: string, rangeEnd: string, _afterCursor: string | undefined, limit: number): Promise<ActualHistoryPage> {
    const start = Date.parse(rangeStart);
    const end = Date.parse(rangeEnd);
    const events = this.fixture.events
      .filter((event) => {
        const occurred = Date.parse(event.occurredAt);
        return (!Number.isFinite(start) || occurred >= start) && (!Number.isFinite(end) || occurred < end);
      })
      .slice(0, limit);
    return {
      items: events.map((event) => ({ kind: "event", at: event.occurredAt, event: copy(event) })),
      sessions: [],
      events: copy(events),
      sourceRevision: this.fixture.sourceRevision,
    };
  }
  async getFocusProjection(_rangeStart: string, _rangeEnd: string, currentInstant: string, _nextCursor: string | undefined, _limits: { segmentLimit: number; nextWorkLimit: number }): Promise<FocusProjection> { return { segments: [], currentFocus: (await this.getCurrentFocus()) ?? undefined, nextWork: await this.getNextQueue(undefined, 12), metadata: { sourceRevision: this.fixture.sourceRevision, queryInstant: currentInstant, truncated: false, queryDurationMs: 0 } }; }
  async getDaySummary(localDate: string, timeZone: string, currentInstant: string, _cursor: string | undefined, _limit: number): Promise<DaySummaryPage> { return { localDate, timeZone, dayStartUtc: `${localDate}T00:00:00.000Z`, dayEndUtc: `${localDate}T23:59:59.999Z`, tasks: [], sourceRevision: this.fixture.sourceRevision, truncated: false, queryInstant: currentInstant, queryDurationMs: 0 }; }
  async getArchiveSummary(localDateStart: string, localDateEnd: string, timeZone: string, currentInstant: string, _cursor: string | undefined, _limit: number): Promise<ArchiveSummaryPage> { return { localDateStart, localDateEnd, timeZone, days: [], sourceRevision: this.fixture.sourceRevision, truncated: false, queryInstant: currentInstant, queryDurationMs: 0 }; }

  async getTaskForest(limit: number): Promise<TaskForestSnapshot> {
    this.controlledFailure();
    if (limit <= 0) staticError("invalid-limit", "表示件数が不正です");
    this.normalize();
    return { entries: copy(this.fixture.entries.slice(0, limit)), hierarchyRevision: this.fixture.hierarchyRevision, sourceRevision: this.fixture.sourceRevision, truncated: this.fixture.entries.length > limit };
  }

  async createTaskInHierarchy(title: string, targetParentTaskId: string | undefined, beforeTaskId: string | undefined, expectedHierarchyRevision: number): Promise<HierarchyChangeResult> {
    this.controlledFailure();
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > 240) staticError("invalid-title", "タイトルは1〜240文字で入力してください");
    if (expectedHierarchyRevision !== this.fixture.hierarchyRevision) staticError("stale-hierarchy", "一覧が更新されています。再読込してから試してください");
    if (targetParentTaskId) {
      const parent = this.task(targetParentTaskId);
      if (!isRemaining(parent)) staticError("parent-completed", "完了済みの親には追加できません。親を再開してください");
    }
    if (beforeTaskId && this.entry(beforeTaskId).parentTaskId !== targetParentTaskId) staticError("anchor-scope-mismatch", "挿入位置が現在の階層と一致しません");
    const before = copy(this.fixture);
    const id = `preview-created-${this.fixture.sourceRevision + 1}`;
    const task = makeTask(id, trimmed, "queued");
    const siblings = this.fixture.entries.filter((entry) => entry.parentTaskId === targetParentTaskId).sort((a, b) => a.position - b.position);
    const index = beforeTaskId ? siblings.findIndex((entry) => entry.task.id === beforeTaskId) : siblings.length;
    const newEntry = { task, parentTaskId: targetParentTaskId, position: index < 0 ? siblings.length : index, depth: 0 };
    siblings.splice(index < 0 ? siblings.length : index, 0, newEntry);
    for (const [position, entry] of siblings.entries()) entry.position = position;
    this.fixture.entries.push(newEntry);
    this.fixture.sourceRevision += 1;
    this.fixture.hierarchyRevision += 1;
    this.fixture.queueRevision += 1;
    this.normalize();
    this.recordUndo("create", `「${trimmed}」を作成`, [id], before);
    return this.result([id], [id]);
  }

  async moveTaskInHierarchy(taskId: string, targetParentTaskId: string | undefined, beforeTaskId: string | undefined, expectedHierarchyRevision: number): Promise<HierarchyChangeResult> {
    this.controlledFailure();
    if (expectedHierarchyRevision !== this.fixture.hierarchyRevision) staticError("stale-hierarchy", "一覧が更新されています。移動先を選び直してください");
    const source = this.entry(taskId);
    const before = copy(this.fixture);
    if (targetParentTaskId && (targetParentTaskId === taskId || this.descendants(taskId).some((entry) => entry.task.id === targetParentTaskId))) staticError("hierarchy-cycle", "自分自身や子孫の中には移動できません");
    if (targetParentTaskId && !isRemaining(this.task(targetParentTaskId))) staticError("parent-completed", "完了済みの親には移動できません。親を再開してください");
    if (beforeTaskId && this.entry(beforeTaskId).parentTaskId !== targetParentTaskId) staticError("anchor-scope-mismatch", "挿入位置が現在の階層と一致しません");
    if (beforeTaskId === taskId || this.descendants(taskId).some((entry) => entry.task.id === beforeTaskId)) staticError("hierarchy-cycle", "自身の配下には移動できません");
    const subtree = [source, ...this.descendants(taskId)];
    const subtreeIds = new Set(subtree.map((entry) => entry.task.id));
    const siblings = this.fixture.entries.filter((entry) => entry.parentTaskId === targetParentTaskId && !subtreeIds.has(entry.task.id)).sort((a, b) => a.position - b.position);
    const index = beforeTaskId ? siblings.findIndex((entry) => entry.task.id === beforeTaskId) : siblings.length;
    source.parentTaskId = targetParentTaskId;
    siblings.splice(index < 0 ? siblings.length : index, 0, source);
    for (const [position, entry] of siblings.entries()) entry.position = position;
    this.fixture.sourceRevision += 1;
    this.fixture.hierarchyRevision += 1;
    this.normalize();
    this.recordUndo("move", `「${source.task.title}」を移動`, subtree.map((entry) => entry.task.id), before);
    return this.result([], subtree.map((entry) => entry.task.id));
  }

  async completeHierarchyTask(taskId: string, expectedTaskVersion: number): Promise<HierarchyChangeResult> {
    this.controlledFailure();
    const task = this.task(taskId);
    if (task.version !== expectedTaskVersion) staticError("version-conflict", "Task version is stale");
    if (task.state === "completed") staticError("invalid-state", "このタスクはすでに完了しています");
    const remaining = this.descendants(taskId).find((entry) => isRemaining(entry.task));
    if (remaining) staticError("incomplete-descendants", `未完了の子タスクがあります: ${remaining.task.title}`, remaining.task.id);
    const before = copy(this.fixture);
    task.state = "completed";
    task.version += 1;
    task.completedAt = PREVIEW_NOW;
    this.fixture.sourceRevision += 1;
    this.fixture.queueRevision += 1;
    this.recordUndo("complete", `「${task.title}」を完了`, [taskId], before);
    return this.result([taskId], [taskId]);
  }

  async reopenHierarchyTask(taskId: string, expectedTaskVersion: number): Promise<HierarchyChangeResult> {
    this.controlledFailure();
    const target = this.task(taskId);
    if (target.version !== expectedTaskVersion) staticError("version-conflict", "Task version is stale");
    if (target.state !== "completed") staticError("invalid-state", "完了済みのタスクだけ再開できます");
    const changed = [target, ...this.ancestors(taskId).map((entry) => entry.task).filter((task) => task.state === "completed")];
    const before = copy(this.fixture);
    for (const task of changed) { task.state = "queued"; task.version += 1; delete task.completedAt; }
    this.fixture.sourceRevision += 1;
    this.fixture.queueRevision += 1;
    this.recordUndo("reopen", `「${target.title}」を再開`, changed.map((task) => task.id), before);
    return this.result(changed.map((task) => task.id), changed.map((task) => task.id));
  }

  async deleteTaskSubtree(taskId: string, expectedTaskVersion: number, expectedHierarchyRevision: number): Promise<ReversibleChangeResult> {
    this.controlledFailure();
    if (expectedHierarchyRevision !== this.fixture.hierarchyRevision) staticError("stale-hierarchy", "一覧が更新されています。再読込してから試してください");
    const root = this.task(taskId);
    if (root.version !== expectedTaskVersion) staticError("version-conflict", "Task version is stale");
    const before = copy(this.fixture);
    const affectedTaskIds = [taskId, ...this.descendants(taskId).map((entry) => entry.task.id)];
    const affected = new Set(affectedTaskIds);
    this.fixture.entries = this.fixture.entries.filter((entry) => !affected.has(entry.task.id));
    this.fixture.tasks = this.fixture.tasks.filter((task) => !affected.has(task.id));
    this.fixture.sessions = this.fixture.sessions.filter((session) => !affected.has(session.taskId));
    this.fixture.events = this.fixture.events.filter((event) => !event.taskId || !affected.has(event.taskId));
    this.fixture.sourceRevision += 1;
    this.fixture.hierarchyRevision += 1;
    this.fixture.queueRevision += 1;
    this.normalize();
    this.recordUndo("delete", `「${root.title}」を削除`, affectedTaskIds, before);
    return this.reversibleResult(`preview-delete-${this.operationSequence}`, affectedTaskIds);
  }

  async getUndoStatus(): Promise<UndoStatus> {
    this.controlledFailure();
    return copy(this.undoStatus());
  }

  async undoLastTaskOperation(expectedOperationToken: string): Promise<ReversibleChangeResult> {
    this.controlledFailure();
    const latest = this.undoJournal.at(-1);
    if (!latest) staticError("undo-not-available", "取り消せる操作はありません");
    if (latest.token !== expectedOperationToken) staticError("stale-undo", "取り消し対象が更新されています");
    const currentVersions = new Map(this.fixture.entries.map((entry) => [entry.task.id, entry.task.version]));
    const sourceRevision = this.fixture.sourceRevision + 1;
    const hierarchyRevision = this.fixture.hierarchyRevision + 1;
    const queueRevision = this.fixture.queueRevision + 1;
    this.fixture.tasks = copy(latest.snapshot.tasks);
    this.fixture.entries = copy(latest.snapshot.entries);
    this.fixture.sessions = copy(latest.snapshot.sessions);
    this.fixture.events = copy(latest.snapshot.events);
    this.fixture.sourceRevision = sourceRevision;
    this.fixture.hierarchyRevision = hierarchyRevision;
    this.fixture.queueRevision = queueRevision;
    const affected = new Set(latest.affectedTaskIds);
    for (const entry of this.fixture.entries) {
      const monotonicVersion = Math.max(entry.task.version, currentVersions.get(entry.task.id) ?? entry.task.version);
      entry.task.version = affected.has(entry.task.id) ? monotonicVersion + 1 : monotonicVersion;
    }
    this.fixture.tasks = this.fixture.entries.map((entry) => copy(entry.task));
    this.undoJournal.pop();
    this.undoRevision += 1;
    this.normalize();
    return this.reversibleResult(`preview-undo-operation-${this.operationSequence}`, latest.affectedTaskIds);
  }
}

export function createFixtureTaskApi(variant: PreviewVariant = "empty"): TaskApi {
  const fixture = variant === "empty" ? buildFixture([], [], [], 0) : variant === "dense" ? buildDense() : variant === "no-active" ? buildNoActive() : variant === "only-completed" ? buildOnlyCompleted() : variant === "deep" ? buildDeep() : buildTypical();
  return new StaticFixtureTaskApi(variant, fixture);
}

export function previewVariantFromLocation(): PreviewVariant | undefined {
  if (typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get("preview");
  return value === "typical" || value === "dense" || value === "no-active" || value === "empty" || value === "error" || value === "only-completed" || value === "deep" ? value : undefined;
}
