# UI density / navigation v1 — 独立 UI 探索

- 探索状態: ユーザー承認済み方針に対する推奨案を選定済み
- 対象: History-left / NOW-right の密度・ナビゲーション改善
- 選定権限: ユーザーが固定した改善要件の範囲で Codex が推奨案を選定
- 独立性: 指定された design 文書とレンダリング画像だけを入力にした。実装コード、テスト、データベース、既存仕様の実装詳細は読んでいない。

## 入力と観察

参照した入力は次のとおり。

- `design/principles.md`
- `design/capability-packs/history-left-now-right-v1.md`
- `design/explorations/history-left-now-right-v1.md`
- `output/dense-120-tasks.png`
- `output/history-30-days-top.png`
- `output/history-30-days.png`

レンダリングから得た構造上の観察:

- dense 画面では、120 件のカウント、追加欄、範囲操作、軸、NOW、説明文が同じ上部に積み上がり、行ごとに `+子 / 移動 / 削除` が常時見えている。タイトルと完了操作より補助操作の反復が目立つ。
- 30 日軸では `3週間前` のような同一意味のラベルが複数箇所に現れ、期間に対して意味的な目盛の間引きが不足している。
- 下部の完了履歴は小さいバー、グループ名、個別名、`+27件` が同じ帯に反復される。完了の存在は分かるが、どの pocket を選び、どこから NOW に戻るかが弱い。
- 上部の軸と NOW は行を読み進める際の基準になるため、スクロール後も同じ基準を残す必要がある。

## Locked boundary と改善要件

空間文法は次で固定する。

```text
PAST / TIME  ─────────────────────────────  NOW  │  CURRENT TASKS
older / selected range                 latest      title + complete
```

- 左から右へ時間が進み、固定された縦の NOW boundary の右に current task identity と mutation controls を置く。
- Remaining は committed `createdAt → display NOW`、completed は committed `createdAt → completedAt`。`completedAt` がない completed は creation point と warning だけを描き、端点を捏造しない。
- 完了 pocket は別の `完了済み` register、page、tab に移さず、元の hierarchy slot に残す。各 task は同じ surface に一度だけ現れる。
- Timeline は task lifetime の読み取り専用表現であり、planned date、progress、estimate、timer、work-session segment、dependency、NEXT ではない。時間バーから drag / resize を始めない。
- 既存の domain state、永続化、並び順、completion / reopen、delete、Undo、pointer / keyboard の drag・reparent 契約は変更しない。新しい local Undo、optimistic endpoint、UI-only archive は作らない。
- 時間軸ヘッダーはスクロール中も固定する。小さな件数付きジャンプ `現在 n` / `履歴 n` を置き、`現在 n` は history から NOW へ戻る同じ入口にする。
- タスク行ではタイトルと完了ボタンを主役にする。`+子 / 移動 / 削除` は row hover / focus / selected のときだけ露出する。完了ボタンの hover はアイコン・輪郭だけを変え、行幅、タイトル位置、行高を変えない。
- 期間ごとに一つの意味を持つ、重複しない tick と label を決定する。表示幅が足りないときは label を間引くが、別の意味の tick に置き換えない。
- 1 px 未満の lifetime は幅を最小幅へ偽装せず、時刻位置の点で表す。exact timestamp は選択時と assistive readout で authoritative にする。

## 四つのレンズ

### Information

