# Focus Flow v1 — 独立モノクロUI探索

- Artifact status: **Direction A selected / ready for UI integration**
- Input boundary: `design/capability-packs/focus-flow-v1.md`、locked `focus-work-lifecycle` v1.1、locked `next-queue-ordering` v1.1、locked `work-session-history` v1.0、locked `history-projection` v1.0、`design/principles.md`
- Selection owner: Human / product owner
- Selected direction: A「時間の継ぎ目」
- Structural target: desktop-first 1280×800、minimum 960×640
- Visual phase: 構造選択済み、visual systemは未決。以下の記号、罫線、濃淡名は構造と非色覚キューを確認するためのもの

## Capability boundary carried into every direction

この探索が表現してよいのは、実際に宣言された作業時間、現在の1件、意図的な次順、保持されたイベントと集約だけである。未来の時刻、予定バー、期限、見積り、進捗率、依存関係、自動優先度は表示にも操作にも持ち込まない。

- `NOW` は最大1件。active task は open session をちょうど1件持つ。
- `NEXT` は queued / paused task の単一の相対順序であり、カレンダーではない。
- switch は旧タスクの終了と新タスクの開始を同一時刻で行う1回の原子的操作。
- switchでは旧タスクのNEXT return placementをeligible anchorの前または末尾としてpreviewできる。明示placementはpreview時のexpected queue revisionを伴い、省略時は互換defaultとして末尾へ戻る。
- complete 後も次は自動開始しない。reopen 後も自動開始しない。
- session gap、completion cycle、過去の event は消去・結合しない。
- open session の右端に用いる `NOW` は読み取り時の supplied current instant であり、保存された終了ではない。
- すべての失敗は no partial application。表示は楽観的な確定状態を作らず、成功結果を受けてから確定する。
- ページングされた recent history と next queue は、それぞれ独立した continuation と truncation 表示を持つ。

### Locked v1.1 switch return placement

- Explicit switch previewは `fromTask A → toTask B` と、Aのreturn placement (`before C` または `end`) を一つの原子的結果として示す。
- Explicit placementは、そのpreviewを組み立てた `expectedQueueRevision` と共に送る。revisionがない／stale、anchorが不適格、source/targetをanchorにする指定は全体を失敗させ、task、queue、session、event、revisionを一切変えない。
- Placementとrevisionを共に省略する操作は、Aをqueue endへ戻す後方互換switchとして表示する。
- 成功時はAのsession close、Aのpause/queue insertion、Bのdequeue/activation/session open、eventとrevision更新を一つの結果として確定する。UIはこれをpauseとstartの別commandに分解しない。

## Four lenses

### 1. Information lens

#### 同時に見える必要がある情報

- 現在の active task、その open 状態、開始時刻、経過が「投影値」であること。
- 次に選べる queued / paused task の先頭部分と、その相対順序。paused は「以前に作業済み」であることを文字／形で区別する。
- 直近の exact session segments。特に A → B → A を A の連続区間に見せない gap。
- 操作対象、操作種別、pending / success / failure、失敗時に以前の状態が保持されたこと。
- truncated history / queue の継続取得口と、表示が全件ではないという明示。

#### 遅延表示できる情報

- task ごとの全 session / event、completion cycles、operation identifier、source references。
- 日単位の task 別 duration / session count / completion count。
- archive の日別 duration / distinct task count / session count / completion count。
- source revision、query instant、time zone、diagnostic metadata。通常時は情報詳細面に置き、stale recovery 時だけ前面化する。

#### 時制の文法

| Meaning | Monochrome non-color cue | 必須ラベル |
|---|---|---|
| Past exact | 終端を持つ実線 segment、時刻範囲、segment 間の空白 | `実働` / end reason |
| Current | 右端未確定の線、`… NOW`、常時位置固定 | `作業中` |
| Future order | 時刻軸を持たない番号／相対位置、縦方向 | `次の順番` |
| Paused | `Ⅱ` と session count、次順に存在 | `一時停止` |
| Completed | `✓` と completion event、current/next から分離 | `完了` |
| Aggregate | 太さや塗りではなく数値と集約単位 | `日集計` / `アーカイブ` |

時刻と順番を同じ軸で符号化しない。`3番目` は `15:30` を意味せず、history の横幅は queue の優先度を意味しない。

### 2. Interaction lens

すべての主要操作には pointer と keyboard の両方の発見可能な入口を置く。操作は、対象を選ぶ → 許可された command を確認する → pending → 確定結果、という因果列を壊さない。

| Operation | Capability-safe interaction contract | Cancel / undo boundary |
|---|---|---|
| Create | title 1–240文字を検証し、queued の末尾に追加 | 送信前は取消可。成功後の delete は存在しない |
| Rename | 選択 task の title を編集し expected version と共に送信 | 送信前は取消可。成功後は再 rename が新操作 |
| Start | active がない時だけ queued / paused を start | 送信後の履歴を消す undo はない。必要なら後続 pause |
| Switch | active、対象、旧タスクのreturn placement、expected queue revisionを同時にpreviewし、単一の explicit switchとして送信。placement/revision省略はdefault end | 送信後の reversal は新たな switch であり、履歴は保持 |
| Pause | active を止め、選んだ relative placement に queue 挿入 | placement preview は取消可。成功後の再開は新 session |
| Complete | queued / paused / active を完了。active なら session close | 確認前は取消可。成功後は reopen 可能だが completion event は残る |
| Reopen | completed を queued の指定位置へ戻す。開始しない | placement preview は取消可。成功後も session は開かない |
| Reorder | before-anchor / end を明示した preview を expected revision で送信 | preview は取消可。成功後の戻しは別の move command |
| Detail query | focus → day → archive、または source reference から下位詳細へ | 読み取りなので閉じる／戻るのみ。source は不変 |

