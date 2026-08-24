# Capability: application-update-delivery

- Status: locked
- Version: 1.0
- User outcome: 安全な最新版が利用可能かを確認し、作業を中断するタイミングを自分で選んで、署名検証済みの更新を適用して最新版を起動できる。
- Owner: Gantt Chart App
- Last updated: 2026-08-25

## Domain boundary

### In scope
- 利用可能な更新の確認と、version・release notes・公開日時の取得。
- ユーザーが明示的に開始した更新のdownload/installと、その後の再起動。
- download進捗、再試行可能な失敗、利用可能な更新がない結果の通知。
- ブラウザーfixtureおよびテスト環境でTauri runtimeへ依存しないheadless adapter。
- 既存SQLiteデータを保つ、順序付きかつ冪等なschema migration。

### Out of scope
- ユーザー同意のないdownload、install、再起動。
- Windows Authenticodeコード署名、差分配信、独自更新サーバー、更新のrollback。
- アプリ実行中のDB schema downgrade。
- releaseのversion/tag作成をローカルから自動pushする操作。

## Domain vocabulary

- Update candidate: 現在のversionより新しく、Updaterの署名・platform要件を満たすrelease。
- Check: Update candidateの有無とmetadataだけを問い合わせる非破壊操作。
- Apply: 選択済みcandidateをdownloadし、検証し、installerへ引き渡す操作。
- Relaunch: Apply成功後に、新しいアプリを起動するため現在のprocessを終了して再起動する操作。
- Schema version: SQLite `PRAGMA user_version` に保存する、適用済みmigrationの単調増加番号。

## Scenarios

### S1: 更新なし

**Given** 現在versionが配布中の最新版以上である
**When** 更新を確認する
**Then** 更新なしを返し、download・install・再起動・DB変更を行わない

### S2: 更新候補を提示する

**Given** 署名対象の新しいreleaseが利用可能である
**When** 更新を確認する
**Then** version・notes・公開日時を含むcandidateを返し、ユーザーが後で適用できる状態にする

### S3: ユーザー同意後に更新する

**Given** candidateが提示され、ユーザーが更新開始を明示した
**When** candidateを適用する
**Then** download進捗を通知し、署名検証済みartifactをinstallしてから再起動する

### S4: 確認または適用に失敗する

**Given** network、release metadata、署名検証、download、installのいずれかが失敗する
**When** 対応する操作を行う
**Then** 安定したerror結果を返し、勝手に再起動せず、再確認または再適用を可能にする

### S5: 複数versionを飛び越えてDBを更新する

**Given** DBのschema versionがアプリ要求versionより古い
**When** アプリがDBを開く
**Then** 未適用migrationを番号順に各transactionで一度だけ適用し、既存タスク・履歴・metadataを保持する

### S6: DB migrationが失敗する

**Given** 次のmigrationを完了できない
**When** アプリがDBを開く
**Then** そのmigrationの部分変更をrollbackし、DBを直前の完了versionに保ち、アプリ起動を安全に失敗させる

## Inputs

- check request: 入力なし。同時呼び出しは一つに集約する。
- apply request: 有効なUpdate candidate。ユーザーの明示操作からのみ呼び出す。
- progress observer: 受信済みbytesと可能な場合の総bytesを受け取るcallback。
- database connection: schema version 0以上のSQLite connection。

## Outputs

- check result: `available` candidateまたは`up-to-date`。
- candidate: version、任意notes、任意publishedAt、適用operation。
- apply result: installerへの引き渡しが成功し、relaunch可能であること。
- update error: `check-failed`、`download-failed`、`install-failed`、`relaunch-failed`の安定codeと診断message。
- migration result: 最終schema version。

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| idle | 未確認または前回操作が完了 | checking |
| checking | candidateを問い合わせ中 | up-to-date, available, failed |
| up-to-date | 更新なし | checking |
| available | candidateを保持しユーザー判断待ち | downloading, checking, idle |
| downloading | ユーザー同意後にartifact取得中 | installing, failed |
| installing | artifact検証・install中 | ready-to-relaunch, failed |
| ready-to-relaunch | install成功 | relaunching |
| relaunching | process再起動要求中 | terminal, failed |
| failed | 安定errorを保持し既存作業を継続可能 | checking, downloading, idle |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| check-failed | networkまたはmetadata取得失敗 | 現在versionで継続し、後で再確認 | No |
| download-failed | artifact取得失敗 | 現在versionで継続し、同じcandidateを再適用可能 | No install |
| install-failed | 署名検証またはinstaller起動失敗 | 再起動せずerrorを提示し再確認可能 | No successful apply |
| relaunch-failed | install後の再起動要求失敗 | 手動再起動可能であることを提示 | Install済みの可能性を明示 |
| migration-failed | SQLite migration失敗 | 当該transactionをrollbackし起動失敗 | No partial migration |
| schema-too-new | DB schemaがアプリ要求versionより新しい | DBを変更せず起動失敗 | No |

## Invariants

- Checkはタスク、履歴、DB schema、filesystem、process stateを変更しない。
- Applyとrelaunchはユーザーの明示操作なしに開始しない。
- candidateなしにApplyしない。
- 署名検証を迂回しない。
- 失敗した確認・download・installはアプリを勝手に終了しない。
- Schema versionは単調増加し、未適用migrationだけを順番に実行する。
- 各migrationはtransaction境界を持ち、既存ユーザーデータを保持する。
- ブラウザーpreviewとtestはnetworkやTauri pluginを暗黙に呼び出さない。

## Scale and performance envelope

- 起動時Checkは一度だけ開始し、通常のworkspace読み込みをblockしない。
- 進捗通知は大きなinstallerでもUIを飽和させない粒度で扱う。
- migrationは現在の単一ユーザーSQLite DBを対象とし、複数versionの飛び越しに対応する。

## Observability

- state、target version、進捗、安定error codeをadapterから観測できる。
- 秘密鍵、署名key material、token、filesystem上の機密pathをlogしない。
- migration後の`PRAGMA user_version`をテストで検証できる。

## Headless interface

```text
checkForUpdate() -> UpdateCandidate | null | UpdateError
applyUpdate(candidate, onProgress) -> Applied | UpdateError
relaunchApplication() -> never | UpdateError
migrateDatabase(connection) -> SchemaVersion | MigrationError
```

## Contract tests

- S1: 更新なしではcandidateを返さず、適用・再起動を呼ばない。
- S2: candidate metadataを損失なく返す。
- S3: 明示適用でdownload/install進捗を通知し、成功後だけ再起動する。
- S4: check/apply/relaunch errorを安定codeへ正規化し、再試行可能にする。
- 同時Checkを重複実行しない。
- preview/test adapterは外部I/Oを行わない。
- S5: schema version 0から最新版まで順番にmigrationし、再実行は冪等である。
- S5: 既存versionから複数versionを飛び越してもユーザーデータを保持する。
- S6: migration失敗時に当該versionの変更をrollbackする。
- DB schemaがアプリ要求versionより新しい場合は変更せず失敗する。

## Change history

- 1.0/2026-08-25: Initial draft based on the approved Tauri Updater + GitHub Releases delivery direction.
- 1.0/2026-08-25: Locked after the UpdateApi contract suite, full frontend suite (86 tests), and full Rust suite (54 tests) passed.