- 常時必要なのは、範囲端、主要な意味的 tick、NOW boundary、remaining の title / 完了、completed の密度と選択状態だけ。説明文や同じ状態を繰り返すラベルは常時表示しない。
- Header の jump は `現在 120` / `履歴 600` のように件数を持つ短い control とし、選択中でも消さない。表示名は短く、`aria-label` には「現在のタスク 120 件へ移動」「完了履歴 600 件へ移動」のような完全な意味を保持する。
- Completed pocket は閉じた square cap、creation tick、必要時の dot / hatch、件数だけを first glance に置く。title、full path、exact created / completed、reopen、placement は選択した pocket に付く readout で開く。
- Tick label は表示期間の単位に合わせる。24 時間は時間、7 日は日、30 日は週、90 日は月、全期間は範囲に合わせた calendar boundary を採用し、同じラベル文字列を同一軸上に二度置かない。
- Pending は最後の committed geometry と identity を保つ。成功 commit 後だけ open cap を closed cap に変え、失敗 / stale では旧状態と recovery を残す。

### Interaction

- Header は sticky な一つの軸領域。縦スクロールは一つだけにし、left plane と right tree が別々に進んで基準を失わないようにする。
- `履歴 n` は最初の visible history pocket、または現在選択中の history item を同じ surface 内へ移動する。`現在 n` は NOW anchor と current task identity へ戻す。別 page / modal / register には遷移しない。
- History plane は composite widget 一つを tab stop にする。矢印で時間順 / pocket 内の deterministic order を移動し、Enter で local expansion、Escape で閉じる。600 件を 600 個の default tab stop にしない。
- Remaining の選択、rename、completion、child create、move / reparent は right identity から始める。Completed の reopen と completed placement は selected mark の attached detail から始める。Timeline rail 自体は移動開始点にならない。
- 完了ボタンは常時同じ幅の primary cell とし、hover は視覚状態だけを変更する。補助 action は行末の重なり領域に出し、露出・非露出でタイトルのレイアウトを再計算しない。focus / selected では pointer なしでも同じ action group を読む。
- Completion pending 中は open bar、NOW connector、right identity を保持する。Reopen pending 中は closed pocket を保持する。成功時のみ A/B/C 各案の結果表現へ遷移し、Undo と delete は既存契約の既存入口を使う。

### Layout

- 普通幅では left history と right current の split を保ち、NOW boundary を viewport 高さ方向に一本通す。960×640 では current title / complete cell に最低限の幅を優先し、軸 label は間引く。
- Sticky header は compact range control、jump counts、semantic ruler、NOW label を一段にまとめる。説明文、重複する「現在」「履歴」の補助見出し、常時の操作ヒントは置かない。
- Remaining row は left lifetime、NOW hinge、right identity が同じ logical row track を共有する。タイトルが二行になっても左の軌跡と完了 cell は同じ row bounds に留まる。
- Completed-only row は right に空の task row を作らず、元の sibling slot に left-only pocket として挿入する。Dense 時は deterministic lane packing と local expansion を使い、count は aggregate の存在だけを示す。
- Sticky header の下に行が潜る境界は high contrast でも読める system border / text で示す。Header の固定は content の temporal meaning を変えず、presentation state に限る。

### Visual

- まず grayscale で、tick、NOW line、open / closed cap、clip chevron、missing-end hatch、selected outline、focus ring を形と線幅で分ける。色は後から semantic token として加える。
- Lifetime は細い rail。progress fill に見える太い塗りを避け、subpixel は小さな点、完了 endpoint は square、NOW endpoint は open cap とする。
- Header は静かな neutral surface と一つの境界線だけで固定感を示す。カード、shadow、gradient、hero title、dashboard tile は使わない。
- Teal は NOW / selection の限定された cue、amber は actual lifecycle state、red は warning / error に限定し、形・文字・位置を併用する。高コントラスト / grayscale でも同じ判別ができる。
- Action reveal は opacity だけで意味を隠さず、focus ring と accessible name を保つ。完了 hover による layout shift や行の再折り返しを起こさない。

## 三つの構造案（monochrome first）

### Direction A: Sticky hinge + lineage pockets（推奨）

