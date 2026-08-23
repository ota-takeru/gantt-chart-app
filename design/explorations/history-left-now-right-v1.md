# History-left / NOW-right v1 — 独立 UI 探索

- 探索状態: 推奨案を選定済み、integration planning へ引き渡し可能
- capability 状態: 既存 capability は implemented / locked、変更は presentation composition のみ
- product surface: 日本語優先の Windows desktop app
- selection authority: Product owner は左 history / 右 current という family を固定し、variant 選定を Codex に委任
- selection owner: Codex（明示委任）
- independence boundary: Capability Pack と、そこから明示された locked specifications / established product context だけを使用した。Product code、現在の実装、既存 screenshot、過去の実装推論は使用していない。

## 入力注記

Root Capability Pack が直接参照する `specs/capabilities/focus-lifecycle.md` は存在しなかった。同 Pack が authoritative input として含める `hierarchy-task-lifetime-timeline-v1` Pack は、実在する locked source `specs/capabilities/focus-work-lifecycle-v1.1.md` と `design/principles.md` を明示しているため、本探索ではその明示された source を使用した。Capability の意味を補完・推測してはいない。

## Locked boundary

画面の空間文法は次で固定する。

```text
PAST / TIME  ─────────────────────────────  NOW  │  CURRENT TASKS
oldest / selected range              latest       identity + actions
```

- 時刻は左から右へ進み、固定された縦の **NOW boundary** に到達する。
- remaining task の current identity、階層、mutation control は boundary の右に置く。
- completed task は別の `完了済み` register、page、tab に移さない。左 time plane の中に直接残す。
- NEXT、oversized product title、planned dates、estimate、dependency、progress、timer、work-session segment は出さない。
- Time bar は読み取り専用で、drag / resize できない。
- task は一度だけ表現される。Remaining task は「左の lifetime + boundary connector + 右の identity」で一つの論理 row、completed task は左 plane 内の一つの historical identity である。

## Exact temporal grammar

| Current state | Interval start | Interval end | 表す意味 |
|---|---|---|---|
| `queued` / `active` / `paused` | committed `createdAt` | current display NOW | 作成されてから現在まで task が存在している |
| `completed` with `completedAt` | committed `createdAt` | committed `completedAt` | 作成から最新の retained completion まで task が存在した |
| `completed` without `completedAt` | known `createdAt` point only | endpoint を描かない | retained data が不完全である |

- Bar length は task lifetime であり、active work duration、session time、progress、effort、estimate、planned occupancy ではない。
- `actualStartAt` と work sessions は bar geometry に使わない。
- Completion pending 中は endpoint を先に閉じない。成功 commit 後だけ NOW endpoint を `completedAt` で seal する。
- Reopen 成功後は current interval を `createdAt → NOW` に戻す。過去の completion event を session segment や二本目の bar として描かない。
- Rename、sibling reorder、reparent、focus start / pause / switch は temporal coordinate を変えない。
- Mutation failure / stale conflict では、最後に commit 済みの hierarchy と timestamp をそのまま保つ。

### Shape language

- creation: 細い縦 tick と accessible label `作成`。
- remaining end: NOW boundary に接続する開いた cap `○`。Readout は `NOW` と exact timestamp を出す。
- completed end: 閉じた square cap `■` と label `完了`。
- range clip: true endpoint と異なる chevron `◁` / `▷`。
- missing end: creation tick と barred warning stub `////`、text `完了時刻なし`。NOW まで延ばさない。
- sub-pixel lifetime: true instant を中心に最小 marker を描くが、semantic width は exact timestamps が authoritative。見かけの最小幅を duration と解釈させない。

## Range model

### Default and presets

- Default: **直近 24時間**、右端は NOW。
- Options: `24時間`, `7日`, `30日`, `90日`, `全期間`。
- Range option は presentation state だけで、task / revision / event を変更しない。
- NOW anchored 状態で preset を変えると、NOW を右端に保ったまま左端だけが広がる。
- Major ticks: 24h は 3時間、7日は 1日、30日は 1週、90日は 1か月を基本とし、幅不足時は label を間引く。Tick の間引きは interval を変えない。

### Historical inspection without losing NOW

