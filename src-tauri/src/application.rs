use crate::domain::{
    ActualHistoryPage, ActualHistorySummary, ArchiveDaySummary, ArchiveSummaryPage, DaySummaryPage,
    DomainError, EndReason, FocusProjection, FocusSegment, HierarchyChangeResult, HierarchyEntry,
    HistoryItem, LifecycleResult, ProjectionLimits, ProjectionMetadata, QueueChangeResult,
    QueuePage, QueuePlacement, ReversibleChangeResult, SwitchExpectedVersions, TaskDaySummary,
    TaskForestSnapshot, TaskSnapshot, TaskState, UndoStatus, WorkSessionPage,
};
use crate::infrastructure as db;
use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::time::Instant;

const MAX_PAGE_SIZE: u32 = 200;
const MAX_ARCHIVE_DAYS: i64 = 366;
const MAX_UNDO_ENTRIES: i64 = 50;
const MAX_MEMO_SCALARS: usize = 4_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotTask {
    id: String,
    title: String,
    state: String,
    created_at: String,
    #[serde(default)]
    memo: String,
    completed_at: Option<String>,
    version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotQueueEntry {
    task_id: String,
    position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotHierarchyEntry {
    task_id: String,
    parent_task_id: Option<String>,
    position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotSession {
    id: String,
    task_id: String,
    started_at: String,
    ended_at: Option<String>,
    end_reason: Option<String>,
    operation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotEvent {
    id: String,
    task_id: Option<String>,
    operation_id: String,
    event_type: String,
    occurred_at: String,
    payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ObservableSnapshot {
    tasks: Vec<SnapshotTask>,
    queue_entries: Vec<SnapshotQueueEntry>,
    hierarchy_entries: Vec<SnapshotHierarchyEntry>,
    sessions: Vec<SnapshotSession>,
    events: Vec<SnapshotEvent>,
}

struct JournalEntry {
    operation_token: String,
    affected_task_ids: Vec<String>,
    snapshot: ObservableSnapshot,
    expected_source_revision: i64,
    expected_hierarchy_revision: i64,
    expected_queue_revision: i64,
}

fn transaction(connection: &mut Connection) -> Result<Transaction<'_>, DomainError> {
    connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db::storage_error)
}

fn capture_observable_snapshot(connection: &Connection) -> Result<ObservableSnapshot, DomainError> {
    let tasks = {
        let mut statement = connection
            .prepare(
                "SELECT id, title, state, created_at, memo, completed_at, version FROM tasks ORDER BY id",
            )
            .map_err(db::storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(SnapshotTask {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    state: row.get(2)?,
                    created_at: row.get(3)?,
                    memo: row.get(4)?,
                    completed_at: row.get(5)?,
                    version: row.get(6)?,
                })
            })
            .map_err(db::storage_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(db::storage_error)?
    };
    let queue_entries = {
        let mut statement = connection
            .prepare("SELECT task_id, position FROM queue_entries ORDER BY position, task_id")
            .map_err(db::storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(SnapshotQueueEntry {
                    task_id: row.get(0)?,
                    position: row.get(1)?,
                })
            })
            .map_err(db::storage_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(db::storage_error)?
    };
    let hierarchy_entries = {
        let mut statement = connection
            .prepare(
                "SELECT task_id, parent_task_id, position FROM task_hierarchy ORDER BY task_id",
            )
            .map_err(db::storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(SnapshotHierarchyEntry {
                    task_id: row.get(0)?,
                    parent_task_id: row.get(1)?,
                    position: row.get(2)?,
                })
            })
            .map_err(db::storage_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(db::storage_error)?
    };
    let sessions = {
        let mut statement = connection
            .prepare("SELECT id, task_id, started_at, ended_at, end_reason, operation_id FROM work_sessions ORDER BY id")
            .map_err(db::storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(SnapshotSession {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    end_reason: row.get(4)?,
                    operation_id: row.get(5)?,
                })
            })
            .map_err(db::storage_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(db::storage_error)?
    };
    let events = {
        let mut statement = connection
            .prepare("SELECT id, task_id, operation_id, event_type, occurred_at, payload FROM task_events ORDER BY id")
            .map_err(db::storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(SnapshotEvent {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    operation_id: row.get(2)?,
                    event_type: row.get(3)?,
                    occurred_at: row.get(4)?,
                    payload: row.get(5)?,
                })
            })
            .map_err(db::storage_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(db::storage_error)?
    };
    Ok(ObservableSnapshot {
        tasks,
        queue_entries,
        hierarchy_entries,
        sessions,
        events,
    })
}

fn record_undo_entry(
    transaction: &Transaction<'_>,
    operation_id: &str,
    operation_kind: &str,
    label: &str,
    committed_at: &str,
    affected_task_ids: &[String],
    snapshot: &ObservableSnapshot,
) -> Result<i64, DomainError> {
    let affected_json = serde_json::to_string(affected_task_ids).map_err(|_| {
        DomainError::new("persistence-failure", "Undo journal could not be encoded")
    })?;
    let snapshot_json = serde_json::to_string(snapshot).map_err(|_| {
        DomainError::new("persistence-failure", "Undo snapshot could not be encoded")
    })?;
    transaction
        .execute(
            "INSERT INTO undo_journal
         (operation_token, operation_id, operation_kind, label, committed_at,
          affected_task_ids, snapshot_json, expected_source_revision,
          expected_hierarchy_revision, expected_queue_revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                operation_id,
                operation_id,
                operation_kind,
                label,
                committed_at,
                affected_json,
                snapshot_json,
                db::source_revision(transaction)?,
                db::hierarchy_revision(transaction)?,
                db::queue_revision(transaction)?,
            ],
        )
        .map_err(db::storage_error)?;
    transaction
        .execute(
            "DELETE FROM undo_journal WHERE sequence IN (
             SELECT sequence FROM undo_journal ORDER BY sequence DESC LIMIT -1 OFFSET ?1
         )",
            [MAX_UNDO_ENTRIES],
        )
        .map_err(db::storage_error)?;
    db::bump_undo_revision(transaction)
}

fn undo_status_in(connection: &Connection) -> Result<UndoStatus, DomainError> {
    let latest = connection
        .query_row(
            "SELECT operation_token, operation_kind, label, committed_at
         FROM undo_journal ORDER BY sequence DESC LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(db::storage_error)?;
    let undo_revision = db::undo_revision(connection)?;
    Ok(match latest {
        Some((operation_token, operation_kind, label, committed_at)) => UndoStatus {
            available: true,
            operation_token: Some(operation_token),
            operation_kind: Some(operation_kind),
            label: Some(label),
            committed_at: Some(committed_at),
            undo_revision,
        },
        None => UndoStatus {
            available: false,
            operation_token: None,
            operation_kind: None,
            label: None,
            committed_at: None,
            undo_revision,
        },
    })
}

fn latest_journal_entry(connection: &Connection) -> Result<Option<JournalEntry>, DomainError> {
    let raw = connection
        .query_row(
            "SELECT operation_token, affected_task_ids,
                snapshot_json, expected_source_revision, expected_hierarchy_revision,
                expected_queue_revision
         FROM undo_journal ORDER BY sequence DESC LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            },
        )
        .optional()
        .map_err(db::storage_error)?;
    raw.map(
        |(
            operation_token,
            affected_json,
            snapshot_json,
            expected_source_revision,
            expected_hierarchy_revision,
            expected_queue_revision,
        )| {
            let affected_task_ids = serde_json::from_str(&affected_json).map_err(|_| {
                DomainError::new("persistence-failure", "Stored undo journal is invalid")
            })?;
            let snapshot = serde_json::from_str(&snapshot_json).map_err(|_| {
                DomainError::new("persistence-failure", "Stored undo snapshot is invalid")
            })?;
            Ok(JournalEntry {
                operation_token,
                affected_task_ids,
                snapshot,
                expected_source_revision,
                expected_hierarchy_revision,
                expected_queue_revision,
            })
        },
    )
    .transpose()
}

fn restore_observable_snapshot(
    transaction: &Transaction<'_>,
    snapshot: &ObservableSnapshot,
    affected_task_ids: &[String],
) -> Result<(), DomainError> {
    let affected = affected_task_ids.iter().cloned().collect::<HashSet<_>>();
    let current_versions = {
        let mut statement = transaction
            .prepare("SELECT id, version FROM tasks")
            .map_err(db::storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(db::storage_error)?
            .collect::<Result<HashMap<_, _>, _>>()
            .map_err(db::storage_error)?;
        rows
    };
    transaction
        .execute("DELETE FROM task_events", [])
        .map_err(db::storage_error)?;
    transaction
        .execute("DELETE FROM work_sessions", [])
        .map_err(db::storage_error)?;
    transaction
        .execute("DELETE FROM task_hierarchy", [])
        .map_err(db::storage_error)?;
    transaction
        .execute("DELETE FROM queue_entries", [])
        .map_err(db::storage_error)?;
    transaction
        .execute("DELETE FROM tasks", [])
        .map_err(db::storage_error)?;
    for task in &snapshot.tasks {
        let monotonic_version = current_versions
            .get(&task.id)
            .copied()
            .unwrap_or(task.version)
            .max(task.version);
        let version = if affected.contains(&task.id) {
            monotonic_version.checked_add(1).ok_or_else(|| {
                DomainError::new("persistence-failure", "Task version is exhausted")
            })?
        } else {
            monotonic_version
        };
        transaction
            .execute(
                "INSERT INTO tasks (id, title, state, created_at, memo, completed_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    task.id,
                    task.title,
                    task.state,
                    task.created_at,
                    task.memo,
                    task.completed_at,
                    version
                ],
            )
            .map_err(db::storage_error)?;
    }
    for row in &snapshot.hierarchy_entries {
        transaction.execute(
            "INSERT INTO task_hierarchy (task_id, parent_task_id, position) VALUES (?1, ?2, ?3)",
            params![row.task_id, row.parent_task_id, row.position],
        ).map_err(db::storage_error)?;
    }
    for row in &snapshot.queue_entries {
        transaction
            .execute(
                "INSERT INTO queue_entries (task_id, position) VALUES (?1, ?2)",
                params![row.task_id, row.position],
            )
            .map_err(db::storage_error)?;
    }
    for row in &snapshot.sessions {
        transaction.execute(
            "INSERT INTO work_sessions (id, task_id, started_at, ended_at, end_reason, operation_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![row.id, row.task_id, row.started_at, row.ended_at, row.end_reason, row.operation_id],
        ).map_err(db::storage_error)?;
    }
    for row in &snapshot.events {
        transaction.execute(
            "INSERT INTO task_events (id, task_id, operation_id, event_type, occurred_at, payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![row.id, row.task_id, row.operation_id, row.event_type, row.occurred_at, row.payload],
        ).map_err(db::storage_error)?;
    }
    Ok(())
}

fn validate_title(title: &str) -> Result<String, DomainError> {
    let trimmed = title.trim();
    let length = trimmed.chars().count();
    if length == 0 || length > 240 {
        return Err(DomainError::new(
            "invalid-title",
            "Title must contain between 1 and 240 Unicode characters",
        ));
    }
    Ok(trimmed.to_owned())
}

fn validate_memo(memo: &str) -> Result<(), DomainError> {
    if memo.chars().count() > MAX_MEMO_SCALARS {
        return Err(DomainError::new(
            "invalid-memo",
            "Memo must contain at most 4000 Unicode scalar values",
        ));
    }
    Ok(())
}

fn validate_version(version: i64) -> Result<(), DomainError> {
    if version < 0 {
        Err(DomainError::new("stale-version", "Task version is stale"))
    } else {
        Ok(())
    }
}

fn instant(value: &str) -> Result<DateTime<Utc>, DomainError> {
    db::parse_instant(value)
}

fn canonical(value: DateTime<Utc>) -> String {
    db::canonical_instant(value)
}

fn ensure_not_before(value: DateTime<Utc>, lower_bound: DateTime<Utc>) -> Result<(), DomainError> {
    if value < lower_bound {
        Err(DomainError::new(
            "invalid-effective-instant",
            "Effective instant precedes an affected session boundary",
        ))
    } else {
        Ok(())
    }
}

fn validate_task_effective_instant(
    transaction: &Transaction<'_>,
    task_id: &str,
    effective: DateTime<Utc>,
) -> Result<(), DomainError> {
    let task = db::task_snapshot(transaction, task_id)?;
    ensure_not_before(effective, instant(&task.created_at)?)?;
    if let Some(latest_event) = db::latest_event_instant(transaction, task_id)? {
        ensure_not_before(effective, latest_event)?;
    }
    Ok(())
}

fn check_last_session_end(
    connection: &Connection,
    task_id: &str,
    start: DateTime<Utc>,
) -> Result<(), DomainError> {
    if let Some(last_end) = db::latest_session_end(connection, task_id)? {
        ensure_not_before(start, last_end)?;
    }
    Ok(())
}

fn task_in_transaction(
    transaction: &Transaction<'_>,
    task_id: &str,
) -> Result<TaskSnapshot, DomainError> {
    db::task_snapshot(transaction, task_id)
}

fn current_active_id(transaction: &Transaction<'_>) -> Result<Option<String>, DomainError> {
    transaction
        .query_row(
            "SELECT id FROM tasks WHERE state = 'active' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(db::storage_error)
}

fn ensure_queue_member(transaction: &Transaction<'_>, task_id: &str) -> Result<(), DomainError> {
    let present: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM queue_entries WHERE task_id = ?1)",
            [task_id],
            |row| row.get(0),
        )
        .map_err(db::storage_error)?;
    if present {
        Ok(())
    } else {
        Err(DomainError::new(
            "persistence-failure",
            "Task state and queue membership are inconsistent",
        ))
    }
}

fn ensure_no_queue_member(transaction: &Transaction<'_>, task_id: &str) -> Result<(), DomainError> {
    let present: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM queue_entries WHERE task_id = ?1)",
            [task_id],
            |row| row.get(0),
        )
        .map_err(db::storage_error)?;
    if !present {
        Ok(())
    } else {
        Err(DomainError::new(
            "persistence-failure",
            "Task state and queue membership are inconsistent",
        ))
    }
}

fn changed_result(
    connection: &Connection,
    operation_id: String,
    task_ids: &[&str],
    queue_revision: i64,
    source_revision: i64,
) -> Result<LifecycleResult, DomainError> {
    let changed_tasks = task_ids
        .iter()
        .map(|id| db::task_snapshot(connection, id))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(LifecycleResult {
        operation_id,
        changed_tasks,
        queue_revision,
        source_revision,
    })
}

pub fn create_task(
    connection: &mut Connection,
    title: &str,
    effective_instant: &str,
) -> Result<TaskSnapshot, DomainError> {
    let expected_hierarchy_revision = db::hierarchy_revision(connection)?;
    let result = create_task_in_hierarchy_internal(
        connection,
        title,
        None,
        None,
        expected_hierarchy_revision,
        effective_instant,
    )?;
    result
        .changed_tasks
        .into_iter()
        .next()
        .ok_or_else(|| DomainError::new("persistence-failure", "Created task is unavailable"))
}

pub fn rename_task(
    connection: &mut Connection,
    task_id: &str,
    title: &str,
    expected_version: i64,
    effective_instant: &str,
) -> Result<TaskSnapshot, DomainError> {
    let title = validate_title(title)?;
    validate_version(expected_version)?;
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let undo_snapshot = capture_observable_snapshot(&transaction)?;
    let task = task_in_transaction(&transaction, task_id)?;
    if task.version != expected_version {
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    validate_task_effective_instant(&transaction, task_id, effective_dt)?;
    db::update_task_title(&transaction, task_id, expected_version, &title)?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "task-renamed",
        &effective,
        &json!({ "title": title }),
    )?;
    let source_revision = db::bump_source_revision(&transaction)?;
    record_undo_entry(
        &transaction,
        &operation_id,
        "rename",
        &format!("「{}」の名前変更", task.title),
        &effective,
        &[task_id.to_owned()],
        &undo_snapshot,
    )?;
    transaction.commit().map_err(db::storage_error)?;
    let _ = source_revision;
    db::task_snapshot(connection, task_id)
}

pub fn update_task_memo(
    connection: &mut Connection,
    task_id: &str,
    memo: &str,
    expected_task_version: i64,
    effective_instant: &str,
) -> Result<ReversibleChangeResult, DomainError> {
    validate_memo(memo)?;
    validate_version(expected_task_version)?;
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let task = task_in_transaction(&transaction, task_id)?;
    if task.version != expected_task_version {
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    validate_task_effective_instant(&transaction, task_id, effective_dt)?;

    let source_revision = db::source_revision(&transaction)?;
    let hierarchy_revision = db::hierarchy_revision(&transaction)?;
    let queue_revision = db::queue_revision(&transaction)?;
    let undo_revision = db::undo_revision(&transaction)?;
    if task.memo == memo {
        transaction.commit().map_err(db::storage_error)?;
        return Ok(ReversibleChangeResult {
            operation_id,
            source_revision,
            hierarchy_revision,
            queue_revision,
            undo_revision,
            affected_task_ids: vec![task_id.to_owned()],
            undo_status: undo_status_in(connection)?,
        });
    }

    let undo_snapshot = capture_observable_snapshot(&transaction)?;
    db::update_task_memo(&transaction, task_id, expected_task_version, memo)?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "task-memo-updated",
        &effective,
        &json!({
            "hasMemo": !memo.is_empty(),
            "scalarLength": memo.chars().count(),
        }),
    )?;
    let source_revision = db::bump_source_revision(&transaction)?;
    let undo_revision = record_undo_entry(
        &transaction,
        &operation_id,
        "memo-update",
        &format!("「{}」のメモを更新", task.title),
        &effective,
        &[task_id.to_owned()],
        &undo_snapshot,
    )?;
    transaction.commit().map_err(db::storage_error)?;
    Ok(ReversibleChangeResult {
        operation_id,
        source_revision,
        hierarchy_revision,
        queue_revision,
        undo_revision,
        affected_task_ids: vec![task_id.to_owned()],
        undo_status: undo_status_in(connection)?,
    })
}

pub fn start_task(
    connection: &mut Connection,
    task_id: &str,
    expected_version: i64,
    effective_instant: &str,
) -> Result<LifecycleResult, DomainError> {
    validate_version(expected_version)?;
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let task = task_in_transaction(&transaction, task_id)?;
    if task.version != expected_version {
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    validate_task_effective_instant(&transaction, task_id, effective_dt)?;
    match task.state {
        TaskState::Queued | TaskState::Paused => {}
        TaskState::Active => {
            return Err(DomainError::new(
                "invalid-transition",
                "Task is already active",
            ));
        }
        TaskState::Completed => {
            return Err(DomainError::new(
                "invalid-transition",
                "Completed task must be reopened first",
            ));
        }
    }
    if let Some(active_id) = current_active_id(&transaction)? {
        if active_id != task_id {
            return Err(DomainError::new(
                "active-task-conflict",
                "Another task is already active",
            ));
        }
    }
    ensure_queue_member(&transaction, task_id)?;
    check_last_session_end(&transaction, task_id, effective_dt)?;
    db::update_task_state(
        &transaction,
        task_id,
        expected_version,
        TaskState::Active,
        None,
    )?;
    db::remove_queue_entry(&transaction, task_id)?;
    let session_id = db::open_session(&transaction, task_id, &effective, &operation_id)?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "task-started",
        &effective,
        &json!({ "sessionId": session_id }),
    )?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "task-dequeued",
        &effective,
        &json!({}),
    )?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "session-opened",
        &effective,
        &json!({ "sessionId": session_id }),
    )?;
    let queue_revision = db::bump_queue_revision(&transaction)?;
    let source_revision = db::bump_source_revision(&transaction)?;
    transaction.commit().map_err(db::storage_error)?;
    changed_result(
        connection,
        operation_id,
        &[task_id],
        queue_revision,
        source_revision,
    )
}

pub fn switch_focus(
    connection: &mut Connection,
    from_task_id: &str,
    to_task_id: &str,
    expected_versions: SwitchExpectedVersions,
    effective_instant: &str,
) -> Result<LifecycleResult, DomainError> {
    switch_focus_v1_1(
        connection,
        from_task_id,
        to_task_id,
        expected_versions,
        None,
        None,
        effective_instant,
    )
}