- **Thesis:** Sticky な時間軸を semantic hinge とし、remaining row は作成時点から NOW を越えて右 identity へ連続し、completed-only subtree は元の hierarchy slot に compact pocket として折り畳む。
- **Spatial model / primary object:** 一つの vertical scroll と retained pre-order。主対象は「hierarchy slot を保った task lifetime」。left pocket と right current row が同じ logical track を共有する。
- **History packing / navigation:** Pocket は最大 3 micro-lane と deterministic order。pixel collision は短い点群と `n件` の count にする。sticky header の `履歴 n` は最初 / selected pocket へ、`現在 n` は NOW identity へジャンプする。選択 readout は mark の近くに付く。
- **Action origin / result:** Right title row で complete、rename、child、move / reparent。Left mark の readout で reopen / completed placement。Completion は commit 後に同じ slot の pocket へ fold、reopen は completed ancestor path と target を right open rows へ unfold。Delete / Undo は既存の domain outcome と入口を保持する。
- **State / edge cases:** Pending は旧 row / pocket を保持し、failure / stale は geometry、order、timestamp、focus を保持。Missing end は creation tick + hatch、clip は chevron + exact readout、subpixel は点。Range 変更は presentation-only で selection と scroll anchor を保つ。
- **Scale / accessibility:** Typical 8+2 は row と pocket の関係が直読できる。7 日 8+40 は pocket count と local expansion。120+600 / depth 8 / 240 文字は virtualized logical forest、3 lane、composite history cursor。Only-completed は left pockets を展開し right に inline create だけ、only-remaining は open rows、empty は compact ruler + create。960×640 は current title / complete を優先する。
- **Visual signature:** `open NOW cap → identity` と `closed square pocket` の同じ hinge grammar。Row action の補助 controls は hover / focus / selected だけに出し、primary complete cell は固定幅で layout を動かさない。
- **Risks:** Pocket の圧縮を学ぶ必要、left-only row の垂直対応、aggregate 内 identity の discoverability。Composite keyboard cursor、count、attached exact detail を必須にする。
- **Typical-pattern rationale:** Pocket は completed register や card ではなく、retained hierarchy slot を保って 600 件を圧縮する domain representation。Attached detail は exact time / path / reopen を同じ surface で keyboard-accessible にするため必要。sidebar / modal / tab は temporal row alignment を壊すので使わない。

Monochrome sketch:

```text
sticky: 24h  7d  30d    現在 120   履歴 600                    NOWへ
PAST / TIME ───────────────────────────── NOW │ CURRENT TASKS
      │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○──────│ □ API障害フォロー      ◯
        ├━━■  ├•┤  2件  ───────────────────│ □ 原因を整理する       ◯
              ├━━━━■  1件 ────────────────│ □ 回答案を作る         ◯
```

### Direction B: Sticky ruler + historical canopy

- **Thesis:** Sticky ruler の直下に completed history の薄い canopy を置き、current rows は canopy の下で NOW と right identity に厳密に揃える。Pocket は hierarchy slot ではなく、時間密度を先に読む temporal field になる。
- **Spatial model / primary object:** 左 plane 上部の 56–96px canopy と、その下の current row deck。主対象は「期間内の完了密度」と「今の row」の二層。
- **History packing / navigation:** Canopy は completion-time order の 3 lane と collision count。`履歴 n` は canopy の selected cluster へ、`現在 n` は deck の NOW へ。選択 cluster は canopy 内で local expansion し、full path / exact time / reopen を attached readout で読む。
- **Action origin / result:** Current mutation は right row、reopen は canopy mark。Complete は row から canopy に commit 後移動、reopen は current deck に戻る。Move / reparent は right identity で既存契約を呼び、completed placement は detail の identity action から行う。Delete / Undo の意味は変えない。
- **State / edge cases:** Pending / failure は source layer を保持。Missing end は canopy の creation point + warning、clip は axis edge marker、subpixel は point。Range は canopy と deck を同時に再計算し、NOW anchor と selection を保持する。
- **Scale / accessibility:** Historical 8+40 と 600 件の density は最も読みやすい。Only-completed でも canopy が見えるが、empty / only-remaining では canopy の専用高さが空白になりやすい。960×640 では 56–96px が current title / complete の高さを奪う。Canopy は一つの composite widget、keyboard order は time order、reduced motion は即時 fold / unfold、screen reader は cluster count と selected task を一度だけ読む。
- **Visual signature:** Ruler と canopy の境界を太くせず、completion density を短い rails / dots と count で表す。Dashboard の数値カードにはしない。
- **Risks:** Completed hierarchy placement と current row の因果が detail に隠れ、only-completed で「現在が空」の理解が遅い。Pocket readability には強いが、lineage の spatial context が弱い。
- **Typical-pattern rationale:** Canopy は summary dashboard ではなく、同じ time plane 内の completed marks を固定高さに packing する機能領域。card / sidebar / tab は不要だが、専用 canopy が 640px の task surface を常に消費するため推奨しない。

