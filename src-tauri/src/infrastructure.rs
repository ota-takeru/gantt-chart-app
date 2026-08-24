use crate::domain::{
    DomainError, EndReason, LifecycleEvent, QueueEntrySnapshot, TaskSnapshot, TaskState,
    WorkSession,
};
use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde_json::Value;
use std::path::Path;
use uuid::Uuid;

pub const ORDER_GAP: i64 = 1_024;
pub const CURRENT_SCHEMA_VERSION: i64 = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HierarchyRow {
    pub task_id: String,
    pub parent_task_id: Option<String>,
    pub position: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HierarchyTaskRow {
    pub task: TaskSnapshot,
    pub parent_task_id: Option<String>,
    pub position: i64,
}

pub fn open_database(path: &Path) -> Result<Connection, DomainError> {
    let connection = Connection::open(path).map_err(storage_error)?;
    configure_connection(&connection)?;
    migrate(&connection)?;
    Ok(connection)
}

pub fn open_in_memory() -> Result<Connection, DomainError> {
    let connection = Connection::open_in_memory().map_err(storage_error)?;
    configure_connection(&connection)?;
    migrate(&connection)?;
    Ok(connection)
}

fn configure_connection(connection: &Connection) -> Result<(), DomainError> {
    connection
        .execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
        .map_err(storage_error)
}

/// Return the schema version recorded by SQLite for this connection.
pub fn schema_version(connection: &Connection) -> Result<i64, DomainError> {
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(storage_error)
}

/// Apply each unapplied schema migration in its own transaction.
///
/// Version zero is the state of databases created before explicit migration
/// bookkeeping was introduced.  The migrations are intentionally additive and
/// use `IF NOT EXISTS`/column inspection so those databases retain all tasks,
/// metadata, history, and memo text they already contain.
pub fn migrate(connection: &Connection) -> Result<i64, DomainError> {
    let current = schema_version(connection)?;
    if current > CURRENT_SCHEMA_VERSION {
        return Err(DomainError::with_detail(
            "schema-too-new",
            "The database schema is newer than this application",
            current.to_string(),
        ));
    }

    let mut version = current;
    while version < CURRENT_SCHEMA_VERSION {
        let next_version = version + 1;
        let transaction = connection
            .unchecked_transaction()
            .map_err(|_| migration_failed())?;
        let result = match next_version {
            1 => migrate_v1(&transaction),
            2 => migrate_v2(&transaction),
            3 => migrate_v3(&transaction),
            _ => Err(DomainError::new(
                "migration-failed",
                "No migration exists for the requested schema version",
            )),
        };
        if result.is_err() {
            return Err(migration_failed());
        }
        transaction
            .execute_batch(&format!("PRAGMA user_version = {next_version};"))
            .map_err(|_| migration_failed())?;
        transaction.commit().map_err(|_| migration_failed())?;
        version = next_version;
    }
    Ok(version)
}

fn migration_failed() -> DomainError {
    DomainError::new(
        "migration-failed",
        "The database migration could not be completed",
    )
}

fn migrate_v1(transaction: &Transaction<'_>) -> Result<(), DomainError> {
    transaction
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS app_metadata (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );

            INSERT OR IGNORE INTO metadata (key, value) VALUES ('queue_revision', '0');
            INSERT OR IGNORE INTO metadata (key, value) VALUES ('source_revision', '0');
            INSERT OR IGNORE INTO metadata (key, value) VALUES ('hierarchy_revision', '0');
            INSERT OR IGNORE INTO metadata (key, value) VALUES ('undo_revision', '0');

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL CHECK (length(title) >= 1 AND length(title) <= 240),
                state TEXT NOT NULL CHECK (state IN ('queued', 'active', 'paused', 'completed')),
                created_at TEXT NOT NULL,
                completed_at TEXT,
                version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0)
            );

            CREATE TABLE IF NOT EXISTS queue_entries (
                task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                position INTEGER NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS work_sessions (
                id TEXT PRIMARY KEY NOT NULL,
                task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                end_reason TEXT,
                operation_id TEXT NOT NULL,
                CHECK ((ended_at IS NULL AND end_reason IS NULL) OR
                       (ended_at IS NOT NULL AND end_reason IS NOT NULL)),
                CHECK (ended_at IS NULL OR ended_at >= started_at),
                CHECK (end_reason IS NULL OR end_reason IN ('paused', 'switched', 'completed'))
            );

            CREATE TABLE IF NOT EXISTS task_events (
                id TEXT PRIMARY KEY NOT NULL,
                task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
                operation_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS undo_journal (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_token TEXT NOT NULL UNIQUE,
                operation_id TEXT NOT NULL,
                operation_kind TEXT NOT NULL,
                label TEXT NOT NULL,
                committed_at TEXT NOT NULL,
                affected_task_ids TEXT NOT NULL,
                snapshot_json TEXT NOT NULL,
                expected_source_revision INTEGER NOT NULL,
                expected_hierarchy_revision INTEGER NOT NULL,
                expected_queue_revision INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS undo_journal_sequence_idx
                ON undo_journal (sequence DESC);
            CREATE TABLE IF NOT EXISTS undo_audit (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id TEXT NOT NULL UNIQUE,
                undone_operation_token TEXT NOT NULL,
                undone_at TEXT NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS one_active_task
                ON tasks ((1)) WHERE state = 'active';
            CREATE UNIQUE INDEX IF NOT EXISTS one_open_session
                ON work_sessions ((1)) WHERE ended_at IS NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS one_open_session_per_task
                ON work_sessions (task_id) WHERE ended_at IS NULL;
            CREATE INDEX IF NOT EXISTS queue_entries_position_idx
                ON queue_entries (position, task_id);
            CREATE INDEX IF NOT EXISTS task_events_task_time_idx
                ON task_events (task_id, occurred_at, id);
            CREATE INDEX IF NOT EXISTS task_events_time_idx
                ON task_events (occurred_at, id);
            CREATE INDEX IF NOT EXISTS work_sessions_task_time_idx
                ON work_sessions (task_id, started_at, id);
            CREATE INDEX IF NOT EXISTS work_sessions_time_idx
                ON work_sessions (started_at, id);
            CREATE INDEX IF NOT EXISTS work_sessions_open_time_idx
                ON work_sessions (ended_at, started_at);
            ",
        )
        .map_err(storage_error)
}

fn migrate_v2(transaction: &Transaction<'_>) -> Result<(), DomainError> {
    let has_memo = {
        let mut statement = transaction
            .prepare("PRAGMA table_info(tasks)")
            .map_err(storage_error)?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(storage_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage_error)?;
        columns
            .iter()
            .any(|column| column.eq_ignore_ascii_case("memo"))
    };
    if !has_memo {
        transaction
            .execute(
                "ALTER TABLE tasks ADD COLUMN memo TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(storage_error)?;
    } else {
        transaction
            .execute("UPDATE tasks SET memo = '' WHERE memo IS NULL", [])
            .map_err(storage_error)?;
    }
    Ok(())
}

fn migrate_v3(transaction: &Transaction<'_>) -> Result<(), DomainError> {
    transaction
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS task_hierarchy (
                task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                parent_task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
                position INTEGER NOT NULL CHECK (position >= 0)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS task_hierarchy_sibling_position_idx
                ON task_hierarchy (COALESCE(parent_task_id, ''), position);
            CREATE INDEX IF NOT EXISTS task_hierarchy_parent_position_idx
                ON task_hierarchy (parent_task_id, position, task_id);
            ",
        )
        .map_err(storage_error)?;

    // Legacy databases have no hierarchy rows. Add missing tasks in stable
    // creation order as top-level entries without touching existing placement.
    let mut statement = transaction
        .prepare(
            "SELECT t.id
             FROM tasks t
             WHERE NOT EXISTS (
                 SELECT 1 FROM task_hierarchy h WHERE h.task_id = t.id
             )
             ORDER BY t.created_at ASC, t.id ASC",
        )
        .map_err(storage_error)?;
    let missing_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(storage_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_error)?;
    drop(statement);
    let mut next_position: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1
             FROM task_hierarchy WHERE parent_task_id IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(storage_error)?;
    for task_id in missing_ids {
        transaction
            .execute(
                "INSERT OR IGNORE INTO task_hierarchy
                 (task_id, parent_task_id, position) VALUES (?1, NULL, ?2)",
                params![task_id, next_position],
            )
            .map_err(storage_error)?;
        next_position = next_position.checked_add(1).ok_or_else(|| {
            DomainError::new(
                "persistence-failure",
                "Hierarchy ordering space is exhausted",
            )
        })?;
    }
    Ok(())
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn parse_instant(value: &str) -> Result<DateTime<Utc>, DomainError> {
    DateTime::parse_from_rfc3339(value)
        .map(|instant| instant.with_timezone(&Utc))
        .map_err(|_| {
            DomainError::with_detail(
                "invalid-effective-instant",
                "Instant must be RFC3339",
                value,
            )
        })
}

pub fn canonical_instant(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn storage_error(_error: rusqlite::Error) -> DomainError {
    DomainError::new(
        "persistence-failure",
        "The operation could not be committed",
    )
}

pub fn source_revision(connection: &Connection) -> Result<i64, DomainError> {
    metadata_revision(connection, "source_revision")
}

pub fn queue_revision(connection: &Connection) -> Result<i64, DomainError> {
    metadata_revision(connection, "queue_revision")
}

pub fn hierarchy_revision(connection: &Connection) -> Result<i64, DomainError> {
    metadata_revision(connection, "hierarchy_revision")
}

pub fn undo_revision(connection: &Connection) -> Result<i64, DomainError> {
    metadata_revision(connection, "undo_revision")
}

fn metadata_revision(connection: &Connection, key: &str) -> Result<i64, DomainError> {
    let value: String = connection
        .query_row("SELECT value FROM metadata WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .map_err(storage_error)?;
    value.parse::<i64>().map_err(|_| {
        DomainError::with_detail("persistence-failure", "Stored revision is invalid", key)
    })
}

pub fn bump_source_revision(transaction: &Transaction<'_>) -> Result<i64, DomainError> {
    transaction
        .execute(
            "UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'source_revision'",
            [],
        )
        .map_err(storage_error)?;
    metadata_revision(transaction, "source_revision")
}

pub fn bump_queue_revision(transaction: &Transaction<'_>) -> Result<i64, DomainError> {
    transaction
        .execute(
            "UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'queue_revision'",
            [],
        )
        .map_err(storage_error)?;
    metadata_revision(transaction, "queue_revision")
}

pub fn bump_hierarchy_revision(transaction: &Transaction<'_>) -> Result<i64, DomainError> {
    transaction
        .execute(
            "UPDATE metadata SET value = CAST(value AS INTEGER) + 1
             WHERE key = 'hierarchy_revision'",
            [],
        )
        .map_err(storage_error)?;
    metadata_revision(transaction, "hierarchy_revision")
}

pub fn bump_undo_revision(transaction: &Transaction<'_>) -> Result<i64, DomainError> {
    transaction
        .execute(
            "UPDATE metadata SET value = CAST(value AS INTEGER) + 1
             WHERE key = 'undo_revision'",
            [],
        )
        .map_err(storage_error)?;
    metadata_revision(transaction, "undo_revision")
}

pub fn hierarchy_rows(connection: &Connection) -> Result<Vec<HierarchyRow>, DomainError> {
    let mut statement = connection
        .prepare(
            "SELECT task_id, parent_task_id, position
             FROM task_hierarchy
             ORDER BY COALESCE(parent_task_id, ''), position ASC, task_id ASC",
        )
        .map_err(storage_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok(HierarchyRow {
                task_id: row.get(0)?,
                parent_task_id: row.get(1)?,
                position: row.get(2)?,
            })
        })
        .map_err(storage_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(storage_error)
}

pub fn hierarchy_task_rows(connection: &Connection) -> Result<Vec<HierarchyTaskRow>, DomainError> {
    let mut statement = connection
        .prepare(
            "SELECT t.id, t.title, t.state, t.version, t.created_at, t.memo, t.completed_at,
                    (SELECT MIN(s.started_at) FROM work_sessions s WHERE s.task_id = t.id),
                    h.parent_task_id, h.position
             FROM task_hierarchy h
             JOIN tasks t ON t.id = h.task_id
             ORDER BY COALESCE(h.parent_task_id, ''), h.position ASC, h.task_id ASC",
        )
        .map_err(storage_error)?;
    let rows = statement
        .query_map([], |row| {
            let state: String = row.get(2)?;
            Ok(HierarchyTaskRow {
                task: TaskSnapshot {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    state: TaskState::parse(&state).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            2,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?,
                    version: row.get(3)?,
                    created_at: row.get(4)?,
                    memo: row.get(5)?,
                    completed_at: row.get(6)?,
                    actual_start_at: row.get(7)?,
                },
                parent_task_id: row.get(8)?,
                position: row.get(9)?,
            })
        })
        .map_err(storage_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(storage_error)
}

pub fn next_hierarchy_position(
    connection: &Connection,
    parent_task_id: Option<&str>,
) -> Result<i64, DomainError> {
    let position = match parent_task_id {
        Some(parent_id) => connection.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1
             FROM task_hierarchy WHERE parent_task_id = ?1",
            [parent_id],
            |row| row.get(0),
        ),
        None => connection.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1
             FROM task_hierarchy WHERE parent_task_id IS NULL",
            [],
            |row| row.get(0),
        ),
    };
    position.map_err(storage_error)
}

pub fn insert_hierarchy_entry(
    transaction: &Transaction<'_>,
    task_id: &str,
    parent_task_id: Option<&str>,
    position: i64,
) -> Result<(), DomainError> {
    transaction
        .execute(
            "INSERT INTO task_hierarchy (task_id, parent_task_id, position)
             VALUES (?1, ?2, ?3)",
            params![task_id, parent_task_id, position],
        )
        .map_err(storage_error)?;
    Ok(())
}

pub fn set_hierarchy_placement(
    transaction: &Transaction<'_>,
    task_id: &str,
    parent_task_id: Option<&str>,
    position: i64,
) -> Result<(), DomainError> {
    transaction
        .execute(
            "UPDATE task_hierarchy SET parent_task_id = ?1, position = ?2
             WHERE task_id = ?3",
            params![parent_task_id, position, task_id],
        )
        .map_err(storage_error)?;
    Ok(())
}

pub fn task_snapshot(connection: &Connection, task_id: &str) -> Result<TaskSnapshot, DomainError> {
    connection
        .query_row(
            "SELECT t.id, t.title, t.state, t.version, t.created_at, t.memo, t.completed_at,
                    (SELECT MIN(s.started_at) FROM work_sessions s WHERE s.task_id = t.id)
             FROM tasks t WHERE t.id = ?1",
            [task_id],
            task_from_row,
        )
        .optional()
        .map_err(storage_error)?
        .ok_or_else(|| DomainError::with_detail("task-not-found", "Task does not exist", task_id))
}

pub fn task_from_row(row: &Row<'_>) -> rusqlite::Result<TaskSnapshot> {
    let state: String = row.get(2)?;
    Ok(TaskSnapshot {
        id: row.get(0)?,
        title: row.get(1)?,
        state: TaskState::parse(&state).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        version: row.get(3)?,
        created_at: row.get(4)?,
        memo: row.get(5)?,
        completed_at: row.get(6)?,
        actual_start_at: row.get(7)?,
    })
}

pub fn enqueue_task(transaction: &Transaction<'_>, task_id: &str) -> Result<i64, DomainError> {
    let max_position: Option<i64> = transaction
        .query_row("SELECT MAX(position) FROM queue_entries", [], |row| {
            row.get(0)
        })
        .map_err(storage_error)?;
    let position = max_position
        .unwrap_or(0)
        .checked_add(ORDER_GAP)
        .ok_or_else(|| {
            DomainError::new("persistence-failure", "Queue ordering space is exhausted")
        })?;
    transaction
        .execute(
            "INSERT INTO queue_entries (task_id, position) VALUES (?1, ?2)",
            params![task_id, position],
        )
        .map_err(storage_error)?;
    Ok(position)
}

pub fn enqueue_task_at(
    transaction: &Transaction<'_>,
    task_id: &str,
    before_task_id: Option<&str>,
) -> Result<i64, DomainError> {
    let before_position: Option<i64> = before_task_id
        .map(|anchor| {
            transaction
                .query_row(
                    "SELECT position FROM queue_entries WHERE task_id = ?1",
                    [anchor],
                    |row| row.get(0),
                )
                .optional()
                .map_err(storage_error)
        })
        .transpose()?
        .flatten();

    match (before_task_id, before_position) {
        (Some(_), None) => Err(DomainError::new(
            "anchor-not-found",
            "Anchor task is not eligible",
        )),
        (None, None) => enqueue_task(transaction, task_id),
        (Some(anchor), Some(anchor_position)) => {
            let previous_position: Option<i64> = transaction
                .query_row(
                    "SELECT MAX(position) FROM queue_entries WHERE position < ?1",
                    [anchor_position],
                    |row| row.get(0),
                )
                .map_err(storage_error)?;

            let position = match previous_position {
                Some(previous) if anchor_position - previous > 1 => {
                    previous + (anchor_position - previous) / 2
                }
                Some(_) => {
                    rebalance_queue(transaction)?;
                    let new_anchor_position: i64 = transaction
                        .query_row(
                            "SELECT position FROM queue_entries WHERE task_id = ?1",
                            [anchor],
                            |row| row.get(0),
                        )
                        .map_err(storage_error)?;
                    let new_previous: Option<i64> = transaction
                        .query_row(
                            "SELECT MAX(position) FROM queue_entries WHERE position < ?1",
                            [new_anchor_position],
                            |row| row.get(0),
                        )
                        .map_err(storage_error)?;
                    match new_previous {
                        Some(previous) => previous + (new_anchor_position - previous) / 2,
                        None => new_anchor_position - ORDER_GAP,
                    }
                }
                None => anchor_position - ORDER_GAP,
            };

            transaction
                .execute(
                    "INSERT INTO queue_entries (task_id, position) VALUES (?1, ?2)",
                    params![task_id, position],
                )
                .map_err(storage_error)?;
            Ok(position)
        }
        (None, Some(_)) => unreachable!("an absent anchor cannot have a position"),
    }
}

pub fn remove_queue_entry(transaction: &Transaction<'_>, task_id: &str) -> Result<(), DomainError> {
    transaction
        .execute("DELETE FROM queue_entries WHERE task_id = ?1", [task_id])
        .map_err(storage_error)?;
    Ok(())
}

pub fn queue_position(connection: &Connection, task_id: &str) -> Result<Option<i64>, DomainError> {
    connection
        .query_row(
            "SELECT position FROM queue_entries WHERE task_id = ?1",
            [task_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(storage_error)
}

pub fn queue_entries(connection: &Connection) -> Result<Vec<QueueEntrySnapshot>, DomainError> {
    let mut statement = connection
        .prepare(
            "SELECT q.task_id, q.position, t.id, t.title, t.state, t.version,
                    t.created_at, t.memo, t.completed_at,
                    (SELECT MIN(s.started_at) FROM work_sessions s WHERE s.task_id = t.id)
             FROM queue_entries q
             JOIN tasks t ON t.id = q.task_id
             ORDER BY q.position ASC, q.task_id ASC",
        )
        .map_err(storage_error)?;
    let rows = statement
        .query_map([], |row| {
            let state: String = row.get(4)?;
            Ok(QueueEntrySnapshot {
                task_id: row.get(0)?,
                position: row.get(1)?,
                task: TaskSnapshot {
                    id: row.get(2)?,
                    title: row.get(3)?,
                    state: TaskState::parse(&state).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            4,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?,
                    version: row.get(5)?,
                    created_at: row.get(6)?,
                    memo: row.get(7)?,
                    completed_at: row.get(8)?,
                    actual_start_at: row.get(9)?,
                },
            })
        })
        .map_err(storage_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(storage_error)
}

pub fn rebalance_queue(transaction: &Transaction<'_>) -> Result<(), DomainError> {
    let mut statement = transaction
        .prepare("SELECT task_id FROM queue_entries ORDER BY position ASC, task_id ASC")
        .map_err(storage_error)?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(storage_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_error)?;
    drop(statement);

    // Temporarily move keys into a disjoint negative range so a UNIQUE
    // constraint cannot fail while the queue is being renumbered.
    transaction
        .execute("UPDATE queue_entries SET position = -position - 1", [])
        .map_err(storage_error)?;
    for (index, task_id) in ids.iter().enumerate() {
        let position = (index as i64 + 1).checked_mul(ORDER_GAP).ok_or_else(|| {
            DomainError::new("persistence-failure", "Queue ordering space is exhausted")
        })?;
        transaction
            .execute(
                "UPDATE queue_entries SET position = ?1 WHERE task_id = ?2",
                params![position, task_id],
            )
            .map_err(storage_error)?;
    }
    Ok(())
}

pub fn insert_event(
    transaction: &Transaction<'_>,
    task_id: Option<&str>,
    operation_id: &str,
    event_type: &str,
    occurred_at: &str,
    payload: &Value,
) -> Result<String, DomainError> {
    let id = new_id();
    let payload = serde_json::to_string(payload).map_err(|error| {
        DomainError::with_detail(
            "persistence-failure",
            "Event payload could not be encoded",
            error.to_string(),
        )
    })?;
    transaction
        .execute(
            "INSERT INTO task_events
             (id, task_id, operation_id, event_type, occurred_at, payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, task_id, operation_id, event_type, occurred_at, payload],
        )
        .map_err(storage_error)?;
    Ok(id)
}

pub fn open_session(
    transaction: &Transaction<'_>,
    task_id: &str,
    started_at: &str,
    operation_id: &str,
) -> Result<String, DomainError> {
    let id = new_id();
    transaction
        .execute(
            "INSERT INTO work_sessions
             (id, task_id, started_at, ended_at, end_reason, operation_id)
             VALUES (?1, ?2, ?3, NULL, NULL, ?4)",
            params![id, task_id, started_at, operation_id],
        )
        .map_err(storage_error)?;
    Ok(id)
}

pub fn close_open_session(
    transaction: &Transaction<'_>,
    task_id: &str,
    ended_at: &str,
    reason: EndReason,
) -> Result<String, DomainError> {
    let session_id: Option<String> = transaction
        .query_row(
            "SELECT id FROM work_sessions WHERE task_id = ?1 AND ended_at IS NULL",
            [task_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(storage_error)?;
    let session_id = session_id
        .ok_or_else(|| DomainError::new("session-not-open", "The task has no open work session"))?;
    transaction
        .execute(
            "UPDATE work_sessions SET ended_at = ?1, end_reason = ?2
             WHERE id = ?3 AND ended_at IS NULL",
            params![ended_at, reason.as_str(), session_id],
        )
        .map_err(storage_error)?;
    Ok(session_id)
}

pub fn session_from_row(row: &Row<'_>) -> rusqlite::Result<WorkSession> {
    let reason: Option<String> = row.get(4)?;
    Ok(WorkSession {
        id: row.get(0)?,
        task_id: row.get(1)?,
        started_at: row.get(2)?,
        ended_at: row.get(3)?,
        end_reason: reason
            .as_deref()
            .map(EndReason::parse)
            .transpose()
            .map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    4,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
        operation_id: row.get(5)?,
    })
}

pub fn event_from_row(row: &Row<'_>) -> rusqlite::Result<LifecycleEvent> {
    let payload: String = row.get(5)?;
    Ok(LifecycleEvent {
        id: row.get(0)?,
        task_id: row.get(1)?,
        operation_id: row.get(2)?,
        event_type: row.get(3)?,
        occurred_at: row.get(4)?,
        payload: serde_json::from_str(&payload).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                5,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
    })
}

pub fn latest_session_end(
    connection: &Connection,
    task_id: &str,
) -> Result<Option<DateTime<Utc>>, DomainError> {
    let value: Option<String> = connection
        .query_row(
            "SELECT MAX(ended_at) FROM work_sessions WHERE task_id = ?1 AND ended_at IS NOT NULL",
            [task_id],
            |row| row.get(0),
        )
        .map_err(storage_error)?;
    value.map(|value| parse_instant(&value)).transpose()
}

pub fn latest_event_instant(
    connection: &Connection,
    task_id: &str,
) -> Result<Option<DateTime<Utc>>, DomainError> {
    let value: Option<String> = connection
        .query_row(
            "SELECT MAX(occurred_at) FROM task_events WHERE task_id = ?1",
            [task_id],
            |row| row.get(0),
        )
        .map_err(storage_error)?;
    value.map(|value| parse_instant(&value)).transpose()
}

pub fn open_session_for_task(
    connection: &Connection,
    task_id: &str,
) -> Result<Option<WorkSession>, DomainError> {
    connection
        .query_row(
            "SELECT id, task_id, started_at, ended_at, end_reason, operation_id
             FROM work_sessions WHERE task_id = ?1 AND ended_at IS NULL",
            [task_id],
            session_from_row,
        )
        .optional()
        .map_err(storage_error)
}

pub fn task_history_sessions(
    connection: &Connection,
    task_id: &str,
) -> Result<Vec<WorkSession>, DomainError> {
    let mut statement = connection
        .prepare(
            "SELECT id, task_id, started_at, ended_at, end_reason, operation_id
             FROM work_sessions WHERE task_id = ?1 ORDER BY started_at ASC, id ASC",
        )
        .map_err(storage_error)?;
    let rows = statement
        .query_map([task_id], session_from_row)
        .map_err(storage_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(storage_error)
}

pub fn task_history_events(
    connection: &Connection,
    task_id: &str,
) -> Result<Vec<LifecycleEvent>, DomainError> {
    let mut statement = connection
        .prepare(
            "SELECT id, task_id, operation_id, event_type, occurred_at, payload
             FROM task_events WHERE task_id = ?1 ORDER BY occurred_at ASC, id ASC",
        )
        .map_err(storage_error)?;
    let rows = statement
        .query_map([task_id], event_from_row)
        .map_err(storage_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(storage_error)
}

pub fn insert_task(
    transaction: &Transaction<'_>,
    task_id: &str,
    title: &str,
    created_at: &str,
) -> Result<(), DomainError> {
    transaction
        .execute(
            "INSERT INTO tasks (id, title, state, created_at, completed_at, version, memo)
             VALUES (?1, ?2, 'queued', ?3, NULL, 0, '')",
            params![task_id, title, created_at],
        )
        .map_err(storage_error)?;
    Ok(())
}

pub fn update_task_state(
    transaction: &Transaction<'_>,
    task_id: &str,
    expected_version: i64,
    state: TaskState,
    completed_at: Option<&str>,
) -> Result<(), DomainError> {
    let changed = transaction
        .execute(
            "UPDATE tasks SET state = ?1, completed_at = COALESCE(?2, completed_at), version = version + 1
             WHERE id = ?3 AND version = ?4",
            params![state.as_str(), completed_at, task_id, expected_version],
        )
        .map_err(storage_error)?;
    if changed == 0 {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?1)",
                [task_id],
                |row| row.get(0),
            )
            .map_err(storage_error)?;
        if !exists {
            return Err(DomainError::with_detail(
                "task-not-found",
                "Task does not exist",
                task_id,
            ));
        }
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    Ok(())
}

pub fn update_task_title(
    transaction: &Transaction<'_>,
    task_id: &str,
    expected_version: i64,
    title: &str,
) -> Result<(), DomainError> {
    let changed = transaction
        .execute(
            "UPDATE tasks SET title = ?1, version = version + 1
             WHERE id = ?2 AND version = ?3",
            params![title, task_id, expected_version],
        )
        .map_err(storage_error)?;
    if changed == 0 {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?1)",
                [task_id],
                |row| row.get(0),
            )
            .map_err(storage_error)?;
        if !exists {
            return Err(DomainError::with_detail(
                "task-not-found",
                "Task does not exist",
                task_id,
            ));
        }
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    Ok(())
}

pub fn update_task_memo(
    transaction: &Transaction<'_>,
    task_id: &str,
    expected_version: i64,
    memo: &str,
) -> Result<(), DomainError> {
    let changed = transaction
        .execute(
            "UPDATE tasks SET memo = ?1, version = version + 1
             WHERE id = ?2 AND version = ?3",
            params![memo, task_id, expected_version],
        )
        .map_err(storage_error)?;
    if changed == 0 {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?1)",
                [task_id],
                |row| row.get(0),
            )
            .map_err(storage_error)?;
        if !exists {
            return Err(DomainError::with_detail(
                "task-not-found",
                "Task does not exist",
                task_id,
            ));
        }
        return Err(DomainError::new("stale-version", "Task version is stale"));
    }
    Ok(())
}

#[cfg(test)]
mod migration_tests {
    use super::*;
    use rusqlite::Connection;

    fn stored_user_version(connection: &Connection) -> i64 {
        schema_version(connection).expect("schema version")
    }

    fn migrate_to_version_one(connection: &Connection) {
        let transaction = connection
            .unchecked_transaction()
            .expect("migration transaction");
        migrate_v1(&transaction).expect("version one migration");
        transaction
            .execute_batch("PRAGMA user_version = 1;")
            .expect("version one marker");
        transaction.commit().expect("version one commit");
    }

    fn migrate_to_version_two(connection: &Connection) {
        let transaction = connection
            .unchecked_transaction()
            .expect("migration transaction");
        migrate_v2(&transaction).expect("version two migration");
        transaction
            .execute_batch("PRAGMA user_version = 2;")
            .expect("version two marker");
        transaction.commit().expect("version two commit");
    }

    #[test]
    fn from_zero_applies_ordered_migrations_to_current_schema() {
        let connection = Connection::open_in_memory().expect("database");
        assert_eq!(stored_user_version(&connection), 0);

        assert_eq!(
            migrate(&connection).expect("migration"),
            CURRENT_SCHEMA_VERSION
        );
        assert_eq!(stored_user_version(&connection), CURRENT_SCHEMA_VERSION);
        for table in [
            "app_metadata",
            "metadata",
            "tasks",
            "queue_entries",
            "task_hierarchy",
            "work_sessions",
            "task_events",
            "undo_journal",
            "undo_audit",
        ] {
            let exists: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                    [table],
                    |row| row.get(0),
                )
                .expect("table lookup");
            assert!(exists, "missing table {table}");
        }
        let memo_exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('tasks') WHERE name = 'memo')",
                [],
                |row| row.get(0),
            )
            .expect("memo lookup");
        assert!(memo_exists);
    }

    #[test]
    fn migration_is_idempotent_and_preserves_metadata_and_memo() {
        let connection = Connection::open_in_memory().expect("database");
        migrate(&connection).expect("first migration");
        connection
            .execute(
                "INSERT INTO app_metadata (key, value) VALUES ('workspace', 'preserved')",
                [],
            )
            .expect("metadata");
        connection
            .execute(
                "INSERT INTO tasks (id, title, state, created_at, version, memo)
                 VALUES ('memo-task', 'Memo', 'queued', '2026-08-25T00:00:00Z', 4, 'exact memo')",
                [],
            )
            .expect("task");
        connection
            .execute(
                "INSERT INTO task_hierarchy (task_id, parent_task_id, position)
                 VALUES ('memo-task', NULL, 0)",
                [],
            )
            .expect("hierarchy");

        assert_eq!(
            migrate(&connection).expect("second migration"),
            CURRENT_SCHEMA_VERSION
        );
        assert_eq!(stored_user_version(&connection), CURRENT_SCHEMA_VERSION);
        assert_eq!(
            connection
                .query_row(
                    "SELECT value FROM app_metadata WHERE key = 'workspace'",
                    [],
                    |row| { row.get::<_, String>(0) }
                )
                .expect("metadata value"),
            "preserved"
        );
        assert_eq!(
            connection
                .query_row("SELECT memo FROM tasks WHERE id = 'memo-task'", [], |row| {
                    row.get::<_, String>(0)
                })
                .expect("memo value"),
            "exact memo"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM task_hierarchy WHERE task_id = 'memo-task'",
                    [],
                    |row| { row.get::<_, i64>(0) }
                )
                .expect("hierarchy row"),
            1
        );
    }

    #[test]
    fn legacy_database_without_memo_preserves_rows_and_defaults_memo() {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(
                "CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
                 INSERT INTO metadata (key, value) VALUES ('source_revision', '17');
                 CREATE TABLE tasks (
                   id TEXT PRIMARY KEY NOT NULL,
                   title TEXT NOT NULL,
                   state TEXT NOT NULL,
                   created_at TEXT NOT NULL,
                   completed_at TEXT,
                   version INTEGER NOT NULL
                 );
                 INSERT INTO tasks VALUES ('legacy', 'Legacy task', 'queued', '2026-01-01T00:00:00Z', NULL, 9);",
            )
            .expect("legacy database");

        migrate(&connection).expect("legacy migration");
        assert_eq!(stored_user_version(&connection), CURRENT_SCHEMA_VERSION);
        assert_eq!(
            connection
                .query_row(
                    "SELECT title, version, memo FROM tasks WHERE id = 'legacy'",
                    [],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    }
                )
                .expect("legacy task"),
            ("Legacy task".to_string(), 9, String::new())
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT value FROM metadata WHERE key = 'source_revision'",
                    [],
                    |row| { row.get::<_, String>(0) }
                )
                .expect("legacy metadata"),
            "17"
        );
    }

    #[test]
    fn a_multi_version_jump_runs_each_pending_migration_in_order() {
        let connection = Connection::open_in_memory().expect("database");
        migrate_to_version_one(&connection);
        connection
            .execute(
                "INSERT INTO tasks (id, title, state, created_at, version)
                 VALUES ('jump-task', 'Jump', 'queued', '2026-08-25T00:00:00Z', 2)",
                [],
            )
            .expect("legacy task");

        assert_eq!(
            migrate(&connection).expect("multi-version migration"),
            CURRENT_SCHEMA_VERSION
        );
        assert_eq!(stored_user_version(&connection), CURRENT_SCHEMA_VERSION);
        assert_eq!(
            connection
                .query_row("SELECT memo FROM tasks WHERE id = 'jump-task'", [], |row| {
                    row.get::<_, String>(0)
                })
                .expect("memo after jump"),
            ""
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM task_hierarchy WHERE task_id = 'jump-task'",
                    [],
                    |row| { row.get::<_, i64>(0) }
                )
                .expect("hierarchy after jump"),
            1
        );
    }

    #[test]
    fn too_new_schema_is_rejected_without_changes() {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch("CREATE TABLE sentinel (value TEXT); PRAGMA user_version = 99;")
            .expect("future database");
        let error = migrate(&connection).expect_err("future schema should fail");
        assert_eq!(error.code, "schema-too-new");
        assert_eq!(stored_user_version(&connection), 99);
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'tasks'",
                    [],
                    |row| { row.get::<_, i64>(0) }
                )
                .expect("schema remains unchanged"),
            0
        );
    }

    #[test]
    fn failed_migration_rolls_back_the_current_version_transaction() {
        let connection = Connection::open_in_memory().expect("database");
        migrate_to_version_one(&connection);
        migrate_to_version_two(&connection);
        connection
            .execute_batch(
                "CREATE TABLE task_hierarchy (
                   task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                   parent_task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
                   position INTEGER NOT NULL CHECK (position >= 0)
                 );
                 CREATE TRIGGER reject_hierarchy_insert
                 BEFORE INSERT ON task_hierarchy
                 BEGIN SELECT RAISE(ABORT, 'test migration failure'); END;
                 INSERT INTO tasks (id, title, state, created_at, version, memo)
                 VALUES ('rollback-task', 'Rollback', 'queued', '2026-08-25T00:00:00Z', 0, 'kept');",
            )
            .expect("rollback fixture");

        let error = migrate(&connection).expect_err("migration should fail");
        assert_eq!(error.code, "migration-failed");
        assert_eq!(stored_user_version(&connection), 2);
        assert_eq!(
            connection
                .query_row(
                    "SELECT memo FROM tasks WHERE id = 'rollback-task'",
                    [],
                    |row| { row.get::<_, String>(0) }
                )
                .expect("task preserved"),
            "kept"
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'task_hierarchy_sibling_position_idx'", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("index rollback"),
            0
        );
    }
}
