# UI density / navigation v2 — 実装引き渡し用の独立デザイン仕様

- 状態: ユーザー選択済み方向を固定。実装コード・テスト・DB は未読・未編集。
- ロック入力: `design/capability-packs/history-left-now-right-v1.md`、`design/capability-packs/reversible-task-operations-v1.md`
- 画面証拠: `page-2026-08-23T15-45-48-891Z.png`（760px typical）、`page-2026-08-23T15-44-19-203Z.png`（1280px typical）、`page-2026-08-23T15-45-19-433Z.png`（削除確認）、`page-2026-08-23T15-46-35-951Z.png`（dense history）
- 変更範囲: presentation composition、focus / disclosure、既存操作の配置だけ。新しい機能、ドメイン状態、永続化、履歴、削除、Undo、時間軸 semantics、表示文言は追加しない。

## Evidence と設計課題

- 760px typical は、範囲操作が一段目、再読込が孤立した二段目、`タスクを追加` が三段目に分かれる。最初に使う入力が最後に来るため、上部の主従が逆転している。
- 1280px typical は左右の余白で操作を一行に収められるが、範囲・NOW・選択・再読込が同じ密度で並び、追加が主操作として視認されにくい。
- 削除確認は影響する子孫を正しく列挙し、`削除する` / `キャンセル` と赤系の警告を保っている。一方、確認パネルが document flow に入り、元の作業位置と下の行を大きく押し下げる。
- dense history は `現在 120` / `履歴 600` の規模が読める。完了グループ、個別名、`+27件` が反復し、完了 pocket の意味よりラベルの反復が先に目に入る。
- 既存画面は left timeline / NOW / right current、remaining-first、completed pocket、既存の `着手中` / `保留`、既存の Undo status をすでに表現している。これらを別の面や大きなカードに移さない。

## Locked boundary

- 左から右へ `createdAt → NOW` / `createdAt → completedAt` を表す。missing `completedAt` は creation point と既存 warning だけで、端点を補わない。
- NOW は固定された縦の semantic hinge。current identity と mutation controls は右、completed は左の retained lineage pocket。NEXT、planned date、progress、timer、session segment、draggable / resizable time bar は出さない。
- Remaining / completed は各 task 一度だけ。completion は成功 commit 後だけ pocket に折り畳み、reopen は成功後に NOW 側へ戻す。pending / stale / persistence failure は最後の committed geometry と order を保つ。
- Delete は subtree を atomic に消し、tombstone / trash / history register を作らない。Undo は既存の persisted strict LIFO / token 契約をそのまま使う。視界の range、selection、scroll、draft は Undo 対象にしない。
- 既存の sibling order、reorder / reparent、complete / reopen、delete / Undo、completion blocked recovery、keyboard placement を presentation 側で再定義しない。
- visible copy は既存画面のものだけを再配置する。`タスクを追加`、範囲値、`‹` / `›`、`NOW`、`選択`、既存の再読込 icon、`現在 n`、`履歴 n`、`着手中`、`保留`、削除確認の既存 title / list / `削除する` / `キャンセル` を維持し、説明文や重複見出しを増やさない。既存 `aria-label` は保持する。

## 四つのレンズ

### 情報

- 操作の優先順位は `タスクを追加` → range cluster → 再読込。追加欄と plus は primary、期間の前後移動・NOW・選択・再読込は同じ secondary cluster にまとめる。Undo status は既存 status band のまま、追加の文言を置かない。
- 軸の sticky strip には既存の期間 tick、開始 / 現在時刻、NOW、`現在 n` / `履歴 n` だけを残す。`現在 n` は history から NOW へ戻る常時利用可能な jump、`履歴 n` は selected / first visible pocket へ戻る jump とする。
- Active / paused は current row の title 近傍に既存の点と既存 state label（`着手中` / `保留`）を inline で置く。カード、見出し、タイマー値、別の状態説明は追加しない。
- Remaining row の left bar、NOW gutter、right title / complete cell は同一 task の一つの readout として扱う。hover / selected 時だけ同じ row surface を弱く結び、時間幅や端点を変更しない。
- Delete confirmation は task title と descendants の既存 impact list、既存 confirm / cancel、既存 Undo status を一続きに保つ。削除成功後の task は普通の history に見せず、既存 Undo でのみ復元可能にする。