- `前の期間` / `次の期間` は current duration の 80% ずつ移動する。`次の期間` は NOW を越えない。
- Historical window の end が NOW より前の場合、plot の右端と NOW boundary の間に固定幅の discontinuity gutter `… NOW` を置く。ここは時間比例しない省略区間である。
- Remaining interval は historical plot の右端で `▷ 継続` となり、細い破線 bridge で NOW boundary と右 identity へ接続する。省略区間を実時間幅として描かない。
- `現在へ` は選択中 duration の `[NOW − duration, NOW]` に戻す。
- `選択を表示` は selected completed task の interval を plot に収める。NOW boundary は固定し、interval end から NOW までを discontinuity gutter で明示する。Remaining task では `createdAt → NOW` を収める最小 preset または `全期間` を選ぶ。
- Exact bound text を常時表示する。例: `8/22 14:30 — 8/23 14:30`。

### Clipping / out-of-range

| Condition | Representation | Recovery |
|---|---|---|
| start が range より前、end は range 内 | 左 edge から `◁` で続く bar | exact `createdAt` readout、`選択を表示` |
| start は range 内、end が range より後 | 右 edge で `▷`、true end cap は描かない | exact end readout、range forward / fit |
| interval が range 全体をまたぐ | 両 edge に `◁` / `▷` | exact start/end readout |
| interval 全体が range より前 | 左 edge の locator `◁ 範囲外`、false bar は描かない | locator activation / fit / broader preset |
| interval 全体が range より後 | 右 edge の locator `範囲外 ▷` | locator activation / forward / fit |
| completed end が missing | known creation point と warning のみ | exact creation と `完了時刻なし` を読む。UI repair はしない |

Clip は shape、direction text、accessible name の三つで伝え、color だけに依存しない。

## Lens 1 — Information

### 同時に見えるべき情報

- 左: shared time scale、range bounds、completed intervals、remaining lifetime、clip / warning、selected historical item の exact readout。
- 中央: 一本の NOW boundary。Remaining bar が current identity へ接続する semantic hinge。
- 右: remaining tasks の title、hierarchy depth / rails、actual lifecycle state、collapse state、create / rename / complete / move actions。
- Selection 時: task title、full hierarchy path、state、exact `createdAt`、exact `completedAt` または NOW、clip state、許可された recovery / reopen。
- Mutation 時: origin、pending / committed / failed、recovery target。Time plane は結果が commit するまで last-known truth を維持する。

### Deferred information

- Dense history では全 title と timestamp を常時印刷しない。Historical mark の pointer focus / keyboard active descendant により、左 plane に attached readout を開く。
- `actualStartAt`、session boundary、session total、queue/source revision、operation id は timeline content にしない。
- Reopened task の旧 completion event は current lifetime に重ねない。
- Aggregate mark は count と density を表す presentation cluster であり、aggregate duration や aggregate task を意味しない。

### Completed packing の情報原則

Completed task は left plane から消さない。一方で 600 title を常時表示して NOW の右 surface と競合させないため、次を守る。

1. Individual identity は composite history navigation から必ず到達可能。
2. Selected item の title、full path、exact times、state、reopen、placement action は必ず読める。
3. Aggregation は display resolution と deterministic order にだけ依存し、persist しない。
4. Aggregation は count を出すが、duration・progress・work amount を合計しない。
5. Semantic zoom / local expansion により aggregate を individual marks へ分解できる。別 page / register へ遷移しない。

### Information tradeoff

Left plane に completed title を常時すべて出すと history identity は強いが、24h axis と current tree の双方が読めなくなる。本探索は、historical marks を first glance で可視に保ちつつ exact identity を selection 時に明示する。これは identity の消去ではなく、density に応じた progressive disclosure である。

## Lens 2 — Interaction

### Task mutation origin

- Remaining task の select、collapse、inline child create、inline rename、complete、pointer drag、keyboard `移動` はすべて右 identity から始まる。
- Drag handle は右 identity cell に限定し、left lifetime bar から task drag や time edit は始まらない。
- Pointer drop と keyboard placement は同じ `target parent + optional before sibling` の seam / basin を右 tree 上に出す。
- Movement pending 中は left bar と right identity を一つの row として last committed position に残す。Success 後、両方が同時に新しい hierarchy row へ移り、timestamp は変わらない。

### Completed history navigation