pub fn switch_focus_v1_1(
    connection: &mut Connection,
    from_task_id: &str,
    to_task_id: &str,
    expected_versions: SwitchExpectedVersions,
    from_queue_placement: Option<QueuePlacement>,
    expected_queue_revision: Option<i64>,
    effective_instant: &str,
) -> Result<LifecycleResult, DomainError> {
    validate_version(expected_versions.from_version)?;
    validate_version(expected_versions.to_version)?;
    if from_task_id == to_task_id {
        return Err(DomainError::new(
            "invalid-transition",
            "Focus switch requires two tasks",
        ));
    }
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let current_queue_revision = db::queue_revision(&transaction)?;
    if from_queue_placement.is_some() {
        let expected_revision = expected_queue_revision.ok_or_else(|| {
            DomainError::new(
                "stale-queue",
                "Explicit switch placement requires a queue revision",
            )
        })?;
        if expected_revision < 0 || expected_revision != current_queue_revision {
            return Err(DomainError::new("stale-queue", "Queue revision is stale"));
        }
    }
    let from = task_in_transaction(&transaction, from_task_id)?;
    let to = task_in_transaction(&transaction, to_task_id)?;
    if from.version != expected_versions.from_version || to.version != expected_versions.to_version
    {
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    validate_task_effective_instant(&transaction, from_task_id, effective_dt)?;
    validate_task_effective_instant(&transaction, to_task_id, effective_dt)?;
    if from.state != TaskState::Active {
        return Err(DomainError::new(
            "invalid-transition",
            "Source task is not active",
        ));
    }
    if !matches!(to.state, TaskState::Queued | TaskState::Paused) {
        return Err(DomainError::new(
            "invalid-transition",
            "Target task is not queued or paused",
        ));
    }
    let active_id = current_active_id(&transaction)?;
    if active_id.as_deref() != Some(from_task_id) {
        return Err(DomainError::new(
            "persistence-failure",
            "Stored active focus is inconsistent",
        ));
    }
    ensure_queue_member(&transaction, to_task_id)?;
    let open_from = db::open_session_for_task(&transaction, from_task_id)?.ok_or_else(|| {
        DomainError::new(
            "persistence-failure",
            "Active task has no open work session",
        )
    })?;
    let open_from_start = instant(&open_from.started_at)?;
    ensure_not_before(effective_dt, open_from_start)?;
    check_last_session_end(&transaction, to_task_id, effective_dt)?;

    let before = from_queue_placement
        .as_ref()
        .and_then(|placement| placement.before_task_id.as_deref());
    if let Some(anchor) = before {
        if anchor == from_task_id || anchor == to_task_id {
            return Err(DomainError::new(
                "self-anchor",
                "Source or target task cannot be the switch placement anchor",
            ));
        }
        let anchor_task = task_in_transaction(&transaction, anchor).map_err(|error| {
            if error.code == "task-not-found" {
                DomainError::new("anchor-not-found", "Anchor task does not exist")
            } else {
                error
            }
        })?;
        if !matches!(anchor_task.state, TaskState::Queued | TaskState::Paused)
            || db::queue_position(&transaction, anchor)?.is_none()
        {
            return Err(DomainError::new(
                "anchor-not-found",
                "Anchor task is not eligible",
            ));
        }
    }

    db::close_open_session(&transaction, from_task_id, &effective, EndReason::Switched)?;
    db::remove_queue_entry(&transaction, to_task_id)?;
    db::update_task_state(
        &transaction,
        from_task_id,
        expected_versions.from_version,
        TaskState::Paused,
        None,
    )?;
    db::update_task_state(
        &transaction,
        to_task_id,
        expected_versions.to_version,
        TaskState::Active,
        None,
    )?;
    let new_session_id = db::open_session(&transaction, to_task_id, &effective, &operation_id)?;
    db::enqueue_task_at(&transaction, from_task_id, before)?;
    let focus_switched_payload = if from_queue_placement.is_some() {
        json!({
            "fromTaskId": from_task_id,
            "toTaskId": to_task_id,
            "beforeTaskId": before,
        })
    } else {
        json!({ "fromTaskId": from_task_id, "toTaskId": to_task_id })
    };
    let enqueued_payload = if from_queue_placement.is_some() {
        json!({ "beforeTaskId": before })
    } else {
        json!({})
    };
    db::insert_event(
        &transaction,
        Some(from_task_id),
        &operation_id,
        "focus-switched",
        &effective,
        &focus_switched_payload,
    )?;
    db::insert_event(
        &transaction,
        Some(to_task_id),
        &operation_id,
        "task-dequeued",
        &effective,
        &json!({}),
    )?;
    db::insert_event(
        &transaction,
        Some(from_task_id),
        &operation_id,
        "task-enqueued",
        &effective,
        &enqueued_payload,
    )?;
    db::insert_event(
        &transaction,
        Some(from_task_id),
        &operation_id,
        "session-closed",
        &effective,
        &json!({ "reason": "switched" }),
    )?;
    db::insert_event(
        &transaction,
        Some(to_task_id),
        &operation_id,
        "session-opened",
        &effective,
        &json!({ "sessionId": new_session_id }),
    )?;
    let queue_revision = db::bump_queue_revision(&transaction)?;
    let source_revision = db::bump_source_revision(&transaction)?;
    transaction.commit().map_err(db::storage_error)?;
    changed_result(
        connection,
        operation_id,
        &[from_task_id, to_task_id],
        queue_revision,
        source_revision,
    )
}

pub fn pause_task(
    connection: &mut Connection,
    task_id: &str,
    expected_version: i64,
    placement: Option<QueuePlacement>,
    effective_instant: &str,
) -> Result<LifecycleResult, DomainError> {
    validate_version(expected_version)?;
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let task = task_in_transaction(&transaction, task_id)?;
    if task.version != expected_version {
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    validate_task_effective_instant(&transaction, task_id, effective_dt)?;
    if task.state != TaskState::Active {
        return Err(DomainError::new(
            "invalid-transition",
            "Only the active task can be paused",
        ));
    }
    let open_session = db::open_session_for_task(&transaction, task_id)?.ok_or_else(|| {
        DomainError::new(
            "persistence-failure",
            "Active task has no open work session",
        )
    })?;
    ensure_not_before(effective_dt, instant(&open_session.started_at)?)?;
    if placement
        .as_ref()
        .and_then(|value| value.before_task_id.as_deref())
        == Some(task_id)
    {
        return Err(DomainError::new(
            "self-anchor",
            "Task cannot be placed before itself",
        ));
    }
    db::close_open_session(&transaction, task_id, &effective, EndReason::Paused)?;
    db::update_task_state(
        &transaction,
        task_id,
        expected_version,
        TaskState::Paused,
        None,
    )?;
    let before = placement
        .as_ref()
        .and_then(|value| value.before_task_id.as_deref());
    db::enqueue_task_at(&transaction, task_id, before)?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "task-paused",
        &effective,
        &json!({ "beforeTaskId": before }),
    )?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "task-enqueued",
        &effective,
        &json!({}),
    )?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "session-closed",
        &effective,
        &json!({ "reason": "paused" }),
    )?;
    let queue_revision = db::bump_queue_revision(&transaction)?;
    let source_revision = db::bump_source_revision(&transaction)?;
    transaction.commit().map_err(db::storage_error)?;
    changed_result(
        connection,
        operation_id,
        &[task_id],
        queue_revision,
        source_revision,
    )
}

fn complete_task_in_transaction(
    transaction: &Transaction<'_>,
    task_id: &str,
    expected_version: i64,
    effective_dt: DateTime<Utc>,
    effective: &str,
    operation_id: &str,
    enforce_hierarchy: bool,
) -> Result<(TaskSnapshot, bool), DomainError> {
    let task = task_in_transaction(transaction, task_id)?;
    if task.version != expected_version {
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    validate_task_effective_instant(transaction, task_id, effective_dt)?;
    if task.state == TaskState::Completed {
        return Err(DomainError::new(
            "invalid-transition",
            "Task is already completed",
        ));
    }
    if enforce_hierarchy {
        ensure_no_remaining_descendants(transaction, task_id)?;
    }
    if task.state == TaskState::Active {
        let open = db::open_session_for_task(transaction, task_id)?.ok_or_else(|| {
            DomainError::new(
                "persistence-failure",
                "Active task has no open work session",
            )
        })?;
        ensure_not_before(effective_dt, instant(&open.started_at)?)?;
        db::close_open_session(transaction, task_id, effective, EndReason::Completed)?;
    } else {
        ensure_queue_member(transaction, task_id)?;
        check_last_session_end(transaction, task_id, effective_dt)?;
    }
    db::remove_queue_entry(transaction, task_id)?;
    db::update_task_state(
        transaction,
        task_id,
        expected_version,
        TaskState::Completed,
        Some(effective),
    )?;
    db::insert_event(
        transaction,
        Some(task_id),
        operation_id,
        "task-completed",
        effective,
        &json!({ "hadOpenSession": task.state == TaskState::Active }),
    )?;
    if task.state != TaskState::Active {
        db::insert_event(
            transaction,
            Some(task_id),
            operation_id,
            "task-dequeued",
            effective,
            &json!({}),
        )?;
    }
    if task.state == TaskState::Active {
        db::insert_event(
            transaction,
            Some(task_id),
            operation_id,
            "session-closed",
            effective,
            &json!({ "reason": "completed" }),
        )?;
    }
    let updated = db::task_snapshot(transaction, task_id)?;
    Ok((updated, task.state != TaskState::Active))
}

pub fn complete_task(
    connection: &mut Connection,
    task_id: &str,
    expected_version: i64,
    effective_instant: &str,
) -> Result<LifecycleResult, DomainError> {
    validate_version(expected_version)?;
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let (_, queue_changed) = complete_task_in_transaction(
        &transaction,
        task_id,
        expected_version,
        effective_dt,
        &effective,
        &operation_id,
        false,
    )?;
    let queue_revision = if !queue_changed {
        db::queue_revision(&transaction)?
    } else {
        db::bump_queue_revision(&transaction)?
    };
    let source_revision = db::bump_source_revision(&transaction)?;
    transaction.commit().map_err(db::storage_error)?;
    changed_result(
        connection,
        operation_id,
        &[task_id],
        queue_revision,
        source_revision,
    )
}

pub fn reopen_task(
    connection: &mut Connection,
    task_id: &str,
    expected_version: i64,
    placement: Option<QueuePlacement>,
    effective_instant: &str,
) -> Result<LifecycleResult, DomainError> {
    validate_version(expected_version)?;
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let task = task_in_transaction(&transaction, task_id)?;
    if task.version != expected_version {
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    validate_task_effective_instant(&transaction, task_id, effective_dt)?;
    if task.state != TaskState::Completed {
        return Err(DomainError::new(
            "invalid-transition",
            "Only completed work can be reopened",
        ));
    }
    if let Some(last_completion) = task.completed_at.as_deref() {
        ensure_not_before(instant(&effective)?, instant(last_completion)?)?;
    }
    let before = placement
        .as_ref()
        .and_then(|value| value.before_task_id.as_deref());
    if before == Some(task_id) {
        return Err(DomainError::new(
            "self-anchor",
            "Task cannot be placed before itself",
        ));
    }
    ensure_no_queue_member(&transaction, task_id)?;
    db::update_task_state(
        &transaction,
        task_id,
        expected_version,
        TaskState::Queued,
        None,
    )?;
    db::enqueue_task_at(&transaction, task_id, before)?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "task-reopened",
        &effective,
        &json!({ "beforeTaskId": before }),
    )?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "task-enqueued",
        &effective,
        &json!({}),
    )?;
    let queue_revision = db::bump_queue_revision(&transaction)?;
    let source_revision = db::bump_source_revision(&transaction)?;
    transaction.commit().map_err(db::storage_error)?;
    changed_result(
        connection,
        operation_id,
        &[task_id],
        queue_revision,
        source_revision,
    )
}

const MAX_HIERARCHY_DEPTH: u32 = 8;
const MAX_HIERARCHY_TASKS: usize = 5_000;

fn validate_hierarchy_revision(expected: i64) -> Result<(), DomainError> {
    if expected < 0 {
        Err(DomainError::new(
            "stale-hierarchy",
            "Hierarchy revision is stale",
        ))
    } else {
        Ok(())
    }
}

fn validate_tree_limit(limit: u32) -> Result<usize, DomainError> {
    if limit == 0 {
        return Err(DomainError::new(
            "invalid-limit",
            "Tree limit must be between 1 and 5000",
        ));
    }
    if limit as usize > MAX_HIERARCHY_TASKS {
        return Err(DomainError::new(
            "tree-limit-exceeded",
            "Tree limit cannot exceed 5000 tasks",
        ));
    }
    Ok(limit as usize)
}

fn ensure_tree_capacity(connection: &Connection) -> Result<(), DomainError> {
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
        .map_err(db::storage_error)?;
    if count as usize >= MAX_HIERARCHY_TASKS {
        Err(DomainError::new(
            "tree-limit-exceeded",
            "The retained task tree cannot exceed 5000 tasks",
        ))
    } else {
        Ok(())
    }
}

fn hierarchy_children(
    rows: &[db::HierarchyTaskRow],
) -> HashMap<Option<String>, Vec<db::HierarchyTaskRow>> {
    let mut children: HashMap<Option<String>, Vec<db::HierarchyTaskRow>> = HashMap::new();
    for row in rows {
        children
            .entry(row.parent_task_id.clone())
            .or_default()
            .push(row.clone());
    }
    for siblings in children.values_mut() {
        siblings.sort_by(|left, right| {
            left.position
                .cmp(&right.position)
                .then_with(|| left.task.id.cmp(&right.task.id))
        });
    }
    children
}

fn flatten_hierarchy_rows(
    rows: Vec<db::HierarchyTaskRow>,
) -> Result<Vec<HierarchyEntry>, DomainError> {
    fn visit(
        parent_task_id: Option<&str>,
        depth: u32,
        children: &HashMap<Option<String>, Vec<db::HierarchyTaskRow>>,
        visited: &mut HashSet<String>,
        entries: &mut Vec<HierarchyEntry>,
    ) -> Result<(), DomainError> {
        let key = parent_task_id.map(str::to_owned);
        if let Some(siblings) = children.get(&key) {
            for row in siblings {
                if depth > MAX_HIERARCHY_DEPTH {
                    return Err(DomainError::new(
                        "persistence-failure",
                        "Stored hierarchy exceeds the supported depth",
                    ));
                }
                if !visited.insert(row.task.id.clone()) {
                    return Err(DomainError::new(
                        "persistence-failure",
                        "Stored hierarchy contains a cycle",
                    ));
                }
                entries.push(HierarchyEntry {
                    task: row.task.clone(),
                    parent_task_id: row.parent_task_id.clone(),
                    position: row.position,
                    depth,
                });
                visit(
                    Some(row.task.id.as_str()),
                    depth + 1,
                    children,
                    visited,
                    entries,
                )?;
            }
        }
        Ok(())
    }

    let expected_count = rows.len();
    let children = hierarchy_children(&rows);
    let mut visited = HashSet::with_capacity(expected_count);
    let mut entries = Vec::with_capacity(expected_count);
    visit(None, 0, &children, &mut visited, &mut entries)?;
    if visited.len() != expected_count {
        return Err(DomainError::new(
            "persistence-failure",
            "Stored hierarchy contains an orphaned task",
        ));
    }
    Ok(entries)
}

fn hierarchy_depths(rows: &[db::HierarchyTaskRow]) -> Result<HashMap<String, u32>, DomainError> {
    let entries = flatten_hierarchy_rows(rows.to_vec())?;
    Ok(entries
        .into_iter()
        .map(|entry| (entry.task.id, entry.depth))
        .collect())
}

fn hierarchy_row<'a>(
    rows: &'a [db::HierarchyTaskRow],
    task_id: &str,
) -> Result<&'a db::HierarchyTaskRow, DomainError> {
    rows.iter()
        .find(|row| row.task.id == task_id)
        .ok_or_else(|| DomainError::with_detail("task-not-found", "Task does not exist", task_id))
}

fn sibling_ids(rows: &[db::HierarchyTaskRow], parent_task_id: Option<&str>) -> Vec<String> {
    let mut siblings = rows
        .iter()
        .filter(|row| row.parent_task_id.as_deref() == parent_task_id)
        .map(|row| (row.position, row.task.id.clone()))
        .collect::<Vec<_>>();
    siblings.sort();
    siblings.into_iter().map(|(_, id)| id).collect()
}

fn descendant_ids(
    rows: &[db::HierarchyTaskRow],
    task_id: &str,
) -> Result<Vec<String>, DomainError> {
    let children = hierarchy_children(rows);
    let mut descendants = Vec::new();
    let mut stack = vec![task_id.to_owned()];
    let mut visited = HashSet::new();
    visited.insert(task_id.to_owned());
    while let Some(parent) = stack.pop() {
        for child in children.get(&Some(parent.clone())).into_iter().flatten() {
            if !visited.insert(child.task.id.clone()) {
                return Err(DomainError::new(
                    "persistence-failure",
                    "Stored hierarchy contains a cycle",
                ));
            }
            descendants.push(child.task.id.clone());
            stack.push(child.task.id.clone());
        }
    }
    Ok(descendants)
}

fn ancestor_ids(rows: &[db::HierarchyTaskRow], task_id: &str) -> Result<Vec<String>, DomainError> {
    let mut by_id = HashMap::with_capacity(rows.len());
    for row in rows {
        by_id.insert(row.task.id.as_str(), row.parent_task_id.as_deref());
    }
    let mut result = Vec::new();
    let mut current = task_id;
    let mut visited = HashSet::new();
    while let Some(parent) = by_id.get(current).copied().flatten() {
        if !visited.insert(parent.to_owned()) {
            return Err(DomainError::new(
                "persistence-failure",
                "Stored hierarchy contains a cycle",
            ));
        }
        result.push(parent.to_owned());
        current = parent;
    }
    Ok(result)
}

fn ensure_no_remaining_descendants(
    connection: &Connection,
    task_id: &str,
) -> Result<(), DomainError> {
    let rows = db::hierarchy_task_rows(connection)?;
    let remaining = descendant_ids(&rows, task_id)?
        .into_iter()
        .filter_map(|id| rows.iter().find(|row| row.task.id == id))
        .find(|row| row.task.state != TaskState::Completed);
    if remaining.is_some() {
        Err(DomainError::new(
            "incomplete-descendants",
            "Complete remaining descendants before completing this task",
        ))
    } else {
        Ok(())
    }
}

fn validate_parent_and_anchor(
    rows: &[db::HierarchyTaskRow],
    target_parent_task_id: Option<&str>,
    before_task_id: Option<&str>,
    moving_task_id: Option<&str>,
    moving_has_remaining_work: bool,
) -> Result<(), DomainError> {
    if let Some(parent_id) = target_parent_task_id {
        let parent = hierarchy_row(rows, parent_id).map_err(|_| {
            DomainError::with_detail("parent-not-found", "Parent task does not exist", parent_id)
        })?;
        if moving_has_remaining_work && parent.task.state == TaskState::Completed {
            return Err(DomainError::new(
                "parent-completed",
                "Remaining work cannot be placed under a completed parent",
            ));
        }
        if let Some(source_id) = moving_task_id {
            if source_id == parent_id {
                return Err(DomainError::new(
                    "hierarchy-cycle",
                    "A task cannot become its own parent",
                ));
            }
            let descendants = descendant_ids(rows, source_id)?;
            if descendants.iter().any(|id| id == parent_id) {
                return Err(DomainError::new(
                    "hierarchy-cycle",
                    "A task cannot be placed under its descendant",
                ));
            }
        }
    }
    if let Some(anchor_id) = before_task_id {
        let anchor = hierarchy_row(rows, anchor_id).map_err(|_| {
            DomainError::with_detail("anchor-not-found", "Anchor task does not exist", anchor_id)
        })?;
        if moving_task_id == Some(anchor_id) {
            return Err(DomainError::new(
                "hierarchy-cycle",
                "A task cannot be placed before itself",
            ));
        }
        if anchor.parent_task_id.as_deref() != target_parent_task_id {
            return Err(DomainError::new(
                "anchor-scope-mismatch",
                "Anchor task does not share the target parent",
            ));
        }
    }
    Ok(())
}

fn validate_resulting_depth(
    rows: &[db::HierarchyTaskRow],
    target_parent_task_id: Option<&str>,
    moving_task_id: Option<&str>,
) -> Result<(), DomainError> {
    let depths = hierarchy_depths(rows)?;
    let base_depth = target_parent_task_id
        .map(|parent| {
            depths.get(parent).copied().ok_or_else(|| {
                DomainError::with_detail("parent-not-found", "Parent task does not exist", parent)
            })
        })
        .transpose()?
        .map(|depth| depth + 1)
        .unwrap_or(0);
    if let Some(source_id) = moving_task_id {
        let source_depth = *depths.get(source_id).ok_or_else(|| {
            DomainError::with_detail("task-not-found", "Task does not exist", source_id)
        })?;
        let subtree_ids = descendant_ids(rows, source_id)?
            .into_iter()
            .collect::<HashSet<_>>();
        for row in rows {
            if row.task.id == source_id || subtree_ids.contains(&row.task.id) {
                let relative_depth = depths
                    .get(&row.task.id)
                    .copied()
                    .unwrap_or(source_depth)
                    .saturating_sub(source_depth);
                if base_depth + relative_depth > MAX_HIERARCHY_DEPTH {
                    return Err(DomainError::new(
                        "hierarchy-depth-exceeded",
                        "The resulting hierarchy would exceed depth eight",
                    ));
                }
            }
        }
    } else if base_depth > MAX_HIERARCHY_DEPTH {
        return Err(DomainError::new(
            "hierarchy-depth-exceeded",
            "The resulting hierarchy would exceed depth eight",
        ));
    }
    Ok(())
}