Monochrome sketch:

```text
sticky: 30日   現在 120   履歴 600                         NOWへ
PAST / TIME ───────────────────────────── NOW │ CURRENT TASKS
history canopy   ├━━■  ••  8件  ├━━━━■  4件                │
───────────────────────────────────────────┼───────────────
        │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○───│ □ API障害フォロー
           │━━━━━━━━━━━━━━━━━━━━━━━━━━○───│ □ 原因を整理する
```

### Direction C: Sticky axis + temporal atlas / NOW ports

- **Thesis:** 左 plane の全 lifetime を global lane packing し、NOW boundary の ordered port から right tree identity へ短い connector を結ぶ。Hierarchy row は time lane から解放される。
- **Spatial model / primary object:** Left は history-first atlas、right は current identity map。主対象は lifetime と NOW に到達する port の関係。
- **History packing / navigation:** Completed / remaining を 3–6 lane に deterministic packing。collision は dot cluster + count。`履歴 n` は atlas cursor、`現在 n` は ports / right identity へ。Selected port だけ connector を強調し、full path / exact time / reopen は attached readout で読む。
- **Action origin / result:** Right identity で complete、rename、child、move / reparent。Left mark で history select / reopen。Completion は open port を閉じ atlas lane に残し、reopen は closed mark を port に再接続する。Delete / Undo は既存の domain contract のまま。
- **State / edge cases:** Pending / error は旧 lane map と identity を保持。Missing end は point + warning、clip は chevron、subpixel は point。Range は atlas を再packするだけで domain order / timestamp を変えない。Reduced motion は connector の補間を省き、focus transfer と status text にする。
- **Scale / accessibility:** Dense 120+600 は最も高さ効率がよいが、120 ports と depth 8 では connector crossing / bundling が増える。Only-completed は atlas だけ、only-remaining は open ports、empty は ruler + create。960×640 / 200% zoom では right title と connector の競合が強い。Screen reader の lane-to-port relationship と keyboard order を個別に説明する必要があり、default tab stop は一つでも認知負荷が高い。
- **Visual signature:** `NOW port` と selected connector が current identity への到達を明示する。Connector は行動 target ではなく read-only relation で、time bar drag は許可しない。
- **Risks:** Connector の crossing、selected 以外の identity association、screen-reader relationship、reopen 後の focus recovery が複雑。Visual novelty が time / hierarchy の読みやすさを上回る。
- **Typical-pattern rationale:** Atlas は dashboard graph ではなく lifetime navigation だが、connector map を維持するコストが row alignment の利点を上回る。card / modal / tab は使わない。

Monochrome sketch:

```text
sticky: 24h   現在 120   履歴 600                         NOWへ
PAST / TIME ───────────────────────────── NOW │ CURRENT TASKS
lane 1  ├━━━━■       ├━━━━━━━━━━━━━━○  1 ├──│ □ API障害フォロー
lane 2      ├━━■          ├━━━━━━━━○  2 ├──│ □ 原因を整理する
lane 3  •• 12              ├━━━━━━○  3 ├──│ □ 回答案を作る
```