- Left time plane 全体を一つの composite widget とし、default tab stop は一つにする。600 marks に 600 tab stops を追加しない。
- `Left` / `Right` は時間順、`Up` / `Down` は retained pre-order / packed lane の隣接 item、`Home` / `End` は現在 range の最初 / 最後へ移動する。
- Active descendant の mark は shape/outline で選択され、attached readout が title、path、exact times、clip / warning、available actions を表示する。Screen reader は同じ内容を一度だけ読む。
- Pointer hover は transient readout、click は selection を固定する。Hover だけで reopen や exact time に依存しない。
- Aggregate を選ぶと `n件` と範囲を読み、`Enter` でその場の local expansion、または arrow keys で aggregate 内 individual task を順番に選ぶ。

### Reopen and completed placement

- Reopen は selected historical mark の attached readout から始まる。Pending 中は closed mark をその場に残し `再開中` とする。
- Success 後、target と locked capability が返す completed ancestor path は left packet から外れ、`createdAt → NOW` の open interval と右 current identities として retained positions に現れる。Focus は reopened target の右 identity へ移る。Timer / session は開始しない。
- Failure / stale version では historical mark は closed のまま。Safe refresh 後、task identity を保てる場合は同じ mark を再選択し、user が再度 reopen を選ぶ。
- Completed task の placement を変更する場合、attached readout の identity chip から `配置を変更` を開始する。Pointer は identity chip を drag し、keyboard は同じ placement mode を使う。Time bar 自体は drag できない。Success では packet / lane 位置だけが新しい retained hierarchy slot に変わり、temporal coordinate は不変。

### Completion continuity

- Complete pending 中は open bar、NOW connector、右 identity を残し `完了処理中` とする。
- Success 後だけ open NOW cap を committed `completedAt` の closed cap に変え、右 identity を消し、retained sibling position の left historical packing に取り込む。
- Blocked parent completion は bar と identity を変えない。`最初の未完了へ` は必要な branch を開き、右側の incomplete descendant に focus を移す。
- Completion failure / persistence failure は last committed open interval を保持し、identity origin に retry / refresh を付ける。

### Range, selection, cancellation, undo

- Range controls は standard button / combobox で pointer と keyboard の双方から操作できる。
- Range change は selected task identity と vertical scroll position を保ち、mark が off-range になれば edge locator を selection として残す。
- Historical local expansion、range pan、selection は presentation state であり `現在へ` / collapse / `Esc` で戻せる。
- Post-commit domain undo は作らない。Move は新しい move、completion / reopen は locked inverse transition が valid な場合だけ別 mutation として実行する。

### Loading / pending / error / recovery summary

| State | Visual continuity | Recovery |
|---|---|---|
| Initial loading | Axis、NOW boundary、right rows の monochrome skeleton を alignment 付きで出す | Retry を同じ surface に出す |
| Safe refresh | Last committed plane/tree を保持し `更新中`。placement commit を一時停止 | identity-based focus を復元 |
| Create / rename pending | Right inline editor が origin。bar は commit 前に作らない / 変えない | invalid title は inline correction |
| Move preview | Right seams/basins。Left bar は read-only reference | `Esc` cancel、invalid target は reason text |
| Move pending | bar + identity を old slot に保持 | success で一体移動、stale は refresh + destination reselection |
| Completion pending | open interval と right identity を保持 | success のみ closed history へ変換 |
| Reopen pending | closed history mark を保持 | success のみ open interval + right identity へ変換 |
| Missing end | warning stub、no fabricated endpoint | Data warning を読む。UI 内補完なし |
| Load / persistence failure | Last committed timestamps に `stale の可能性` | Refresh 後に user-initiated retry |
| Tree limit / truncation | 全体が placement-safe でないと明示 | Hierarchy mutation を disable。archive/delete を擬似実装しない |

## Lens 3 — Layout

### Spatial frame

- Compact top line は left に range control、中央に NOW label、right に top-level create / current count を置く。Display-sized title は置かない。
- NOW boundary は viewport 高さを貫く一つの semantic rule。普通幅では line、high contrast では system border と `NOW` text を併用する。
- Default split は 1280px で left 54% / right 46%、960px で left 46% / right 54%。Deep Japanese hierarchy を守るため responsive に変える。
- Boundary は presentation-only splitter として keyboard / pointer で調整可能。Left / right とも 400px 未満にしない。NOW meaning は位置変更しても不変。
- One vertical scroll owner を使い、left plane と right current rows を別々に scroll させない。

### Remaining row alignment

- Remaining task は left lifetime、NOW hinge、right identity が同じ logical row track を共有する。
- Long title が二行になる場合、right identity が row height を決め、left bar lane も同じ height を取る。
- Depth 5–8 は compressed indentation と selected full path で title width を確保する。
- Hierarchy placement seam は right identity region に出し、thin guide だけを NOW boundary まで延ばす。Left time plane を drop target にしない。