### 操作

- ツールバーは primary row と secondary row の最大二段。760px では primary row に add input / plus、secondary row に range cluster と再読込を置く。再読込を単独の段や孤立した端にしない。1280px では二つの row を一行に畳めるが、DOM / keyboard order は add → range cluster → 再読込を保つ。
- Time-axis sticky は縦スクロール時に残る。軸の `現在 n` / `履歴 n` は document の位置に依存しない。Jump は同じ surface 内の identity / pocket anchor に移動し、別 page / modal / completed register を開かない。
- Current row は title と complete を常時操作可能にする。`+子` / move / delete は row hover、keyboard focus、selected のときだけ視覚的に露出し、row の tab order では focus された row の action group として読む。露出前後で title の幅、complete cell の位置、row height を変えない。
- 左 bar に hover したときも右 title が同じ row highlight を得る。右 title / complete に hover したときも left bar が同じ highlight を得る。selected は hover が離れても維持し、別 task を選ぶまで消さない。
- Delete は selected row の right task cell を起点にする。確認面は row-bound overlay として既存 panel を表示し、left timeline の bar と NOW hinge を隠さない。document flow に新しい行を挿入しない。
- Delete overlay は既存の impact list を全件到達可能にする bounded internal scroll を持つ。100 descendants でも work surface の rows を押し流さない。viewport 下端に近い場合は origin row が見える範囲で上側に反転できるが、別の確認経路は作らない。
- Delete pending は last committed row / pocket と overlay origin を保つ。cancel は何も commit せず delete control に戻る。success は row / descendants を普通の history に残さず消し、既存 Undo status を同じ結果として更新する。stale / persistence failure は committed presentation と既存 recovery を保つ。
- Delete success で origin が消えた場合だけ、既存 Undo action または生き残った安定 row へ focus を移す。viewport を新しい history や先頭へ自動スクロールしない。cancel / failure では origin focus を保つ。
- Undo は既存の latest token のみを action にし、操作ごとに label / token と rendered state を一緒に更新する。選択した過去 operation の復元、redo、soft delete は追加しない。

### レイアウト

- 1280px: add input / plus を左の primary zone、range cluster + 再読込を右の secondary zone に置く。上部の status band は既存の undo / operation status 用で、操作を第三段へ増やさない。
- 760px: 上部操作を二つの固定 row にする。
  1. `タスクを追加` input が伸縮し、plus は同じ primary row の末尾。
  2. range value、`‹`、`›`、`NOW`、`選択`、再読込 icon が一つの secondary cluster。
  期間 cluster の内部 gap を詰めても折り返さず、再読込だけを次段へ送らない。axis ruler はこの toolbar の下にあり、縦スクロール中は sticky になる。
- Header / ruler の sticky layer は current rows の上に重なる。下の row は軸の背後へ潜るが、NOW boundary と既存 range bounds は sticky layer 上で連続する。sticky layer の高さを増やす説明文や巨大タイトルは置かない。
- NOW boundary は left time plane と right current の境界を貫く。row highlight は boundary を横切る薄い selected underlay として描き、bar の x 座標、NOW の x 座標、right title の y 座標を変えない。
- Current row の right cell は title、inline state、complete cell を主列にし、secondary actions は同じ row の reserved overlay zone に重ねる。hover / focus / selected の表示差は paint と hit target だけで、layout measurement を変えない。
- Delete overlay は selected row を anchor にした row-local layer。left bar と axis の geometry はそのまま、right current 側に既存確認内容を置く。panel の長さは viewport に合わせ、影響 list だけが内部 scroll する。
- Pocket は retained hierarchy slot の left plane に留め、right に空の confirmation / action row を作らない。Dense では個別 history marks を composite cursor から到達させる。

### 視覚