pending 中は同じ command の二重送信を止めるが、他の表示を「成功済み」に変えない。atomic command 自体の domain-level cancellation は locked capability にないため、送信後に「キャンセル済み」と偽らない。

### 3. Layout lens

- タスクは原則 row。title、state、actual segments、next order の読み合わせを水平または反復可能な垂直リズムで保つ。
- 1280×800 では current / history / next の意味をスクロールせず把握できる。960×640 では supporting detail を畳むが current と primary action、next 先頭、直近 gap は残す。
- dense state は row height 28–36 px 相当を想定し、長い mixed title は1行省略＋full-title access。30 queue entries と100 sessionsを全展開せず、それぞれ独立に page / virtualize する。
- selection と keyboard focus は別概念。selection は `>`、focus は `[ ]` 相当の輪郭で、mutation 後は結果の row または因果上の次の安全な対象へ復元する。
- sticky な要素は `NOW` と列見出しに限定し、画面を dashboard cards で分割しない。

### 4. Visual lens

構造選択前はモノクロのまま検証する。

- Typography: title、時刻／duration、state、metadata の4階層。数字は桁揃え、長い日本語／英語混在 title は本文書体のまま。
- State marks: `● 作業中`、`Ⅱ 一時停止`、`○ 未着手`、`✓ 完了`。色を外しても読める語と形を必ず併置。
- Segment: closed `├────┤`、open `├────… NOW`、gap は空白、completion は `◇`。線の種類だけに依存せず時刻も表示可能。
- Feedback: pending は対象行に `処理中…`、success は結果行の短い確定文、failure は同じ action origin に error code の人間向け説明と recovery action。toast だけにしない。
- Motion: switch 時に old segment が閉じ new segment が開く因果を補強できるが、reduced motion では同一時刻ラベルと静的な接合記号で同じ情報を出す。
- Later visual decisions: semantic colors、font family、surface material、spacing tokens、motion duration は direction selection 後に決める。

### Lens tensions to preserve

- Information lens は recent exact detail を多く要求するが、layout lens は bounded density を要求する。解決は aggregation で gap を潰すことではなく、exact recent page と明示的な day/archive drill-down の分離。
- Interaction lens は command の確信を求めるが、visual lens は常時 confirmation dialog を避けたい。irreversible deletion は存在しないため、complete / switch の因果だけを action origin 内で明確にし、一般 modal は使わない。
- Product character は時間面を求める一方、NEXT は時間ではない。各案とも NEXT を time axis に載せず、連続性は「意味の並び」で表し、予定時刻には見せない。

## Shared state and error grammar

### Command states

| State | Required rendering and behavior |
|---|---|
| Idle | 現在の snapshot と許可 command を表示 |
| Preparing | title / target / placement を局所編集。`Esc` で取消し、domain state は不変 |
| Pending | 対象と command 名を残し `処理中…`。二重送信を無効化し、旧状態を維持 |
| Success | server/result snapshot で確定し、operation の結果を短文で同じ場所に表示 |
| Failure | error code、no-change、recovery を action origin に表示。入力可能なら保持 |
| Refreshed | stale recovery 後の新 revision と、再選択が必要かを示す |
| Projection truncated | `一部表示: 続きを読み込む` と独立 cursor。全件表示を装わない |
| No active | NOW の空席を明示し、NEXT の先頭を自動開始しない |

### Required variant coverage

| Variant | Cross-direction requirement |
|---|---|
| Empty: task/historyなし | 空のNOWと空のNEXTを別々に示し、唯一のprimary actionをcreateにする。架空のsample rowやfuture barを置かない |
| Queue only: 未開始taskあり | exact historyはvalid empty、NOWは空席、NEXTだけを順序付きで表示。先頭を自動選択／開始しない |
| Active typical | active title、open session、prior recent work、bounded NEXTを同時表示 |
| Active with prior segments | 同じtaskの各segmentとgapを保持し、open segmentだけをNOWへ接続 |
| No active after completion | closed segmentまたはevent-only completion、空のNOW、残るNEXT、`自動開始なし`を同時表示 |
| Pending / success | old stateを保つpendingから、返されたsnapshot/revisionによる確定へ遷移 |
| Stale version / queue | no-changeを示し、該当taskまたはqueueだけをrefreshして意図を再確認 |
| Persistence failure | old lifecycle / queue / session / eventをそのまま描き、safe retryを同じoriginに置く |
| Cancellation | create/edit/switch/placementの送信前previewだけを取消し。送信済みatomic commandの取消しは装わない |
| Recovery / refresh | refreshed revision、selection/focus restoration、再送が自動でないことを示す |
| Truncated history / NEXT | 2つのcontinuationを分離し、それぞれの表示範囲と続きを明示 |

### Error and recovery mapping

| Error family | In-place message | Recovery action |
|---|---|---|
| `invalid-title` | `タイトルは1〜240文字で入力` | title を保持して修正・再送 |
| `task-not-found` | `対象が現在の一覧にありません。変更はありません` | task / projection を refresh |
| `invalid-transition`, `task-not-eligible` | `現在の状態ではこの操作はできません` | lifecycle / queue を refreshし許可操作を再提示 |
| `active-task-conflict` | `別の作業が進行中。開始ではなく切替が必要` | explicit switch または先に pause |
| `stale-version` | `タスクが更新されています。変更はありません` | task を refresh、意図を再確認して retry |
| `stale-queue` | `次の順番が更新されています。切替／並べ替えは未反映` | queue refresh、placement preview を新revisionで再構成して retry |
| `anchor-not-found` | `戻り先／移動先が次の順番から外れました` | queue refresh、別 anchor / end を選択 |
| `self-anchor` | `切替元・切替先自身を戻り先にはできません` | source/target以外のanchorまたはendへ修正 |
| `invalid-effective-instant`, `invalid-time-order` | `時刻の整合性を確認できません。変更はありません` | clock/state refresh。手動の session 時刻編集は提供しない |
| `session-already-open`, `session-not-open`, `overlapping-session`, `invalid-end-reason` | `作業記録と状態が一致しません。変更はありません` | lifecycle と task history を refresh。source detail を開く |
| `invalid-range` | `表示範囲を短くするか正しい順に指定` | focus ≤24h / day 1日 / archive ≤366日で再 query |
| `invalid-current-instant` | `現在時刻が作業開始より前です` | clock refreshして query を再実行 |
| `invalid-time-zone` | `タイムゾーンを確認` | 有効な IANA time zone を選び直す |
| `stale-cursor` | `履歴が更新されたため先頭から読み直します` | 同じ query shape の first page から再開。混在ページを保持しない |
| `persistence-failure` | `保存／読込に失敗。以前の状態は保持されています` | 同じ command / query を安全に retry、または refresh |