### Completed-only space

- Completed marks は right current row を作らない。Left-only compact row / lane として logical forest の retained position に挿入できる。
- Right surface に対応 identity がない left-only lane は 14–20px に抑え、right 側は full blank row を作らず adjacent current rows を詰める。One scroll model は left lane offset map と right row map を同一 virtual layout から導く。
- Attached readout は left plane 内で selected mark 近傍に置き、right current surface を inspector/sidebar に置き換えない。

### Dense rendering

- 120 remaining + 600 completed は virtualized logical forest と viewport-level tick grid を前提にする。
- Individual SVG/DOM node を全 retained event 数に比例して増やさない。Visible mark / aggregate と composite navigation index を分離する。
- Aggregation の bucket は timestamp pixel collision と retained order から deterministic に作る。Window resize / range zoom で再計算してよいが、selection は task id で保つ。
- Reduced zoom でも completed count と temporal density は残り、zoom / local expansion で identity に到達できる。

## Lens 4 — Visual

### Monochrome-first

- Structure は grayscale で決める。Time ticks、NOW boundary、open/closed cap、clip chevron、warning hatch、hierarchy rail、selection outline、invalid target を line weight / shape / text で区別する。
- Lifetime は細い rail とし、progress bar に見える solid fill を避ける。
- Completed density aggregate は dot cloud / stacked short rails と count label で表し、heatmap color を意味の唯一の carrier にしない。
- Cards、shadow、gradient、decorative whitespace、large hero typography は使わない。

### Established semantic tokens after selection

- Dark neutral text: title、exact readout、primary controls。
- Quiet gray: ticks、history rails、hierarchy rails、secondary labels。
- Teal accent: selection / NOW / valid placement のいずれかに限定し、shape/text を併用。
- Amber active cue: right identity の actual lifecycle state にだけ使い、lifetime bar を active-work duration に見せない。
- Red error cue: warning/error text、stop / hatch geometry と併用。

### Motion

- Completion / reopen は NOW hinge を開閉する短い continuity transition を使えるが、reduced motion では即時 state change、focus transfer、status text だけで完全に理解できる。
- Range pan / semantic zoom は reduced motion で補間しない。
- NOW は minute boundary で discrete update し、秒表示、連続 animation、live-region announcement をしない。

## Three structural directions

三案とも left history / fixed NOW / right current を守る。差は completed packing、hierarchy context、remaining connection の構造にある。

### Direction A: Lineage pockets at the NOW hinge

- **Thesis:** Completed work を retained hierarchy の中の「完了部分木 pocket」として圧縮し、remaining row は同じ slot から NOW をまたいで current identity に開く。
- **Spatial model:** Logical forest の pre-order を基礎にする。Remaining row は left bar + NOW hinge + right identity の連続 row。Completed-only subtree / contiguous completed siblings はその sibling slot に left-only compact pocket として入る。別 register はない。
- **Primary object:** Hierarchy slot を保った task lifetime。Current task は開いた row、completed branch は閉じた pocket として読む。
- **Action origin:** Remaining mutation は right identity。Historical select / reopen / completed placement は left mark の attached identity detail。Range は compact top line。
- **State/result expression:** Completion は open row を commit 後に local pocket へ fold。Reopen は selected mark と completed ancestor を pocket から open rows に unfold。Move/reparent は row/pocket の hierarchy slot を変えるが x-coordinate を変えない。Pending は旧形を保持し、failure は fold/unfold しない。
- **Temporal/history representation:** Maximal completed subtree は remaining descendant を持たないという invariant を使い、安全に self-contained pocket 化する。Pocket 内は最大 3 micro-lanes へ greedy packing し、pixel collision は count aggregate にする。Local expansion で全 interval を同じ left plane に展開できる。
- **Domain signature:** **NOW hinge** と **lineage pocket**。Open cap が boundary を越えて right identity に接続し、closed branch は元 sibling slot の左側に折り畳まれる。Lifecycle state と hierarchy invariant が同じ spatial grammar になる。
- **Capability traceability:** Hierarchy S1–S5 は right row と slot movement、S6 は fold、S7 は unchanged + recovery、S8 は atomic unfold、S9 は remaining row / completed mark の一回表現、S10 は既存 pre-order の通常 pocket 化。Temporal semantics は exact interval のまま。
- **Risks and scale concerns:** Pocket aggregation の学習、right row のない left-only lane による vertical mapping、completed title の immediate visibility 低下、alternating remaining/completed siblings で pocket 数が増える。Composite navigation と local expansion が必須。
- **Typical-pattern rationale:** Pocket は card や completed register ではなく、retained sibling slot にある time-plane compression。これがなければ completed identity を left plane に残しながら 600 rows を抑えられない。Attached detail は hover tooltip では reopen / keyboard operation を安全に担えないため必要だが、modal / sidebar /別 page ではなく mark に結び付いた一時的 inspector である。