## 短い比較

| 案 | 構造上の強み | density / navigation の強み | 主な犠牲 | 方針適合 |
|---|---|---|---|---|
| A: sticky hinge + lineage pockets | hierarchy slot、lifetime、NOW identity が一つの row に残る | jump 先と戻り先が同じ logical surface。pocket を局所展開できる | pocket の学習、left-only lane の対応付け | **最適** |
| B: historical canopy | 完了密度を固定高さで比較しやすい | 40/600 件の first glance が最も軽い | hierarchy context、only-completed、640px の current 面積 | 次点 |
| C: temporal atlas / ports | 最小高さで全 lifetime を time-first に packed | 大規模 history の global overview | connector、keyboard / screen-reader association、error recovery | 不適 |

A と B は token の差ではなく、completed history を retained slot に置くか、独立 canopy に置くかが違う。A と C も、row alignment を守るか port connector に置換するかが違うため、三つは構造的に別案である。

## Capability traceability と受け入れ観察

| locked outcome / invariant | A での observable result | acceptance evidence |
|---|---|---|
| committed temporal semantics | open は `createdAt → NOW`、completed は `createdAt → completedAt`。missing end は point + warning | 端点を先に閉じない。exact readout と grayscale で start / end / warning を区別 |
| fixed axis / NOW | sticky ruler と固定 vertical NOW boundary。単一 scroll owner | 長い dense / history scroll 後も tick、NOW、current identity の関係が変わらない |
| current / history jump | `現在 n` と `履歴 n` が常時小さく表示され、同じ surface 内を identity-based に移動 | 30 日下部から `現在 n` を押すと NOW row に戻り、`履歴 n` は selected / first pocket を表示 |
| title / complete priority | title と固定幅 complete cell は常時同じ位置。`+子 / 移動 / 削除` は hover / focus / selected のみ | 120 行で補助 action が消え、complete hover でタイトル幅・行高・wrap が変わらない |
| completion / reopen | commit 成功時だけ row ↔ pocket を fold / unfold。reopen は right identity に focus、timer は開始しない | pending / persistence failure / stale で last committed geometry と focus recovery を保持 |
| hierarchy / order | move / reparent は right identity から既存契約を呼び、x/time は不変。completed placement は attached detail から | sibling order、parent、depth、timestamp、task id を前後で照合。illegal target は no-op + reason |
| delete / Undo | delete、Undo、completion inverse は既存の domain outcome と既存入口のまま | 新しい UI-only undo、archive、second projection がない。各 id が一度だけ現れる |
| range / ticks | range は presentation-only。期間別 semantic unit、重複なし label、clip chevron | 24h / 7d / 30d / 90d / all の tick label が重ならず、同じ label を同軸に繰り返さない |
| subpixel / pocket | 1 px 未満は点。pocket は max 3 lane + count、selected で title / path / exact time | 見かけの最小幅を duration と誤読しない。600 件すべてを同じ surface から keyboard reach |
| accessibility / recovery | history は composite cursor、aria-label は完全な意味、shape / text が color を補完 | keyboard-only、screen reader、high contrast、grayscale、200% zoom、reduced motion で同じ状態を説明 |

## Scale / state matrix