Failure 表示は赤色前提にせず、`!`、見出し、説明、recovery control、focus 移動で伝える。

---

## Direction A: 時間の継ぎ目 — HISTORY / NOW / NEXT continuity

- Thesis: 実働の過去、ただ1つの現在、順序だけを持つ未来を、一本の意味的な連続面として読む。中心は「切替の瞬間」。
- Spatial model: 左から `HISTORY | NOW | NEXT` の3帯。HISTORY は actual-time 横軸、NOW は固定幅の接合帯、NEXT は時刻を持たない縦順。
- Primary object: current moment と、その前後をつなぐ handoff。
- Action origin: NOW の current row、または NEXT の対象 row。switch は両者を一本の接合プレビューで結ぶ。
- State/result expression: old/new rowの間の seam に pending / exact instant / success / failure を局所表示。
- Temporal/history representation: exact segments は左へ伸び、open segment のみ NOW seam に接する。NEXT は番号付き縦列で横幅を持たない。
- Domain signature: **原子的切替の継ぎ目**。A の closed segment と B の open segment を同じ `T` の上下対で表示し、同一時刻・no gap・no overlap を一目で示す。通常 pause/resume の gap は seam で接続しない。

### Typical 1280×800

```text
 実働 HISTORY  10:00   11:00   12:00   13:00   14:00 │ NOW 15:12 │ 次の順番 NEXT
──────────────────────────────────────────────────┼───────────┼──────────────────────
 APIレスポンス遅延…  10:05-10:26  13:42-14:01 ├──┼──… NOW   │ ● 作業中  [一時停止][完了]
 顧客向け回答の根拠…        11:12-11:29 ├──┤       │           │ 1 Ⅱ 顧客向け回答… [切替]
 再現条件をテストケースにする                         │           │ 2 ○ 再現条件を…    [切替]
 SQLite migrationの失敗ケースを確認                  │           │ 3 ○ SQLite…        [切替]
 … recent 12/30 segments [履歴の続きを表示]           │           │ 4 ○ レビュー…      [切替]
──────────────────────────────────────────────────┴───────────┴──────────────────────
 + 新しい作業を追加   切替preview: B=1番 / Aを3番の前へ / queue rev 184 [確定][取消]
 Day 8/23: 4h18m・18 tasks [日集計]       Archive [古い実働]       Queue 6件
```

### Dense 1280×800

```text
 HISTORY: 今日 100 sessions / 45 tasks [一部表示 1–40]│NOW│ NEXT 30 [1–12表示]
──────────────────────────────────────────────────────┼───┼────────────────────────
 APIレスポンス…      ├─┤   ├──┤       ├────…          │●  │ 01 Ⅱ 顧客向け回答…
 調査ログA            ├┤ ├─┤                            │   │ 02 ○ 再現条件をテスト…
 very-long-English…       ├────┤                       │   │ 03 ○ SQLite migration…
 … 37 visible rows / virtualized                       │   │ 04 Ⅱ レビューコメント…
 [さらに古いsegment]                                  │   │ … 12/30 [次を表示]
──────────────────────────────────────────────────────┴───┴────────────────────────
 Detail drawer-row: selected task 3 sessions / 2 completions / refs [閉じる]
```

### No-active 1280×800

```text
 HISTORY: 直近の実働                                 │ NOW 15:12      │ NEXT
────────────────────────────────────────────────────┼────────────────┼────────────────────
 完了 API調査       14:38-15:10 ├────────┤ ◇完了      │ ○ 作業中なし   │ 1 ○ 再現条件… [開始]
 顧客向け回答       11:12-11:29 ├──┤                 │ 次は自動開始   │ 2 Ⅱ 顧客向け… [開始]
                                                    │ されません     │ 3 ○ SQLite…   [開始]
────────────────────────────────────────────────────┴────────────────┴────────────────────
 完了しました。以前の順番は保持 / 次の開始を選んでください
```

### Operations, states, error, and recovery

