# Gantt Chart

React + Tauri 2 + SQLite で作る、カスタマイズ可能なガントチャート形式のタスク管理アプリです。

現在は、左に過去の時間軸、中央にNOW境界、右に現在の階層タスクを置くNOW画面を実装済みです。残タスクは左の `作成日時 → NOW` バーから右のタスク名・操作へつながり、完了すると別一覧へ移さず、元の階層位置に対応する左側の履歴ポケットへ `作成日時 → 完了日時` として畳まれます。履歴ポケットは同じ画面内で展開でき、正確な時刻、階層、再開、配置を確認できます。トップレベル／サブタスクの追加、完了・再開、並べ替え、ドラッグによる親タスクの付け替えにも対応しています。バーは作業時間・進捗率・予定期間ではなく、タスクが存在していた期間です。既定は直近24時間で、7日／30日／90日／全期間にも切り替えられます。Reactは型付き `TaskApi` adapter経由でのみTauri commandを呼び出します。

## インストール（Windows / GitHub Releases）

GitHub の **Releases** に公開された Windows NSIS インストーラー（`.exe`）をダウンロードして実行してください。セットアップ完了後、スタートメニューまたはインストール先のアプリを起動します。リリースの配布物はWindows向けです。

現行のWindowsパッケージはコード署名を行っていないため、初回実行時に発行元が不明としてSmartScreenの警告が表示されることがあります。取得元がこのリポジトリの信頼できるReleaseであることを確認したうえで、警告画面の **詳細情報** から実行してください。署名済み発行元としては表示されません。

アプリのSQLiteデータは次の場所に保存されます。アンインストールや再インストールの前に、必要ならこのファイルをバックアップしてください。

```text
%APPDATA%\com.ganttchart.desktop\gantt.db
```

開発者がローカルでWindows NSISパッケージを作る場合は、Rust stable、WebView2 Runtimeを準備したうえで次を実行します。

```powershell
npm install
npm run package:windows
```

生成されたインストーラーは通常、次のフォルダーに出力されます。

```text
src-tauri\target\release\bundle\nsis\
```

## 前提

- Node.js 20.19 以上（推奨: LTS）
- npm
- Rust stable（`rustup` 経由を推奨。プロジェクトは `rust-toolchain.toml` で 1.98.0 を使用）
- Windows では WebView2 Runtime

Tauri の詳しい OS ごとの前提は、公式の [Prerequisites](https://v2.tauri.app/start/prerequisites/) を確認してください。

## セットアップと起動

```powershell
npm install
npm run dev
```

`npm run dev` はブラウザ用の Vite 開発サーバーです。通常のブラウザでは空の確認表示になります。visual QA用fixtureは明示的なqueryでのみ有効です。

```text
http://localhost:1420/?preview=typical
http://localhost:1420/?preview=dense
http://localhost:1420/?preview=no-active
http://localhost:1420/?preview=only-completed
http://localhost:1420/?preview=empty
http://localhost:1420/?preview=error
```

fixtureは静的preview/test専用で、production semanticsの代替ではありません。実データとSQLiteを確認する場合は、別のターミナルで次を実行します。

```powershell
npm run tauri dev
```

## 検証コマンド

```powershell
npm run check
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug --no-bundle
```

最後のコマンドは Tauri のデバッグビルドを作りますが、インストーラーなどの bundle は作りません。

## 構成

```text
src/                         階層型NOW UI、型付きTaskApi adapter、browser preview fixture、interaction tests
src-tauri/src/domain.rs      UI非依存のserde型、状態、結果、安定エラー
src-tauri/src/application.rs lifecycle / queue / sessions / projection のユースケースと契約テスト
src-tauri/src/infrastructure.rs SQLite schema、migration、transaction、cursor/revision
src-tauri/src/commands.rs    Tauri command adapter と AppState
src-tauri/src/lib.rs         Tauri起動処理、DB初期化、command登録
src-tauri/capabilities/      Tauri 2 の window 権限
src-tauri/tauri.conf.json    Tauri と Vite の接続設定
```

SQLite はRustの `rusqlite`（bundled SQLite）で管理し、アプリの `identifier` は `com.ganttchart.desktop` です。Windows では通常 `%APPDATA%\com.ganttchart.desktop\gantt.db`、macOS/Linux では OS のアプリデータ規則に従う場所になります。ReactはSQLiteへ直接接続せず、Tauri command adapterだけを呼び出します。

初回起動時に既存の `app_metadata` を維持しながら、`tasks`、`task_hierarchy`、`queue_entries`、`work_sessions`、`task_events`、revision用の `metadata` と必要なindexをtransaction境界の下で作成します。既存タスクには決定的な順序でトップレベル階層を補完し、タイトル・状態・完了日時・従来履歴は変更しません。planned start/endや見積durationの列・APIはありません。すべてのmutationはoperation IDとUTC RFC3339 millisecond形式のeffective instantを記録し、hierarchy/queue/source revisionで古い操作を検出します。

Headless commandの主な境界は次の通りです。

```text
createTask / renameTask / startTask / switchFocus / pauseTask
completeTask / reopenTask / getCurrentFocus / getTask
createTaskInHierarchy / moveTaskInHierarchy
completeHierarchyTask / reopenHierarchyTask / getTaskForest
getNextQueue / moveQueuedTask
getTaskActualHistory / getTaskSessions / getHistoryByActualRange
getFocusProjection / getDaySummary / getArchiveSummary
```

`cargo test` は、階層作成、サブタスク、並べ替え／親変更、循環・深さ制限、未完了の子を持つ親の完了拒否、親を含む再開、移行の冪等性に加え、従来のlifecycle／queue／history契約も実行します。`npm test` はTaskApi境界、インライン追加、完了・再開、ドラッグ付け替え、stale recovery、キーボード移動とfocus復元に加え、ライフタイムの終点、範囲外表示、期間操作がタスクを変更しないことを検証します。