Monochrome sketch:

```text
PAST / 24h                                      NOW │ CURRENT TASKS
8/22 15:00       21:00        8/23 03:00   09:00 │
─────────────────────────────────────────────────┼────────────────────
       │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○├─▾ API障害フォロー
          ├━━■ ├━━━━■  [完了 2・展開]             │
              │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○├─  原因を整理する
                    ├━━━━━━■ [完了 1]              │
                           │━━━━━━━━━━━━━━━━━━━━━━○├─  回答案を作る
     ├━━━━━━━━■  ├━━■ [完了branch 2]               │
─────────────────────────────────────────────────┼────────────────────
selected history: タイムアウト境界テスト / API…
作成 8/22 17:10 → 完了 8/22 20:42     [再開] [配置]
```

### Direction B: Historical canopy over aligned current rows

- **Thesis:** Completed work を left plane 上部の一つの temporal canopy に集約し、remaining rows はその下で NOW と right identities に厳密 alignment する。
- **Spatial model:** Shared axis の直下に 56–96px の completed canopy。全 completed intervals を completion-time / collision で packing する。その下は current row-aligned lifetime grid。Canopy は left plane の一部で、right に completed register を持たない。
- **Primary object:** Time density first。Completed past は一つの historical field、remaining work は row-aligned current list として分けて読む。
- **Action origin:** Canopy mark / aggregate から history detail と reopen。Current task actions は right identity。Range changes は canopy と current bars を同時に rescale。
- **State/result expression:** Completion は right row から canopy の exact time position へ移る。Reopen は canopy から right hierarchy slot へ戻り open NOW bar を作る。Move/reparent は right row を移動し、completed placement は canopy detail の path 表示だけ更新する。Pending/failure は source を保持。
- **Temporal/history representation:** Canopy は最大 lane 数を固定し、collision を endpoint cluster と count にする。History selection は completion time 順、detail は full path を出す。
- **Domain signature:** **History canopy**。Past density を一目で読み、下の open lifetimes が NOW へ流れ込む二層の time plane。
- **Capability traceability:** Completion/reopen と temporal exactness は明確。Remaining alignment も強い。一方、completed hierarchy placement は常時 spatial には見えず detail に deferred される。
- **Risks and scale concerns:** Canopy が dashboard sparkline に見える、completed hierarchy context が弱い、only-completed では right が空なのに canopy が薄すぎる、dense cluster 内 navigation が抽象的。Fixed canopy height が 640px を守る一方、2 tasks でも専用 band を消費する。
- **Typical-pattern rationale:** Canopy は dashboard summary ではなく individual history marks を保持する composite time plane。全体密度を常時見せる機能上の理由があるが、hierarchy slot を失うため selected recommendation にはしない。Card / tab / modal は不要。

Monochrome sketch:

```text
PAST / 24h                                      NOW │ CURRENT TASKS
─────────────────────────────────────────────────┼────────────────────
history canopy   ├━━■  ├━━━━■  [•• 12]  ├━━━━━■    │
                 ├━━━━━━■   ├━━■   [••• 26]         │
─────────────────────────────────────────────────┼────────────────────
       │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○├─▾ API障害フォロー
              │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○├─  原因を整理する
                           │━━━━━━━━━━━━━━━━━━━━━━○├─  回答案を作る
─────────────────────────────────────────────────┼────────────────────
```

### Direction C: Temporal atlas with NOW ports