- Create: NEXT 下端の一行 capture。Enter で末尾追加、Esc で取消し。成功後は新 row と queue revision を表示。
- Rename: HISTORY/NOW/NEXT いずれの同一 task row から title edit。表示位置が複数でも editor は1つ、成功 snapshot を全表現へ反映。
- Start: no-active の NEXT row にのみ `開始`。active 時には `開始` を隠して `切替` と明記し、active-task-conflict を誘発しにくくする。
- Switch: active row A と target row Bを seam で結び、NEXT上でAのreturn slot (`Cの前` / `末尾`) を選ぶ。previewは `A → B を15:12に切替 / AをCの前へ戻す / queue rev 184` のように2 task、placement、expected queue revisionを同時に固定する。明示placementはrevisionと共に単一commandとして送信し、omissionはAをdefault endへ戻す。成功後はAが選択位置でpaused、Bが seam に接するopen segmentになり、queue/source revisionは各1回進む。stale/missing revisionまたはinvalid anchorではseamもNEXTも変えず、refresh後にpreviewを作り直す。
- Pause: NOW から `一時停止`。before-anchor / end の placement chooser を NEXT 内に preview。成功後 NOW は空席になる。
- Complete: row 内から実行。active complete は open segment を閉じ、NOW 空席と `自動開始なし` を同時表示。queued complete は session bar を作らず completion marker だけを HISTORY detail に残す。
- Reopen: completion detail の `再開候補へ戻す` から placement preview。成功後 NEXT に queued として現れるが NOW へ接続しない。
- Reorder: NEXT 内の destination slots (`この前へ` / `末尾`) を keyboardでも順に選ぶ。drag を補助に使えても relative placement の言語化を常に残す。
- History detail: segment / completion marker / day summary から行内 detail band を開き、session list → event refs を辿る。詳細を開いても projection source は変えない。
- Pending / success / failure: seam または操作 row に表示。pending中はA/B/return slotを固定する。staleの場合は旧previewを破棄し、refresh後のqueue revisionで2対象とreturn slotを再提示する。persistence failureではold segmentを閉じた見た目にもqueueを移した見た目にもしない。

### Trace to locked semantics

- Seam とreturn-slot previewは lifecycle v1.1 S3–S5、queue v1.1 S4–S6、work-session S4のexplicit placement、compatible default end、revision-safe atomic switchを表現する。
- 分離 segment は work-session S2–S3 と「never silently merged」を保持する。
- NOW 空席は lifecycle v1.1 S6 / next-queue の no auto-start を明示する。
- 時刻のない NEXT は queue v1.1 S1–S5 と「no planned date/duration」を保つ。
- exact → day → archive の下段は projection S1–S5、detail references、独立 pagination に対応する。

### Risks and scale concerns

- 3帯の幅競合が強く、960px では long title と exact time の両立が難しい。NEXT title を省略し、HISTORY の時刻範囲を優先する必要がある。
- 100 sessions を同じ軸に描くと線が密集する。row virtualization と range zoom は読み取り query の範囲変更として扱い、session merge はしない。
- History/NOW/Next が一本に見えすぎると NEXT を予定時刻と誤認する危険がある。軸線を NOW で切り、NEXT に時間目盛を絶対に延長しない。
- screen reader では visual seam を `Aの作業を終了し、同時刻にBを開始` と一文で読み上げる。

### Typical-pattern rationale / anti-template

- Dashboard cards は使わない。3帯はタイルではなく、異なる時制と単位を隣接比較するための連続座標面。
- 常設 sidebar は使わない。NEXT は補助 navigation ではなく primary domain object なので主面の右帯に置く。
- Modal は使わない。switch の2対象と現在文脈が隠れると atomic meaning を確認できないため、seam 上の inline confirmation が必要。
- Detail band は drawer風に見えても row alignment を保持する局所展開であり、画面外の汎用 inspector ではない。

---

## Direction B: 実働仕訳帳 — declaration ledger

- Thesis: 仕事の状態を「予定」ではなく、ユーザーが行った宣言と生じた実働の連続記録として読む。中心は ledger の最新行。
- Spatial model: 上から下へ source順の chronological ledger。末尾側に current declaration composer、右端に時刻を持たない queue index を細い平行レーンとして置く。
- Primary object: lifecycle declaration / retained event と、それが開閉した session。
- Action origin: ledger の現在端に固定した `次の宣言` 行。対象は検索／queue index から選び、command sentence を組み立てる。
- State/result expression: 1 command = 1 ledger row。pending は未確定罫線、success は operation id 付き確定行、failure は `未記帳` 行として表示して no-change を示す。
- Temporal/history representation: 実時間順の event/session ledger。NEXT は別単位の番号 index で、ledger の未来行を予約しない。
- Domain signature: **切替の複式記帳行**。単一 operation 行の中に `A session closed: switched` と `B session opened` を同じ時刻・同じ operation bracket で対にする。二つの別成功には分解しない。

### Typical 1280×800

```text
 実働仕訳帳  今日  source chronological order          │ 次の順番 index
═══════════════════════════════════════════════════════╪══════════════════════════
 12:57  ✓ task completed / sessionなし                 │ 01 Ⅱ 顧客向け回答…
 13:42  { APIレスポンス遅延… OPEN }                    │ 02 ○ 再現条件を…
 14:01  { APIレスポンス遅延… CLOSED / paused }         │ 03 ○ SQLite migration…
 14:38  { APIレスポンス遅延… OPEN } op-…               │ 04 ○ レビューコメント…
 15:12  ● OPEN APIレスポンス遅延…                      │ 05 ○ ログ採取手順…
 … 12/30 [続きを記帳から読む]                           │ 06 ○ リリースノート…
───────────────────────────────────────────────────────┼──────────────────────────
 CURRENT DECLARATION ● APIレスポンス遅延… 14:38…NOW [一時停止][完了]
 [対象: 顧客向け回答…] [AからBへ切替]                  + 作業を追加
───────────────────────────────────────────────────────┴──────────────────────────
 [8/23 日集計] [アーカイブ]     selected event → [task][sessions][completion cycle]
```

### Dense 1280×800

```text
 LEDGER 今日 1–50 / 100 events+sessions                │ QUEUE 1–15 / 30 rev 184
 14:01 CLOSE paused task#32                              │ 04 Ⅱ very-long-English…
 14:07 [SWITCH op-93] A CLOSE ┐ B OPEN ┘               │ 03 ○ SQLite migration…
 14:38 OPEN  task#32                                   │ 02 ○ 再現条件をテスト…
 15:12 OPEN/current task#32 APIレスポンス…              │ 01 Ⅱ 顧客向け回答…
 … compact rows, equal timestamps grouped by stable order│ … [次の15件]
 [古い50件]                                              │ selected 03 [前へ][末尾]
───────────────────────────────────────────────────────┴──────────────────────────
 DECLARE: ● current APIレスポンス… | commands [Ctrl+K] | status: idle
```

