pub mod application;
pub mod commands;
pub mod domain;
pub mod infrastructure;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database_path = data_dir.join("gantt.db");
            let connection = infrastructure::open_database(&database_path)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(AppState::new(connection));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::database_health,
            commands::create_task,
            commands::rename_task,
            commands::start_task,
            commands::switch_focus,
            commands::pause_task,
            commands::complete_task,
            commands::reopen_task,
            commands::get_current_focus,
            commands::get_task,
            commands::create_task_in_hierarchy,
            commands::move_task_in_hierarchy,
            commands::complete_hierarchy_task,
            commands::reopen_hierarchy_task,
            commands::get_task_forest,
            commands::delete_task_subtree,
            commands::get_undo_status,
            commands::undo_last_task_operation,
            commands::get_next_queue,
            commands::move_queued_task,
            commands::get_task_actual_history,
            commands::get_task_sessions,
            commands::get_history_by_actual_range,
            commands::get_focus_projection,
            commands::get_day_summary,
            commands::get_archive_summary
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gantt Chart application");
}

#[cfg(test)]
mod tests {
    use super::infrastructure;

    #[test]
    fn migration_preserves_app_metadata_and_creates_revisions() {
        let connection = infrastructure::open_in_memory().expect("database");
        connection
            .execute(
                "INSERT INTO app_metadata (key, value) VALUES ('app_name', 'Gantt Chart')",
                [],
            )
            .expect("metadata");
        assert_eq!(
            connection
                .query_row(
                    "SELECT value FROM app_metadata WHERE key = 'app_name'",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "Gantt Chart"
        );
        assert_eq!(infrastructure::queue_revision(&connection).unwrap(), 0);
        assert_eq!(infrastructure::source_revision(&connection).unwrap(), 0);
    }
}
