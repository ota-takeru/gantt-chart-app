use serde::{Deserialize, Serialize};

/// Stable error returned by the headless application layer.
///
/// The message is intentionally safe to show to a caller.  SQLite details are
/// kept out of this type so a persistence failure does not expose local paths
/// or SQL text through the command boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DomainError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl DomainError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(
        code: &'static str,
        message: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            detail: Some(detail.into()),
        }
    }
}

impl std::fmt::Display for DomainError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for DomainError {}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskState {
    Queued,
    Active,
    Paused,
    Completed,
}

impl TaskState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Completed => "completed",
        }
    }

    pub fn parse(value: &str) -> Result<Self, DomainError> {
        match value {
            "queued" => Ok(Self::Queued),
            "active" => Ok(Self::Active),
            "paused" => Ok(Self::Paused),
            "completed" => Ok(Self::Completed),
            _ => Err(DomainError::with_detail(
                "persistence-failure",
                "Stored task state is invalid",
                value,
            )),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EndReason {
    Paused,
    Switched,
    Completed,
}

impl EndReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Paused => "paused",
            Self::Switched => "switched",
            Self::Completed => "completed",
        }
    }

    pub fn parse(value: &str) -> Result<Self, DomainError> {
        match value {
            "paused" => Ok(Self::Paused),
            "switched" => Ok(Self::Switched),
            "completed" => Ok(Self::Completed),
            _ => Err(DomainError::with_detail(
                "persistence-failure",
                "Stored session end reason is invalid",
                value,
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskSnapshot {
    pub id: String,
    pub title: String,
    pub state: TaskState,
    pub version: i64,
    pub created_at: String,
    /// The most recent completion event, retained after a task is reopened.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_start_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleResult {
    pub operation_id: String,
    pub changed_tasks: Vec<TaskSnapshot>,
    pub queue_revision: i64,
    pub source_revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueuePlacement {
    #[serde(default)]
    pub before_task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SwitchExpectedVersions {
    #[serde(alias = "fromTaskVersion", alias = "from")]
    pub from_version: i64,
    #[serde(alias = "toTaskVersion", alias = "to")]
    pub to_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueueEntrySnapshot {
    pub task_id: String,
    pub task: TaskSnapshot,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueuePage {
    pub entries: Vec<QueueEntrySnapshot>,
    /// A convenience projection for consumers that only need stable IDs.
    pub task_ids: Vec<String>,
    pub queue_revision: i64,
    pub source_revision: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueueChangeResult {
    pub operation_id: String,
    pub task_id: String,
    pub position: i64,
    pub queue_revision: i64,
    pub source_revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkSession {
    pub id: String,
    pub task_id: String,
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_reason: Option<EndReason>,
    pub operation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActualHistorySummary {
    pub task_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_start_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_completion_at: Option<String>,
    pub total_closed_duration_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_open_session: Option<WorkSession>,
    pub session_count: i64,
    pub source_revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkSessionPage {
    pub sessions: Vec<WorkSession>,
    pub source_revision: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleEvent {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    pub operation_id: String,
    pub event_type: String,
    pub occurred_at: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub kind: String,
    pub at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<WorkSession>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<LifecycleEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActualHistoryPage {
    pub items: Vec<HistoryItem>,
    pub sessions: Vec<WorkSession>,
    pub events: Vec<LifecycleEvent>,
    pub source_revision: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionLimits {
    #[serde(default = "default_segment_limit")]
    pub segment_limit: u32,
    #[serde(default = "default_next_work_limit")]
    pub next_work_limit: u32,
}

fn default_segment_limit() -> u32 {
    200
}

fn default_next_work_limit() -> u32 {
    50
}

impl Default for ProjectionLimits {
    fn default() -> Self {
        Self {
            segment_limit: default_segment_limit(),
            next_work_limit: default_next_work_limit(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionMetadata {
    pub source_revision: i64,
    pub query_instant: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_zone: Option<String>,
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    pub query_duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FocusSegment {
    pub session_id: String,
    pub task_id: String,
    pub task_title: String,
    pub started_at: String,
    pub ended_at: String,
    pub effective_end: bool,
    pub source_reference: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FocusProjection {
    pub segments: Vec<FocusSegment>,
    pub current_focus: Option<TaskSnapshot>,
    pub next_work: QueuePage,
    pub metadata: ProjectionMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskDaySummary {
    pub task_id: String,
    pub task_title: String,
    pub actual_duration_ms: i64,
    pub session_count: i64,
    pub completion_count: i64,
    pub detail_references: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DaySummaryPage {
    pub local_date: String,
    pub time_zone: String,
    pub day_start_utc: String,
    pub day_end_utc: String,
    pub tasks: Vec<TaskDaySummary>,
    pub source_revision: i64,
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    pub query_instant: String,
    pub query_duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveDaySummary {
    pub local_date: String,
    pub actual_duration_ms: i64,
    pub distinct_task_count: i64,
    pub session_count: i64,
    pub completion_count: i64,
    pub detail_references: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSummaryPage {
    pub local_date_start: String,
    pub local_date_end: String,
    pub time_zone: String,
    pub days: Vec<ArchiveDaySummary>,
    pub source_revision: i64,
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    pub query_instant: String,
    pub query_duration_ms: i64,
}

/// A task's stable placement in the hierarchy.  Lifecycle state is kept on
/// [`TaskSnapshot`]; placement is deliberately orthogonal so completing a
/// task never removes it from the tree.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HierarchyEntry {
    pub task: TaskSnapshot,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_task_id: Option<String>,
    pub position: i64,
    pub depth: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskForestSnapshot {
    pub entries: Vec<HierarchyEntry>,
    pub hierarchy_revision: i64,
    pub source_revision: i64,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HierarchyChangeResult {
    pub operation_id: String,
    pub hierarchy_revision: i64,
    pub source_revision: i64,
    pub changed_entries: Vec<HierarchyEntry>,
    pub changed_tasks: Vec<TaskSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UndoStatus {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub committed_at: Option<String>,
    pub undo_revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReversibleChangeResult {
    pub operation_id: String,
    pub source_revision: i64,
    pub hierarchy_revision: i64,
    pub queue_revision: i64,
    pub undo_revision: i64,
    pub affected_task_ids: Vec<String>,
    pub undo_status: UndoStatus,
}