### No-active 1280×800

```text
 14:38 { APIレスポンス… OPEN }                         │ 03 ○ SQLite…
 15:10 { APIレスポンス… CLOSED / completed }           │ 01 ○ 再現条件を…
 15:10 ✓ APIレスポンス… completed                      │ 02 Ⅱ 顧客向け回答…
 …                                                     │
═══════════════════════════════════════════════════════╧══════════════════════════
 CURRENT DECLARATION ○ 作業中なし — 次は自動開始していません
 [対象: 再現条件をテストケースにする] [開始]             + 作業を追加
```

### Operations, states, error, and recovery

- Create: declaration composer の `+ 作業を追加` で title sentence を作成。成功すると `task-created` 確定行と queue末尾 index を同時反映。
- Rename: task detail から `名称を変更` declaration を組み立てる。履歴行の古い表示を「その時点の別名」と誤認させないよう、task identity と current title を併記できる。
- Start: no-active の composer で `対象を開始`。active が存在すれば composer は明示的に switch sentence へ分岐し、start と switch を同じ語にしない。
- Switch: `AからBへ切替し、AをCの前へ戻す（queue rev 184）` の一文と複式preview。pendingはbracketを点線、成功時だけ一つの確定ledger rowにする。placement/revisionを省略するsentenceは `Aを末尾へ戻す` compatible defaultとして扱う。stale/invalid placementは `未記帳—変更なし` としてqueueをrefreshし、sentenceを再構成する。
- Pause: `Aを一時停止し、NEXTのXの前へ / 末尾へ` という一文。成功 row と queue index 更新は同じ結果として読み上げる。
- Complete: current/queue/task detail から宣言。成功 ledger の直後も composer は `作業中なし`。never-started task は completion event のみで session rowを作らない。
- Reopen: completion row / cycle detail から `queueへ戻す` sentence。過去の completion row は消さず、新しい reopened event を追記。
- Reorder: queue index の item を選び、composer に `CをAの前へ移動` と文章化して preview。成功すると audit row と revision を更新。
- History detail: ledger row の operation bracket / source ref から task sessions、day summary、archive dayへ辿る。equal timestamps は stable source order を保持。
- Cancellation: composer 内の未送信 sentence を Esc で破棄。pending command は domain cancel 不可と表示し、完了結果を待つ。
- Failure/recovery: failure は ledger に retained event として混ぜず、composer直下の `未記帳—変更なし` band に置く。refresh 成功後に band を `現在のstate/revisionを読込済み` に変え、ユーザーが再送を選ぶ。

### Trace to locked semantics

- Ledger は lifecycle observability events と completion cycles を直接理解しやすくし、reopen 後も旧 completion を残す。
- 複式 switch row は lifecycle S3 / session S4 / atomic no-partial invariant に対応。
- event-only completion row は lifecycle S5 と projection の completion-only summary を捏造 session なしで表す。
- queue index は next-queue relative order / revision を、時刻の未来予告と混同せず表す。
- query page と source refs は equal timestamp ordering、pagination、focus/day/archive detail を支える。

### Risks and scale concerns

- 一般ユーザーに「仕訳」の概念が重く見える可能性。UI用語は `実働の記録` とし、複式構造は switch 時だけ使う。
- event/session ledger では長い作業区間の全体像が掴みにくい。session rowに duration と task detailへの経路が必要。
- events と sessions を同時に並べると100件/日の密度が高い。compact modeでも行種別ラベルを省略しない。
- keyboard command composer は高速だが、全 command を暗記させない。選択可能な動詞と対象を常時列挙し、screen reader に完成 sentence を確認させる。

### Typical-pattern rationale / anti-template

- 右の queue index は sidebar navigation ではなく、command sentence の対象／anchor を供給する primary ordered set。外すと relative placement と deliberate next order が見えない。
- Command palette 風入力は shortcut 専用ではない。許可 transition と2対象 operation を文章化するために必要。通常ボタンの発見可能性も残す。
- Modal は使わない。ledger の直前結果と current state が見えないと宣言の因果を検証できない。
- Cards / dashboard summary は使わず、全項目を同一 ledger rhythm に置く。

---

## Direction C: 作業糸マトリクス — task threads across actual time and order

- Thesis: 一つの task が中断・再開・完了・再openを経ても同じ糸として追えることを中心にする。時間は糸上の実働節、NEXT は糸端につく順番札。
- Spatial model: task rows の matrix。左に identity/state、中央に actual-time thread、右に queue rank / row action。上部に1本だけの current focus rail。
- Primary object: task thread（stable task identity と保持された session/completion cycles）。
- Action origin: 選択した task row の右端 action rail。active と target の2行選択で switch rail が現れる。
- State/result expression: rowの糸端に pending knot、成功すると segment/end marker/queue tagを更新。failure は knot を `! no change` に変え、既存糸を維持。
- Temporal/history representation: exact session segments と gap を同一 task row に並べ、completion は糸を切断せず cycle ring `◇`、reopen 後の新 segment は ring の後ろに続く。
- Domain signature: **中断を保存する作業糸**。同じ task の複数 segment を細い identity line で関連付けるが、実働 segment の間は必ず空白＋gap markにする。identity の連続性と work duration の非連続性を同時に示す。

### Typical 1280×800