- **Thesis:** Left plane は hierarchy row に拘束されず全 task lifetime を最適 packing し、remaining intervals は NOW boundary の semantic ports から right tree identities へ接続する。
- **Spatial model:** Left は temporal lane atlas。Completed と remaining を同じ time scale に packing し、closed/open endpoint で区別する。NOW boundary に remaining task ごとの ordered port を置き、短い orthogonal connector を right tree row へ結ぶ。Selected connection だけを full strength で追跡し、他は bundled guides にする。
- **Primary object:** Time interval と NOW への到達関係。Right hierarchy は独立した current identity map。
- **Action origin:** Left mark で history selection / reopen、right identity で current mutations。Port selection は対応 identity を focus する。Range controls は atlas を rescale する。
- **State/result expression:** Completion は open port を閉じ、bar を atlas lane に残す。Reopen は closed bar を port へ再接続し right identity を materialize。Move/reparent は right tree order と port connection を更新するが bar coordinate は不変。Failure は旧 port map を保持。
- **Temporal/history representation:** Global lane packing と semantic zoom により completed 600 件を最も小さい高さで表現できる。Completed identity は mark detail、remaining identity は port link で接続する。
- **Domain signature:** **NOW ports**。Open lifetime が fixed boundary へ到着し、current identity へ「現在化」することを明示する。
- **Capability traceability:** Temporal invariants と completed density は強い。Hierarchy mutation は right で維持するが、left/right の row alignment は connector に置換される。
- **Risks and scale concerns:** 120 ports と depth-eight tree で connector crossing / bundling が複雑、selected 以外の task-bar association が弱い、screen-reader relationship model が難しい。Visual novelty が comprehension を上回る可能性が高い。
- **Typical-pattern rationale:** Atlas は dashboard graph ではなく individual lifetime navigation surface。ただし connector map の複雑さを正当化するほど row alignment の代替価値がなく、recommended にはしない。Cards/sidebar/modal/tabs は使用しない。

Monochrome sketch:

```text
PAST / 24h                                      NOW │ CURRENT TASKS
─────────────────────────────────────────────────┼────────────────────
lane 1   ├━━━━■     ├━━━━━━━━━━━━━━━━━━━━━━━━━━○ 1├────── API障害
lane 2      ├━━■          ├━━━━━━━━━━━━━━━━━━━━○ 2├──┐   └ 原因整理
lane 3   [•• 8]               ├━━━━━━━━━━━━━━━━○ 3├──┼── └ 回答案
lane 4          ├━━━━━━■          ├━━━━━━━━━━━━○ 4├──┘   リリース準備
─────────────────────────────────────────────────┼────────────────────
```

## Capability traceability matrix

| Locked outcome / invariant | Required observable result | Direction A mechanism | Acceptance evidence |
|---|---|---|---|
| Hierarchy S1 top-level create | Right current identity + `createdAt → NOW` appears atomically | Inline create on right; commit creates open row across hinge | No bar before commit; exact start equals snapshot |
| Hierarchy S2 child create | Child depth / sibling slot and own lifetime | Right parent child action; new row at retained slot | Child uses own `createdAt`, not parent time |
| Rename | Identity changes, time does not | Right inline rename | Left x-coordinates and endpoints unchanged |
| Queued / active / paused | All are remaining and open to NOW | Same open hinge; actual state label stays right | Start/pause/switch never creates segments or changes interval |
| S3 sibling reorder | Row slot changes, timestamp does not | Right sibling seam moves full open row | Bar x-position identical, y-position follows new slot |
| S4 reparent subtree | Subtree identity/order/history preserved | Right parent basin moves open rows / completed pockets | Every task keeps exact start/end and internal order |
| S5 invalid/cyclic/depth move | No partial hierarchy or temporal change | Invalid right target; last committed left marks remain | Self/descendant/depth-nine test changes nothing |
| S6 complete eligible task | Open interval seals and identity becomes left history only | Commit folds row into local lineage pocket | Closed endpoint equals `completedAt`; no right duplicate remains |
| S7 incomplete descendants | Parent stays open; recovery finds child | Right attached error + expand/focus first incomplete | No bar seals and no pocket changes |
| S8 nested reopen | Target + completed ancestors return as open rows | Selected mark unfolds changed ancestor path | Focus lands right; placement retained; no timer/session starts |
| S9 separate projections | Every task exactly once | Remaining is one cross-hinge row; completed is one left mark | ID audit finds no completed register/duplicate mark |
| S10 migrated tasks | Existing order/state/timestamps display normally | Deterministic pre-order pocket partition | No migration badge or fabricated history |
| Completed subtree invariant | Packing cannot hide remaining descendants | Only maximal completed-only subtrees become pockets | Pocket expansion contains no remaining task |
| Missing `completedAt` | No fabricated end | Warning stub in its retained pocket | No line extends from creation to NOW/completion |
| Reopened old history | Current bar is creation-to-NOW only | Old completion segments are not drawn | One open interval after reopen |
| Move/reparent preserves history | Placement and time are orthogonal | y/slot changes; x/time remains | Exact readout before/after matches |
| Range is presentation-only | No task mutation/revision change | Presets/pan/fit recompute marks only | Domain call spy records no mutation |
| Failed/stale mutation | Last committed tree + timestamps stay visible | No fold/unfold/move until success | Injected failures retain marks, caps, slots, focus recovery |
| No auto-start on complete/reopen | NOW identity state does not imply active session | Reopened row is queued/open lifetime; active cue absent unless state says active | No timer, session segment, or next-task activation appears |