- Monochrome first: primary / secondary の境界は余白と線、row continuation は同じ薄い underlay、active / paused は既存 dot shape + label、delete は既存 error fill / border で区別する。色だけに依存しない。
- Complete cell は常時同じ円形 hit area と位置。hover は既存 teal / outline token の強調だけで、row の padding、title の ellipsis、左 bar の長さを変えない。
- Active は既存 amber cue と filled dot、paused は既存 quiet cue と別 shape / label。大きな card、section heading、背景の塗り分けで status を見せない。`着手中` / `保留` の意味は text と shape でも判別する。
- Hover / selected の row connection は left bar → NOW gutter → right title を同じ line weight / tint で連続させる。Completed pocket は selected mark と attached detail だけを強め、右に偽の task identity を描かない。
- Delete overlay は既存の赤系 warning 面を保つが、shadow、modal backdrop、画面全体の dim、巨大な見出しは追加しない。確認 / cancel の既存 focus ring と border contrast を保つ。
- 既存 motion token の時間・easing を流用する。reduced-motion では toolbar reorder、row continuation、delete overlay、fold / unfold を補間せず、状態の最終形、focus transfer、既存 status announce だけを示す。

## 構造候補の確認（選択済み方向を固定）

### Direction A: Two-tier command rail + sticky ruler + row-bound confirmation（選択）

- **Thesis / spatial model:** add を primary row、期間と再読込を一つの secondary row、axis を sticky ruler とし、task row の right cell に delete confirmation を anchor する。left timeline / NOW / right current の一つの logical row を保つ。
- **Primary object / action origin:** primary object は current task row。add / complete / delete / move は right identity、reopen / completed placement は left pocket の既存 detail。range / reload は secondary cluster。
- **State/result expression:** hover / selected は row-wide continuity。active / paused は inline dot + 既存 label。delete pending は overlay 内で committed row を保持、success は row を消し existing Undo、cancel / failure は origin に復帰。
- **Temporal/history representation:** sticky ruler は既存の time semantics、pocket は left retained slot。scroll / jump は presentation-only。
- **Domain signature:** NOW boundary を横切る row-continuation underlay と、row を押し流さず影響 list を保つ delete overlay。
- **Capability traceability:** add priority、existing range / reload、complete / blocked、delete subtree、strict LIFO Undo、drag / reparent、exact lifetime を同じ surface で保つ。
- **Risks / scale:** 760px で二段の toolbar と sticky ruler の合計高さ、100 descendants の overlay list、600 history cursor。内部 scroll、固定 hit area、composite focus で抑える。
- **Typical-pattern rationale:** overlay は modal / card の追加ではなく、impact disclosure を必要とする既存 delete confirmation を row origin に留めるための layer。range cluster は generic dashboard filter ではなく既存 presentation controls の同一操作群。

### Direction B: Single compressed command row + in-flow confirmation

- **Thesis / spatial model:** すべての top controls を一行へ圧縮し、delete panel を従来どおり row flow に挿入する。
- **Primary object / action origin:** task row と primary add は同列。period / reload は icon density に寄せ、delete は current row。
- **State/result expression:** active / paused と row continuation は A と同じだが、delete pending は下の rows を押し下げ、cancel / success 後に scroll position が揺れる。
- **Temporal/history representation:** left pocket / NOW / right current は保持し、sticky ruler は単独にする。
- **Domain signature:** one-line command density。ただし 760px では `タスクを追加` と period controls が競合する。
- **Capability traceability:** domain outcome は保てるが、add priority と作業位置保持の acceptance を満たしにくい。
- **Risks / scale:** 760px で truncation、hit target 縮小、再読込の孤立、delete impact list による大きな vertical shift。採用しない。
- **Typical-pattern rationale:** 一行 toolbar は通常の compact toolbar だが、760px の add priority と視認性を犠牲にするため機能的理由が不足する。

### Direction C: Sticky current action rail + viewport delete sheet