| 状態 / viewport | A の表示と操作 |
|---|---|
| typical 8 remaining + 2 completed | 全 row と pocket の lineage を一目で見せる。不要な補助 action は隠す |
| historical 8 + 40 completed | `履歴 40` で pocket へ jump、count を選択して local expansion、`現在 8` で NOW へ戻る |
| dense 120 + 600, depth 8 | virtualized logical forest、deterministic 3 lane、collision count、composite keyboard cursor。個別 DOM / tab stop を件数に比例させない |
| only completed | left pocket の高さを使い、right は短い empty cue と inline create のみ。completed register は出さない |
| only remaining | open lifetime が left に残り、empty history placeholder は置かない |
| empty | compact ruler、NOW boundary、inline create を残す。説明カードは作らない |
| 960×640 | current title と complete cell に優先幅。tick label を必要最小限にし、split は両側 400px 未満にしない |
| keyboard / screen reader | sticky header の controls、current rows、history composite の順。active descendant が title / path / exact times / action を一度だけ読む |
| high contrast / grayscale | open cap、square cap、point、chevron、hatch、text、system border で判別。色は補助 |
| reduced motion | range / fold / unfold を即時更新し、focus transfer、status text、保持された slot で結果を示す |

## Anti-template rationale

- Sticky axis は一般的な dashboard header ではなく、時間を読む判断基準を scroll 中も固定するための temporal affordance。固定するのは axis と短い navigation であり、巨大な product title や hero ではない。
- `現在 n` / `履歴 n` は KPI tile ではなく、同じ surface 内の identity-based jump。件数は到達先の規模を示すが、duration や work amount を集計しない。
- Lineage pocket は completed register / sidebar / tab の代替ではない。completed-only subtree が remaining descendant を持たない invariant を使い、元の hierarchy slot と temporal history を同時に保つ compression である。
- Attached readout は hover tooltip だけでは exact timestamp、full path、reopen、keyboard recovery を保証できないため必要。ただし modal / inspector sidebar にして current surface を奪わない。
- 視覚上の独自性は色、gradient、shadow、角丸ではなく、`open NOW cap → right identity`、`closed square pocket`、subpixel point、semantic tick の組合せから生まれる。

## Direction selection

- **Selected direction:** A — Sticky hinge + lineage pockets
- **Selection owner:** Codex（ユーザーが left-history/right-NOW family と改善要件を承認済み）
- **Why it was selected:** ユーザーが承認した history-left / NOW-right の意味を最小の認知変換で保ち、sticky axis、件数付き jump、NOW への復帰、pocket の局所展開を一つの logical surface に置ける。タイトルと完了を主役にした current row も、既存の hierarchy / drag / persistence semantics も維持できる。B より hierarchy context と only-completed の扱いが強く、C より connector と assistive relationship が単純である。
- **Rejected directions:** B は completed density の比較に優れるが、専用 canopy が 960×640 の current area を消費し、retained hierarchy slot と reopen の因果が弱くなる。C は最も compact だが、ports / connectors が 120 件と depth 8 で crossing し、keyboard、screen reader、stale recovery の説明を複雑にする。
- **Structural decisions now fixed:** sticky time-axis header、one vertical scroll owner、fixed NOW boundary、`現在 n` / `履歴 n` identity-based jump、retained lineage pockets、max 3 micro-lanes + collision count、local expansion、title + fixed complete cell、secondary actions only on hover / focus / selected、read-only lifetime rail、semantic non-overlapping ticks、subpixel point、attached exact detail / reopen、no new register / domain mutation。
- **Visual decisions still open:** exact split curve、header height、tick label spacing、pocket row height、dot / cap glyph dimensions、focus ring、Japanese type scale、semantic token assignment、reduced-motion duration（即時遷移の状態表現は固定）。
- **Integration stop conditions:** persisted field、aggregate duration / progress、archive / delete semantics、new Undo / reopen outcome、planned scheduling、session accounting、time-bar drag が必要になったら、UI workaround を足さず Capability Change Request を出す。
- **Acceptance checks:** 24h / 7d / 30d / 90d / all の tick 重複なし、sticky header、history → NOW jump、120+600 dense navigation、subpixel point、missing-end / clip、pocket selection / reopen、title / complete priority、hover layout stability、completion / delete / Undo / reorder / reparent / stale / persistence failure、keyboard / screen reader / high contrast / grayscale / 200% zoom / reduced motion を、指定レンダリング相当のデータで観察する。