## Scale and accessibility risks

| Risk | Impact | Mitigation | Verification |
|---|---|---|---|
| 960×640 left/right competition | Time scale or Japanese hierarchy becomes unreadable | Responsive 46/54 split, 400px minimums, keyboard/pointer splitter, 24h default | Depth-eight + 24h fixture keeps exact controls and tick labels usable |
| 120 remaining / 600 completed | Visual/DOM overload | Virtualized forest, maximal completed pockets, max 3 micro-lanes, collision aggregate, local expansion | Dense scroll/range/select/reopen/move remains stable |
| 5,000 forest truncation | Placement model may be unsafe/incomplete | Surface truncation warning and disable hierarchy mutation | No active seam/basin from truncated snapshot |
| Alternating completed/current siblings | Many small pockets interrupt scan | Merge only contiguous completed siblings at same parent; 14–20px collapsed height; retained slot markers | Worst-case fixture preserves sibling order and current task scan |
| Aggregation hides identity | User cannot find a specific completed task | Composite keyboard cursor, deterministic order, exact attached detail, local semantic expansion | Every task id in 600-item fixture reachable without leaving surface |
| Completed path deferred | Reopen target context may be unclear | Full hierarchy path in readout; selected pocket ancestry rail | User can state target parent before reopen |
| Long title up to 240 chars | Right side height and left row drift | Shared logical row height, two-line default, full title on focus | Resize/zoom never breaks open bar ↔ identity alignment |
| Depth eight | Right identity width collapses | Responsive right priority at 960, compressed indent after depth four, full-path readout | Title/action remain usable at 200% zoom |
| Historical pan with fixed NOW | Omitted time may look proportional | Fixed-width hatched discontinuity gutter `… NOW`, exact bounds, dashed bridge | User distinguishes plotted interval from omitted gap |
| Clip mistaken for endpoint | False creation/completion inference | Chevron vs tick/square/open cap, direction text, exact readout | Five clipping states pass grayscale comprehension |
| Missing completed end | UI may silently invent history | Creation tick + warning only | No fabricated bar in screenshot and accessible tree |
| Time bar mistaken as editable plan | User attempts scheduling | Thin read-only rails, no handles/move cursor, explicit `task lifetime` help | Pointer cannot resize/move bar; first-use meaning test passes |
| 600 default tab stops | Keyboard navigation unusable | One history-plane tab stop + active descendant / roving composite navigation | Tab order does not grow with mark count |
| Pointer-only historical detail | Keyboard/screen reader loses exact time/reopen | Arrow navigation, Enter local expansion, attached action group, accessible descriptions | Full select/read/reopen path without pointer |
| Screen-reader cross-boundary association | Bar and current identity read as separate tasks | One logical treeitem owns identity + described interval; completed mark owns full name/path/time | Narrator reads each task once with state and exact interval |
| High contrast / grayscale | NOW/open/closed/clip/warning collapse | System borders, cap shapes, hatches, labels; color additive only | All temporal states distinguishable without teal/amber/red |
| Reduced motion | Fold/unfold continuity lost | Focus transfer, status text, retained slot, immediate cap change | Completion/reopen understandable with animation disabled |
| Only completed | Right empty looks broken | Right shows quiet `現在のタスクはありません` + inline create; left pockets expand available vertical space | Completed marks visible and every item reachable; no register appears |
| Only remaining | Left looks empty despite lifetimes | Open bars fill left rows; no completed-pocket placeholder | Creation-to-NOW remains first-glance clear |
| Empty | Axis/boundary may feel purposeless | Keep compact 24h ruler + NOW boundary; right inline top-level create as primary | No decorative empty card or history register |
| Persistence / stale recovery | Mark could move/seal optimistically | Last committed state through pending, identity-based focus after refresh | Injected failure leaves caps, slots, exact timestamps unchanged |