- **Thesis / spatial model:** right current 側に sticky action rail を残し、delete confirmation を viewport 下部 sheet として表示する。left timeline は scroll する。
- **Primary object / action origin:** current identity と action rail が主対象。delete は rail、range / reload は top band、history は left plane。
- **State/result expression:** active / paused は row inline、hover / selected は rail と left bar を結ぶ。delete の impact / confirm / cancel は sheet 内、success は existing Undo。
- **Temporal/history representation:** left history / NOW は保持するが、row-local continuity が rail で分断される。sheet が origin row を覆う可能性がある。
- **Domain signature:** action rail と NOW hinge の境界。ただし 760px で current width と timeline width を同時に圧迫する。
- **Capability traceability:** delete scope / Undo は保てるが、row-local focus、drag origin、left bar ↔ right title の連続性が弱くなる。
- **Risks / scale:** 960×640 / dense で sticky rail が current title を圧迫、sheet が work position を隠し、keyboard の spatial orientation が複雑。採用しない。
- **Typical-pattern rationale:** sheet は destructive impact を視界に置く一般的 pattern だが、既存の task row の意味を viewport layer に移し、current / history の優先関係を変えるため不要。

## 選択方向の固定仕様

### Toolbar / sticky axis

1. 1280px では add zone と secondary cluster を一行に置く。760px では primary add row と secondary cluster row の二段まで。再読込は secondary cluster の最後に常駐し、単独行を作らない。
2. Primary add row は既存 `タスクを追加` と plus の hit target を維持し、narrow では入力が残り幅を使う。range controls が先に押し出す構造にしない。
3. Secondary cluster は既存の range value、前後、NOW、選択、再読込 icon を同じ grouping として扱う。visible copy は増やさず、既存 `aria-label` を保つ。
4. Time-axis ruler（tick、bound、NOW、`現在 n` / `履歴 n`）は sticky。縦 scroll は一つ。Jump は current identity / history pocket anchor に対する presentation-only scroll と selection で、domain mutation を呼ばない。
5. Sticky layer の z-order、背景、境界線は tick と NOW を読み取れる最小限にする。既存 status band を別の説明段へ複製しない。

### Row continuity / action disclosure

1. Remaining logical row の left lifetime bar、NOW gutter、right title / state / complete を同じ row identity で結ぶ。hover は pointer origin に関係なく全域へ、selected は pointer が離れても全域へ適用する。
2. Title と complete cell は常時 visible / focusable。complete cell の box、row padding、title x、left bar y / height は rest / hover / selected で不変。
3. `+子` / move / delete は row hover / keyboard focus / selected のときだけ paint。secondary action の visibility は row width を測り直さず、focus 可能な row で既存 accessible name を読める。
4. Active / paused は既存 dot + `着手中` / `保留` を title の baseline 近くに置く。active は既存 amber cue、paused は既存 quiet cue。shape と text が残るため high contrast / grayscale でも判別できる。
5. Left completed pocket は right current identity として複製しない。selected pocket の existing detail から title / path / exact time / reopen を読む。

### Delete confirmation / Undo

1. Delete trigger は right current row の existing delete action。selected row を anchor にする non-flow confirmation layer とし、left bar、NOW、origin row の y position を保持する。
2. Layer は既存の赤系 impact content、子孫 scope、`削除する`、`キャンセル`、既存 focus treatment をそのまま表示する。visible copy の追加・言い換え・別確認段はしない。
3. 子孫リストが viewport に収まらない場合だけ layer 内を scroll する。list は省略して意味を落とさず、screen reader から全件を到達可能にする。layer は origin row を含む safe viewport 内に置く。
4. Cancel / Escape / failed delete は no-op とし、row geometry、selection、scroll、focus origin を保つ。Pending は panel と last committed row を保つ。
5. Success は atomic delete の結果だけを反映し、row / descendants を ordinary timeline / pocket に残さない。既存 Undo status の label / token / affected result が一つの update として出る。新しい toast、trash、restore view は作らない。
6. Success で origin が消える場合のみ既存 Undo action または stable surviving row へ focus。focus recovery に伴う viewport jump は行わない。Undo は existing token の strict LIFO、restart 後も existing behavior を保つ。

## 状態別受け入れ条件