fn apply_hierarchy_orders(
    transaction: &Transaction<'_>,
    orders: &HashMap<Option<String>, Vec<String>>,
) -> Result<(), DomainError> {
    let mut affected = orders.values().flatten().cloned().collect::<Vec<_>>();
    affected.sort();
    affected.dedup();
    // Use a disjoint high range first.  This lets the unique sibling
    // index remain active while two sibling groups are reparented at once.
    for (index, task_id) in affected.iter().enumerate() {
        let position = 1_000_000_000_i64.checked_add(index as i64).ok_or_else(|| {
            DomainError::new(
                "persistence-failure",
                "Hierarchy ordering space is exhausted",
            )
        })?;
        transaction
            .execute(
                "UPDATE task_hierarchy SET position = ?1 WHERE task_id = ?2",
                params![position, task_id],
            )
            .map_err(db::storage_error)?;
    }
    for (parent_task_id, ids) in orders {
        for (position, task_id) in ids.iter().enumerate() {
            db::set_hierarchy_placement(
                transaction,
                task_id,
                parent_task_id.as_deref(),
                position as i64,
            )?;
        }
    }
    Ok(())
}

fn placement_orders(
    rows: &[db::HierarchyTaskRow],
    source_task_id: Option<&str>,
    target_parent_task_id: Option<&str>,
    before_task_id: Option<&str>,
) -> Result<HashMap<Option<String>, Vec<String>>, DomainError> {
    let source_parent = source_task_id
        .map(|source| hierarchy_row(rows, source))
        .transpose()?
        .and_then(|row| row.parent_task_id.as_deref().map(str::to_owned));
    let mut target_order = sibling_ids(rows, target_parent_task_id);
    if let Some(source) = source_task_id {
        target_order.retain(|id| id != source);
    }
    let insertion_index = before_task_id
        .map(|anchor| {
            target_order
                .iter()
                .position(|id| id == anchor)
                .ok_or_else(|| DomainError::new("anchor-not-found", "Anchor task does not exist"))
        })
        .transpose()?
        .unwrap_or(target_order.len());
    if let Some(source) = source_task_id {
        target_order.insert(insertion_index, source.to_owned());
    }

    let mut orders = HashMap::new();
    orders.insert(target_parent_task_id.map(str::to_owned), target_order);
    if let Some(source_parent_id) = source_parent {
        if Some(source_parent_id.as_str()) != target_parent_task_id {
            orders.insert(
                Some(source_parent_id.clone()),
                sibling_ids(rows, Some(source_parent_id.as_str()))
                    .into_iter()
                    .filter(|id| Some(id.as_str()) != source_task_id)
                    .collect(),
            );
        }
    }
    Ok(orders)
}

fn hierarchy_entries_for_ids(
    connection: &Connection,
    task_ids: &[String],
) -> Result<Vec<HierarchyEntry>, DomainError> {
    let forest = get_task_forest(connection, MAX_HIERARCHY_TASKS as u32)?;
    let wanted = task_ids.iter().collect::<HashSet<_>>();
    Ok(forest
        .entries
        .into_iter()
        .filter(|entry| wanted.contains(&entry.task.id))
        .collect::<Vec<_>>())
}

fn create_task_in_hierarchy_internal(
    connection: &mut Connection,
    title: &str,
    target_parent_task_id: Option<&str>,
    before_task_id: Option<&str>,
    expected_hierarchy_revision: i64,
    effective_instant: &str,
) -> Result<HierarchyChangeResult, DomainError> {
    let title = validate_title(title)?;
    validate_hierarchy_revision(expected_hierarchy_revision)?;
    let effective = canonical(instant(effective_instant)?);
    ensure_tree_capacity(connection)?;
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let undo_snapshot = capture_observable_snapshot(&transaction)?;
    let current_revision = db::hierarchy_revision(&transaction)?;
    if current_revision != expected_hierarchy_revision {
        return Err(DomainError::new(
            "stale-hierarchy",
            "Hierarchy revision is stale",
        ));
    }
    let rows = db::hierarchy_task_rows(&transaction)?;
    validate_parent_and_anchor(&rows, target_parent_task_id, before_task_id, None, true)?;
    validate_resulting_depth(&rows, target_parent_task_id, None)?;
    let task_id = db::new_id();
    db::insert_task(&transaction, &task_id, &title, &effective)?;
    db::enqueue_task(&transaction, &task_id)?;
    let position = db::next_hierarchy_position(&transaction, target_parent_task_id)?;
    db::insert_hierarchy_entry(&transaction, &task_id, target_parent_task_id, position)?;
    let mut rows_after = db::hierarchy_task_rows(&transaction)?;
    let orders = placement_orders(
        &rows_after,
        Some(&task_id),
        target_parent_task_id,
        before_task_id,
    )?;
    // The source and target are the same for a newly inserted task, so the
    // order map already contains the complete sibling list.
    apply_hierarchy_orders(&transaction, &orders)?;
    db::insert_event(
        &transaction,
        Some(&task_id),
        &operation_id,
        "task-created",
        &effective,
        &json!({ "state": "queued" }),
    )?;
    db::insert_event(
        &transaction,
        Some(&task_id),
        &operation_id,
        "task-enqueued",
        &effective,
        &json!({}),
    )?;
    let next_hierarchy_revision = current_revision.checked_add(1).ok_or_else(|| {
        DomainError::new("persistence-failure", "Hierarchy revision is exhausted")
    })?;
    db::insert_event(
        &transaction,
        Some(&task_id),
        &operation_id,
        "task-hierarchy-created",
        &effective,
        &json!({
            "parentTaskId": target_parent_task_id,
            "beforeTaskId": before_task_id,
            "hierarchyRevision": next_hierarchy_revision
        }),
    )?;
    db::bump_queue_revision(&transaction)?;
    let source_revision = db::bump_source_revision(&transaction)?;
    let hierarchy_revision = db::bump_hierarchy_revision(&transaction)?;
    record_undo_entry(
        &transaction,
        &operation_id,
        "create",
        &format!("「{}」を作成", title),
        &effective,
        std::slice::from_ref(&task_id),
        &undo_snapshot,
    )?;
    transaction.commit().map_err(db::storage_error)?;
    rows_after.clear();
    let changed_tasks = vec![db::task_snapshot(connection, &task_id)?];
    let changed_entries = hierarchy_entries_for_ids(connection, std::slice::from_ref(&task_id))?;
    Ok(HierarchyChangeResult {
        operation_id,
        hierarchy_revision,
        source_revision,
        changed_entries,
        changed_tasks,
    })
}

pub fn create_task_in_hierarchy(
    connection: &mut Connection,
    title: &str,
    target_parent_task_id: Option<&str>,
    before_task_id: Option<&str>,
    expected_hierarchy_revision: i64,
    effective_instant: &str,
) -> Result<HierarchyChangeResult, DomainError> {
    create_task_in_hierarchy_internal(
        connection,
        title,
        target_parent_task_id,
        before_task_id,
        expected_hierarchy_revision,
        effective_instant,
    )
}

pub fn move_task_in_hierarchy(
    connection: &mut Connection,
    task_id: &str,
    target_parent_task_id: Option<&str>,
    before_task_id: Option<&str>,
    expected_hierarchy_revision: i64,
    effective_instant: &str,
) -> Result<HierarchyChangeResult, DomainError> {
    validate_hierarchy_revision(expected_hierarchy_revision)?;
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let undo_snapshot = capture_observable_snapshot(&transaction)?;
    let current_revision = db::hierarchy_revision(&transaction)?;
    if current_revision != expected_hierarchy_revision {
        return Err(DomainError::new(
            "stale-hierarchy",
            "Hierarchy revision is stale",
        ));
    }
    let rows = db::hierarchy_task_rows(&transaction)?;
    let source = hierarchy_row(&rows, task_id)?;
    validate_task_effective_instant(&transaction, task_id, effective_dt)?;
    let subtree_ids = std::iter::once(task_id.to_owned())
        .chain(descendant_ids(&rows, task_id)?)
        .collect::<Vec<_>>();
    let has_remaining_work = subtree_ids.iter().any(|id| {
        rows.iter()
            .find(|row| row.task.id == *id)
            .map(|row| row.task.state != TaskState::Completed)
            .unwrap_or(false)
    });
    validate_parent_and_anchor(
        &rows,
        target_parent_task_id,
        before_task_id,
        Some(task_id),
        has_remaining_work,
    )?;
    validate_resulting_depth(&rows, target_parent_task_id, Some(task_id))?;
    let orders = placement_orders(&rows, Some(task_id), target_parent_task_id, before_task_id)?;
    apply_hierarchy_orders(&transaction, &orders)?;
    let next_hierarchy_revision = current_revision.checked_add(1).ok_or_else(|| {
        DomainError::new("persistence-failure", "Hierarchy revision is exhausted")
    })?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "task-hierarchy-moved",
        &effective,
        &json!({
            "previousParentTaskId": source.parent_task_id,
            "newParentTaskId": target_parent_task_id,
            "beforeTaskId": before_task_id,
            "hierarchyRevision": next_hierarchy_revision
        }),
    )?;
    let source_revision = db::bump_source_revision(&transaction)?;
    let hierarchy_revision = db::bump_hierarchy_revision(&transaction)?;
    record_undo_entry(
        &transaction,
        &operation_id,
        "move",
        &format!("「{}」を移動", source.task.title),
        &effective,
        &subtree_ids,
        &undo_snapshot,
    )?;
    transaction.commit().map_err(db::storage_error)?;
    let changed_entries = hierarchy_entries_for_ids(connection, &subtree_ids)?;
    Ok(HierarchyChangeResult {
        operation_id,
        hierarchy_revision,
        source_revision,
        changed_entries,
        changed_tasks: Vec::new(),
    })
}

pub fn complete_hierarchy_task(
    connection: &mut Connection,
    task_id: &str,
    expected_task_version: i64,
    effective_instant: &str,
) -> Result<HierarchyChangeResult, DomainError> {
    if expected_task_version < 0 {
        return Err(DomainError::new(
            "version-conflict",
            "Task version is stale",
        ));
    }
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let undo_snapshot = capture_observable_snapshot(&transaction)?;
    let task = task_in_transaction(&transaction, task_id)?;
    if task.version != expected_task_version {
        return Err(DomainError::new(
            "version-conflict",
            "Task version is stale",
        ));
    }
    if task.state == TaskState::Completed {
        return Err(DomainError::new(
            "invalid-state",
            "Task is already completed",
        ));
    }
    let hierarchy_revision = db::hierarchy_revision(&transaction)?;
    let (updated, queue_changed) = complete_task_in_transaction(
        &transaction,
        task_id,
        expected_task_version,
        effective_dt,
        &effective,
        &operation_id,
        true,
    )?;
    if queue_changed {
        db::bump_queue_revision(&transaction)?;
    }
    let source_revision = db::bump_source_revision(&transaction)?;
    record_undo_entry(
        &transaction,
        &operation_id,
        "complete",
        &format!("「{}」を完了", task.title),
        &effective,
        &[task_id.to_owned()],
        &undo_snapshot,
    )?;
    transaction.commit().map_err(db::storage_error)?;
    let changed_entries = hierarchy_entries_for_ids(connection, &[task_id.to_owned()])?;
    Ok(HierarchyChangeResult {
        operation_id,
        hierarchy_revision,
        source_revision,
        changed_entries,
        changed_tasks: vec![updated],
    })
}

pub fn reopen_hierarchy_task(
    connection: &mut Connection,
    task_id: &str,
    expected_task_version: i64,
    effective_instant: &str,
) -> Result<HierarchyChangeResult, DomainError> {
    if expected_task_version < 0 {
        return Err(DomainError::new(
            "version-conflict",
            "Task version is stale",
        ));
    }
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let undo_snapshot = capture_observable_snapshot(&transaction)?;
    let rows = db::hierarchy_task_rows(&transaction)?;
    let target = hierarchy_row(&rows, task_id)?;
    if target.task.version != expected_task_version {
        return Err(DomainError::new(
            "version-conflict",
            "Task version is stale",
        ));
    }
    if target.task.state != TaskState::Completed {
        return Err(DomainError::new(
            "invalid-state",
            "Only completed work can be reopened",
        ));
    }
    let mut changed_ids = vec![task_id.to_owned()];
    for ancestor_id in ancestor_ids(&rows, task_id)? {
        let ancestor = hierarchy_row(&rows, &ancestor_id)?;
        if ancestor.task.state == TaskState::Completed {
            changed_ids.push(ancestor_id);
        }
    }
    for changed_id in &changed_ids {
        let current = hierarchy_row(&rows, changed_id)?;
        validate_task_effective_instant(&transaction, changed_id, effective_dt)?;
        if let Some(completed_at) = current.task.completed_at.as_deref() {
            ensure_not_before(effective_dt, instant(completed_at)?)?;
        }
        ensure_no_queue_member(&transaction, changed_id)?;
    }
    for changed_id in &changed_ids {
        let current = hierarchy_row(&rows, changed_id)?;
        db::update_task_state(
            &transaction,
            changed_id,
            current.task.version,
            TaskState::Queued,
            None,
        )?;
        db::enqueue_task(&transaction, changed_id)?;
        db::insert_event(
            &transaction,
            Some(changed_id),
            &operation_id,
            "task-reopened",
            &effective,
            &json!({ "ancestorPath": changed_ids }),
        )?;
        db::insert_event(
            &transaction,
            Some(changed_id),
            &operation_id,
            "task-enqueued",
            &effective,
            &json!({}),
        )?;
    }
    let hierarchy_revision = db::hierarchy_revision(&transaction)?;
    db::bump_queue_revision(&transaction)?;
    let source_revision = db::bump_source_revision(&transaction)?;
    record_undo_entry(
        &transaction,
        &operation_id,
        "reopen",
        &format!("「{}」を再開", target.task.title),
        &effective,
        &changed_ids,
        &undo_snapshot,
    )?;
    transaction.commit().map_err(db::storage_error)?;
    let changed_tasks = changed_ids
        .iter()
        .map(|id| db::task_snapshot(connection, id))
        .collect::<Result<Vec<_>, _>>()?;
    let changed_entries = hierarchy_entries_for_ids(connection, &changed_ids)?;
    Ok(HierarchyChangeResult {
        operation_id,
        hierarchy_revision,
        source_revision,
        changed_entries,
        changed_tasks,
    })
}

pub fn delete_task_subtree(
    connection: &mut Connection,
    task_id: &str,
    expected_task_version: i64,
    expected_hierarchy_revision: i64,
    effective_instant: &str,
) -> Result<ReversibleChangeResult, DomainError> {
    if expected_task_version < 0 {
        return Err(DomainError::new(
            "version-conflict",
            "Task version is stale",
        ));
    }
    validate_hierarchy_revision(expected_hierarchy_revision)?;
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let current_hierarchy_revision = db::hierarchy_revision(&transaction)?;
    if current_hierarchy_revision != expected_hierarchy_revision {
        return Err(DomainError::new(
            "stale-hierarchy",
            "Hierarchy revision is stale",
        ));
    }
    let rows = db::hierarchy_task_rows(&transaction)?;
    let root = hierarchy_row(&rows, task_id)?;
    if root.task.version != expected_task_version {
        return Err(DomainError::new(
            "version-conflict",
            "Task version is stale",
        ));
    }
    let affected_task_ids = std::iter::once(task_id.to_owned())
        .chain(descendant_ids(&rows, task_id)?)
        .collect::<Vec<_>>();
    for affected_id in &affected_task_ids {
        validate_task_effective_instant(&transaction, affected_id, effective_dt)?;
    }
    let undo_snapshot = capture_observable_snapshot(&transaction)?;
    let queue_changed: bool = transaction
        .query_row(
            &format!(
                "SELECT EXISTS(SELECT 1 FROM queue_entries WHERE task_id IN ({}))",
                std::iter::repeat_n("?", affected_task_ids.len())
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            rusqlite::params_from_iter(affected_task_ids.iter()),
            |row| row.get(0),
        )
        .map_err(db::storage_error)?;

    // Remove references first so ON DELETE RESTRICT on hierarchy parents can
    // never expose a partially detached subtree.
    for affected_id in affected_task_ids.iter().rev() {
        transaction
            .execute("DELETE FROM task_events WHERE task_id = ?1", [affected_id])
            .map_err(db::storage_error)?;
        transaction
            .execute(
                "DELETE FROM work_sessions WHERE task_id = ?1",
                [affected_id],
            )
            .map_err(db::storage_error)?;
        transaction
            .execute(
                "DELETE FROM queue_entries WHERE task_id = ?1",
                [affected_id],
            )
            .map_err(db::storage_error)?;
        transaction
            .execute(
                "DELETE FROM task_hierarchy WHERE task_id = ?1",
                [affected_id],
            )
            .map_err(db::storage_error)?;
    }
    for affected_id in affected_task_ids.iter().rev() {
        transaction
            .execute("DELETE FROM tasks WHERE id = ?1", [affected_id])
            .map_err(db::storage_error)?;
    }
    if queue_changed {
        db::bump_queue_revision(&transaction)?;
    }
    let source_revision = db::bump_source_revision(&transaction)?;
    let hierarchy_revision = db::bump_hierarchy_revision(&transaction)?;
    let queue_revision = db::queue_revision(&transaction)?;
    let undo_revision = record_undo_entry(
        &transaction,
        &operation_id,
        "delete",
        &format!("「{}」を削除", root.task.title),
        &effective,
        &affected_task_ids,
        &undo_snapshot,
    )?;
    transaction.commit().map_err(db::storage_error)?;
    Ok(ReversibleChangeResult {
        operation_id,
        source_revision,
        hierarchy_revision,
        queue_revision,
        undo_revision,
        affected_task_ids,
        undo_status: undo_status_in(connection)?,
    })
}

pub fn get_undo_status(connection: &Connection) -> Result<UndoStatus, DomainError> {
    undo_status_in(connection)
}

pub fn undo_last_task_operation(
    connection: &mut Connection,
    expected_operation_token: &str,
    effective_instant: &str,
) -> Result<ReversibleChangeResult, DomainError> {
    let effective = canonical(instant(effective_instant)?);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let entry = latest_journal_entry(&transaction)?.ok_or_else(|| {
        DomainError::new(
            "undo-not-available",
            "There is no operation available to undo",
        )
    })?;
    if entry.operation_token != expected_operation_token {
        return Err(DomainError::new(
            "stale-undo",
            "Undo operation token is stale",
        ));
    }
    if db::source_revision(&transaction)? != entry.expected_source_revision
        || db::hierarchy_revision(&transaction)? != entry.expected_hierarchy_revision
        || db::queue_revision(&transaction)? != entry.expected_queue_revision
    {
        return Err(DomainError::new(
            "undo-conflict",
            "Current task state no longer matches the undo operation",
        ));
    }
    restore_observable_snapshot(&transaction, &entry.snapshot, &entry.affected_task_ids)?;
    transaction
        .execute(
            "INSERT INTO undo_audit (operation_id, undone_operation_token, undone_at)
             VALUES (?1, ?2, ?3)",
            params![operation_id, entry.operation_token, effective],
        )
        .map_err(db::storage_error)?;
    transaction
        .execute(
            "DELETE FROM undo_audit WHERE sequence IN (
                 SELECT sequence FROM undo_audit ORDER BY sequence DESC LIMIT -1 OFFSET ?1
             )",
            [MAX_UNDO_ENTRIES],
        )
        .map_err(db::storage_error)?;
    transaction
        .execute(
            "DELETE FROM undo_journal WHERE operation_token = ?1",
            [&entry.operation_token],
        )
        .map_err(db::storage_error)?;
    let source_revision = db::bump_source_revision(&transaction)?;
    let hierarchy_revision = db::bump_hierarchy_revision(&transaction)?;
    let queue_revision = db::bump_queue_revision(&transaction)?;
    let undo_revision = db::bump_undo_revision(&transaction)?;
    // After an undo, the preceding journal entry once again describes the
    // current observable state, but global revisions intentionally advanced.
    transaction
        .execute(
            "UPDATE undo_journal
         SET expected_source_revision = ?1,
             expected_hierarchy_revision = ?2,
             expected_queue_revision = ?3
         WHERE sequence = (SELECT MAX(sequence) FROM undo_journal)",
            params![source_revision, hierarchy_revision, queue_revision],
        )
        .map_err(db::storage_error)?;
    transaction.commit().map_err(db::storage_error)?;
    Ok(ReversibleChangeResult {
        operation_id,
        source_revision,
        hierarchy_revision,
        queue_revision,
        undo_revision,
        affected_task_ids: entry.affected_task_ids,
        undo_status: undo_status_in(connection)?,
    })
}

pub fn get_task_forest(
    connection: &Connection,
    limit: u32,
) -> Result<TaskForestSnapshot, DomainError> {
    let limit = validate_tree_limit(limit)?;
    let rows = db::hierarchy_task_rows(connection)?;
    if rows.len() > MAX_HIERARCHY_TASKS {
        return Err(DomainError::new(
            "tree-limit-exceeded",
            "The retained task tree cannot exceed 5000 tasks",
        ));
    }
    let entries = flatten_hierarchy_rows(rows)?;
    let truncated = entries.len() > limit;
    Ok(TaskForestSnapshot {
        entries: entries.into_iter().take(limit).collect(),
        hierarchy_revision: db::hierarchy_revision(connection)?,
        source_revision: db::source_revision(connection)?,
        truncated,
    })
}

