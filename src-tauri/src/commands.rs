use crate::application;
use crate::domain::{
    ActualHistoryPage, ActualHistorySummary, ArchiveSummaryPage, DaySummaryPage, DomainError,
    FocusProjection, HierarchyChangeResult, LifecycleResult, ProjectionLimits, QueueChangeResult,
    QueuePage, QueuePlacement, ReversibleChangeResult, SwitchExpectedVersions, TaskForestSnapshot,
    TaskSnapshot, UndoStatus, WorkSessionPage,
};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use tauri::State;

pub struct AppState {
    pub database: Mutex<Connection>,
}

impl AppState {
    pub fn new(database: Connection) -> Self {
        Self {
            database: Mutex::new(database),
        }
    }
}

fn lock_database<'a>(
    state: &'a State<'_, AppState>,
) -> Result<MutexGuard<'a, Connection>, DomainError> {
    state.database.lock().map_err(|_| {
        DomainError::new(
            "persistence-failure",
            "The database is temporarily unavailable",
        )
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealth {
    pub connected: bool,
    pub app_name: Option<String>,
    pub queue_revision: i64,
    pub source_revision: i64,
}

#[tauri::command]
pub fn database_health(state: State<'_, AppState>) -> Result<DatabaseHealth, DomainError> {
    let connection = lock_database(&state)?;
    connection
        .execute(
            "INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('app_name', 'Gantt Chart')",
            [],
        )
        .map_err(crate::infrastructure::storage_error)?;
    let app_name = connection
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'app_name'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(crate::infrastructure::storage_error)?;
    Ok(DatabaseHealth {
        connected: true,
        app_name,
        queue_revision: crate::infrastructure::queue_revision(&connection)?,
        source_revision: crate::infrastructure::source_revision(&connection)?,
    })
}

#[tauri::command]
pub fn create_task(
    state: State<'_, AppState>,
    title: String,
    effective_instant: String,
) -> Result<TaskSnapshot, DomainError> {
    let mut connection = lock_database(&state)?;
    application::create_task(&mut connection, &title, &effective_instant)
}

#[tauri::command]
pub fn rename_task(
    state: State<'_, AppState>,
    task_id: String,
    title: String,
    expected_version: i64,
    effective_instant: String,
) -> Result<TaskSnapshot, DomainError> {
    let mut connection = lock_database(&state)?;
    application::rename_task(
        &mut connection,
        &task_id,
        &title,
        expected_version,
        &effective_instant,
    )
}

#[tauri::command]
pub fn update_task_memo(
    state: State<'_, AppState>,
    task_id: String,
    memo: String,
    expected_task_version: i64,
    effective_instant: String,
) -> Result<ReversibleChangeResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::update_task_memo(
        &mut connection,
        &task_id,
        &memo,
        expected_task_version,
        &effective_instant,
    )
}

#[tauri::command]
pub fn start_task(
    state: State<'_, AppState>,
    task_id: String,
    expected_version: i64,
    effective_instant: String,
) -> Result<LifecycleResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::start_task(
        &mut connection,
        &task_id,
        expected_version,
        &effective_instant,
    )
}

#[tauri::command]
pub fn switch_focus(
    state: State<'_, AppState>,
    from_task_id: String,
    to_task_id: String,
    expected_versions: SwitchExpectedVersions,
    from_queue_placement: Option<QueuePlacement>,
    expected_queue_revision: Option<i64>,
    effective_instant: String,
) -> Result<LifecycleResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::switch_focus_v1_1(
        &mut connection,
        &from_task_id,
        &to_task_id,
        expected_versions,
        from_queue_placement,
        expected_queue_revision,
        &effective_instant,
    )
}

#[tauri::command]
pub fn pause_task(
    state: State<'_, AppState>,
    task_id: String,
    expected_version: i64,
    queue_placement: Option<QueuePlacement>,
    effective_instant: String,
) -> Result<LifecycleResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::pause_task(
        &mut connection,
        &task_id,
        expected_version,
        queue_placement,
        &effective_instant,
    )
}

#[tauri::command]
pub fn complete_task(
    state: State<'_, AppState>,
    task_id: String,
    expected_version: i64,
    effective_instant: String,
) -> Result<LifecycleResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::complete_task(
        &mut connection,
        &task_id,
        expected_version,
        &effective_instant,
    )
}

#[tauri::command]
pub fn reopen_task(
    state: State<'_, AppState>,
    task_id: String,
    expected_version: i64,
    queue_placement: Option<QueuePlacement>,
    effective_instant: String,
) -> Result<LifecycleResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::reopen_task(
        &mut connection,
        &task_id,
        expected_version,
        queue_placement,
        &effective_instant,
    )
}

#[tauri::command]
pub fn get_current_focus(state: State<'_, AppState>) -> Result<Option<TaskSnapshot>, DomainError> {
    let connection = lock_database(&state)?;
    application::get_current_focus(&connection)
}

#[tauri::command]
pub fn get_task(state: State<'_, AppState>, task_id: String) -> Result<TaskSnapshot, DomainError> {
    let connection = lock_database(&state)?;
    application::get_task(&connection, &task_id)
}

#[tauri::command]
pub fn create_task_in_hierarchy(
    state: State<'_, AppState>,
    title: String,
    target_parent_task_id: Option<String>,
    before_task_id: Option<String>,
    expected_hierarchy_revision: i64,
    effective_instant: String,
) -> Result<HierarchyChangeResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::create_task_in_hierarchy(
        &mut connection,
        &title,
        target_parent_task_id.as_deref(),
        before_task_id.as_deref(),
        expected_hierarchy_revision,
        &effective_instant,
    )
}