| 状態 | 観察可能な条件 |
|---|---|
| 1280px wide | add と secondary cluster が一行で読める。axis / NOW / counts は同じ row grammar。右 task title と complete が primary、secondary action は rest で隠れる。 |
| 760px narrow | 操作は二段以内。第一段が add input / plus、第二段が range + NOW + 選択 + 再読込の同一 cluster。再読込の三段目・単独行・孤立 label がない。sticky ruler の下で current / history が同じ split を保つ。 |
| hover | left bar / NOW gutter / right title が同じ task continuation として同時に highlight。secondary actions が出る。complete hover で title x、row height、bar width、scroll position が変わらない。 |
| selected / keyboard focus | hover が離れても continuation が残る。title、complete、既存 secondary action names を keyboard / screen reader で読める。history pocket の composite cursor は一つの tab stop。 |
| active | 大きな card / heading なし。既存 amber cue、filled dot、`着手中` が title の近くで静かに見える。lifetime bar は work duration / progress に変わらない。 |
| paused | active と同じ row footprint。既存 quiet cue、別 shape、`保留` で判別。pause による新しい time segment、timer、追加文言を出さない。 |
| delete idle | existing delete trigger が hover / focus / selected row にだけ出る。rest row は title / complete を優先する。 |
| delete confirmation | impact content と descendants、既存 `削除する` / `キャンセル`、error contrast が origin row に anchored。下の rows、left bar、NOW、scroll position を大きく押し流さない。 |
| delete pending | confirmation layer と last committed row / pocket が残る。optimistic removal、fabricated history、focus の予期せぬ移動がない。 |
| delete cancel / Escape | domain call が commit されず、layer が閉じ、origin row / selection / focus / scroll が戻る。 |
| delete success | subtree が atomic に消え ordinary history / pocket に残らない。既存 Undo status が最新 token と affected result を反映し、focus recovery が一度だけ行われる。 |
| delete stale / persistence failure | committed hierarchy、timestamps、order、row geometry が保たれ、existing recovery を使える。新しい local retry / restore semantics は作らない。 |
| undo available / success | existing latest operation label / token と rendered task state が同時に更新。Undo は strict LIFO、再起動後も既存契約、view range / scroll / draft は復元しない。 |

## Capability traceability

| locked contract | UI adapter が保証すること | 確認 |
|---|---|---|
| history-left / NOW-right | timeline / NOW / current の順序、remaining row の lifetime、completed pocket の一回表現 | 760 / 1280 / dense で x / y の意味を照合 |
| temporal semantics | completion / reopen / range / clip / missing end は既存 timestamp と shape のまま | hover、scroll、delete confirmation で端点が変わらない |
| current lifecycle | active / paused は existing state label + shape。focus start / pause / switch は geometry を変えない | `着手中` / `保留` が inline、カード・timer・segment がない |
| hierarchy order / drag | row continuation と action disclosure は y / x を装飾するだけ。move / reparent の seam / basin は既存 | drag / keyboard placement の前後で parent、sibling、depth、timestamps を照合 |
| delete | current row から existing subtree delete。overlay は presentation only | 1 / 8 / 100 descendants の scope、atomic disappearance、no tombstone |
| Undo | existing token / label / LIFO / persistence を表示するだけ | next operation で status と rendered state が atomic update |
| accessibility | aria-label、focus、composite history、impact list の全件到達を維持 | keyboard-only、screen reader、high contrast、grayscale |

## Accessibility / scale risks