```text
 CURRENT FOCUS  ● APIレスポンス遅延の原因を切り分ける  14:38…NOW [Ⅱ][✓]
 実働時間        10:00      11:00      12:00      13:00      14:00      NOW   NEXT
───────────────────────────────────────────────────────────────────────────────
 > APIレスポンス… ├──┤············├─┤······├────────… NOW               ●
   顧客向け回答…       ├──┤                                           01 Ⅱ [切替]
   再現条件を…                                                         02 ○ [切替]
   SQLite migration…                                                  03 ○ [切替]
   完了済み調査      ├────┤ ◇完了                                     — ✓ [詳細]
   … 12/30 tasks, exact segments [続きを表示]                         04–06
───────────────────────────────────────────────────────────────────────────────
 + 新しい作業  selected row: [名称変更][前へ][末尾][完了][sessions]
 8/23 task summary [日集計] | older threads [アーカイブ]
```

`···` は実働ではなく identity continuity。凡例と `gap 3h16m` のテキストを併置し、duration の塗りに数えない。

### Dense 1280×800

```text
 ● current task#32 14:38…NOW | Matrix range 今日 | tasks 1–45 | sessions 1–100
 TASK / STATE             ACTUAL THREADS (no merge)                         RANK
───────────────────────────────────────────────────────────────────────────────
 APIレスポンス… ●   ├─┤  ··· ├──┤ · ├────…                                —
 顧客向け回答… Ⅱ       ├┤ ···············                                 01
 long mixed 日本語… ○                                                        02
 task #18 ✓         ├┤◇······├─┤◇                                          —
 … virtual rows; [sessions次頁] independently from [tasks次頁]              03–15/30
 selected thread → 3 segments / closed 40m / open 34m / 2 completions / refs
```

### No-active 1280×800

```text
 CURRENT FOCUS  ○ なし — NEXTの1番は自動開始されません
 TASK / STATE             ACTUAL THREADS                                   NEXT
───────────────────────────────────────────────────────────────────────────────
 APIレスポンス… ✓   ├────────┤◇ completed 15:10                           — [再open]
 再現条件を…   ○                                                        01 [開始]
 顧客向け回答… Ⅱ      ├──┤                                              02 [開始]
 SQLite migration… ○                                                    03 [開始]
```

### Operations, states, error, and recovery

- Create: matrix最下部の capture row。成功後、時刻 segment を持たない queued thread と末尾 rank が現れる。
- Rename: task identity cell 内で edit。session source references は title ではなく stable identity に残る。
- Start: no-active の eligible rowから実行。成功時だけ rank tag が外れ、threadの現在時刻に open knotが生じる。
- Switch: active row A とtarget row Bを選び、top railに `A → B`、rank columnにAのdestination slotとqueue revisionを固定する。成功すると同じvertical time coordinateでA終端とB始端を描き、Aのrank tagをpreview位置へ置く。placement/revision省略はrank末尾。stale/invalid placementではthreadもrankも変えずpreviewを再構成する。
- Pause: active rowの糸端から実行し、placement slots を右 rank column にpreview。成功後 open knotを閉じ、paused markとrankを付ける。
- Complete: selected rowの糸端／state cellから実行。activeはsegment close＋cycle ring、queuedはring/eventのみで空のsegmentを作らない。current railは空席になる。
- Reopen: cycle ring detailの `再openしてNEXTへ`。右rankを付けるが thread segment は増やさない。
- Reorder: rank tag を before-anchor slot / end slotへ移す。pointer drag 中も `03を01の前へ` live text を出し、Space/矢印/Enterで同じ操作を可能にする。
- History detail: segmentを選ぶと正確な start/end/end reason、ringはcompletion/reopen cycle、row labelはtask summaryを出す。day/archive summaryから該当threadへ戻れる。
- Cancellation: capture、rename、placement、switch previewはEscで元のrowへfocus restoration。pending後は取消を表示せず結果待ち。
- Pending / success / failure: pending knotは糸端にのみ置き既存segmentを延長/閉鎖しない。failure knotは `! 変更なし` と recovery。stale refresh後はsource revisionとrankを更新し、selectionをstable task idへ戻す。

### Trace to locked semantics

- segment gap と identity thread の区別は session S2–S3 と no merge invariant を直接表す。
- cycle ring は lifecycle S6 / session S5 / projection S4 の retained completion cycles を表す。
- vertical same-time switch coordinate は atomic switchを示し、failure時にはどちらの糸も変えない。
- rank tag は queued/pausedだけに付き、active/completed absent invariantを視覚的に検査できる。
- matrix rowからsource detailへ辿る構造はすべてのaggregateのdetail referenceを保持する。

### Risks and scale concerns

- 細い identity line が実働に誤読される最大リスク。gap は空白、`中断` label、duration計算対象外の凡例を常時出す。誤読が残るなら identity line自体を廃止し、同一row alignmentだけで関連付ける。
- 100 sessions × 45 task rows は横密度が高い。24h以内のrange selector、row virtualization、segment paginationを使い、表示上のmergeはしない。
- queued-only 30件では中央が空き、情報が疎に見えるが、架空のfuture barsで埋めない。rank columnを拡幅してorder操作を優先する responsive modeが必要。
- coarse pointer用にsegment自体より広いhit targetを持たせ、keyboardではrow → segment/ring/rankの順序を予測可能にする。

### Typical-pattern rationale / anti-template

- Matrix は commercial Gantt の予定バーではない。中央はactual-onlyで、右のNEXTには日時座標もduration幅もない。この分離がなければv1の意味を破る。
- top current rail は dashboard cardではなく、仮想化でactive rowが画面外でも唯一のcurrentとprimary actionsを失わないための固定文脈。
- Inspector sidebarは使わず、selected row直下のdetail bandにする。task-threadとの対応を失わないため。
- Modalはcomplete / switchに使わない。thread前後の因果とgapを覆うため。

## Structural comparison