#[tauri::command]
pub fn move_task_in_hierarchy(
    state: State<'_, AppState>,
    task_id: String,
    target_parent_task_id: Option<String>,
    before_task_id: Option<String>,
    expected_hierarchy_revision: i64,
    effective_instant: String,
) -> Result<HierarchyChangeResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::move_task_in_hierarchy(
        &mut connection,
        &task_id,
        target_parent_task_id.as_deref(),
        before_task_id.as_deref(),
        expected_hierarchy_revision,
        &effective_instant,
    )
}

#[tauri::command]
pub fn complete_hierarchy_task(
    state: State<'_, AppState>,
    task_id: String,
    expected_task_version: i64,
    effective_instant: String,
) -> Result<HierarchyChangeResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::complete_hierarchy_task(
        &mut connection,
        &task_id,
        expected_task_version,
        &effective_instant,
    )
}

#[tauri::command]
pub fn reopen_hierarchy_task(
    state: State<'_, AppState>,
    task_id: String,
    expected_task_version: i64,
    effective_instant: String,
) -> Result<HierarchyChangeResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::reopen_hierarchy_task(
        &mut connection,
        &task_id,
        expected_task_version,
        &effective_instant,
    )
}

#[tauri::command]
pub fn get_task_forest(
    state: State<'_, AppState>,
    limit: u32,
) -> Result<TaskForestSnapshot, DomainError> {
    let connection = lock_database(&state)?;
    application::get_task_forest(&connection, limit)
}

#[tauri::command]
pub fn delete_task_subtree(
    state: State<'_, AppState>,
    task_id: String,
    expected_task_version: i64,
    expected_hierarchy_revision: i64,
    effective_instant: String,
) -> Result<ReversibleChangeResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::delete_task_subtree(
        &mut connection,
        &task_id,
        expected_task_version,
        expected_hierarchy_revision,
        &effective_instant,
    )
}

#[tauri::command]
pub fn get_undo_status(state: State<'_, AppState>) -> Result<UndoStatus, DomainError> {
    let connection = lock_database(&state)?;
    application::get_undo_status(&connection)
}

#[tauri::command]
pub fn undo_last_task_operation(
    state: State<'_, AppState>,
    expected_operation_token: String,
    effective_instant: String,
) -> Result<ReversibleChangeResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::undo_last_task_operation(
        &mut connection,
        &expected_operation_token,
        &effective_instant,
    )
}

#[tauri::command]
pub fn get_next_queue(
    state: State<'_, AppState>,
    after_cursor: Option<String>,
    limit: u32,
) -> Result<QueuePage, DomainError> {
    let connection = lock_database(&state)?;
    application::get_next_queue(&connection, after_cursor.as_deref(), limit)
}

#[tauri::command]
pub fn move_queued_task(
    state: State<'_, AppState>,
    task_id: String,
    before_task_id: Option<String>,
    expected_queue_revision: i64,
    effective_instant: String,
) -> Result<QueueChangeResult, DomainError> {
    let mut connection = lock_database(&state)?;
    application::move_queued_task(
        &mut connection,
        &task_id,
        before_task_id.as_deref(),
        expected_queue_revision,
        &effective_instant,
    )
}

#[tauri::command]
pub fn get_task_actual_history(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<ActualHistorySummary, DomainError> {
    let connection = lock_database(&state)?;
    application::get_task_actual_history(&connection, &task_id)
}

#[tauri::command]
pub fn get_task_sessions(
    state: State<'_, AppState>,
    task_id: String,
    after_cursor: Option<String>,
    limit: u32,
) -> Result<WorkSessionPage, DomainError> {
    let connection = lock_database(&state)?;
    application::get_task_sessions(&connection, &task_id, after_cursor.as_deref(), limit)
}

#[tauri::command]
pub fn get_history_by_actual_range(
    state: State<'_, AppState>,
    range_start: String,
    range_end: String,
    after_cursor: Option<String>,
    limit: u32,
) -> Result<ActualHistoryPage, DomainError> {
    let connection = lock_database(&state)?;
    application::get_history_by_actual_range(
        &connection,
        &range_start,
        &range_end,
        after_cursor.as_deref(),
        limit,
    )
}

#[tauri::command]
pub fn get_focus_projection(
    state: State<'_, AppState>,
    range_start: String,
    range_end: String,
    current_instant: String,
    next_cursor: Option<String>,
    limits: ProjectionLimits,
) -> Result<FocusProjection, DomainError> {
    let connection = lock_database(&state)?;
    application::get_focus_projection(
        &connection,
        &range_start,
        &range_end,
        &current_instant,
        next_cursor.as_deref(),
        limits,
    )
}

#[tauri::command]
pub fn get_day_summary(
    state: State<'_, AppState>,
    local_date: String,
    time_zone: String,
    current_instant: String,
    cursor: Option<String>,
    limit: u32,
) -> Result<DaySummaryPage, DomainError> {
    let connection = lock_database(&state)?;
    application::get_day_summary(
        &connection,
        &local_date,
        &time_zone,
        &current_instant,
        cursor.as_deref(),
        limit,
    )
}

#[tauri::command]
pub fn get_archive_summary(
    state: State<'_, AppState>,
    local_date_start: String,
    local_date_end: String,
    time_zone: String,
    current_instant: String,
    cursor: Option<String>,
    limit: u32,
) -> Result<ArchiveSummaryPage, DomainError> {
    let connection = lock_database(&state)?;
    application::get_archive_summary(
        &connection,
        &local_date_start,
        &local_date_end,
        &time_zone,
        &current_instant,
        cursor.as_deref(),
        limit,
    )
}
