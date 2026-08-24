export type TaskState = "queued" | "active" | "paused" | "completed";

export type EndReason = "paused" | "switched" | "completed";

export interface DomainError {
  code: string;
  message: string;
  detail?: string;
}

export interface TaskSnapshot {
  id: string;
  title: string;
  state: TaskState;
  version: number;
  createdAt: string;
  memo: string;
  completedAt?: string;
  actualStartAt?: string;
}

export interface LifecycleResult {
  operationId: string;
  changedTasks: TaskSnapshot[];
  queueRevision: number;
  sourceRevision: number;
}

export interface QueuePlacement {
  beforeTaskId?: string;
}

export interface SwitchExpectedVersions {
  fromVersion: number;
  toVersion: number;
}

export interface QueueEntrySnapshot {
  taskId: string;
  task: TaskSnapshot;
  position: number;
}

export interface QueuePage {
  entries: QueueEntrySnapshot[];
  taskIds: string[];
  queueRevision: number;
  sourceRevision: number;
  nextCursor?: string;
}

export interface QueueChangeResult {
  operationId: string;
  taskId: string;
  position: number;
  queueRevision: number;
  sourceRevision: number;
}

export interface WorkSession {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt?: string;
  endReason?: EndReason;
  operationId: string;
}

export interface ActualHistorySummary {
  taskId: string;
  actualStartAt?: string;
  latestCompletionAt?: string;
  totalClosedDurationMs: number;
  currentOpenSession?: WorkSession;
  sessionCount: number;
  sourceRevision: number;
}

export interface WorkSessionPage {
  sessions: WorkSession[];
  sourceRevision: number;
  nextCursor?: string;
}