| Dimension | A: 時間の継ぎ目 | B: 実働仕訳帳 | C: 作業糸マトリクス |
|---|---|---|---|
| Primary mental object | 切替の瞬間 / NOW | 宣言と確定記録 | stable task thread |
| Main spatial model | past / now / next の3帯 | chronological ledger + queue index | task rows × actual time + rank |
| Action origin | NOW seam / target row | declaration composer | selected row / current rail |
| Atomic switch | same-time seam | one double-entry operation row | two row ends at same x-coordinate |
| Interruption | separated segments left of NOW | separate open/close ledger entries | gap inside one task row |
| Completion cycle | history marker | retained completion/reopen rows | ring on thread |
| Next order | separate vertical band | numbered parallel index | rank tag at row end |
| Dense strength | current/recent/next at a glance | auditability and errors | per-task return patterns |
| Primary risk | NEXT looks scheduled | ledger feels technical | identity line looks like work |

## Capability traceability matrix

| Locked scenario / invariant | A evidence | B evidence | C evidence |
|---|---|---|---|
| Lifecycle S1 create queued, no dates | NEXT末尾の時刻なしrow | created ledger + queue index | segmentなしthread + rank |
| Lifecycle S2 first start | empty NOWからseamへopen | start declaration + OPEN row | rank除去 + open knot |
| Lifecycle v1.1 S3 explicit switch placement | same-time seam + A return slot + queue rev | placementを含むdouble-entry sentence | same-x endpoints + destination rank |
| Lifecycle v1.1 S4 default-end switch | `戻り先: 末尾` preview | omission sentence resolves to end | source rank appears at end |
| Lifecycle v1.1 S5 stale/invalid rollback | seam/NEXT unchanged、preview rebuild | `未記帳—変更なし` | thread/rank unchanged |
| Lifecycle v1.1 S6 complete, no auto-start | NOW空席 message | composer `作業中なし` | current rail空席 |
| Lifecycle v1.1 S7 completion without session / reopen | event-only marker、reopen後も旧marker残存 | event-only row、reopened row追記 | ring only、reopen後もold ring残存 |
| Lifecycle v1.1 S8 conflicting start | active時はexplicit switch entry | sentenceをswitchへ分離 | row actionを`切替`と明記 |
| Rename preserves history | stable row/source identity | task idとcurrent title | stable thread identity |
| One active / one open | single NOW slot | single current declaration | single current rail |
| Failed mutation no partial | seam unchanged | `未記帳—変更なし` | existing thread unchanged |
| Restart keeps open session | open segment remains `…NOW` | retained OPEN/current | open knot reprojected |
| Queue v1.1 S1 capture/reorder | append + destination slots | index末尾 + `C before A` sentence | last rank + before-anchor tag |
| Queue v1.1 S2 start/complete removes target | target leaves NEXT | target leaves index | rank removed |
| Queue v1.1 S3 pause/reopen placement | placement preview | sentence includes anchor | closed knot/ring + rank insertion |
| Queue v1.1 S4 switch return placement | seamとA return slotの一体preview | switch sentenceにA placement | switch railにA destination rank |
| Queue v1.1 S5 default end | explicit `末尾` result | compatible end sentence | last rank |
| Queue v1.1 S6 stale/invalid rollback | queue refresh、全体no-change | failed row outside ledger | rank refresh by stable id |
| Session S1 actual start | first segment | OPEN entry | first knot |
| Session S2–S3 interruption gap | separated exact segments | separate CLOSE/OPEN rows | explicit blank gap |
| Session S4 same-time switch | seam signature | double-entry signature | shared x coordinate |
| Session S5 completion/reopen | retained markers/segments | retained cycle rows | retained rings/segments |
| Session S6 restart open | supplied-NOW edge | latest OPEN effective duration | open endpoint supplied-NOW |
| Focus projection S1 | recent exact + NOW + bounded NEXT | ledger page + current + index | exact threads + current rail + ranks |
| Day projection S2 / DST | day summary drill-down with zone | dated ledger summary | day matrix range + boundary label |
| Archive S3 | lower archive path | older ledger summary | older thread pages |
| Reopened projection S4 | all segments + cycle markers | all cycle events | rings partition cycles |
| Empty projection S5 | empty HISTORY but NOW/NEXT retained | empty ledger but composer/index retained | empty center but current/ranks retained |
| Independent truncation/cursors | separate history/NEXT controls | ledger/index separate pages | session/task/rank continuations named |
| Aggregates retain detail refs | segment/day/archive links | row operation/source links | segment/ring/thread links |
| Open effective end not persisted | `…NOW` label | OPEN + query instant metadata | open knot + `effective` label |
| No planned dates/durations | NEXT has no x/time | queue is number index | rank separate from actual axis |

## Scale strategy and accessibility acceptance

### Scale

- 10,000 retained tasks / 100,000 sessions-events を UI に一括ロードしない。focus ≤24h、day 1 local day、archive ≤366 local days の bounded query と continuation を使う。
- 30 NEXT entries は12–15件程度の viewport pageを想定し、`表示 1–15 / 30` を明示。reorder anchor searchは現在取得済みの対象だけで黙って推測せず、必要な page/queryを取得してから previewする。
- 100 sessions / 45 tasks の1日は virtualized rows と独立 segment pagination。equal timestamps のsource stable orderを変えない。
- Long titleは一行省略、full textはfocus/hover非依存の詳細経路と accessible nameで提供。titleを省略してtask identityを不安定にしない。
- local midnight crossing segment はday projectionで境界分割表示し、source detailでは一つの retained session へのreferenceを保持する。

### Keyboard model