## Anti-template rationale

選定案は conventional Gantt を左右反転しただけではない。

- Conventional Gantt の planned schedule table を持たない。Left rail は committed task lifetime だけで、resize handle、dependency、progress fill、baseline、planned column はない。
- Identity を右に置くのは装飾的 novelty ではない。NOW boundary を越えた task だけが current actionable identity を持つという user の spatial model を直接表す。
- Completed work を page/tab/register に集めない。Maximal completed subtree を元 hierarchy slot の left time plane に pocket 化することで、history visibility と NOW primacy を同時に守る。
- Pocket aggregation は dashboard metric ではない。Count は collision を説明する navigation affordance で、work amount や duration の aggregate ではない。Individual tasks は同じ surface で展開・選択できる。
- Card、tile、sidebar、modal は使わない。Hierarchy order と time alignment を分断するためである。
- Attached detail は typical hover tooltip では足りない exact timestamps、full path、reopen、completed placement を keyboard-accessible にするため必要。Mark に anchor され、right current surface を奪わず、別 navigation context を作らない。
- NOW boundary は divider decoration ではなく、open lifetime endpoint、current identity connector、completion/reopen transition の共通 semantic hinge である。
- Originality は teal、gradient、shadow ではなく、locked invariant を利用した lineage pocket と open/closed hinge から生まれる。

## Direction selection

- **Selected direction:** A — Lineage pockets at the NOW hinge
- **Selection owner:** Codex、product owner からの明示委任
- **Why it was selected:** Left history / right current という固定 spatial family を最も直接的に表しながら、remaining row の creation-to-NOW と current identity を一つの連続した object にできる。Completed task が remaining descendant を持たない locked invariant により、completed-only subtree を元 sibling slot で安全に pocket 化でき、別 register なしで hierarchy placement、identity、exact timestamps、reopen を維持する。Canopy より hierarchy context が強く、port atlas より current task association と accessibility が明快である。
- **Rejected directions:** B は completed density の first-glance overview と一定の compact height に優れるが、completed hierarchy が detail に隠れ、only-completed で dedicated band が不自然になる。C は history packing 効率と time-first character に優れるが、120 ports の connector complexity が row comprehension、screen reader mapping、error recovery を弱める。
- **Structural decisions now fixed:** left-to-right historical time plane、fixed vertical NOW boundary、right current identity/actions、24h default、7d/30d/90d/all presets、historical discontinuity gutter、one logical vertical scroll、remaining cross-hinge rows、completed maximal-subtree lineage pockets at retained slots、max 3 micro-lanes + collision aggregate、one composite history focus model、attached exact detail/reopen、time bars read-only、remaining drag/keyboard placement from right identity、completed placement from attached identity chip、no completed register/page/tab、no NEXT、no oversized title。
- **Visual decisions still open:** Exact responsive split curve、row/pocket heights within stated ranges、micro-lane spacing、aggregate glyph、start/open/closed/clip/warning cap drawing、Japanese type scale、tick density rules at each viewport、attached detail material、teal/amber/red token assignment、focus outline、reduced-motion transition duration。
- **Integration questions:** Missing capability は見つかっていない。ただし adapter が committed `createdAt`、current `completedAt`、task id/state/version、parent/sibling/depth、changed ancestor tasks on reopen、forest truncation、stable errors を提供できない場合は integration を停止する。Root pack の stale `focus-lifecycle.md` reference は source mapping 修正が必要だが、UI で capability semantics を推測する理由にはならない。Aggregation を persist したい、archive/delete で history を減らしたい、aggregate duration を計算したいという要求が出た場合は Capability Change Request が必要。
- **Acceptance checks:** 24h default と 7d/30d/90d/all、fixed NOW、historical discontinuity、five clipping states、missing end、exact timestamps、only-completed/only-remaining/empty、typical 8+2、historical 8+40、dense 120+600、depth eight、240-char Japanese title、960×640、1280×800 を render review。Create/rename/complete/blocked complete/reopen ancestor path/reorder/reparent/completed placement/stale/persistence failure を pointer と keyboard で確認。Every task exactly once、every completed id reachable in same surface、no per-mark tab explosion、Narrator association、high contrast、grayscale、200% zoom、reduced motion、no time-bar drag/resize、no session/progress/planned/NEXT/complete register を観察可能な gate とする。