pub fn get_current_focus(connection: &Connection) -> Result<Option<TaskSnapshot>, DomainError> {
    let id: Option<String> = connection
        .query_row(
            "SELECT id FROM tasks WHERE state = 'active' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(db::storage_error)?;
    id.map(|id| db::task_snapshot(connection, &id)).transpose()
}

pub fn get_task(connection: &Connection, task_id: &str) -> Result<TaskSnapshot, DomainError> {
    db::task_snapshot(connection, task_id)
}

fn validate_page_limit(limit: u32) -> Result<usize, DomainError> {
    if limit == 0 || limit > MAX_PAGE_SIZE {
        return Err(DomainError::new(
            "invalid-limit",
            "Page limit must be between 1 and 200",
        ));
    }
    Ok(limit as usize)
}

fn queue_cursor(revision: i64, position: i64, task_id: &str) -> String {
    format!("{revision}:{position}:{task_id}")
}

fn parse_queue_cursor(value: &str) -> Result<(i64, i64, String), DomainError> {
    let mut pieces = value.splitn(3, ':');
    let revision = pieces
        .next()
        .and_then(|part| part.parse::<i64>().ok())
        .ok_or_else(|| DomainError::new("stale-queue", "Queue cursor is invalid"))?;
    let position = pieces
        .next()
        .and_then(|part| part.parse::<i64>().ok())
        .ok_or_else(|| DomainError::new("stale-queue", "Queue cursor is invalid"))?;
    let task_id = pieces
        .next()
        .filter(|part| !part.is_empty())
        .ok_or_else(|| DomainError::new("stale-queue", "Queue cursor is invalid"))?;
    Ok((revision, position, task_id.to_string()))
}

pub fn get_next_queue(
    connection: &Connection,
    after_cursor: Option<&str>,
    limit: u32,
) -> Result<QueuePage, DomainError> {
    let limit = validate_page_limit(limit)?;
    let queue_revision = db::queue_revision(connection)?;
    let source_revision = db::source_revision(connection)?;
    let after = if let Some(cursor) = after_cursor {
        let (revision, position, task_id) = parse_queue_cursor(cursor)?;
        if revision != queue_revision {
            return Err(DomainError::new("stale-queue", "Queue cursor is stale"));
        }
        Some((position, task_id))
    } else {
        None
    };
    let all = db::queue_entries(connection)?;
    let start = after
        .as_ref()
        .map(|(position, task_id)| {
            all.iter()
                .position(|entry| {
                    entry.position > *position
                        || (entry.position == *position && entry.task_id > *task_id)
                })
                .unwrap_or(all.len())
        })
        .unwrap_or(0);
    let end = (start + limit).min(all.len());
    let entries = all[start..end].to_vec();
    let next_cursor = (end < all.len()).then(|| {
        let last = &entries[entries.len() - 1];
        queue_cursor(queue_revision, last.position, &last.task_id)
    });
    Ok(QueuePage {
        task_ids: entries.iter().map(|entry| entry.task_id.clone()).collect(),
        entries,
        queue_revision,
        source_revision,
        next_cursor,
    })
}

pub fn move_queued_task(
    connection: &mut Connection,
    task_id: &str,
    before_task_id: Option<&str>,
    expected_queue_revision: i64,
    effective_instant: &str,
) -> Result<QueueChangeResult, DomainError> {
    if expected_queue_revision < 0 {
        return Err(DomainError::new("stale-queue", "Queue revision is stale"));
    }
    if before_task_id == Some(task_id) {
        return Err(DomainError::new(
            "self-anchor",
            "Task cannot be placed before itself",
        ));
    }
    let effective_dt = instant(effective_instant)?;
    let effective = canonical(effective_dt);
    let operation_id = db::new_id();
    let transaction = transaction(connection)?;
    let current_revision = db::queue_revision(&transaction)?;
    if current_revision != expected_queue_revision {
        return Err(DomainError::new("stale-queue", "Queue revision is stale"));
    }
    let task = task_in_transaction(&transaction, task_id)?;
    if !matches!(task.state, TaskState::Queued | TaskState::Paused) {
        return Err(DomainError::new(
            "task-not-eligible",
            "Only queued or paused tasks can be moved",
        ));
    }
    ensure_queue_member(&transaction, task_id)?;
    validate_task_effective_instant(&transaction, task_id, effective_dt)?;
    if let Some(anchor) = before_task_id {
        let anchor_task = task_in_transaction(&transaction, anchor).map_err(|error| {
            if error.code == "task-not-found" {
                DomainError::new("anchor-not-found", "Anchor task does not exist")
            } else {
                error
            }
        })?;
        if !matches!(anchor_task.state, TaskState::Queued | TaskState::Paused) {
            return Err(DomainError::new(
                "anchor-not-found",
                "Anchor task is not eligible",
            ));
        }
        ensure_queue_member(&transaction, anchor)?;
    }
    let all = db::queue_entries(&transaction)?;
    let old_order = all
        .iter()
        .map(|entry| entry.task_id.clone())
        .collect::<Vec<_>>();
    let mut new_order = old_order.clone();
    new_order.retain(|id| id != task_id);
    let insertion_index = before_task_id
        .map(|anchor| {
            new_order
                .iter()
                .position(|id| id == anchor)
                .ok_or_else(|| DomainError::new("anchor-not-found", "Anchor task is not eligible"))
        })
        .transpose()?
        .unwrap_or(new_order.len());
    new_order.insert(insertion_index, task_id.to_string());
    if new_order == old_order {
        let position = db::queue_position(&transaction, task_id)?.ok_or_else(|| {
            DomainError::new(
                "persistence-failure",
                "Task state and queue membership are inconsistent",
            )
        })?;
        let source_revision = db::source_revision(&transaction)?;
        transaction.commit().map_err(db::storage_error)?;
        return Ok(QueueChangeResult {
            operation_id,
            task_id: task_id.to_string(),
            position,
            queue_revision: current_revision,
            source_revision,
        });
    }

    transaction
        .execute("DELETE FROM queue_entries WHERE task_id = ?1", [task_id])
        .map_err(db::storage_error)?;
    let previous_position: Option<i64> = if insertion_index == 0 {
        None
    } else {
        let previous_id = &new_order[insertion_index - 1];
        transaction
            .query_row(
                "SELECT position FROM queue_entries WHERE task_id = ?1",
                [previous_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(db::storage_error)?
    };
    let next_position: Option<i64> = if insertion_index + 1 >= new_order.len() {
        None
    } else {
        let next_id = &new_order[insertion_index + 1];
        transaction
            .query_row(
                "SELECT position FROM queue_entries WHERE task_id = ?1",
                [next_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(db::storage_error)?
    };
    let position = match (previous_position, next_position) {
        (Some(previous), Some(next)) if next - previous > 1 => previous + (next - previous) / 2,
        (Some(previous), None) => previous.checked_add(db::ORDER_GAP).ok_or_else(|| {
            DomainError::new("persistence-failure", "Queue ordering space is exhausted")
        })?,
        (None, Some(next)) => next.checked_sub(db::ORDER_GAP).ok_or_else(|| {
            DomainError::new("persistence-failure", "Queue ordering space is exhausted")
        })?,
        (None, None) => db::ORDER_GAP,
        (Some(_), Some(_)) => {
            db::rebalance_queue(&transaction)?;
            let previous_id = &new_order[insertion_index - 1];
            let next_id = &new_order[insertion_index + 1];
            let previous: i64 = transaction
                .query_row(
                    "SELECT position FROM queue_entries WHERE task_id = ?1",
                    [previous_id],
                    |row| row.get(0),
                )
                .map_err(db::storage_error)?;
            let next: i64 = transaction
                .query_row(
                    "SELECT position FROM queue_entries WHERE task_id = ?1",
                    [next_id],
                    |row| row.get(0),
                )
                .map_err(db::storage_error)?;
            previous + (next - previous) / 2
        }
    };
    transaction
        .execute(
            "INSERT INTO queue_entries (task_id, position) VALUES (?1, ?2)",
            params![task_id, position],
        )
        .map_err(db::storage_error)?;
    db::insert_event(
        &transaction,
        Some(task_id),
        &operation_id,
        "queue-reordered",
        &effective,
        &json!({ "beforeTaskId": before_task_id, "queueRevision": current_revision + 1 }),
    )?;
    let queue_revision = db::bump_queue_revision(&transaction)?;
    let source_revision = db::bump_source_revision(&transaction)?;
    transaction.commit().map_err(db::storage_error)?;
    Ok(QueueChangeResult {
        operation_id,
        task_id: task_id.to_string(),
        position,
        queue_revision,
        source_revision,
    })
}

fn cursor_revision<'a>(
    value: &'a str,
    expected_revision: i64,
    code: &'static str,
) -> Result<&'a str, DomainError> {
    let mut pieces = value.splitn(2, ':');
    let revision = pieces
        .next()
        .and_then(|part| part.parse::<i64>().ok())
        .ok_or_else(|| DomainError::new(code, "History cursor is invalid"))?;
    if revision != expected_revision {
        return Err(DomainError::new(code, "History cursor is stale"));
    }
    pieces
        .next()
        .filter(|part| !part.is_empty())
        .ok_or_else(|| DomainError::new(code, "History cursor is invalid"))
}

fn history_cursor(revision: i64, at: &str, id: &str) -> String {
    serde_json::to_string(&json!({
        "revision": revision,
        "at": at,
        "id": id,
    }))
    .unwrap_or_default()
}

fn parse_history_cursor(value: &str, revision: i64) -> Result<(String, String), DomainError> {
    let cursor: serde_json::Value = serde_json::from_str(value)
        .map_err(|_| DomainError::new("stale-cursor", "History cursor is invalid"))?;
    let source = cursor
        .get("revision")
        .and_then(serde_json::Value::as_i64)
        .ok_or_else(|| DomainError::new("stale-cursor", "History cursor is invalid"))?;
    if source != revision {
        return Err(DomainError::new("stale-cursor", "History cursor is stale"));
    }
    let at = cursor
        .get("at")
        .and_then(serde_json::Value::as_str)
        .filter(|part| !part.is_empty())
        .ok_or_else(|| DomainError::new("stale-cursor", "History cursor is invalid"))?;
    let id = cursor
        .get("id")
        .and_then(serde_json::Value::as_str)
        .filter(|part| !part.is_empty())
        .ok_or_else(|| DomainError::new("stale-cursor", "History cursor is invalid"))?;
    Ok((at.to_string(), id.to_string()))
}

pub fn get_task_actual_history(
    connection: &Connection,
    task_id: &str,
) -> Result<ActualHistorySummary, DomainError> {
    let _ = db::task_snapshot(connection, task_id)?;
    let sessions = db::task_history_sessions(connection, task_id)?;
    let session_count = sessions.len() as i64;
    let events = db::task_history_events(connection, task_id)?;
    let actual_start_at = sessions.first().map(|session| session.started_at.clone());
    let latest_completion_at = events
        .iter()
        .filter(|event| event.event_type == "task-completed")
        .max_by(|left, right| {
            left.occurred_at
                .cmp(&right.occurred_at)
                .then(left.id.cmp(&right.id))
        })
        .map(|event| event.occurred_at.clone());
    let total_closed_duration_ms = sessions
        .iter()
        .filter_map(|session| {
            session
                .ended_at
                .as_ref()
                .map(|ended| (session.started_at.as_str(), ended.as_str()))
        })
        .map(|(start, end)| {
            let start = instant(start)?;
            let end = instant(end)?;
            Ok(end.signed_duration_since(start).num_milliseconds())
        })
        .try_fold(0_i64, |total, value: Result<i64, DomainError>| {
            value.and_then(|duration| {
                total.checked_add(duration).ok_or_else(|| {
                    DomainError::new(
                        "persistence-failure",
                        "Stored session duration is too large",
                    )
                })
            })
        })?;
    Ok(ActualHistorySummary {
        task_id: task_id.to_string(),
        actual_start_at,
        latest_completion_at,
        total_closed_duration_ms,
        current_open_session: sessions
            .into_iter()
            .find(|session| session.ended_at.is_none()),
        session_count,
        source_revision: db::source_revision(connection)?,
    })
}

pub fn get_task_sessions(
    connection: &Connection,
    task_id: &str,
    after_cursor: Option<&str>,
    limit: u32,
) -> Result<WorkSessionPage, DomainError> {
    let limit = validate_page_limit(limit)?;
    let _ = db::task_snapshot(connection, task_id)?;
    let revision = db::source_revision(connection)?;
    let after = after_cursor
        .map(|cursor| parse_history_cursor(cursor, revision))
        .transpose()?;
    let sessions = db::task_history_sessions(connection, task_id)?;
    let start = after
        .as_ref()
        .map(|(at, id)| {
            sessions
                .iter()
                .position(|session| {
                    session.started_at.as_str() > at.as_str()
                        || (session.started_at == *at && session.id > *id)
                })
                .unwrap_or(sessions.len())
        })
        .unwrap_or(0);
    let end = (start + limit).min(sessions.len());
    let page = sessions[start..end].to_vec();
    let next_cursor = (end < sessions.len()).then(|| {
        let last = &page[page.len() - 1];
        history_cursor(revision, &last.started_at, &last.id)
    });
    Ok(WorkSessionPage {
        sessions: page,
        source_revision: revision,
        next_cursor,
    })
}

pub fn get_history_by_actual_range(
    connection: &Connection,
    range_start: &str,
    range_end: &str,
    after_cursor: Option<&str>,
    limit: u32,
) -> Result<ActualHistoryPage, DomainError> {
    let limit = validate_page_limit(limit)?;
    let start = instant(range_start).map_err(|_| {
        DomainError::new(
            "invalid-time-order",
            "Range bounds must be RFC3339 instants",
        )
    })?;
    let end = instant(range_end).map_err(|_| {
        DomainError::new(
            "invalid-time-order",
            "Range bounds must be RFC3339 instants",
        )
    })?;
    if start >= end {
        return Err(DomainError::new(
            "invalid-time-order",
            "Range start must be before range end",
        ));
    }
    let start = canonical(start);
    let end = canonical(end);
    let revision = db::source_revision(connection)?;
    let after = after_cursor
        .map(|cursor| parse_history_cursor(cursor, revision))
        .transpose()?;

    let mut session_statement = connection
        .prepare(
            "SELECT id, task_id, started_at, ended_at, end_reason, operation_id
             FROM work_sessions
             WHERE started_at < ?2 AND (ended_at IS NULL OR ended_at > ?1)
             ORDER BY started_at ASC, id ASC",
        )
        .map_err(db::storage_error)?;
    let sessions = session_statement
        .query_map(params![start, end], db::session_from_row)
        .map_err(db::storage_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db::storage_error)?;
    let mut event_statement = connection
        .prepare(
            "SELECT id, task_id, operation_id, event_type, occurred_at, payload
             FROM task_events WHERE occurred_at >= ?1 AND occurred_at < ?2
             ORDER BY occurred_at ASC, id ASC",
        )
        .map_err(db::storage_error)?;
    let events = event_statement
        .query_map(params![start, end], db::event_from_row)
        .map_err(db::storage_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db::storage_error)?;

    let mut items = Vec::with_capacity(sessions.len() + events.len());
    items.extend(sessions.iter().cloned().map(|session| HistoryItem {
        kind: "session".to_string(),
        at: session.started_at.clone(),
        session: Some(session),
        event: None,
    }));
    items.extend(events.iter().cloned().map(|event| HistoryItem {
        kind: "event".to_string(),
        at: event.occurred_at.clone(),
        session: None,
        event: Some(event),
    }));
    items.sort_by(|left, right| {
        left.at.cmp(&right.at).then_with(|| {
            let left_id = left
                .session
                .as_ref()
                .map(|session| session.id.as_str())
                .or_else(|| left.event.as_ref().map(|event| event.id.as_str()))
                .unwrap_or_default();
            let right_id = right
                .session
                .as_ref()
                .map(|session| session.id.as_str())
                .or_else(|| right.event.as_ref().map(|event| event.id.as_str()))
                .unwrap_or_default();
            left_id.cmp(right_id)
        })
    });
    if let Some((at, id)) = after {
        items.retain(|item| {
            let item_id = item
                .session
                .as_ref()
                .map(|session| session.id.as_str())
                .or_else(|| item.event.as_ref().map(|event| event.id.as_str()))
                .unwrap_or_default();
            item.at.as_str() > at.as_str() || (item.at == at && item_id > id.as_str())
        });
    }
    let has_more = items.len() > limit;
    let page = items.into_iter().take(limit).collect::<Vec<_>>();
    let next_cursor = has_more.then(|| {
        let last = &page[page.len() - 1];
        let id = last
            .session
            .as_ref()
            .map(|session| session.id.as_str())
            .or_else(|| last.event.as_ref().map(|event| event.id.as_str()))
            .unwrap_or_default();
        history_cursor(revision, &last.at, id)
    });
    let page_sessions = page
        .iter()
        .filter_map(|item| item.session.clone())
        .collect::<Vec<_>>();
    let page_events = page
        .iter()
        .filter_map(|item| item.event.clone())
        .collect::<Vec<_>>();
    Ok(ActualHistoryPage {
        items: page,
        sessions: page_sessions,
        events: page_events,
        source_revision: revision,
        next_cursor,
    })
}

fn focus_cursor(
    revision: i64,
    segment_offset: usize,
    queue_cursor: Option<&str>,
    queue_exhausted: bool,
) -> String {
    serde_json::to_string(&json!({
        "revision": revision,
        "segmentOffset": segment_offset,
        "queueCursor": queue_cursor,
        "queueExhausted": queue_exhausted,
    }))
    .unwrap_or_default()
}

fn parse_focus_cursor(
    value: &str,
    revision: i64,
) -> Result<(usize, Option<String>, bool), DomainError> {
    let cursor: serde_json::Value = serde_json::from_str(value)
        .map_err(|_| DomainError::new("stale-cursor", "Projection cursor is invalid"))?;
    let cursor_revision = cursor
        .get("revision")
        .and_then(serde_json::Value::as_i64)
        .ok_or_else(|| DomainError::new("stale-cursor", "Projection cursor is invalid"))?;
    if cursor_revision != revision {
        return Err(DomainError::new(
            "stale-cursor",
            "Projection cursor is stale",
        ));
    }
    let offset = cursor
        .get("segmentOffset")
        .and_then(serde_json::Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| DomainError::new("stale-cursor", "Projection cursor is invalid"))?;
    let queue_cursor = cursor
        .get("queueCursor")
        .and_then(|value| {
            if value.is_null() {
                None
            } else {
                value.as_str()
            }
        })
        .map(ToOwned::to_owned);
    let queue_exhausted = cursor
        .get("queueExhausted")
        .and_then(serde_json::Value::as_bool)
        .ok_or_else(|| DomainError::new("stale-cursor", "Projection cursor is invalid"))?;
    if queue_exhausted && queue_cursor.is_some() {
        return Err(DomainError::new(
            "stale-cursor",
            "Projection cursor is invalid",
        ));
    }
    Ok((offset, queue_cursor, queue_exhausted))
}

fn empty_queue_page(connection: &Connection) -> Result<QueuePage, DomainError> {
    Ok(QueuePage {
        task_ids: Vec::new(),
        entries: Vec::new(),
        queue_revision: db::queue_revision(connection)?,
        source_revision: db::source_revision(connection)?,
        next_cursor: None,
    })
}

fn focus_segments(
    connection: &Connection,
    range_start: DateTime<Utc>,
    range_end: DateTime<Utc>,
    current: DateTime<Utc>,
) -> Result<Vec<FocusSegment>, DomainError> {
    let start = canonical(range_start);
    let end = canonical(range_end);
    let mut statement = connection
        .prepare(
            "SELECT s.id, s.task_id, t.title, s.started_at, s.ended_at
             FROM work_sessions s JOIN tasks t ON t.id = s.task_id
             WHERE s.started_at < ?2 AND (s.ended_at IS NULL OR s.ended_at > ?1)
             ORDER BY s.started_at ASC, s.id ASC",
        )
        .map_err(db::storage_error)?;
    let rows = statement
        .query_map(params![start, end], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(db::storage_error)?;
    let mut segments = Vec::new();
    for row in rows {
        let (id, task_id, title, stored_start, stored_end) = row.map_err(db::storage_error)?;
        let stored_start_dt = instant(&stored_start)?;
        let stored_end_dt = stored_end.as_deref().map(instant).transpose()?;
        let effective_end = match stored_end_dt {
            Some(end) => end,
            None => {
                if current < stored_start_dt {
                    return Err(DomainError::new(
                        "invalid-current-instant",
                        "Current instant precedes an included open session",
                    ));
                }
                current
            }
        };
        let clipped_start = stored_start_dt.max(range_start);
        let clipped_end = effective_end.min(range_end);
        if clipped_start < clipped_end {
            segments.push(FocusSegment {
                session_id: id.clone(),
                task_id,
                task_title: title,
                started_at: canonical(clipped_start),
                ended_at: canonical(clipped_end),
                effective_end: stored_end_dt.is_none(),
                source_reference: format!("session:{id}"),
            });
        }
    }
    Ok(segments)
}

pub fn get_focus_projection(
    connection: &Connection,
    range_start: &str,
    range_end: &str,
    current_instant: &str,
    next_cursor: Option<&str>,
    limits: ProjectionLimits,
) -> Result<FocusProjection, DomainError> {
    let started = Instant::now();
    let range_start_dt = instant(range_start).map_err(|_| {
        DomainError::new(
            "invalid-range",
            "Focus range bounds must be RFC3339 instants",
        )
    })?;
    let range_end_dt = instant(range_end).map_err(|_| {
        DomainError::new(
            "invalid-range",
            "Focus range bounds must be RFC3339 instants",
        )
    })?;
    let current_dt = instant(current_instant).map_err(|_| {
        DomainError::new("invalid-current-instant", "Current instant must be RFC3339")
    })?;
    if range_start_dt >= range_end_dt || range_end_dt > current_dt {
        return Err(DomainError::new(
            "invalid-range",
            "Focus range must be ordered and cannot extend past current instant",
        ));
    }
    if range_end_dt - range_start_dt > Duration::hours(24) {
        return Err(DomainError::new(
            "invalid-range",
            "Focus range cannot exceed 24 hours",
        ));
    }
    let segment_limit = validate_page_limit(limits.segment_limit)?;
    let _ = validate_page_limit(limits.next_work_limit)?;
    let revision = db::source_revision(connection)?;
    let (segment_offset, queue_cursor, queue_exhausted) = next_cursor
        .map(|cursor| parse_focus_cursor(cursor, revision))
        .transpose()?
        .unwrap_or((0, None, false));
    let all_segments = focus_segments(connection, range_start_dt, range_end_dt, current_dt)?;
    let end_offset = (segment_offset + segment_limit).min(all_segments.len());
    let segments = all_segments
        .get(segment_offset..end_offset)
        .unwrap_or_default()
        .to_vec();
    let queue = if queue_exhausted {
        empty_queue_page(connection)?
    } else {
        get_next_queue(connection, queue_cursor.as_deref(), limits.next_work_limit)?
    };
    let segment_more = end_offset < all_segments.len();
    let queue_more = queue.next_cursor.is_some();
    let more = segment_more || queue_more;
    let projection_cursor = more.then(|| {
        let next_queue_cursor = queue.next_cursor.as_deref();
        focus_cursor(revision, end_offset, next_queue_cursor, !queue_more)
    });
    let query_instant = canonical(current_dt);
    Ok(FocusProjection {
        segments,
        current_focus: get_current_focus(connection)?,
        next_work: queue,
        metadata: ProjectionMetadata {
            source_revision: revision,
            query_instant,
            time_zone: None,
            truncated: more,
            next_cursor: projection_cursor,
            query_duration_ms: started.elapsed().as_millis().try_into().unwrap_or(i64::MAX),
        },
    })
}

fn parse_time_zone(time_zone: &str) -> Result<Tz, DomainError> {
    time_zone.parse::<Tz>().map_err(|_| {
        DomainError::new(
            "invalid-time-zone",
            "Time zone must be a recognized IANA identifier",
        )
    })
}

fn parse_local_date(value: &str) -> Result<NaiveDate, DomainError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| DomainError::new("invalid-range", "Local date must use YYYY-MM-DD"))
}

fn local_boundary(date: NaiveDate, time_zone: Tz) -> Result<DateTime<Utc>, DomainError> {
    let local_midnight = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| DomainError::new("invalid-range", "Local date is invalid"))?;
    match time_zone.from_local_datetime(&local_midnight) {
        chrono::LocalResult::Single(value) => Ok(value.with_timezone(&Utc)),
        chrono::LocalResult::Ambiguous(first, second) => Ok(first.min(second).with_timezone(&Utc)),
        chrono::LocalResult::None => {
            // A small number of zones have historically skipped midnight.
            // Find the first representable local instant so the local day is
            // still projected without inventing an offset.
            for minute in 1..=(24 * 60) {
                let candidate = local_midnight + Duration::minutes(minute);
                match time_zone.from_local_datetime(&candidate) {
                    chrono::LocalResult::Single(value) => return Ok(value.with_timezone(&Utc)),
                    chrono::LocalResult::Ambiguous(first, second) => {
                        return Ok(first.min(second).with_timezone(&Utc));
                    }
                    chrono::LocalResult::None => {}
                }
            }
            Err(DomainError::new(
                "invalid-time-zone",
                "The requested local date has no representable boundary in this time zone",
            ))
        }
    }
}

fn next_local_date(date: NaiveDate) -> Result<NaiveDate, DomainError> {
    date.checked_add_signed(Duration::days(1))
        .ok_or_else(|| DomainError::new("invalid-range", "Local date range is invalid"))
}

#[derive(Debug, Clone)]
struct SessionProjectionRow {
    id: String,
    task_id: String,
    started_at: DateTime<Utc>,
    ended_at: Option<DateTime<Utc>>,
}

fn load_sessions_intersecting(
    connection: &Connection,
    range_start: DateTime<Utc>,
    range_end: DateTime<Utc>,
) -> Result<Vec<SessionProjectionRow>, DomainError> {
    let start = canonical(range_start);
    let end = canonical(range_end);
    let mut statement = connection
        .prepare(
            "SELECT id, task_id, started_at, ended_at
             FROM work_sessions
             WHERE started_at < ?2 AND (ended_at IS NULL OR ended_at > ?1)
             ORDER BY started_at ASC, id ASC",
        )
        .map_err(db::storage_error)?;
    let rows = statement
        .query_map(params![start, end], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(db::storage_error)?;
    rows.map(|row| {
        let (id, task_id, started_at, ended_at) = row.map_err(db::storage_error)?;
        Ok(SessionProjectionRow {
            id,
            task_id,
            started_at: instant(&started_at)?,
            ended_at: ended_at.as_deref().map(instant).transpose()?,
        })
    })
    .collect()
}

fn projection_effective_end(
    session: &SessionProjectionRow,
    now: DateTime<Utc>,
) -> Result<DateTime<Utc>, DomainError> {
    match session.ended_at {
        Some(end) => {
            ensure_not_before(end, session.started_at)?;
            Ok(end)
        }
        None if now < session.started_at => Err(DomainError::new(
            "invalid-current-instant",
            "Current instant precedes an included open session",
        )),
        None => Ok(now),
    }
}

fn summary_task_title(connection: &Connection, task_id: &str) -> Result<String, DomainError> {
    Ok(db::task_snapshot(connection, task_id)?.title)
}

fn completion_events_by_task(
    connection: &Connection,
    range_start: &str,
    range_end: &str,
) -> Result<BTreeMap<String, Vec<String>>, DomainError> {
    let mut statement = connection
        .prepare(
            "SELECT task_id, id FROM task_events
             WHERE task_id IS NOT NULL AND event_type = 'task-completed'
               AND occurred_at >= ?1 AND occurred_at < ?2
             ORDER BY occurred_at ASC, id ASC",
        )
        .map_err(db::storage_error)?;
    let rows = statement
        .query_map(params![range_start, range_end], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(db::storage_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db::storage_error)?;
    let mut grouped = BTreeMap::new();
    for (task_id, event_id) in rows {
        grouped
            .entry(task_id)
            .or_insert_with(Vec::new)
            .push(event_id);
    }
    Ok(grouped)
}

fn day_task_aggregates(
    connection: &Connection,
    day_start: DateTime<Utc>,
    day_end: DateTime<Utc>,
    now: DateTime<Utc>,
) -> Result<Vec<TaskDaySummary>, DomainError> {
    let sessions = load_sessions_intersecting(connection, day_start, day_end)?;
    let start = canonical(day_start);
    let end = canonical(day_end);
    let completion_events = completion_events_by_task(connection, &start, &end)?;
    let mut grouped: BTreeMap<String, (i64, i64, Vec<String>)> = BTreeMap::new();
    for session in sessions {
        let effective_end = projection_effective_end(&session, now)?;
        let clipped_start = session.started_at.max(day_start);
        let clipped_end = effective_end.min(day_end);
        if clipped_start >= clipped_end {
            continue;
        }
        let duration = clipped_end
            .signed_duration_since(clipped_start)
            .num_milliseconds();
        let entry = grouped
            .entry(session.task_id.clone())
            .or_insert((0, 0, Vec::new()));
        entry.0 = entry.0.checked_add(duration).ok_or_else(|| {
            DomainError::new("persistence-failure", "Projected duration is too large")
        })?;
        entry.1 += 1;
        entry.2.push(format!("session:{}", session.id));
    }
    for (task_id, event_ids) in completion_events {
        let entry = grouped.entry(task_id).or_insert((0, 0, Vec::new()));
        entry
            .2
            .extend(event_ids.into_iter().map(|id| format!("event:{id}")));
    }
    grouped
        .into_iter()
        .map(|(task_id, (duration, count, refs))| {
            let completion_count = refs
                .iter()
                .filter(|reference| reference.starts_with("event:"))
                .count() as i64;
            Ok(TaskDaySummary {
                task_title: summary_task_title(connection, &task_id)?,
                task_id,
                actual_duration_ms: duration,
                session_count: count,
                completion_count,
                detail_references: refs,
            })
        })
        .collect()
}

fn day_cursor(revision: i64, task_id: &str) -> String {
    format!("{revision}:{task_id}")
}

pub fn get_day_summary(
    connection: &Connection,
    local_date: &str,
    time_zone: &str,
    current_instant: &str,
    cursor: Option<&str>,
    limit: u32,
) -> Result<DaySummaryPage, DomainError> {
    let started = Instant::now();
    let limit = validate_page_limit(limit)?;
    let date = parse_local_date(local_date)?;
    let time_zone_value = parse_time_zone(time_zone)?;
    let day_start = local_boundary(date, time_zone_value)?;
    let day_end = local_boundary(next_local_date(date)?, time_zone_value)?;
    if day_start >= day_end {
        return Err(DomainError::new(
            "invalid-range",
            "Local day boundary is invalid",
        ));
    }
    let query_now = instant(current_instant).map_err(|_| {
        DomainError::new("invalid-current-instant", "Current instant must be RFC3339")
    })?;
    let revision = db::source_revision(connection)?;
    let after_task = cursor
        .map(|value| cursor_revision(value, revision, "stale-cursor"))
        .transpose()?;
    let all_tasks = day_task_aggregates(connection, day_start, day_end, query_now)?;
    let start = after_task
        .map(|task_id| {
            all_tasks
                .iter()
                .position(|task| task.task_id.as_str() > task_id)
                .unwrap_or(all_tasks.len())
        })
        .unwrap_or(0);
    let end = (start + limit).min(all_tasks.len());
    let tasks = all_tasks[start..end].to_vec();
    let next_cursor =
        (end < all_tasks.len()).then(|| day_cursor(revision, &tasks[tasks.len() - 1].task_id));
    Ok(DaySummaryPage {
        local_date: local_date.to_string(),
        time_zone: time_zone.to_string(),
        day_start_utc: canonical(day_start),
        day_end_utc: canonical(day_end),
        tasks,
        source_revision: revision,
        truncated: next_cursor.is_some(),
        next_cursor,
        query_instant: canonical(query_now),
        query_duration_ms: started.elapsed().as_millis().try_into().unwrap_or(i64::MAX),
    })
}

pub fn get_archive_summary(
    connection: &Connection,
    local_date_start: &str,
    local_date_end: &str,
    time_zone: &str,
    current_instant: &str,
    cursor: Option<&str>,
    limit: u32,
) -> Result<ArchiveSummaryPage, DomainError> {
    let started = Instant::now();
    let limit = validate_page_limit(limit)?;
    let start_date = parse_local_date(local_date_start)?;
    let end_date = parse_local_date(local_date_end)?;
    if start_date >= end_date {
        return Err(DomainError::new(
            "invalid-range",
            "Archive start date must be before end date",
        ));
    }
    if (end_date - start_date).num_days() > MAX_ARCHIVE_DAYS {
        return Err(DomainError::new(
            "invalid-range",
            "Archive range cannot exceed 366 local days",
        ));
    }
    let time_zone_value = parse_time_zone(time_zone)?;
    let archive_start = local_boundary(start_date, time_zone_value)?;
    let archive_end = local_boundary(end_date, time_zone_value)?;
    let now = instant(current_instant).map_err(|_| {
        DomainError::new("invalid-current-instant", "Current instant must be RFC3339")
    })?;
    let sessions = load_sessions_intersecting(connection, archive_start, archive_end)?;
    let mut days = Vec::new();
    let mut date = start_date;
    while date < end_date {
        let day_start = local_boundary(date, time_zone_value)?;
        let day_end = local_boundary(next_local_date(date)?, time_zone_value)?;
        let day_start_clipped = day_start.max(archive_start);
        let day_end_clipped = day_end.min(archive_end);
        let mut actual_duration_ms = 0_i64;
        let mut distinct_tasks = std::collections::BTreeSet::new();
        let mut session_ids = Vec::new();
        for session in &sessions {
            let effective_end = projection_effective_end(session, now)?;
            let overlap_start = session.started_at.max(day_start_clipped);
            let overlap_end = effective_end.min(day_end_clipped);
            if overlap_start < overlap_end {
                actual_duration_ms = actual_duration_ms
                    .checked_add(
                        overlap_end
                            .signed_duration_since(overlap_start)
                            .num_milliseconds(),
                    )
                    .ok_or_else(|| {
                        DomainError::new("persistence-failure", "Projected duration is too large")
                    })?;
                distinct_tasks.insert(session.task_id.clone());
                session_ids.push(format!("session:{}", session.id));
            }
        }
        let day_start_string = canonical(day_start_clipped);
        let day_end_string = canonical(day_end_clipped);
        let completion_events =
            completion_events_by_task(connection, &day_start_string, &day_end_string)?;
        let completion_count = completion_events.values().map(Vec::len).sum::<usize>() as i64;
        let mut event_ids = Vec::new();
        for (task_id, ids) in completion_events {
            distinct_tasks.insert(task_id);
            event_ids.extend(ids.into_iter().map(|id| format!("event:{id}")));
        }
        session_ids.extend(event_ids);
        days.push(ArchiveDaySummary {
            local_date: date.format("%Y-%m-%d").to_string(),
            actual_duration_ms,
            distinct_task_count: distinct_tasks.len() as i64,
            session_count: session_ids
                .iter()
                .filter(|reference| reference.starts_with("session:"))
                .count() as i64,
            completion_count,
            detail_references: session_ids,
        });
        date = next_local_date(date)?;
    }

    let revision = db::source_revision(connection)?;
    let after_date = cursor
        .map(|value| cursor_revision(value, revision, "stale-cursor"))
        .transpose()?;
    let start = after_date
        .map(|date| {
            days.iter()
                .position(|day| day.local_date.as_str() > date)
                .unwrap_or(days.len())
        })
        .unwrap_or(0);
    let end = (start + limit).min(days.len());
    let page = days[start..end].to_vec();
    let next_cursor =
        (end < days.len()).then(|| day_cursor(revision, &page[page.len() - 1].local_date));
    Ok(ArchiveSummaryPage {
        local_date_start: local_date_start.to_string(),
        local_date_end: local_date_end.to_string(),
        time_zone: time_zone.to_string(),
        days: page,
        source_revision: revision,
        truncated: next_cursor.is_some(),
        next_cursor,
        query_instant: canonical(now),
        query_duration_ms: started.elapsed().as_millis().try_into().unwrap_or(i64::MAX),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure;
    use chrono::SecondsFormat;

    fn connection() -> Connection {
        infrastructure::open_in_memory().expect("in-memory database")
    }

    fn at(minutes: i64) -> String {
        (DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
            + Duration::minutes(minutes))
        .to_rfc3339_opts(SecondsFormat::Millis, true)
    }

    fn create(connection: &mut Connection, title: &str, minutes: i64) -> TaskSnapshot {
        create_task(connection, title, &at(minutes)).expect("create task")
    }

    #[test]
    fn lifecycle_captures_queue_and_actual_sessions() {
        let mut connection = connection();
        let first = create(&mut connection, "A", 0);
        let second = create(&mut connection, "B", 0);
        let started = start_task(&mut connection, &first.id, first.version, &at(1)).expect("start");
        assert_eq!(started.changed_tasks[0].state, TaskState::Active);
        let switched = switch_focus(
            &mut connection,
            &first.id,
            &second.id,
            SwitchExpectedVersions {
                from_version: started.changed_tasks[0].version,
                to_version: second.version,
            },
            &at(5),
        )
        .expect("switch");
        assert_eq!(switched.changed_tasks[0].state, TaskState::Paused);
        assert_eq!(switched.changed_tasks[1].state, TaskState::Active);
        let history = get_task_actual_history(&connection, &first.id).expect("history");
        assert_eq!(history.session_count, 1);
        assert_eq!(history.total_closed_duration_ms, 4 * 60 * 1_000);
        let queue = get_next_queue(&connection, None, 20).expect("queue");
        assert_eq!(queue.task_ids, vec![first.id]);
    }

    #[test]
    fn rejected_conflicting_start_does_not_change_state() {
        let mut connection = connection();
        let first = create(&mut connection, "A", 0);
        let second = create(&mut connection, "B", 0);
        start_task(&mut connection, &first.id, first.version, &at(1)).expect("start");
        let error = start_task(&mut connection, &second.id, second.version, &at(2)).unwrap_err();
        assert_eq!(error.code, "active-task-conflict");
        assert_eq!(
            get_task(&connection, &second.id).unwrap().state,
            TaskState::Queued
        );
        assert_eq!(
            get_next_queue(&connection, None, 20).unwrap().task_ids,
            vec![second.id]
        );
    }

    #[test]
    fn complete_never_started_and_reopen_retain_event_history() {
        let mut connection = connection();
        let task = create(&mut connection, "A", 0);
        let completed =
            complete_task(&mut connection, &task.id, task.version, &at(3)).expect("complete");
        assert_eq!(completed.changed_tasks[0].state, TaskState::Completed);
        let history = get_task_actual_history(&connection, &task.id).unwrap();
        assert_eq!(history.session_count, 0);
        assert_eq!(
            history.latest_completion_at.as_deref(),
            Some(at(3).as_str())
        );
        let reopened = reopen_task(
            &mut connection,
            &task.id,
            completed.changed_tasks[0].version,
            None,
            &at(4),
        )
        .expect("reopen");
        assert_eq!(reopened.changed_tasks[0].state, TaskState::Queued);
        assert_eq!(
            get_task_actual_history(&connection, &task.id)
                .unwrap()
                .latest_completion_at
                .as_deref(),
            Some(at(3).as_str())
        );
    }

    #[test]
    fn queue_relative_move_preserves_task_history_and_revision() {
        let mut connection = connection();
        let a = create(&mut connection, "A", 0);
        let b = create(&mut connection, "B", 0);
        let c = create(&mut connection, "C", 0);
        let queue = get_next_queue(&connection, None, 20).unwrap();
        let moved = move_queued_task(
            &mut connection,
            &c.id,
            Some(&a.id),
            queue.queue_revision,
            &at(1),
        )
        .expect("move");
        assert!(moved.queue_revision > queue.queue_revision);
        assert_eq!(
            get_next_queue(&connection, None, 20).unwrap().task_ids,
            vec![c.id, a.id.clone(), b.id]
        );
        assert_eq!(
            get_task_actual_history(&connection, &a.id)
                .unwrap()
                .session_count,
            0
        );
    }

    #[test]
    fn stale_queue_move_is_atomic() {
        let mut connection = connection();
        let a = create(&mut connection, "A", 0);
        let b = create(&mut connection, "B", 0);
        let queue = get_next_queue(&connection, None, 20).unwrap();
        move_queued_task(
            &mut connection,
            &b.id,
            Some(&a.id),
            queue.queue_revision,
            &at(1),
        )
        .expect("move");
        let error = move_queued_task(&mut connection, &a.id, None, queue.queue_revision, &at(1))
            .unwrap_err();
        assert_eq!(error.code, "stale-queue");
        assert_eq!(
            get_next_queue(&connection, None, 20).unwrap().task_ids,
            vec![b.id, a.id]
        );
    }

    #[test]
    fn history_cursors_are_delimiter_safe_and_pageable() {
        let mut connection = connection();
        let task = create(&mut connection, "history", 0);
        let started = start_task(&mut connection, &task.id, task.version, &at(1)).unwrap();
        let paused = pause_task(
            &mut connection,
            &task.id,
            started.changed_tasks[0].version,
            None,
            &at(2),
        )
        .unwrap();
        let resumed = start_task(
            &mut connection,
            &task.id,
            paused.changed_tasks[0].version,
            &at(3),
        )
        .unwrap();
        complete_task(
            &mut connection,
            &task.id,
            resumed.changed_tasks[0].version,
            &at(4),
        )
        .unwrap();

        let first_sessions = get_task_sessions(&connection, &task.id, None, 1).unwrap();
        let second_sessions = get_task_sessions(
            &connection,
            &task.id,
            first_sessions.next_cursor.as_deref(),
            1,
        )
        .unwrap();
        assert_eq!(first_sessions.sessions.len(), 1);
        assert_eq!(second_sessions.sessions.len(), 1);
        assert_ne!(
            first_sessions.sessions[0].id,
            second_sessions.sessions[0].id
        );

        let first_history =
            get_history_by_actual_range(&connection, &at(0), &at(5), None, 1).unwrap();
        let second_history = get_history_by_actual_range(
            &connection,
            &at(0),
            &at(5),
            first_history.next_cursor.as_deref(),
            1,
        )
        .unwrap();
        assert_eq!(first_history.items.len(), 1);
        assert_eq!(second_history.items.len(), 1);
        let first_id = first_history.items[0]
            .event
            .as_ref()
            .map(|event| event.id.as_str())
            .or_else(|| {
                first_history.items[0]
                    .session
                    .as_ref()
                    .map(|session| session.id.as_str())
            });
        let second_id = second_history.items[0]
            .event
            .as_ref()
            .map(|event| event.id.as_str())
            .or_else(|| {
                second_history.items[0]
                    .session
                    .as_ref()
                    .map(|session| session.id.as_str())
            });
        assert_ne!(first_id, second_id);
    }

    #[test]
    fn focus_projection_uses_now_without_mutating_open_session() {
        let mut connection = connection();
        let task = create(&mut connection, "A", 0);
        start_task(&mut connection, &task.id, task.version, &at(1)).unwrap();
        let before = db::source_revision(&connection).unwrap();
        let projection = get_focus_projection(
            &connection,
            &at(0),
            &at(10),
            &at(10),
            None,
            ProjectionLimits::default(),
        )
        .unwrap();
        assert!(projection.segments[0].effective_end);
        assert_eq!(projection.segments[0].ended_at, at(10));
        assert_eq!(db::source_revision(&connection).unwrap(), before);
        assert!(db::open_session_for_task(&connection, &task.id)
            .unwrap()
            .is_some());
    }

    #[test]
    fn focus_projection_paginates_segments_and_queue_independently() {
        let mut connection = connection();
        let worked = create(&mut connection, "worked", 0);
        let started = start_task(&mut connection, &worked.id, worked.version, &at(1)).unwrap();
        let paused = pause_task(
            &mut connection,
            &worked.id,
            started.changed_tasks[0].version,
            None,
            &at(2),
        )
        .unwrap();
        let resumed = start_task(
            &mut connection,
            &worked.id,
            paused.changed_tasks[0].version,
            &at(3),
        )
        .unwrap();
        complete_task(
            &mut connection,
            &worked.id,
            resumed.changed_tasks[0].version,
            &at(4),
        )
        .unwrap();
        let queued_first = create(&mut connection, "queued first", 5);
        let queued_second = create(&mut connection, "queued second", 6);

        let limits = ProjectionLimits {
            segment_limit: 1,
            next_work_limit: 1,
        };
        let mut cursor = None;
        let mut segment_ids = Vec::new();
        let mut queue_ids = Vec::new();
        let mut page_count = 0;
        loop {
            let page = get_focus_projection(
                &connection,
                &at(0),
                &at(10),
                &at(10),
                cursor.as_deref(),
                limits.clone(),
            )
            .unwrap();
            page_count += 1;
            segment_ids.extend(page.segments.into_iter().map(|segment| segment.session_id));
            queue_ids.extend(page.next_work.task_ids);
            cursor = page.metadata.next_cursor;
            if cursor.is_none() {
                break;
            }
            assert!(page_count < 4, "focus cursor did not terminate");
        }

        assert_eq!(page_count, 2);
        assert_eq!(segment_ids.len(), 2);
        let mut unique_segments = segment_ids.clone();
        unique_segments.sort();
        unique_segments.dedup();
        assert_eq!(unique_segments.len(), segment_ids.len());
        assert_eq!(queue_ids.len(), 2);
        let mut unique_queue = queue_ids.clone();
        unique_queue.sort();
        unique_queue.dedup();
        assert_eq!(unique_queue.len(), queue_ids.len());
        let mut expected_queue = vec![queued_first.id, queued_second.id];
        expected_queue.sort();
        assert_eq!(unique_queue, expected_queue);
    }

    #[test]
    fn day_summary_splits_at_local_midnight() {
        let mut connection = connection();
        let task = create(&mut connection, "A", 0);
        start_task(
            &mut connection,
            &task.id,
            task.version,
            "2026-03-08T04:30:00Z",
        )
        .unwrap();
        let active = get_task(&connection, &task.id).unwrap();
        complete_task(
            &mut connection,
            &task.id,
            active.version,
            "2026-03-08T06:30:00Z",
        )
        .unwrap();
        let summary = get_day_summary(
            &connection,
            "2026-03-07",
            "America/New_York",
            "2026-03-09T00:00:00Z",
            None,
            20,
        )
        .unwrap();
        assert_eq!(summary.tasks.len(), 1);
        assert_eq!(summary.tasks[0].actual_duration_ms, 30 * 60 * 1_000);
        let next = get_day_summary(
            &connection,
            "2026-03-08",
            "America/New_York",
            "2026-03-09T00:00:00Z",
            None,
            20,
        )
        .unwrap();
        assert_eq!(next.tasks[0].actual_duration_ms, 90 * 60 * 1_000);
    }

    #[test]
    fn pagination_rejects_revision_mixing() {
        let mut connection = connection();
        let first = create(&mut connection, "A", 0);
        let second = create(&mut connection, "B", 0);
        let first_page = get_next_queue(&connection, None, 1).unwrap();
        create(&mut connection, "C", 0);
        let error = get_next_queue(&connection, first_page.next_cursor.as_deref(), 1).unwrap_err();
        assert_eq!(error.code, "stale-queue");
        assert_eq!(
            get_task(&connection, &first.id).unwrap().state,
            TaskState::Queued
        );
        assert_eq!(
            get_task(&connection, &second.id).unwrap().state,
            TaskState::Queued
        );
    }

    #[test]
    fn pause_resume_keeps_interruption_as_distinct_sessions() {
        let mut connection = connection();
        let task = create(&mut connection, "A", 0);
        let started = start_task(&mut connection, &task.id, task.version, &at(1)).unwrap();
        let paused = pause_task(
            &mut connection,
            &task.id,
            started.changed_tasks[0].version,
            None,
            &at(3),
        )
        .unwrap();
        let resumed = start_task(
            &mut connection,
            &task.id,
            paused.changed_tasks[0].version,
            &at(8),
        )
        .unwrap();
        let completed = complete_task(
            &mut connection,
            &task.id,
            resumed.changed_tasks[0].version,
            &at(10),
        )
        .unwrap();
        let history = get_task_actual_history(&connection, &task.id).unwrap();
        assert_eq!(history.session_count, 2);
        assert_eq!(history.total_closed_duration_ms, 4 * 60 * 1_000);
        let sessions = get_task_sessions(&connection, &task.id, None, 20)
            .unwrap()
            .sessions;
        assert_eq!(sessions[0].ended_at.as_deref(), Some(at(3).as_str()));
        assert_eq!(sessions[1].started_at, at(8));
        assert_eq!(
            get_task(&connection, &task.id).unwrap().state,
            TaskState::Completed
        );
        assert_eq!(
            completed.changed_tasks[0].completed_at.as_deref(),
            Some(at(10).as_str())
        );
    }

    #[test]
    fn invalid_pause_anchor_rolls_back_lifecycle_and_session_changes() {
        let mut connection = connection();
        let task = create(&mut connection, "A", 0);
        let anchor = create(&mut connection, "Anchor", 0);
        let started = start_task(&mut connection, &task.id, task.version, &at(1)).unwrap();
        let before_source = db::source_revision(&connection).unwrap();
        let before_queue = db::queue_revision(&connection).unwrap();
        let error = pause_task(
            &mut connection,
            &task.id,
            started.changed_tasks[0].version,
            Some(QueuePlacement {
                before_task_id: Some("missing".to_string()),
            }),
            &at(2),
        )
        .unwrap_err();
        assert_eq!(error.code, "anchor-not-found");
        assert_eq!(db::source_revision(&connection).unwrap(), before_source);
        assert_eq!(db::queue_revision(&connection).unwrap(), before_queue);
        assert_eq!(
            get_task(&connection, &task.id).unwrap().state,
            TaskState::Active
        );
        assert!(db::open_session_for_task(&connection, &task.id)
            .unwrap()
            .is_some());
        assert_eq!(
            get_next_queue(&connection, None, 20).unwrap().task_ids,
            vec![anchor.id]
        );
    }

    #[test]
    fn reopen_after_completed_session_preserves_completion_cycle() {
        let mut connection = connection();
        let task = create(&mut connection, "A", 0);
        let first = start_task(&mut connection, &task.id, task.version, &at(1)).unwrap();
        let completed = complete_task(
            &mut connection,
            &task.id,
            first.changed_tasks[0].version,
            &at(4),
        )
        .unwrap();
        let reopened = reopen_task(
            &mut connection,
            &task.id,
            completed.changed_tasks[0].version,
            None,
            &at(5),
        )
        .unwrap();
        let second = start_task(
            &mut connection,
            &task.id,
            reopened.changed_tasks[0].version,
            &at(6),
        )
        .unwrap();
        complete_task(
            &mut connection,
            &task.id,
            second.changed_tasks[0].version,
            &at(9),
        )
        .unwrap();
        let history = get_task_actual_history(&connection, &task.id).unwrap();
        assert_eq!(history.session_count, 2);
        assert_eq!(history.total_closed_duration_ms, 6 * 60 * 1_000);
        assert_eq!(
            history.latest_completion_at.as_deref(),
            Some(at(9).as_str())
        );
        assert_eq!(
            get_history_by_actual_range(&connection, &at(0), &at(10), None, 100)
                .unwrap()
                .events
                .iter()
                .filter(|event| event.event_type == "task-completed")
                .count(),
            2
        );
    }

    #[test]
    fn dst_transition_day_uses_real_utc_duration() {
        let mut connection = connection();
        let task = create(&mut connection, "DST", 0);
        start_task(
            &mut connection,
            &task.id,
            task.version,
            "2026-03-08T06:30:00Z",
        )
        .unwrap();
        let active = get_task(&connection, &task.id).unwrap();
        complete_task(
            &mut connection,
            &task.id,
            active.version,
            "2026-03-08T08:30:00Z",
        )
        .unwrap();
        let summary = get_day_summary(
            &connection,
            "2026-03-08",
            "America/New_York",
            "2026-03-09T00:00:00Z",
            None,
            20,
        )
        .unwrap();
        assert_eq!(summary.day_start_utc, "2026-03-08T05:00:00.000Z");
        assert_eq!(summary.day_end_utc, "2026-03-09T04:00:00.000Z");
        assert_eq!(summary.tasks[0].actual_duration_ms, 2 * 60 * 60 * 1_000);
    }

    #[test]
    fn archive_projection_keeps_empty_days_and_detail_references() {
        let mut connection = connection();
        let task = create(&mut connection, "Archive", 0);
        start_task(
            &mut connection,
            &task.id,
            task.version,
            "2026-01-01T23:30:00Z",
        )
        .unwrap();
        let active = get_task(&connection, &task.id).unwrap();
        complete_task(
            &mut connection,
            &task.id,
            active.version,
            "2026-01-02T00:30:00Z",
        )
        .unwrap();
        let before_source = db::source_revision(&connection).unwrap();
        let archive = get_archive_summary(
            &connection,
            "2026-01-01",
            "2026-01-04",
            "UTC",
            "2026-01-03T00:00:00Z",
            None,
            20,
        )
        .unwrap();
        assert_eq!(archive.days.len(), 3);
        assert_eq!(archive.days[0].actual_duration_ms, 30 * 60 * 1_000);
        assert_eq!(archive.days[1].actual_duration_ms, 30 * 60 * 1_000);
        assert_eq!(archive.days[2].actual_duration_ms, 0);
        assert_eq!(db::source_revision(&connection).unwrap(), before_source);
        assert!(archive.days[0]
            .detail_references
            .iter()
            .any(|reference| reference.starts_with("session:")));
    }

    #[test]
    fn supplied_projection_current_is_deterministic_and_rejects_past_open_session() {
        let mut connection = connection();
        let task = create(&mut connection, "open", 0);
        start_task(&mut connection, &task.id, task.version, &at(1)).unwrap();
        let current = at(10);
        let first = get_day_summary(&connection, "2026-01-01", "UTC", &current, None, 20).unwrap();
        let second = get_day_summary(&connection, "2026-01-01", "UTC", &current, None, 20).unwrap();
        assert_eq!(first.query_instant, current);
        let mut first_semantics = first.clone();
        let mut second_semantics = second.clone();
        first_semantics.query_duration_ms = 0;
        second_semantics.query_duration_ms = 0;
        assert_eq!(first_semantics, second_semantics);
        assert_eq!(first.tasks[0].actual_duration_ms, 9 * 60 * 1_000);

        let archive_first = get_archive_summary(
            &connection,
            "2026-01-01",
            "2026-01-02",
            "UTC",
            &current,
            None,
            20,
        )
        .unwrap();
        let archive_second = get_archive_summary(
            &connection,
            "2026-01-01",
            "2026-01-02",
            "UTC",
            &current,
            None,
            20,
        )
        .unwrap();
        let mut archive_first_semantics = archive_first.clone();
        let mut archive_second_semantics = archive_second.clone();
        archive_first_semantics.query_duration_ms = 0;
        archive_second_semantics.query_duration_ms = 0;
        assert_eq!(archive_first_semantics, archive_second_semantics);
        assert_eq!(archive_first.days[0].actual_duration_ms, 9 * 60 * 1_000);

        let before_source = db::source_revision(&connection).unwrap();
        let error =
            get_day_summary(&connection, "2026-01-01", "UTC", &at(0), None, 20).unwrap_err();
        assert_eq!(error.code, "invalid-current-instant");
        assert_eq!(db::source_revision(&connection).unwrap(), before_source);
        let error = get_archive_summary(
            &connection,
            "2026-01-01",
            "2026-01-02",
            "UTC",
            &at(0),
            None,
            20,
        )
        .unwrap_err();
        assert_eq!(error.code, "invalid-current-instant");
        assert_eq!(db::source_revision(&connection).unwrap(), before_source);
    }

    #[test]
    fn completion_without_session_is_present_in_day_and_archive_summaries() {
        let mut connection = connection();
        let task = create(&mut connection, "never started", 1);
        complete_task(&mut connection, &task.id, task.version, &at(3)).unwrap();
        let day = get_day_summary(&connection, "2026-01-01", "UTC", &at(10), None, 20).unwrap();
        assert_eq!(day.tasks.len(), 1);
        assert_eq!(day.tasks[0].task_id, task.id);
        assert_eq!(day.tasks[0].actual_duration_ms, 0);
        assert_eq!(day.tasks[0].session_count, 0);
        assert_eq!(day.tasks[0].completion_count, 1);
        assert!(day.tasks[0]
            .detail_references
            .iter()
            .any(|reference| reference.starts_with("event:")));

        let archive = get_archive_summary(
            &connection,
            "2026-01-01",
            "2026-01-02",
            "UTC",
            &at(10),
            None,
            20,
        )
        .unwrap();
        assert_eq!(archive.days[0].distinct_task_count, 1);
        assert_eq!(archive.days[0].session_count, 0);
        assert_eq!(archive.days[0].completion_count, 1);
        assert!(archive.days[0]
            .detail_references
            .iter()
            .any(|reference| reference.starts_with("event:")));
    }

    #[test]
    fn mutation_before_creation_or_latest_event_is_atomic() {
        let mut connection = connection();
        let task = create(&mut connection, "ordered", 10);
        let before_source = db::source_revision(&connection).unwrap();
        let error =
            rename_task(&mut connection, &task.id, "too early", task.version, &at(9)).unwrap_err();
        assert_eq!(error.code, "invalid-effective-instant");
        assert_eq!(db::source_revision(&connection).unwrap(), before_source);
        assert_eq!(get_task(&connection, &task.id).unwrap(), task);

        let renamed =
            rename_task(&mut connection, &task.id, "ordered", task.version, &at(11)).unwrap();
        let before_source = db::source_revision(&connection).unwrap();
        let before_queue = db::queue_revision(&connection).unwrap();
        let error = start_task(&mut connection, &task.id, renamed.version, &at(10)).unwrap_err();
        assert_eq!(error.code, "invalid-effective-instant");
        assert_eq!(db::source_revision(&connection).unwrap(), before_source);
        assert_eq!(db::queue_revision(&connection).unwrap(), before_queue);
        assert_eq!(get_task(&connection, &task.id).unwrap(), renamed);

        let error =
            move_queued_task(&mut connection, &task.id, None, before_queue, &at(10)).unwrap_err();
        assert_eq!(error.code, "invalid-effective-instant");
        assert_eq!(db::source_revision(&connection).unwrap(), before_source);
        assert_eq!(db::queue_revision(&connection).unwrap(), before_queue);
    }

    #[test]
    fn active_completion_does_not_append_duplicate_dequeue_event() {
        let mut connection = connection();
        let task = create(&mut connection, "active", 0);
        let started = start_task(&mut connection, &task.id, task.version, &at(1)).unwrap();
        let queue_revision = started.queue_revision;
        complete_task(
            &mut connection,
            &task.id,
            started.changed_tasks[0].version,
            &at(2),
        )
        .unwrap();
        let events = db::task_history_events(&connection, &task.id).unwrap();
        assert_eq!(
            events
                .iter()
                .filter(|event| event.event_type == "task-dequeued")
                .count(),
            1
        );
        assert_eq!(db::queue_revision(&connection).unwrap(), queue_revision);
    }

    #[test]
    fn temporal_validation_covers_pause_switch_complete_and_reopen() {
        let mut connection = connection();
        let task = create(&mut connection, "task", 0);
        let other = create(&mut connection, "future", 2);
        let started = start_task(&mut connection, &task.id, task.version, &at(1)).unwrap();
        let source_before_pause = db::source_revision(&connection).unwrap();
        let error = pause_task(
            &mut connection,
            &task.id,
            started.changed_tasks[0].version,
            None,
            &at(0),
        )
        .unwrap_err();
        assert_eq!(error.code, "invalid-effective-instant");
        assert_eq!(
            db::source_revision(&connection).unwrap(),
            source_before_pause
        );

        let source_before_switch = db::source_revision(&connection).unwrap();
        let error = switch_focus(
            &mut connection,
            &task.id,
            &other.id,
            SwitchExpectedVersions {
                from_version: started.changed_tasks[0].version,
                to_version: other.version,
            },
            &at(1),
        )
        .unwrap_err();
        assert_eq!(error.code, "invalid-effective-instant");
        assert_eq!(
            db::source_revision(&connection).unwrap(),
            source_before_switch
        );

        let paused = pause_task(
            &mut connection,
            &task.id,
            started.changed_tasks[0].version,
            None,
            &at(2),
        )
        .unwrap();
        let source_before_complete = db::source_revision(&connection).unwrap();
        let error = complete_task(
            &mut connection,
            &task.id,
            paused.changed_tasks[0].version,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(error.code, "invalid-effective-instant");
        assert_eq!(
            db::source_revision(&connection).unwrap(),
            source_before_complete
        );

        let completed = complete_task(
            &mut connection,
            &task.id,
            paused.changed_tasks[0].version,
            &at(3),
        )
        .unwrap();
        let source_before_reopen = db::source_revision(&connection).unwrap();
        let error = reopen_task(
            &mut connection,
            &task.id,
            completed.changed_tasks[0].version,
            None,
            &at(2),
        )
        .unwrap_err();
        assert_eq!(error.code, "invalid-effective-instant");
        assert_eq!(
            db::source_revision(&connection).unwrap(),
            source_before_reopen
        );
        assert_eq!(
            get_task(&connection, &task.id).unwrap().state,
            TaskState::Completed
        );
    }

    #[test]
    fn restart_preserves_active_task_and_open_session() {
        let path = std::env::temp_dir().join(format!("gantt-headless-{}.db", db::new_id()));
        let task_id;
        {
            let mut connection = db::open_database(&path).expect("database");
            let task = create(&mut connection, "restart", 0);
            task_id = task.id.clone();
            start_task(&mut connection, &task.id, task.version, &at(1)).expect("start");
        }
        {
            let connection = db::open_database(&path).expect("reopen database");
            assert_eq!(get_current_focus(&connection).unwrap().unwrap().id, task_id);
            assert!(db::open_session_for_task(&connection, &task_id)
                .unwrap()
                .is_some());
        }
        std::fs::remove_file(path).expect("cleanup test database");
    }

    #[test]
    fn queue_is_pageable_without_duplicate_entries() {
        let mut connection = connection();
        for index in 0..250 {
            create(&mut connection, &format!("task-{index}"), index);
        }
        let first = get_next_queue(&connection, None, 200).unwrap();
        assert_eq!(first.entries.len(), 200);
        let second = get_next_queue(&connection, first.next_cursor.as_deref(), 200).unwrap();
        assert_eq!(second.entries.len(), 50);
        assert!(second.next_cursor.is_none());
        assert!(first
            .task_ids
            .iter()
            .all(|id| !second.task_ids.iter().any(|other| other == id)));
    }

    #[test]
    fn switch_focus_v1_1_wrapper_keeps_default_end_compatibility() {
        let mut connection = connection();
        let from = create(&mut connection, "from", 0);
        let target = create(&mut connection, "target", 0);
        let anchor = create(&mut connection, "anchor", 0);
        let started = start_task(&mut connection, &from.id, from.version, &at(1)).unwrap();
        let before_queue_revision = db::queue_revision(&connection).unwrap();
        let before_source_revision = db::source_revision(&connection).unwrap();

        let result = switch_focus(
            &mut connection,
            &from.id,
            &target.id,
            SwitchExpectedVersions {
                from_version: started.changed_tasks[0].version,
                to_version: target.version,
            },
            &at(2),
        )
        .unwrap();

        assert_eq!(
            get_next_queue(&connection, None, 20).unwrap().task_ids,
            vec![anchor.id, from.id.clone()]
        );
        assert_eq!(result.queue_revision, before_queue_revision + 1);
        assert_eq!(result.source_revision, before_source_revision + 1);
        assert_eq!(
            get_task(&connection, &from.id).unwrap().state,
            TaskState::Paused
        );
        assert_eq!(
            get_task(&connection, &target.id).unwrap().state,
            TaskState::Active
        );
    }

    #[test]
    fn switch_focus_v1_1_places_source_before_anchor_exactly() {
        let mut connection = connection();
        let from = create(&mut connection, "from", 0);
        let target = create(&mut connection, "target", 0);
        let middle = create(&mut connection, "middle", 0);
        let anchor = create(&mut connection, "anchor", 0);
        let started = start_task(&mut connection, &from.id, from.version, &at(1)).unwrap();
        let queue_revision = db::queue_revision(&connection).unwrap();
        let source_revision = db::source_revision(&connection).unwrap();

        let result = switch_focus_v1_1(
            &mut connection,
            &from.id,
            &target.id,
            SwitchExpectedVersions {
                from_version: started.changed_tasks[0].version,
                to_version: target.version,
            },
            Some(QueuePlacement {
                before_task_id: Some(anchor.id.clone()),
            }),
            Some(queue_revision),
            &at(2),
        )
        .unwrap();

        assert_eq!(
            get_next_queue(&connection, None, 20).unwrap().task_ids,
            vec![middle.id, from.id.clone(), anchor.id.clone()]
        );
        assert_eq!(result.queue_revision, queue_revision + 1);
        assert_eq!(result.source_revision, source_revision + 1);
        assert_eq!(
            get_task(&connection, &from.id).unwrap().state,
            TaskState::Paused
        );
        assert_eq!(
            get_task(&connection, &target.id).unwrap().state,
            TaskState::Active
        );
        assert_eq!(
            db::task_history_sessions(&connection, &from.id)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            db::task_history_sessions(&connection, &target.id)
                .unwrap()
                .len(),
            1
        );
        let switch_event = db::task_history_events(&connection, &from.id)
            .unwrap()
            .into_iter()
            .find(|event| event.event_type == "focus-switched")
            .expect("focus-switched event");
        assert_eq!(
            switch_event.payload["beforeTaskId"].as_str(),
            Some(anchor.id.as_str())
        );
    }

    #[test]
    fn switch_focus_v1_1_supports_explicit_queue_end() {
        let mut connection = connection();
        let from = create(&mut connection, "from", 0);
        let target = create(&mut connection, "target", 0);
        let remaining = create(&mut connection, "remaining", 0);
        let started = start_task(&mut connection, &from.id, from.version, &at(1)).unwrap();
        let queue_revision = db::queue_revision(&connection).unwrap();

        switch_focus_v1_1(
            &mut connection,
            &from.id,
            &target.id,
            SwitchExpectedVersions {
                from_version: started.changed_tasks[0].version,
                to_version: target.version,
            },
            Some(QueuePlacement {
                before_task_id: None,
            }),
            Some(queue_revision),
            &at(2),
        )
        .unwrap();

        assert_eq!(
            get_next_queue(&connection, None, 20).unwrap().task_ids,
            vec![remaining.id, from.id]
        );
    }

    #[test]
    fn switch_focus_v1_1_rejects_missing_or_stale_revision_atomically() {
        let mut connection = connection();
        let from = create(&mut connection, "from", 0);
        let target = create(&mut connection, "target", 0);
        let anchor = create(&mut connection, "anchor", 0);
        let started = start_task(&mut connection, &from.id, from.version, &at(1)).unwrap();
        let queue_before = get_next_queue(&connection, None, 20).unwrap();
        let source_before = db::source_revision(&connection).unwrap();
        let from_before = get_task(&connection, &from.id).unwrap();
        let target_before = get_task(&connection, &target.id).unwrap();
        let from_sessions_before = db::task_history_sessions(&connection, &from.id).unwrap();
        let target_sessions_before = db::task_history_sessions(&connection, &target.id).unwrap();
        let from_events_before = db::task_history_events(&connection, &from.id).unwrap();
        let target_events_before = db::task_history_events(&connection, &target.id).unwrap();

        let assert_unchanged = |connection: &Connection| {
            assert_eq!(
                db::queue_revision(connection).unwrap(),
                queue_before.queue_revision
            );
            assert_eq!(db::source_revision(connection).unwrap(), source_before);
            assert_eq!(get_next_queue(connection, None, 20).unwrap(), queue_before);
            assert_eq!(get_task(connection, &from.id).unwrap(), from_before);
            assert_eq!(get_task(connection, &target.id).unwrap(), target_before);
            assert_eq!(
                db::task_history_sessions(connection, &from.id).unwrap(),
                from_sessions_before
            );
            assert_eq!(
                db::task_history_sessions(connection, &target.id).unwrap(),
                target_sessions_before
            );
            assert_eq!(
                db::task_history_events(connection, &from.id).unwrap(),
                from_events_before
            );
            assert_eq!(
                db::task_history_events(connection, &target.id).unwrap(),
                target_events_before
            );
        };

        let error = switch_focus_v1_1(
            &mut connection,
            &from.id,
            &target.id,
            SwitchExpectedVersions {
                from_version: started.changed_tasks[0].version,
                to_version: target.version,
            },
            Some(QueuePlacement {
                before_task_id: Some(anchor.id.clone()),
            }),
            None,
            &at(2),
        )
        .unwrap_err();
        assert_eq!(error.code, "stale-queue");
        assert_unchanged(&connection);

        let error = switch_focus_v1_1(
            &mut connection,
            &from.id,
            &target.id,
            SwitchExpectedVersions {
                from_version: started.changed_tasks[0].version,
                to_version: target.version,
            },
            Some(QueuePlacement {
                before_task_id: Some(anchor.id),
            }),
            Some(queue_before.queue_revision - 1),
            &at(2),
        )
        .unwrap_err();
        assert_eq!(error.code, "stale-queue");
        assert_unchanged(&connection);
    }

    #[test]
    fn switch_focus_v1_1_rejects_invalid_anchors_atomically() {
        let mut connection = connection();
        let from = create(&mut connection, "from", 0);
        let target = create(&mut connection, "target", 0);
        let completed_anchor = create(&mut connection, "completed", 0);
        complete_task(
            &mut connection,
            &completed_anchor.id,
            completed_anchor.version,
            &at(1),
        )
        .unwrap();
        let started = start_task(&mut connection, &from.id, from.version, &at(2)).unwrap();
        let queue_before = get_next_queue(&connection, None, 20).unwrap();
        let source_before = db::source_revision(&connection).unwrap();
        let from_before = get_task(&connection, &from.id).unwrap();
        let target_before = get_task(&connection, &target.id).unwrap();
        let from_sessions_before = db::task_history_sessions(&connection, &from.id).unwrap();
        let target_sessions_before = db::task_history_sessions(&connection, &target.id).unwrap();
        let from_events_before = db::task_history_events(&connection, &from.id).unwrap();
        let target_events_before = db::task_history_events(&connection, &target.id).unwrap();
        let assert_unchanged = |connection: &Connection| {
            assert_eq!(
                db::queue_revision(connection).unwrap(),
                queue_before.queue_revision
            );
            assert_eq!(db::source_revision(connection).unwrap(), source_before);
            assert_eq!(get_next_queue(connection, None, 20).unwrap(), queue_before);
            assert_eq!(get_task(connection, &from.id).unwrap(), from_before);
            assert_eq!(get_task(connection, &target.id).unwrap(), target_before);
            assert_eq!(
                db::task_history_sessions(connection, &from.id).unwrap(),
                from_sessions_before
            );
            assert_eq!(
                db::task_history_sessions(connection, &target.id).unwrap(),
                target_sessions_before
            );
            assert_eq!(
                db::task_history_events(connection, &from.id).unwrap(),
                from_events_before
            );
            assert_eq!(
                db::task_history_events(connection, &target.id).unwrap(),
                target_events_before
            );
        };
        let attempt = |connection: &mut Connection, anchor: &str| {
            switch_focus_v1_1(
                connection,
                &from.id,
                &target.id,
                SwitchExpectedVersions {
                    from_version: started.changed_tasks[0].version,
                    to_version: target.version,
                },
                Some(QueuePlacement {
                    before_task_id: Some(anchor.to_string()),
                }),
                Some(queue_before.queue_revision),
                &at(3),
            )
        };

        let error = attempt(&mut connection, "missing").unwrap_err();
        assert_eq!(error.code, "anchor-not-found");
        assert_unchanged(&connection);

        let error = attempt(&mut connection, &completed_anchor.id).unwrap_err();
        assert_eq!(error.code, "anchor-not-found");
        assert_unchanged(&connection);

        let error = attempt(&mut connection, &from.id).unwrap_err();
        assert_eq!(error.code, "self-anchor");
        assert_unchanged(&connection);

        let error = attempt(&mut connection, &target.id).unwrap_err();
        assert_eq!(error.code, "self-anchor");
        assert_unchanged(&connection);
    }

    #[test]
    fn hierarchy_create_and_forest_advance_revisions_once() {
        let mut connection = connection();
        let result = create_task_in_hierarchy(&mut connection, " root ", None, None, 0, &at(0))
            .expect("hierarchy task");
        assert_eq!(result.hierarchy_revision, 1);
        assert_eq!(result.source_revision, 1);
        assert_eq!(result.changed_tasks.len(), 1);
        assert_eq!(result.changed_entries.len(), 1);
        assert_eq!(result.changed_entries[0].depth, 0);
        assert_eq!(result.changed_entries[0].task.title, "root");
        assert_eq!(db::queue_revision(&connection).unwrap(), 1);
        let forest = get_task_forest(&connection, 5).unwrap();
        assert_eq!(forest.entries.len(), 1);
        assert!(!forest.truncated);
        assert_eq!(forest.hierarchy_revision, 1);
    }

    #[test]
    fn hierarchy_child_inserts_relative_and_rejects_completed_parent() {
        let mut connection = connection();
        let parent =
            create_task_in_hierarchy(&mut connection, "parent", None, None, 0, &at(0)).unwrap();
        let first = create_task_in_hierarchy(
            &mut connection,
            "first",
            Some(&parent.changed_tasks[0].id),
            None,
            parent.hierarchy_revision,
            &at(1),
        )
        .unwrap();
        let second = create_task_in_hierarchy(
            &mut connection,
            "second",
            Some(&parent.changed_tasks[0].id),
            Some(&first.changed_tasks[0].id),
            first.hierarchy_revision,
            &at(2),
        )
        .unwrap();
        let forest = get_task_forest(&connection, 20).unwrap();
        assert_eq!(
            forest
                .entries
                .iter()
                .map(|entry| entry.task.title.as_str())
                .collect::<Vec<_>>(),
            vec!["parent", "second", "first"]
        );
        complete_hierarchy_task(
            &mut connection,
            &first.changed_tasks[0].id,
            first.changed_tasks[0].version,
            &at(3),
        )
        .unwrap();
        complete_hierarchy_task(
            &mut connection,
            &second.changed_tasks[0].id,
            second.changed_tasks[0].version,
            &at(4),
        )
        .unwrap();
        let parent_snapshot = get_task(&connection, &parent.changed_tasks[0].id).unwrap();
        complete_hierarchy_task(
            &mut connection,
            &parent_snapshot.id,
            parent_snapshot.version,
            &at(5),
        )
        .unwrap();
        let stale_revision = get_task_forest(&connection, 20).unwrap().hierarchy_revision;
        let error = create_task_in_hierarchy(
            &mut connection,
            "blocked",
            Some(&parent_snapshot.id),
            None,
            stale_revision,
            &at(6),
        )
        .unwrap_err();
        assert_eq!(error.code, "parent-completed");
        assert_eq!(get_task_forest(&connection, 20).unwrap().entries.len(), 3);
    }

    #[test]
    fn hierarchy_move_reparents_subtree_and_rejects_stale_revision() {
        let mut connection = connection();
        let first =
            create_task_in_hierarchy(&mut connection, "first", None, None, 0, &at(0)).unwrap();
        assert_eq!(
            get_undo_status(&connection)
                .unwrap()
                .operation_token
                .as_deref(),
            Some(first.operation_id.as_str())
        );
        let second = create_task_in_hierarchy(
            &mut connection,
            "second",
            None,
            None,
            first.hierarchy_revision,
            &at(0),
        )
        .unwrap();
        let child = create_task_in_hierarchy(
            &mut connection,
            "child",
            Some(&first.changed_tasks[0].id),
            None,
            second.hierarchy_revision,
            &at(0),
        )
        .unwrap();
        let grandchild = create_task_in_hierarchy(
            &mut connection,
            "grandchild",
            Some(&child.changed_tasks[0].id),
            None,
            child.hierarchy_revision,
            &at(0),
        )
        .unwrap();
        let moved = move_task_in_hierarchy(
            &mut connection,
            &child.changed_tasks[0].id,
            Some(&second.changed_tasks[0].id),
            None,
            grandchild.hierarchy_revision,
            &at(1),
        )
        .unwrap();
        assert_eq!(moved.changed_entries.len(), 2);
        let forest = get_task_forest(&connection, 20).unwrap();
        let child_entry = forest
            .entries
            .iter()
            .find(|entry| entry.task.id == child.changed_tasks[0].id)
            .unwrap();
        let grandchild_entry = forest
            .entries
            .iter()
            .find(|entry| entry.task.id == grandchild.changed_tasks[0].id)
            .unwrap();
        assert_eq!(
            child_entry.parent_task_id.as_deref(),
            Some(second.changed_tasks[0].id.as_str())
        );
        assert_eq!(child_entry.depth, 1);
        assert_eq!(grandchild_entry.depth, 2);
        let before = get_task_forest(&connection, 20).unwrap();
        let error = move_task_in_hierarchy(
            &mut connection,
            &first.changed_tasks[0].id,
            None,
            None,
            before.hierarchy_revision - 1,
            &at(2),
        )
        .unwrap_err();
        assert_eq!(error.code, "stale-hierarchy");
        assert_eq!(get_task_forest(&connection, 20).unwrap(), before);
    }

    #[test]
    fn hierarchy_rejects_cycles_and_depth_nine() {
        let mut connection = connection();
        let root = create_task_in_hierarchy(&mut connection, "0", None, None, 0, &at(0)).unwrap();
        let self_error = move_task_in_hierarchy(
            &mut connection,
            &root.changed_tasks[0].id,
            Some(&root.changed_tasks[0].id),
            None,
            root.hierarchy_revision,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(self_error.code, "hierarchy-cycle");
        let mut revision = root.hierarchy_revision;
        let mut parent_id = root.changed_tasks[0].id.clone();
        for depth in 1..=8 {
            let child = create_task_in_hierarchy(
                &mut connection,
                &depth.to_string(),
                Some(&parent_id),
                None,
                revision,
                &at(0),
            )
            .unwrap();
            revision = child.hierarchy_revision;
            parent_id = child.changed_tasks[0].id.clone();
        }
        let depth_error = create_task_in_hierarchy(
            &mut connection,
            "too deep",
            Some(&parent_id),
            None,
            revision,
            &at(0),
        )
        .unwrap_err();
        assert_eq!(depth_error.code, "hierarchy-depth-exceeded");
        let descendant_error = move_task_in_hierarchy(
            &mut connection,
            &root.changed_tasks[0].id,
            Some(&parent_id),
            None,
            revision,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(descendant_error.code, "hierarchy-cycle");
    }

    #[test]
    fn hierarchy_completion_protects_children_and_reopen_restores_ancestors() {
        let mut connection = connection();
        let parent =
            create_task_in_hierarchy(&mut connection, "parent", None, None, 0, &at(0)).unwrap();
        let child = create_task_in_hierarchy(
            &mut connection,
            "child",
            Some(&parent.changed_tasks[0].id),
            None,
            parent.hierarchy_revision,
            &at(0),
        )
        .unwrap();
        let blocked = complete_hierarchy_task(
            &mut connection,
            &parent.changed_tasks[0].id,
            parent.changed_tasks[0].version,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(blocked.code, "incomplete-descendants");
        let child_done = complete_hierarchy_task(
            &mut connection,
            &child.changed_tasks[0].id,
            child.changed_tasks[0].version,
            &at(2),
        )
        .unwrap();
        let parent_snapshot = get_task(&connection, &parent.changed_tasks[0].id).unwrap();
        let parent_done = complete_hierarchy_task(
            &mut connection,
            &parent_snapshot.id,
            parent_snapshot.version,
            &at(3),
        )
        .unwrap();
        let hierarchy_before = get_task_forest(&connection, 20).unwrap().hierarchy_revision;
        let reopened = reopen_hierarchy_task(
            &mut connection,
            &child_done.changed_tasks[0].id,
            child_done.changed_tasks[0].version,
            &at(4),
        )
        .unwrap();
        assert_eq!(reopened.changed_tasks.len(), 2);
        assert_eq!(reopened.hierarchy_revision, hierarchy_before);
        assert!(reopened
            .changed_tasks
            .iter()
            .all(|task| task.state == TaskState::Queued));
        assert_eq!(
            get_task(&connection, &parent_done.changed_tasks[0].id)
                .unwrap()
                .state,
            TaskState::Queued
        );
        assert!(
            db::open_session_for_task(&connection, &child_done.changed_tasks[0].id)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn hierarchy_migration_backfills_deterministically_and_idempotently() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
                 INSERT INTO metadata (key, value) VALUES ('queue_revision', '7');
                 INSERT INTO metadata (key, value) VALUES ('source_revision', '9');
                 CREATE TABLE tasks (
                    id TEXT PRIMARY KEY NOT NULL,
                    title TEXT NOT NULL,
                    state TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    completed_at TEXT,
                    version INTEGER NOT NULL
                 );
                 INSERT INTO tasks VALUES ('later', 'Later', 'completed', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z', 4);
                 INSERT INTO tasks VALUES ('earlier', 'Earlier', 'queued', '2026-01-01T00:00:00Z', NULL, 2);",
            )
            .unwrap();
        infrastructure::migrate(&connection).unwrap();
        infrastructure::migrate(&connection).unwrap();
        let forest = get_task_forest(&connection, 20).unwrap();
        assert_eq!(
            forest
                .entries
                .iter()
                .map(|entry| entry.task.id.as_str())
                .collect::<Vec<_>>(),
            vec!["earlier", "later"]
        );
        assert!(forest
            .entries
            .iter()
            .all(|entry| entry.parent_task_id.is_none()));
        assert_eq!(infrastructure::source_revision(&connection).unwrap(), 9);
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM task_hierarchy", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(get_task(&connection, "later").unwrap().version, 4);
    }

    #[test]
    fn hierarchy_invalid_placements_and_limits_are_atomic() {
        let mut connection = connection();
        let parent =
            create_task_in_hierarchy(&mut connection, "parent", None, None, 0, &at(0)).unwrap();
        let sibling = create_task_in_hierarchy(
            &mut connection,
            "sibling",
            None,
            None,
            parent.hierarchy_revision,
            &at(0),
        )
        .unwrap();
        let child = create_task_in_hierarchy(
            &mut connection,
            "child",
            Some(&parent.changed_tasks[0].id),
            None,
            sibling.hierarchy_revision,
            &at(0),
        )
        .unwrap();
        let before = get_task_forest(&connection, 20).unwrap();
        let empty_title = create_task_in_hierarchy(
            &mut connection,
            "  ",
            None,
            None,
            before.hierarchy_revision,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(empty_title.code, "invalid-title");
        let missing_parent = create_task_in_hierarchy(
            &mut connection,
            "missing parent",
            Some("missing"),
            None,
            before.hierarchy_revision,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(missing_parent.code, "parent-not-found");
        let missing_anchor = move_task_in_hierarchy(
            &mut connection,
            &child.changed_tasks[0].id,
            None,
            Some("missing"),
            before.hierarchy_revision,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(missing_anchor.code, "anchor-not-found");
        let wrong_scope = move_task_in_hierarchy(
            &mut connection,
            &child.changed_tasks[0].id,
            Some(&sibling.changed_tasks[0].id),
            Some(&parent.changed_tasks[0].id),
            before.hierarchy_revision,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(wrong_scope.code, "anchor-scope-mismatch");
        assert_eq!(get_task_forest(&connection, 20).unwrap(), before);
        assert_eq!(
            get_task_forest(&connection, 0).unwrap_err().code,
            "invalid-limit"
        );
        assert_eq!(
            get_task_forest(&connection, 5001).unwrap_err().code,
            "tree-limit-exceeded"
        );
        let limited = get_task_forest(&connection, 2).unwrap();
        assert!(limited.truncated);
        assert_eq!(limited.entries.len(), 2);
    }

    #[test]
    fn delete_subtree_disappears_from_all_projections_and_undo_restores_it() {
        let mut connection = connection();
        let parent =
            create_task_in_hierarchy(&mut connection, "parent", None, None, 0, &at(0)).unwrap();
        let parent_id = parent.changed_tasks[0].id.clone();
        let child = create_task_in_hierarchy(
            &mut connection,
            "child",
            Some(&parent_id),
            None,
            parent.hierarchy_revision,
            &at(1),
        )
        .unwrap();
        let child_id = child.changed_tasks[0].id.clone();
        let started = start_task(
            &mut connection,
            &child_id,
            child.changed_tasks[0].version,
            &at(2),
        )
        .unwrap();
        pause_task(
            &mut connection,
            &child_id,
            started.changed_tasks[0].version,
            None,
            &at(3),
        )
        .unwrap();
        let before_forest = get_task_forest(&connection, 20).unwrap();
        let before_sessions = get_task_sessions(&connection, &child_id, None, 20).unwrap();
        let deleted = delete_task_subtree(
            &mut connection,
            &parent_id,
            parent.changed_tasks[0].version,
            before_forest.hierarchy_revision,
            &at(4),
        )
        .unwrap();
        assert_eq!(deleted.affected_task_ids.len(), 2);
        assert_eq!(
            get_task(&connection, &parent_id).unwrap_err().code,
            "task-not-found"
        );
        assert_eq!(
            get_task(&connection, &child_id).unwrap_err().code,
            "task-not-found"
        );
        assert!(get_task_forest(&connection, 20).unwrap().entries.is_empty());
        assert!(
            get_history_by_actual_range(&connection, &at(0), &at(10), None, 200)
                .unwrap()
                .items
                .is_empty()
        );
        assert!(get_next_queue(&connection, None, 20)
            .unwrap()
            .entries
            .is_empty());

        let token = deleted.undo_status.operation_token.clone().unwrap();
        let restored = undo_last_task_operation(&mut connection, &token, &at(5)).unwrap();
        let restored_forest = get_task_forest(&connection, 20).unwrap();
        assert_eq!(restored_forest.entries.len(), before_forest.entries.len());
        assert_eq!(
            restored_forest.entries[1].parent_task_id.as_deref(),
            Some(parent_id.as_str())
        );
        assert_eq!(
            get_task_sessions(&connection, &child_id, None, 20)
                .unwrap()
                .sessions,
            before_sessions.sessions
        );
        assert!(restored.source_revision > deleted.source_revision);
        assert!(restored.hierarchy_revision > deleted.hierarchy_revision);
        assert!(restored.queue_revision > deleted.queue_revision);
        assert!(
            get_task(&connection, &parent_id).unwrap().version > parent.changed_tasks[0].version
        );
    }

    #[test]
    fn undo_reverts_create_rename_move_complete_and_reopen_in_lifo_order() {
        let mut connection = connection();
        let first =
            create_task_in_hierarchy(&mut connection, "first", None, None, 0, &at(0)).unwrap();
        let first_id = first.changed_tasks[0].id.clone();
        let second = create_task_in_hierarchy(
            &mut connection,
            "second",
            None,
            None,
            first.hierarchy_revision,
            &at(1),
        )
        .unwrap();
        let second_id = second.changed_tasks[0].id.clone();
        let renamed = rename_task(
            &mut connection,
            &second_id,
            "renamed",
            second.changed_tasks[0].version,
            &at(2),
        )
        .unwrap();
        let revision = get_task_forest(&connection, 20).unwrap().hierarchy_revision;
        move_task_in_hierarchy(
            &mut connection,
            &second_id,
            Some(&first_id),
            None,
            revision,
            &at(3),
        )
        .unwrap();
        let completed =
            complete_hierarchy_task(&mut connection, &second_id, renamed.version, &at(4)).unwrap();
        reopen_hierarchy_task(
            &mut connection,
            &second_id,
            completed.changed_tasks[0].version,
            &at(5),
        )
        .unwrap();

        let token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        undo_last_task_operation(&mut connection, &token, &at(6)).unwrap();
        assert_eq!(
            get_task(&connection, &second_id).unwrap().state,
            TaskState::Completed
        );
        let token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        undo_last_task_operation(&mut connection, &token, &at(7)).unwrap();
        assert_eq!(
            get_task(&connection, &second_id).unwrap().state,
            TaskState::Queued
        );
        let token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        undo_last_task_operation(&mut connection, &token, &at(8)).unwrap();
        assert_eq!(
            get_task_forest(&connection, 20)
                .unwrap()
                .entries
                .iter()
                .find(|entry| entry.task.id == second_id)
                .unwrap()
                .parent_task_id,
            None,
        );
        let token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        undo_last_task_operation(&mut connection, &token, &at(9)).unwrap();
        assert_eq!(get_task(&connection, &second_id).unwrap().title, "second");
        let token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        undo_last_task_operation(&mut connection, &token, &at(10)).unwrap();
        assert_eq!(
            get_task(&connection, &second_id).unwrap_err().code,
            "task-not-found"
        );
        assert_eq!(get_task(&connection, &first_id).unwrap().title, "first");
    }

    #[test]
    fn undo_is_persistent_bounded_and_rejects_stale_tokens_atomically() {
        let path = std::env::temp_dir().join(format!("gantt-undo-{}.db", db::new_id()));
        let mut first_token = String::new();
        let mut latest_token = String::new();
        {
            let mut connection = infrastructure::open_database(&path).unwrap();
            let mut revision = 0;
            for index in 0..51 {
                let result = create_task_in_hierarchy(
                    &mut connection,
                    &format!("task-{index}"),
                    None,
                    None,
                    revision,
                    &at(index),
                )
                .unwrap();
                revision = result.hierarchy_revision;
                let token = get_undo_status(&connection)
                    .unwrap()
                    .operation_token
                    .unwrap();
                if index == 0 {
                    first_token = token.clone();
                }
                if index == 50 {
                    latest_token = token;
                }
            }
            let count: i64 = connection
                .query_row("SELECT COUNT(*) FROM undo_journal", [], |row| row.get(0))
                .unwrap();
            assert_eq!(count, 50);
        }
        {
            let mut connection = infrastructure::open_database(&path).unwrap();
            assert_eq!(
                get_undo_status(&connection)
                    .unwrap()
                    .operation_token
                    .as_deref(),
                Some(latest_token.as_str())
            );
            let before = get_task_forest(&connection, 100).unwrap();
            let stale =
                undo_last_task_operation(&mut connection, &first_token, &at(60)).unwrap_err();
            assert_eq!(stale.code, "stale-undo");
            assert_eq!(get_task_forest(&connection, 100).unwrap(), before);
            undo_last_task_operation(&mut connection, &latest_token, &at(61)).unwrap();
        }
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn failed_delete_and_unavailable_undo_are_atomic() {
        let mut connection = connection();
        let task =
            create_task_in_hierarchy(&mut connection, "task", None, None, 0, &at(0)).unwrap();
        let before = get_task_forest(&connection, 20).unwrap();
        let status_before = get_undo_status(&connection).unwrap();
        let error = delete_task_subtree(
            &mut connection,
            &task.changed_tasks[0].id,
            task.changed_tasks[0].version + 1,
            before.hierarchy_revision,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(error.code, "version-conflict");
        assert_eq!(get_task_forest(&connection, 20).unwrap(), before);
        assert_eq!(get_undo_status(&connection).unwrap(), status_before);

        let token = status_before.operation_token.unwrap();
        undo_last_task_operation(&mut connection, &token, &at(2)).unwrap();
        let revisions = (
            db::source_revision(&connection).unwrap(),
            db::hierarchy_revision(&connection).unwrap(),
            db::queue_revision(&connection).unwrap(),
            db::undo_revision(&connection).unwrap(),
        );
        let unavailable = undo_last_task_operation(&mut connection, &token, &at(3)).unwrap_err();
        assert_eq!(unavailable.code, "undo-not-available");
        assert_eq!(
            revisions,
            (
                db::source_revision(&connection).unwrap(),
                db::hierarchy_revision(&connection).unwrap(),
                db::queue_revision(&connection).unwrap(),
                db::undo_revision(&connection).unwrap(),
            )
        );
    }

    #[test]
    fn journal_persistence_failure_rolls_back_the_task_mutation() {
        let mut connection = connection();
        let task =
            create_task_in_hierarchy(&mut connection, "before", None, None, 0, &at(0)).unwrap();
        let before_task = get_task(&connection, &task.changed_tasks[0].id).unwrap();
        let before_forest = get_task_forest(&connection, 20).unwrap();
        let before_status = get_undo_status(&connection).unwrap();
        connection
            .execute_batch(
                "CREATE TRIGGER reject_undo_journal BEFORE INSERT ON undo_journal
             BEGIN SELECT RAISE(ABORT, 'injected'); END;",
            )
            .unwrap();
        let error = rename_task(
            &mut connection,
            &before_task.id,
            "after",
            before_task.version,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(error.code, "persistence-failure");
        assert_eq!(get_task(&connection, &before_task.id).unwrap(), before_task);
        assert_eq!(get_task_forest(&connection, 20).unwrap(), before_forest);
        assert_eq!(get_undo_status(&connection).unwrap(), before_status);
    }

    #[test]
    fn undo_conflict_after_non_journalled_mutation_is_atomic() {
        let mut connection = connection();
        let task =
            create_task_in_hierarchy(&mut connection, "task", None, None, 0, &at(0)).unwrap();
        let token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        start_task(
            &mut connection,
            &task.changed_tasks[0].id,
            task.changed_tasks[0].version,
            &at(1),
        )
        .unwrap();
        let before = get_task_forest(&connection, 20).unwrap();
        let revisions = (
            db::source_revision(&connection).unwrap(),
            db::hierarchy_revision(&connection).unwrap(),
            db::queue_revision(&connection).unwrap(),
            db::undo_revision(&connection).unwrap(),
        );
        let error = undo_last_task_operation(&mut connection, &token, &at(2)).unwrap_err();
        assert_eq!(error.code, "undo-conflict");
        assert_eq!(get_task_forest(&connection, 20).unwrap(), before);
        assert_eq!(
            revisions,
            (
                db::source_revision(&connection).unwrap(),
                db::hierarchy_revision(&connection).unwrap(),
                db::queue_revision(&connection).unwrap(),
                db::undo_revision(&connection).unwrap(),
            )
        );
        assert_eq!(
            get_undo_status(&connection)
                .unwrap()
                .operation_token
                .as_deref(),
            Some(token.as_str())
        );
    }

    #[test]
    fn repeated_undo_never_decreases_unrelated_task_versions() {
        let mut connection = connection();
        let first =
            create_task_in_hierarchy(&mut connection, "first", None, None, 0, &at(0)).unwrap();
        let first_id = first.changed_tasks[0].id.clone();
        let renamed = rename_task(
            &mut connection,
            &first_id,
            "renamed",
            first.changed_tasks[0].version,
            &at(1),
        )
        .unwrap();
        let revision = get_task_forest(&connection, 20).unwrap().hierarchy_revision;
        create_task_in_hierarchy(&mut connection, "second", None, None, revision, &at(2)).unwrap();
        let token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        undo_last_task_operation(&mut connection, &token, &at(3)).unwrap();
        assert!(get_task(&connection, &first_id).unwrap().version >= renamed.version);
        let before_rename_undo = get_task(&connection, &first_id).unwrap().version;
        let token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        undo_last_task_operation(&mut connection, &token, &at(4)).unwrap();
        assert!(get_task(&connection, &first_id).unwrap().version > before_rename_undo);
    }

    #[test]
    fn memo_update_preserves_exact_text_and_only_advances_source_and_undo_revisions() {
        let mut connection = connection();
        let created =
            create_task_in_hierarchy(&mut connection, "memo task", None, None, 0, &at(0)).unwrap();
        let task_id = created.changed_tasks[0].id.clone();
        let before = get_task(&connection, &task_id).unwrap();
        let forest_before = get_task_forest(&connection, 20).unwrap();
        let queue_before = get_next_queue(&connection, None, 20).unwrap();
        let memo = "  日本語🙂\n二行目\t ";

        let changed = update_task_memo(&mut connection, &task_id, memo, before.version, &at(1))
            .expect("memo update");
        let current = get_task(&connection, &task_id).unwrap();
        assert_eq!(current.memo, memo);
        assert_eq!(current.version, before.version + 1);
        assert_eq!(current.state, before.state);
        assert_eq!(current.completed_at, before.completed_at);
        assert_eq!(changed.source_revision, forest_before.source_revision + 1);
        assert_eq!(changed.hierarchy_revision, forest_before.hierarchy_revision);
        assert_eq!(changed.queue_revision, queue_before.queue_revision);
        assert_eq!(
            changed.undo_status.operation_kind.as_deref(),
            Some("memo-update")
        );

        let events = db::task_history_events(&connection, &task_id).unwrap();
        let memo_event = events
            .iter()
            .find(|event| event.event_type == "task-memo-updated")
            .expect("memo event");
        assert_eq!(memo_event.payload["hasMemo"], true);
        assert_eq!(memo_event.payload["scalarLength"], memo.chars().count());
        assert!(!memo_event.payload.to_string().contains(memo));

        let status_before_noop = get_undo_status(&connection).unwrap();
        let no_op = update_task_memo(&mut connection, &task_id, memo, current.version, &at(2))
            .expect("unchanged memo no-op");
        assert_eq!(no_op.source_revision, changed.source_revision);
        assert_eq!(no_op.hierarchy_revision, changed.hierarchy_revision);
        assert_eq!(no_op.queue_revision, changed.queue_revision);
        assert_eq!(no_op.undo_revision, changed.undo_revision);
        assert_eq!(get_undo_status(&connection).unwrap(), status_before_noop);
        assert_eq!(
            db::task_history_events(&connection, &task_id)
                .unwrap()
                .len(),
            events.len()
        );
    }

    #[test]
    fn memo_update_rejects_stale_time_and_scalar_limit_without_partial_change() {
        let mut connection = connection();
        let task = create(&mut connection, "memo task", 0);
        let before = get_task(&connection, &task.id).unwrap();
        let revisions = (
            db::source_revision(&connection).unwrap(),
            db::hierarchy_revision(&connection).unwrap(),
            db::queue_revision(&connection).unwrap(),
            db::undo_revision(&connection).unwrap(),
        );
        let status = get_undo_status(&connection).unwrap();
        let too_long = "🙂".repeat(4_001);
        for (memo, expected_version, instant_value, code) in [
            ("stale", before.version - 1, at(1), "stale-version"),
            (
                "invalid time",
                before.version,
                "not-an-instant".to_owned(),
                "invalid-effective-instant",
            ),
        ] {
            let error = update_task_memo(
                &mut connection,
                &task.id,
                memo,
                expected_version,
                &instant_value,
            )
            .unwrap_err();
            assert_eq!(error.code, code);
        }
        let error = update_task_memo(&mut connection, &task.id, &too_long, before.version, &at(1))
            .unwrap_err();
        assert_eq!(error.code, "invalid-memo");
        assert_eq!(get_task(&connection, &task.id).unwrap(), before);
        assert_eq!(get_undo_status(&connection).unwrap(), status);
        assert_eq!(
            revisions,
            (
                db::source_revision(&connection).unwrap(),
                db::hierarchy_revision(&connection).unwrap(),
                db::queue_revision(&connection).unwrap(),
                db::undo_revision(&connection).unwrap(),
            )
        );
    }

    #[test]
    fn memo_update_allows_completed_tasks_and_undo_is_lifo_with_other_operations() {
        let mut connection = connection();
        let created = create(&mut connection, "memo task", 0);
        let completed =
            complete_task(&mut connection, &created.id, created.version, &at(1)).unwrap();
        let memo_change = update_task_memo(
            &mut connection,
            &created.id,
            "completed memo",
            completed.changed_tasks[0].version,
            &at(2),
        )
        .unwrap();
        let memo_version = get_task(&connection, &created.id).unwrap().version;
        let renamed = rename_task(
            &mut connection,
            &created.id,
            "renamed",
            memo_version,
            &at(3),
        )
        .unwrap();
        let rename_token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        undo_last_task_operation(&mut connection, &rename_token, &at(4)).unwrap();
        let after_rename_undo = get_task(&connection, &created.id).unwrap();
        assert_eq!(after_rename_undo.title, "memo task");
        assert_eq!(after_rename_undo.memo, "completed memo");

        let memo_token = get_undo_status(&connection)
            .unwrap()
            .operation_token
            .unwrap();
        assert_eq!(memo_token, memo_change.undo_status.operation_token.unwrap());
        undo_last_task_operation(&mut connection, &memo_token, &at(5)).unwrap();
        let restored = get_task(&connection, &created.id).unwrap();
        assert_eq!(restored.memo, "");
        assert_eq!(restored.state, TaskState::Completed);
        assert!(restored.version > renamed.version);
    }

    #[test]
    fn memo_survives_delete_restore_and_restart() {
        let path = std::env::temp_dir().join(format!("gantt-memo-{}.db", db::new_id()));
        let task_id;
        {
            let mut connection = db::open_database(&path).unwrap();
            let created =
                create_task_in_hierarchy(&mut connection, "memo task", None, None, 0, &at(0))
                    .unwrap();
            task_id = created.changed_tasks[0].id.clone();
            update_task_memo(&mut connection, &task_id, "restart-safe", 0, &at(1)).unwrap();
        }
        {
            let mut connection = db::open_database(&path).unwrap();
            let task = get_task(&connection, &task_id).unwrap();
            assert_eq!(task.memo, "restart-safe");
            let forest = get_task_forest(&connection, 20).unwrap();
            let deleted = delete_task_subtree(
                &mut connection,
                &task_id,
                task.version,
                forest.hierarchy_revision,
                &at(2),
            )
            .unwrap();
            let token = deleted.undo_status.operation_token.unwrap();
            undo_last_task_operation(&mut connection, &token, &at(3)).unwrap();
            assert_eq!(
                get_task(&connection, &task_id).unwrap().memo,
                "restart-safe"
            );
        }
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn memo_update_migration_is_idempotent_and_legacy_undo_snapshots_default_memo() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
                 INSERT INTO metadata (key, value) VALUES ('queue_revision', '7');
                 INSERT INTO metadata (key, value) VALUES ('source_revision', '9');
                 CREATE TABLE tasks (
                    id TEXT PRIMARY KEY NOT NULL,
                    title TEXT NOT NULL,
                    state TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    completed_at TEXT,
                    version INTEGER NOT NULL
                 );
                 INSERT INTO tasks VALUES ('legacy', 'Legacy', 'queued', '2026-01-01T00:00:00Z', NULL, 4);",
            )
            .unwrap();
        infrastructure::migrate(&connection).unwrap();
        let revisions = (
            infrastructure::source_revision(&connection).unwrap(),
            infrastructure::queue_revision(&connection).unwrap(),
        );
        assert_eq!(get_task(&connection, "legacy").unwrap().memo, "");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'memo'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            1
        );
        infrastructure::migrate(&connection).unwrap();
        assert_eq!(
            revisions,
            (
                infrastructure::source_revision(&connection).unwrap(),
                infrastructure::queue_revision(&connection).unwrap(),
            )
        );

        let legacy_json = r#"{
            "tasks":[{"id":"legacy","title":"Legacy","state":"queued","created_at":"2026-01-01T00:00:00Z","completed_at":null,"version":4}],
            "queue_entries":[],"hierarchy_entries":[],"sessions":[],"events":[]
        }"#;
        let snapshot: ObservableSnapshot = serde_json::from_str(legacy_json).unwrap();
        assert_eq!(snapshot.tasks[0].memo, "");
    }

    #[test]
    fn memo_update_persistence_failure_rolls_back_body_event_and_revisions() {
        let mut connection = connection();
        let task = create(&mut connection, "memo task", 0);
        let before = get_task(&connection, &task.id).unwrap();
        let revisions = (
            db::source_revision(&connection).unwrap(),
            db::hierarchy_revision(&connection).unwrap(),
            db::queue_revision(&connection).unwrap(),
            db::undo_revision(&connection).unwrap(),
        );
        let event_count = db::task_history_events(&connection, &task.id)
            .unwrap()
            .len();
        let status = get_undo_status(&connection).unwrap();
        connection
            .execute_batch(
                "CREATE TRIGGER reject_memo_undo BEFORE INSERT ON undo_journal
                 BEGIN SELECT RAISE(ABORT, 'injected'); END;",
            )
            .unwrap();
        let error = update_task_memo(
            &mut connection,
            &task.id,
            "must roll back",
            before.version,
            &at(1),
        )
        .unwrap_err();
        assert_eq!(error.code, "persistence-failure");
        assert_eq!(get_task(&connection, &task.id).unwrap(), before);
        assert_eq!(
            db::task_history_events(&connection, &task.id)
                .unwrap()
                .len(),
            event_count
        );
        assert_eq!(
            revisions,
            (
                db::source_revision(&connection).unwrap(),
                db::hierarchy_revision(&connection).unwrap(),
                db::queue_revision(&connection).unwrap(),
                db::undo_revision(&connection).unwrap(),
            )
        );
        assert_eq!(get_undo_status(&connection).unwrap(), status);
    }
}