- `Tab` は global capture → current → visible next/history rows → paging controls の予測可能な順。
- Row内は arrowで subtarget、Enter/Spaceで選択、Escで未送信編集／previewを取消し。
- Start / switch / pause / complete / reopen / reorder はrow action listとcommand searchの双方から発見可能。shortcutだけにしない。
- Reorder は `移動開始` → `前に置くanchor / 末尾` → preview → `確定`。screen readerに旧位置と新相対位置を読み上げる。
- Mutation成功後: activeになったrowへfocus。active complete後は空のcurrent表示へ移し、NEXTを勝手に選択／開始しない。queued / paused complete後は除去位置の結果表示へ戻し、既存currentを変えない。reorder後は移動したstable taskへfocus。failure後はrecovery controlへ。

### Non-color and assistive semantics

- stateはshape + Japanese text + position。selected、focused、pending、failedを色だけで表さない。
- sessionは accessible description `10:05から10:26、終了理由 一時停止`。openは `14:38開始、現在も作業中、表示上の終端15:12`。
- A → B → A は3つのsessionとして読み上げ、Aの合計だけで置換しない。
- dynamic statusは polite live region、failureはassertiveにしすぎずfocusable error summaryを同じoriginに置く。
- pointer targetはcoarse trackpadでも操作できる余白。細いlineは描画でありhit targetそのものにしない。
- WCAG AA compatible contrastを後続visual phaseで検証。reduced motionでは静的 seam / bracket / endpoint と時刻文で因果を同等にする。

## Anti-template rationale across directions

この機能を generic productivity dashboard にしない基準は、`現在件数`、`完了件数`、`総時間` のカードを主対象にしないこと。ユーザーが判断する対象は、どの実働区間が現在へつながり、どの task が意図的な次順にあり、どこで中断・復帰したかである。

- A の3帯は dashboard columns ではなく、past actual / singular now / sequence-only next の単位差を固定する。
- B のledgerは activity feed の装飾ではなく、atomic operation と no-partial failure を一行単位で検証する。
- C のmatrixは予定Ganttではなく、actual session gaps と retained completion cycles をtask identity上で追う。
- Cards、常設navigation sidebar、tab分断は採用しない。current / recent / next を別tabにすると「一目で」のproduct outcomeとswitch前後の因果が失われる。
- Detailの局所展開だけを許容する。source referenceから詳細へ進む要件を満たしつつ、主面のrow / time / order alignmentを維持するためである。

## Recommendation record

**Direction A「時間の継ぎ目」の推薦を、human product ownerが選択した。**

理由は、4つの product outcome（今、次順、直近の中断を含む実働、古い集約）を1280×800の一面で最も直接に分離しつつ関連付け、locked v1.1で誤解の損失が大きい atomic switch、return placement、no auto-startを固有のseamで説明できるためである。Cはtask単位の復帰パターンに最も強いが、identity continuityをactual durationと誤読する危険が残る。Bは監査性とfailureの正確さが最も高い一方、日常の「いま何をし、次に何を選ぶか」よりevent読解を前面に出しやすい。選択後は、Bの `未記帳—変更なし` error grammar とCの completion cycle markerを取り込むが、構造はAの3帯/seamのまま固定する。

## Missing capability check

Missing locked capabilityはない。旧active taskのswitch return placement gapは、承認・実装・contract test済みのlocked lifecycle / queue v1.1で解消された。Direction Aはexplicit placement + expected queue revisionとcompatible default endの範囲内で統合できる。

一般的な履歴undo、session時刻編集、delete、自動次開始、future schedulingは要求しない。UI上の取消しは送信前previewに限定し、成功済み履歴の巻き戻しを装わない。

## Direction selection

- Selected direction: **A「時間の継ぎ目」**
- Selection owner: Human / product owner
- Why it was selected: HISTORY / singular NOW / sequence-only NEXTを一面で最も直接に区別し、atomic switchをsame-time seamとreturn-slot previewで説明できる。no auto-startとinterruption gapも通常状態の構造内で理解でき、1280×800のtypical/dense比較でproduct outcomeとscaleの均衡が最も良い
- Rejected directions: Bはevent/audit読解をprimaryにしすぎるため構造として不採用。ただしaction originに残る `未記帳—変更なし` error grammarをAのseamへ継承する。Cはidentity threadがgapを実働と誤読させる危険から構造として不採用。ただしretained completion/reopen cycleの `◇` markerをAのHISTORYへ継承する。どちらもAの3帯、primary object、action originを変更しない
- Structural decisions now fixed: HISTORY / NOW / NEXTの3帯、NOW seamをprimary object/action originとすること、task row alignment、actual-only exact segmentsと可視gap、NEXTを時刻軸のない相対順にすること、switchでA/B/return slot/expected queue revisionを一体previewすること、omissionをdefault endとして明記すること、seam内pending/error/recovery、成功後もno auto-start、局所detail band、independent pagination、非色覚state cues、dashboard cards・常設sidebar・tabs・一般modalを主構造にしないこと
- Visual decisions still open: semantic color roles、typeface、spacing/density tokens、line weightとsegment texture、focus/selection surface、icon形状、success/errorの持続時間、motion duration/easing、reduced-motion静的transition、960pxでのtitle truncation details
- Integration questions: なし
- Acceptance checks: 1280×800 typical / dense / no-activeと960×640を実描画する。A→B→Aを3 sessionとgapで表示する。explicit switch previewにA/B/before-anchor/expected queue revisionを示し、成功時はsame-instant close/open、指定位置へのA挿入、target除去、queue/source revision各1回更新を一結果として表示する。placement/revision省略時はAをqueue endへ戻す。missing/stale revision、absent/ineligible anchor、source self-anchor、target-as-anchor、persistence failureでseam・task・queue・session・event・revisionがすべてno-changeとなり、refresh後にpreviewを再構成する。complete後の空NOW、sessionなしcompletion、reopen cycle、30件queue、100 sessions、独立truncation、全commandのkeyboard path、focus restoration、reduced motion、non-color/AA contrast、source-detail round tripを確認する