export interface LifecycleEvent {
  id: string;
  taskId?: string;
  operationId: string;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface HistoryItem {
  kind: string;
  at: string;
  session?: WorkSession;
  event?: LifecycleEvent;
}

export interface ActualHistoryPage {
  items: HistoryItem[];
  sessions: WorkSession[];
  events: LifecycleEvent[];
  sourceRevision: number;
  nextCursor?: string;
}

export interface ProjectionLimits {
  segmentLimit: number;
  nextWorkLimit: number;
}

export interface ProjectionMetadata {
  sourceRevision: number;
  queryInstant: string;
  timeZone?: string;
  truncated: boolean;
  nextCursor?: string;
  queryDurationMs: number;
}

export interface FocusSegment {
  sessionId: string;
  taskId: string;
  taskTitle: string;
  startedAt: string;
  endedAt: string;
  effectiveEnd: boolean;
  sourceReference: string;
}

export interface FocusProjection {
  segments: FocusSegment[];
  currentFocus?: TaskSnapshot;
  nextWork: QueuePage;
  metadata: ProjectionMetadata;
}

export interface TaskDaySummary {
  taskId: string;
  taskTitle: string;
  actualDurationMs: number;
  sessionCount: number;
  completionCount: number;
  detailReferences: string[];
}

export interface DaySummaryPage {
  localDate: string;
  timeZone: string;
  dayStartUtc: string;
  dayEndUtc: string;
  tasks: TaskDaySummary[];
  sourceRevision: number;
  truncated: boolean;
  nextCursor?: string;
  queryInstant: string;
  queryDurationMs: number;
}

export interface ArchiveDaySummary {
  localDate: string;
  actualDurationMs: number;
  distinctTaskCount: number;
  sessionCount: number;
  completionCount: number;
  detailReferences: string[];
}

export interface ArchiveSummaryPage {
  localDateStart: string;
  localDateEnd: string;
  timeZone: string;
  days: ArchiveDaySummary[];
  sourceRevision: number;
  truncated: boolean;
  nextCursor?: string;
  queryInstant: string;
  queryDurationMs: number;
}

/** A task's durable position in the hierarchy. Lifecycle state is orthogonal. */
export interface HierarchyEntry {
  task: TaskSnapshot;
  parentTaskId?: string;
  position: number;
  depth: number;
}

export interface TaskForestSnapshot {
  entries: HierarchyEntry[];
  hierarchyRevision: number;
  sourceRevision: number;
  truncated: boolean;
}

export interface HierarchyChangeResult {
  operationId: string;
  hierarchyRevision: number;
  sourceRevision: number;
  changedEntries: HierarchyEntry[];
  changedTasks: TaskSnapshot[];
}

export type UndoOperationKind = "create" | "rename" | "move" | "complete" | "reopen" | "delete" | "memo-update";

export interface UndoStatus {
  available: boolean;
  operationToken?: string;
  operationKind?: UndoOperationKind;
  label?: string;
  committedAt?: string;
  undoRevision: number;
}

export interface ReversibleChangeResult {
  operationId: string;
  sourceRevision: number;
  hierarchyRevision: number;
  queueRevision: number;
  undoRevision: number;
  affectedTaskIds: string[];
  undoStatus: UndoStatus;
}

export interface TaskApi {
  createTask(title: string, effectiveInstant?: string): Promise<TaskSnapshot>;
  renameTask(
    taskId: string,
    title: string,
    expectedVersion: number,
    effectiveInstant?: string,
  ): Promise<TaskSnapshot>;
  updateTaskMemo(
    taskId: string,
    memo: string,
    expectedTaskVersion: number,
    effectiveInstant?: string,
  ): Promise<ReversibleChangeResult>;
  startTask(
    taskId: string,
    expectedVersion: number,
    effectiveInstant?: string,
  ): Promise<LifecycleResult>;
  switchFocus(
    fromTaskId: string,
    toTaskId: string,
    expectedVersions: SwitchExpectedVersions,
    fromQueuePlacement?: QueuePlacement,
    expectedQueueRevision?: number,
    effectiveInstant?: string,
  ): Promise<LifecycleResult>;
  pauseTask(
    taskId: string,
    expectedVersion: number,
    queuePlacement?: QueuePlacement,
    effectiveInstant?: string,
  ): Promise<LifecycleResult>;
  completeTask(
    taskId: string,
    expectedVersion: number,
    effectiveInstant?: string,
  ): Promise<LifecycleResult>;
  reopenTask(
    taskId: string,
    expectedVersion: number,
    queuePlacement?: QueuePlacement,
    effectiveInstant?: string,
  ): Promise<LifecycleResult>;
  getCurrentFocus(): Promise<TaskSnapshot | null>;
  getTask(taskId: string): Promise<TaskSnapshot>;
  getNextQueue(afterCursor: string | undefined, limit: number): Promise<QueuePage>;
  moveQueuedTask(
    taskId: string,
    beforeTaskId: string | undefined,
    expectedQueueRevision: number,
    effectiveInstant?: string,
  ): Promise<QueueChangeResult>;
  getTaskActualHistory(taskId: string): Promise<ActualHistorySummary>;
  getTaskSessions(
    taskId: string,
    afterCursor: string | undefined,
    limit: number,
  ): Promise<WorkSessionPage>;
  getHistoryByActualRange(
    rangeStart: string,
    rangeEnd: string,
    afterCursor: string | undefined,
    limit: number,
  ): Promise<ActualHistoryPage>;
  getFocusProjection(
    rangeStart: string,
    rangeEnd: string,
    currentInstant: string,
    nextCursor: string | undefined,
    limits: ProjectionLimits,
  ): Promise<FocusProjection>;
  getDaySummary(
    localDate: string,
    timeZone: string,
    currentInstant: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<DaySummaryPage>;
  getArchiveSummary(
    localDateStart: string,
    localDateEnd: string,
    timeZone: string,
    currentInstant: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<ArchiveSummaryPage>;

  createTaskInHierarchy(
    title: string,
    targetParentTaskId: string | undefined,
    beforeTaskId: string | undefined,
    expectedHierarchyRevision: number,
    effectiveInstant?: string,
  ): Promise<HierarchyChangeResult>;
  moveTaskInHierarchy(
    taskId: string,
    targetParentTaskId: string | undefined,
    beforeTaskId: string | undefined,
    expectedHierarchyRevision: number,
    effectiveInstant?: string,
  ): Promise<HierarchyChangeResult>;
  completeHierarchyTask(
    taskId: string,
    expectedTaskVersion: number,
    effectiveInstant?: string,
  ): Promise<HierarchyChangeResult>;
  reopenHierarchyTask(
    taskId: string,
    expectedTaskVersion: number,
    effectiveInstant?: string,
  ): Promise<HierarchyChangeResult>;
  getTaskForest(limit: number): Promise<TaskForestSnapshot>;
  deleteTaskSubtree(
    taskId: string,
    expectedTaskVersion: number,
    expectedHierarchyRevision: number,
    effectiveInstant?: string,
  ): Promise<ReversibleChangeResult>;
  getUndoStatus(): Promise<UndoStatus>;
  undoLastTaskOperation(
    expectedOperationToken: string,
    effectiveInstant?: string,
  ): Promise<ReversibleChangeResult>;
}

export const emptyProjectionLimits: ProjectionLimits = {
  segmentLimit: 200,
  nextWorkLimit: 12,
};

export function isDomainError(value: unknown): value is DomainError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

export function normalizeDomainError(error: unknown): DomainError {
  if (isDomainError(error)) return error;
  if (error instanceof Error) {
    return { code: "persistence-failure", message: error.message };
  }
  return { code: "persistence-failure", message: String(error) };
}