- **760px operation collision:** add input を最初の row に固定し、secondary controls を一つの flex / grid cluster にする。cluster の gap を減らしても hit target を潰さない。再読込の standalone row を作らない。
- **Sticky ruler occlusion:** sticky layer の下端に既存の明確な border を置き、focused row が隠れたときだけ minimal scroll。focus を先頭へ飛ばさない。
- **Dense 120 / 600:** history marks は virtual / composite navigation、count と local selection。current rows の secondary actions を全件常時描画しない。`現在 120` / `履歴 600` は jump target を identity-based に保つ。
- **Long Japanese title / depth 8:** title は既存の single-line truncation / accessible full name を保ち、hover / complete で再折返ししない。indent compression と full path は既存 detail に委ねる。
- **Delete with 100 descendants:** confirmation layer の internal scroll で impact list を読み切る。document height、timeline alignment、current row order を増やさない。screen reader は表示省略に依存せず全 descendant を読む。
- **Keyboard:** add → secondary cluster → sticky axis counts → current row の順で predictable。secondary action は hover でなく focus / selected でも出る。delete overlay 内は existing confirm / cancel の focus order、Escape cancel、成功後の existing Undo / stable neighbor recovery。
- **Screen reader:** row の title / state / complete を一つの task identity として読む。left bar と right name の visual continuation を aria relationship の新規追加で置き換えない。既存 names を保持し、pocket aggregate は composite cursor で一件ずつ到達する。
- **High contrast / grayscale:** active / paused、open / closed / clip / warning、selected / hover、delete warning を dot shape、cap shape、hatch、text、system border で分ける。teal / amber / red は補助。
- **Reduced motion:** 既存 motion token の reduced variant を使い、row highlight、sticky changes、delete layer、fold / unfold を即時に確定。focus transfer と既存 status announce は残す。
- **Failure / stale recovery:** overlay を optimistic に閉じたり pocket を折り畳んだりせず、last committed row / timestamps / order を表示する。recovery が focus や scroll を作業位置から押し出さない。

## Anti-template rationale

- 二段 toolbar は compact SaaS dashboard の分類ではなく、760px でも add を最初に保ち、既存 range / NOW / selection / reload を同じ presentation-control cluster として到達可能にするための構造である。
- Sticky ruler は時間を読む基準を scroll 後も保つ domain surface。固定するのは軸・NOW・件数 jump だけで、hero title や説明カードを増やさない。
- Row-continuation underlay は decorative highlight ではなく、left lifetime と right current identity が同じ task であることを pointer / keyboard で追跡する domain signature。時間軸を編集可能にはしない。
- Row-bound delete overlay は modal / trash / history view の追加ではない。既存の subtree impact disclosure、確認、キャンセル、Undo を origin の近くに保ち、document flow の押し流しだけを避ける presentation layer である。

## Direction selection

- **Selected direction:** A — Two-tier command rail + sticky ruler + row-bound confirmation
- **Selection owner:** Product owner が操作優先順位、quiet lifecycle、row continuation、non-disruptive delete を明示的に選択済み。
- **Why it was selected:** 760px の add-first と isolated reload の解消、1280px の既存一行、sticky time-axis、left/right row continuity、静かな active / paused、影響内容を保った delete confirmation、既存 Undo を同時に満たす。domain mutation や visible copy の追加なしに、現状証拠の問題だけを解消する。
- **Rejected directions:** B は一行圧縮により 760px で add と range が競合し、delete の in-flow panel が作業位置を押し流す。C は action rail / viewport sheet が current width と row identity を奪い、left bar ↔ right name の連続性を弱める。
- **Structural decisions now fixed:** add-first primary row、range + NOW + selection + reload secondary cluster、760px でも最大二段、sticky axis / one scroll owner、identity-based current/history jump、right title + fixed complete cell、hover/focus/selected-only secondary actions、row-wide left↔NOW↔right highlight、inline active / paused cues、row-bound non-flow delete confirmation、bounded impact-list scroll、existing Undo / LIFO / no tombstone。
- **Visual decisions still open:** exact toolbar row height / gap、sticky boundary line、row continuation tint、dot / shape stroke、overlay max block size、focus ring offset、既存 motion token の適用箇所。新しい文言、token、domain state は開かない。
- **Integration questions:** 既存 adapter が row identity を left bar と right title に共有できるか、既存 delete confirmation content / Undo status を non-flow layer に配置できるか、既存 focus / aria names が overlay 内で保てるかだけ確認する。できない場合は UI workaround ではなく Capability Change Request とする。
- **Acceptance checks:** 760px で二段以内・add first・再読込同群、1280px で一行、axis sticky、history ↔ NOW jump、hover / selected row continuity、complete hover の no layout shift、inline active / paused、delete impact / confirm / cancel / pending / success / stale、ordinary history に deleted task が出ない、existing Undo LIFO / persistence、keyboard / screen reader / high contrast / grayscale / 200% / reduced motion、120+600 / 100 descendants を観察する。
