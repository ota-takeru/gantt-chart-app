# Reversible task operations v1 — 独立 UI 探索

- 探索状態: 推奨案を選定済み、UI integration へ引き渡し可能
- capability 状態: implemented / locked。ここでは表現と interaction grammar だけを選ぶ
- product surface: 日本語優先の Windows desktop app
- established structure: 左 historical time plane / fixed NOW hinge / 右 current task identities、選定済み Direction A「Lineage pockets at the NOW hinge」
- selection owner: Codex（product owner からの明示委任）
- independence boundary: `design/capability-packs/reversible-task-operations-v1.md`、`design/principles.md`、選定済み既存探索、design-exploration 手順だけを入力にした。Product source、SQLite / Rust、tests、temporary harness、headless implementer の推論は参照していない

## Locked boundary

本探索は次の意味を変更しない。

- Delete は対象 task と全 descendants を一回の commit で全 ordinary projection から除去する。子の reparent、tombstone、trash、archive view、soft deletion は作らない。
- Undo は persisted / global / strict LIFO / 最大50件で、current undo status が返す最新 token だけを実行できる。履歴一覧、任意選択、redo、部分 restore は作らない。
- Successful create / rename / move / complete / reopen / subtree delete だけが undo 対象で、view range、展開、selection、scroll、draft は対象外である。
- Pending / stale / conflict / persistence failure 中は last committed row / pocket geometry を保持し、失敗時に domain state を変えない。
- 新規 task は正確な sibling group の先頭へ入る。画面は remaining を先、completed pockets を後に投影してよいが、raw parent / position と drop target の意味を y 座標から推測しない。
- Existing cycle / depth / completed-parent / incomplete-descendant / optimistic concurrency rules が常に authoritative である。
- Left time bars は read-only task lifetime であり、planned schedule、progress、session、timer、draggable time bar ではない。

## Monochrome structural frame

色を決める前の共通記号は次のとおり。

| Mark | Meaning |
|---|---|
| `○` | Remaining lifetime が NOW に開いている |
| `■` | Committed completion endpoint |
| `□` | Completion control at rest |
| `[ ]` | Keyboard focus / selected action boundary |
| `···` | Pending。元の row / pocket geometry は維持 |
| `!` + text | Blocked / stale / conflict / failure |
| `↶` + latest label | Current token にだけ適用できる undo |
| `└─ n件` | Delete scope の descendant count。削除後には残さない |
| `▼ ROOT END` | Pointer / keyboard 共通の absolute root-end destination |

Color、shadow、gradient、decorative card は三案の差に使わない。差は operation status の居場所、confirmation の空間、action-result continuity、root-end destination との関係で作る。

## Lens 1 — Information

### 同時に見えるべき情報

- 左 plane には remaining の `createdAt → NOW` と completed の `createdAt → completedAt` lineage pockets を残す。Delete 成功した task は interval、pocket、count、locator のどれにも残さない。
- 中央 NOW hinge には current と past の境界だけでなく、選定案では「最後に commit した操作」の一行レシートを置く。レシートは undo history ではなく、current undo status の投影である。
- 右 current hierarchy には title、depth / hierarchy rail、completion control、task actions、drag origin を置く。Create / rename / complete / delete / move はここから始める。
- Undo available 時は concise Japanese label と `元に戻す`、pending / success / stale / conflict / persistence failure を一つの status unit で示す。Token、snapshot、revision number は user-facing text にしない。
- Parent delete confirmation では対象 title と descendant count を必ず併記する。1 / 8 / 100 descendants のいずれでも「子も同時に消える」ことを本文で明示する。
- Placement mode 中は exact destination meaning を表示する。`A の前`、`B の子の末尾`、`ルートの末尾`のように parent と anchor を言葉にし、投影後の見た目の位置だけに依存しない。

### Deferred information

- Delete scope で descendant title を100件すべて並べない。先頭3件の path と `ほか97件`、全件 count、必要なら同じ inline disclosure 内の scrollable preview を使う。Preview は task history ではなく pre-commit scope 確認であり、cancel / commit 後に消える。
- Undo stack の古い label、50件という残数、restoration snapshot は表示しない。Undo 成功後、次の current status が返った時だけ次の最新 label に置き換える。
- Completed 600件に個別 tab stop を追加しない。既存の composite history focus model と local expansion を維持する。
- Visual status grouping は presentation として扱い、raw persisted sibling position を user-facing list number のように見せない。

### State distinctions

- **Completed:** left plane に closed `■` と pocket が残る。
- **Deleted:** ordinary plane から完全に消え、latest-operation receipt だけが recovery を示す。Receipt を time mark や row placeholder にしない。
- **Restored by undo:** prior observable row / pocket が正しい projection に再出現し、receipt は undo success を短く述べた直後、次の latest operation または unavailable state に原子的に更新される。
- **Pending:** source geometry を維持し、action label だけを進行形にする。
- **Failure:** source geometry を維持し、origin 近傍の reason / retry / refresh と live status で示す。

### Information tradeoff

Undo stack を一覧化すれば過去操作は探しやすいが、locked strict LIFO を selective undo のように誤読させる。本探索は「現在 undo できる一件」だけを高い確度で読ませる。Deleted task の identity を ordinary history に残さない代わりに、最新レシートの concise label と復元 action を常に同じ場所へ出し、recovery の発見可能性を担保する。

## Lens 2 — Interaction

### Delete flow

1. Delete は右 task identity の named action `削除` から始まる。Pointer では row action、keyboard では同じ action group から到達する。
2. Leaf は row 内の action area が一段だけ展開し、`「回答案」を削除します [削除する] [キャンセル]` とする。二度目の明示 action が必要で、icon の単押しでは commit しない。
3. Parent は row 下に scope fold を開き、hierarchy rail で subtree を bracket する。本文は `「API障害フォロー」と子8件を、タイムラインと通常の履歴を含む画面から削除します。直後は最新操作として元に戻せます。` とする。
4. 初期 focus は destructive commit ではなく confirmation heading または `キャンセル` に置く。`Esc` は cancel し、元の `削除` action に focus を返す。Draft scope を閉じても undo entry は作らない。
5. Commit 中は元 row / descendants / left intervals を残し、fold を `削除中…` にする。Other conflicting row mutations は同じ origin で unavailable reason を読ませる。
6. Success の commit 後にだけ subtree 全体を left / right / pockets から同時に除去する。Gap は閉じるが deleted mark、灰色 row、count pocket、fade-out residue は残さない。
7. 同じ render result で latest receipt を `「API障害フォロー」と子8件を削除しました [元に戻す]` に更新し、focus は削除元の次の logical sibling、なければ parent、なければ current surface heading へ予測可能に移す。Live region は scope と undo availability を一度だけ読む。
8. Stale hierarchy / task や persistence failure では fold を閉じずに reason を出し、row / descendants / intervals を last committed geometry に戻す。Safe refresh 後も同じ task id を解決できれば delete action へ focus を戻す。

### Repeated strict-LIFO undo

- Receipt の `元に戻す` は表示中の current token にだけ bind する。Action 開始時に label を固定し `「…」を元に戻しています…` とするが、task geometry は commit まで変えない。
- Success では restored / reverted state と次の undo status を同じ visual result で反映する。たとえば delete undo で subtree が戻った直後、receipt は次の `「回答案」を名前変更 [元に戻す]` に変わる。Stack を展開したり過去 label を click したりしない。
- 連続して undo する間も focus は receipt の同じ `元に戻す` position に保つ。Button node を差し替えず accessible name / description を更新し、次の action 前に新 label を screen reader が読めるようにする。
- Undo unavailable では同じ receipt slot に `元に戻せる操作はありません` を quiet text として出す。Disabled button だけに意味を預けない。
- Restart 後も receipt は persisted status から同じ位置に再構成する。再起動を跨いだことを別 history row や badge にしない。
- Stale token は task state を変えず safe refresh を促す。Conflict は current task context と latest label を保って retry 可否を明示する。Persistence failure は receipt 内で retry / refresh を出し、成功したように次 label へ進めない。

### New-at-top / completed-lower projection

- Create commit 後、新 task はその exact top-level / child sibling group の remaining zone 最上部に現れる。Left lifetime と right identity を一つの row result として追加し、receipt も create label へ同時更新する。
- 各 sibling group は remaining rows を先に、completed lineage pockets を低い secondary band に投影する。Small text `完了した作業` と closed-cap shape で区切り、別 page / register にはしない。
- Drag / keyboard placement target は projection の y 位置を raw order と読み替えない。Adapter が提供する exact `target parent + before sibling` / parent-end / root-end destination を named seam / basin として出す。
- Undo で create を戻すと new row は deleted history へ移らず消える。Undo で complete を戻すと pocket から remaining zone の deterministic retained position へ戻る。

### Completion control grammar

| State | Row control and geometry | Accessible / recovery behavior |
|---|---|---|
| Rest | Title action edge に outline `□` を常時表示。Fill なし、row より一段 quiet | Accessible name `「…」を完了`。Hover がなくても存在を認識できる |
| Hover | `□ 完了` と短い underline / boundary を出し click target を明確化 | Hover は enhancement のみ。Text は pointer target 内に含む |
| Focus | `[□ 完了]` の太い system focus outline。Title や drag handle と混同しない | Enter / Space で開始。Focus indicator は high contrast でも残る |
| Pending | Open NOW cap、right identity、row height を保持し `··· 完了処理中`。再押下不可 | Polite live status。Focus は control に保持 |
| Blocked | Geometry は不変。`! 未完了の子があります [最初の未完了へ]` を row 下に attachment | Reason を text で読む。Action は branch を開き descendant に focus。Completion を擬似成功させない |
| Success | Commit 後だけ open cap を closed cap にし、right identity を除去して completed-lower pocket へ fold | Latest receipt を complete label に更新。Reduced motion は即時でも focus / status で結果が分かる |
| Error | Open row を維持。`! 完了できませんでした [再試行] [更新]` | Stale / persistence reason を区別し、last committed state を読み上げる |

### Pointer root-end, edge scroll, cancellation

- Drag 開始後、viewport bottom に 36–44px の fixed **root landing sill** を出す。`▼ ルートの末尾に配置` は content の scroll end ではなく viewport に常時届く destination である。
- Sill のすぐ上を bottom edge-scroll channel、viewport top を top edge-scroll channel とする。Channel に入ると current named seam / basin を保持したまま徐々に scroll し、pointer が root sill に入った時だけ destination を root append に切り替える。
- Root sill、ordinary seam、parent basin は border shape と text label が異なる。Color だけで valid / invalid / root を表さない。
- Drag 中 `Esc` は必ず cancel し、row / pocket / scroll 以外の domain state を変えず origin handle へ focus を返す。Pointer capture loss も cancel として扱う。
- Drop pending 中は origin row を last committed position に残し、destination guide に `移動中…` を出す。Success 後にだけ row / subtree を移し、`ルートの末尾に移動しました` のように committed destination を announce する。

### Keyboard equivalent

- Right identity の `移動` から同じ placement mode を開く。Arrow keys は named seam / basin 間、`Home` / `End` は現在 parent の先頭 / 末尾、明示 command `ルートの末尾` は absolute root-end destination を選ぶ。
- Root-end は shortcut 記憶を要求せず、placement mode の常設 named option として到達できる。`Enter` で commit、`Esc` で cancel する。
- Preview / pending / invalid / success は pointer と同じ destination model と日本語 result を使う。Keyboard 専用の別 ordering meaning を作らない。

## Lens 3 — Layout

### Base composition

- Existing one-scroll composition を保つ。Left time plane、NOW hinge、right hierarchy の vertical tracks は同一 logical row map から導く。
- Compact top line の直下、NOW hinge を跨ぐ一行を latest-operation receipt の固定 slot とする。1280×800 では height 32–36px、960×640 / 200% では二行まで wrap し、task row を覆わない。
- Right current hierarchy は remaining zone を先に配置し、各 sibling group の completed pockets は同じ left historical plane 内で低い secondary projection として後ろへ置く。Right 側に completed register の列を作らない。
- Long Japanese title は two-line clamp を基本にし、focus / scope confirmation で full title を読める。Depth 5–8 は compressed indent と full path description で補う。

### Delete scope fold

- Confirmation は source row の直下に挿入し、right hierarchy rail と subtree bracket を共有する。Left plane には destructive action panel を伸ばさず、該当 lifetime rows に thin scope bracket だけを重ねる。
- 100 descendants でも fold が viewport を占領しないよう、summary、3 path preview、`ほかn件`、commit / cancel を最初の 3–5 lines に収める。Expanded preview は composite scroll region 一つとし、100個の buttons / tab stops を作らない。
- Fold は modal ではないため surrounding timeline context を失わず、parent と descendants の範囲を同時に見られる。ただし commit 中は scope 外への destructive action を抑止し、focus が偶発的に背景へ抜けないよう contextual focus boundary を設ける。

### Operation receipt

- Receipt は timeline event ではなく UI status line で、time scale の x position を持たない。NOW label と alignment しても、left plane に bar / dot / endpoint を描かない。
- Label が 240 characters の title 由来でも concise server label を優先し、2 lines で truncate。Accessible description には full label と committed instant を含められる。
- Available / pending / failure / next-label transition で receipt height を変えず、120 rows の vertical origin と scroll positionを揺らさない。

### Root landing sill

- Sill は placement mode 中だけ viewport bottom に現れ、ordinary view の permanent toolbar にはしない。Virtualized list end や 600 completed pockets の下まで scroll させない。
- Bottom edge-scroll channel と sill を別 hit region にし、scroll intent と root-append intent を混同しない。200% zoom では sill を 48px 以上、text wrap なしにする。
- Keyboard placement では同じ sill を visible destination として描き、screen reader には `配置先、ルートの末尾` と読む。

### Empty / only-state layouts

- **Empty:** compact axis、NOW hinge、top-level create origin、undo unavailable receipt を残す。Empty-state card や illustration は置かない。
- **Only remaining:** All rows は open lifetime + right identities。Completed-lower placeholder は出さない。
- **Only completed:** Left lineage pockets は historical plane を使い、right は quiet `現在のタスクはありません` と top-level create を出す。Undo receipt は hinge 上で同じ位置を保つ。
- **Typical 8 + 8:** Receipt 一行、remaining rows、local completed pockets、row-attached confirmation が同時に理解できる。
- **Dense 120 + 600:** Logical forest virtualization、completed pocket aggregation、one history composite focus、fixed receipt / root sill を用い、viewport resident controls を task count に比例させない。

## Lens 4 — Visual

### Monochrome-first grammar

- Task lifetime rail、NOW boundary、hierarchy rail、scope bracket、receipt rule、root sill は line weight と spacing で区別する。Solid filled bars を使わず progress に見せない。
- Completion rest は outline square、hover / focus は text + underline / system outline、pending は ellipsis + text、blocked / error は stop shape `!` + reason text とする。
- Delete confirmation は destructive button の border を二重線、cancel は通常線にする。High contrast では system colors / borders を尊重し、red だけで destructive を示さない。
- Deleted success の transition は row を ordinary history へ灰色化しない。Commit 後の geometry reflow と fixed receipt の文だけが結果を示す。
- Undo success で restored task を一回だけ outline emphasis できるが、3秒後に消える badge や persistent `復元済み` mark は作らない。

### Motion

- Standard motion では delete success の row collapse、complete success の hinge close / pocket fold、undo restore の row re-entryを 120–180ms 程度の continuity cue にできる。
- Reduced motion では interpolation を外し、commit 後に即時 geometry、focus transfer、receipt text、live announcement を同じ順で更新する。
- Edge scrolling は reduced motion でも機能として必要だが、加速度を穏やかにし、pointer が channel を離れれば即停止する。Decorative inertia は使わない。

### Visual decisions deferred until integration

- Semantic accent assignments、exact grayscale values、Japanese typeface / size、receipt border weight、scope bracket pattern、root sill hatch、focus outline thickness、animation duration の最終値。
- これらは structure を変えず、grayscale / high contrast / Windows system focus / 200% zoom の render evidence 後に決める。

## Three monochrome structural theses

三案とも locked left-history / NOW / right-current、strict LIFO、no tombstone、remaining-first / completed-lower、viewport-bottom root destination を守る。違いは recovery status、confirmation、placement destination の spatial ownership である。

### Direction A: NOW commit receipt + inline scope fold

- **Thesis:** Task mutation は right row から始まり、commit の結果だけを NOW hinge 上の一行レシートへ渡す。削除範囲は source hierarchy の中で確認する。
- **Spatial model:** Top line 下に hinge-crossing receipt、body に left lifetime / right identity rows、source row 下に delete scope fold、placement 中だけ viewport bottom に root landing sill。
- **Primary object:** Committed task row / lineage pocket。Receipt は task ではなく最新 commit の recovery handle。
- **Action origin:** Create / rename / complete / delete / move は right identity。Undo は fixed receipt。Root append は pointer / keyboard 共通 sill。
- **State/result expression:** Pending は source geometry を保持。Delete success は row を無痕跡で除去し receipt を更新。Completion success は pocket へ fold。Failure は origin attachment。Undo success は state と next receipt を原子的に更新。
- **Temporal/history representation:** Left plane は task lifetime だけを持つ。Receipt は x-coordinate を持たない「latest operation only」の status で、ordinary history と混ざらない。
- **Domain signature:** **NOW commit receipt**。Current action が NOW 境界で committed past へ変わる瞬間に、復元可能な最新一件だけを固定する。Deleted task を historical mark にしなくても recovery origin がぶれない。
- **Capability traceability:** Subtree scope / cancel / atomic delete、persisted repeated LIFO、new-at-top、completed-lower、completion seven states、root-end / edge scroll / keyboard equivalent、last-committed failure continuityを直接担う。
- **Risks and scale concerns:** Receipt が generic toast に見える危険、inline fold が dense hierarchy を押し下げる危険、hinge top line が 200% で wrap する危険。Fixed non-overlay slot、scope bracket、2-line limit で抑える。
- **Typical-pattern rationale:** Modal を使わないのは hierarchy scope と time rows を同時に見る必要があるため。Toast を使わないのは repeated undo / restart / keyboard focus に持続性が足りないため。Receipt は toolbar/card ではなく current undo status 専用の一行。Inline fold がなければ parent と descendants の spatial relation を確認しながら cancel できない。

Monochrome sketch:

```text
PAST / TIME                              NOW │ CURRENT TASKS
────────────────── 「回答案」を作成   [↶ 元に戻す] ─────────
     ├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ │ ▾ API障害フォロー
                                        │   ├ 原因を整理する  □
                                        │   └ 回答案を作る    □ [削除]
                                        │     ┌ 削除の確認 ─────────┐
                                        │     │ このtaskと子8件      │
                                        │     │ [削除する] [取消]    │
                                        │     └─────────────────────┘
          ├━━━━■ [完了 8件]             │
────────────────────────────────────────────────────────────
placement: edge scroll zone
▼ ルートの末尾に配置
```

### Direction B: Bottom operation dock

- **Thesis:** Confirmation、latest undo、placement destination を viewport bottom の mode-aware operation dock に集め、body を rows / time marks だけに保つ。
- **Spatial model:** Body は existing left/right surface。通常時 bottom dock は latest label + undo、delete 開始時は scope summary + commit / cancel、drag 時は root-end destination + edge-scroll separator に mode-switch する。Source subtree は bracket だけで示す。
- **Primary object:** 現在の operation mode。Task row は origin、bottom dock は command と result の恒常的な home。
- **Action origin:** Row action から dock へ focus / pointer attention が移る。Undo と confirmation は dock、completion control は row、root append は同じ dock の placement state。
- **State/result expression:** Pending / failure / recovery は dock と source row の二点で同期表示。Delete success は source が消え、dock が undo label に戻る。Repeated undo は bottom position を保つ。
- **Temporal/history representation:** Latest operation は時間 plane 外の bottom edge に置き、task history と完全に分離する。
- **Domain signature:** **Operation shoreline**。長い work surface の viewport edge が、commit recovery と absolute root-end の二つの「これ以上先がない」意味を担う。
- **Capability traceability:** Delete scope、latest-only undo、root destination の到達性は強い。New/completed projection と completion geometry は body で既存文法を維持する。
- **Risks and scale concerns:** Undo と root-end が同じ場所で mode-switch し、drag 中に latest recovery が隠れる。200% / 640px height で permanent dock が task density を削る。Row から confirmation へ attention / focus が長距離移動する。
- **Typical-pattern rationale:** Bottom action bar は modal より context を残し、root destination を常時 viewport 内に置く機能上の理由がある。しかし operation type ごとに内容が変わる generic command bar に近く、action-result continuity が source row から離れるため選定しない。

Monochrome sketch:

```text
PAST / TIME                              NOW │ CURRENT TASKS
     ├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ │ API障害フォロー   □ …
          ├━━━━━━━━━━━━━━━━━━━━━━━━━━━○ │ └ 回答案          □ 削除
           ├━━━━■  [完了 8件]            │
────────────────────────────────────────────────────────────
│ 最新: 「原因を整理する」を変更       [↶ 元に戻す]        │
└───────────────────────────────────────────────────────────┘

delete mode:
┌ 対象「API障害フォロー」+ 子8件 ─ [削除する] [取消] ─────┐
```

### Direction C: NOW transaction spine

- **Thesis:** NOW boundary の右隣に細い transaction spine を設け、各 current row の completion / deletion state と global latest undo を縦一列の operation nodes として読む。
- **Spatial model:** Left time plane、NOW boundary、32–48px operation spine、right titles / hierarchy。Global undo node は spine 上端、row-level completion / delete node は各 row alignment、root-end node は placement 中だけ spine bottom から viewport 幅へ展開する。Parent delete は spine node から anchored scope layer を開く。
- **Primary object:** NOW に接する transaction point。Task identity より先に「この row に今できる操作」が縦に揃う。
- **Action origin:** Completion / delete は row-aligned spine nodes、rename / move / create は right identity、undo は spine head。Keyboard は spine を一つの action composite として移動できる。
- **State/result expression:** Pending は node を `···`、blocked/error は `!` にし、anchored text を右へ出す。Success 後に row node が消え、undo head label が更新される。
- **Temporal/history representation:** Latest operation は NOW head に pin され、completed/deleted の過去 markにはならない。Completion は row node が left closed pocket へ意味的に渡る。
- **Domain signature:** **Transaction spine**。NOW hinge を current mutation の vertical action rail として物理化し、time / action の境界を一本にする。
- **Capability traceability:** Completion states と latest undo の位置は強い。Delete / root-end / LIFO は head / anchored layer / bottom expansion で表す。
- **Risks and scale concerns:** Depth eight / long titleには有利でも、120 rows に controls が縦列化して visual noise が増す。Completion と delete の icon-only 誤読、200% で spine 幅不足、NOW boundary が time hinge ではなく toolbar に見える。Create / rename / move の origin も分裂する。
- **Typical-pattern rationale:** Vertical action rail は sidebar ではなく row alignment を保つ composite control だが、task count に比例する chrome を増やす。Right identity に既に action origin があるため重複を正当化できず、選定しない。Anchored scope layer は modal より contextを残すが、spine の icon grammar を学ばせる負担が大きい。

Monochrome sketch:

```text
PAST / TIME                        NOW │ OPS │ CURRENT TASKS
──────── latest: rename ──────────────│ ↶  │
  ├━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○ │ □⋮ │ API障害フォロー
       ├━━━━━━━━━━━━━━━━━━━━━━━━━━━○ │ □⋮ │ └ 原因を整理する
              ├━━━━━━━━━━━━━━━━━━━━○ │[□⋮]│ └ 回答案
                                      │ └──┴─ scope + 子8件
          ├━━━━■ [完了 8件]           │     │
────────────────────────────────────────────────────────────
                                      ▼ ROOT END
```

## Capability traceability matrix

| Locked outcome / invariant | Required observable result | Selected Direction A mechanism | Acceptance evidence |
|---|---|---|---|
| Delete leaf | Deliberate commit; task vanishes from every ordinary projection | Row-local two-step confirmation; success removes left/right/pocket identity | No deleted mark/tombstone/archive row remains; receipt offers current undo |
| Delete subtree atomically | Parent + all descendants disclosed and removed together | Inline scope fold + hierarchy bracket + exact descendant count | Fixtures with 1 / 8 / 100 descendants show correct scope; no partial disappearance |
| Delete cancellation | No mutation / undo entry | Cancel / Esc closes fold and restores focus | Forest, queue/timeline projection, receipt label unchanged |
| Delete stale / persistence failure | No observable task change | Last committed geometry + local reason / refresh | Injected failure retains every row, interval, pocket and current receipt |
| Undo strict latest token only | Only current operation can be undone | Single fixed receipt; no list / older item controls | Accessibility tree exposes one undo action at most |
| Repeated LIFO | Each success reveals next latest operation | Stable button position; atomic state + next-label update | Repeated undo across create / rename / move / complete / reopen / delete preserves focus and order |
| Undo after restart | Persisted availability is immediately understandable | Receipt reconstructs from current status in same slot | Restart fixture shows same latest concise label and one action |
| Undo pending / success | No optimistic geometry; restored state then next status | Receipt pending text, commit-time geometry change | Deleted subtree appears only after undo commit; versions/revisions are not presented as reverted |
| Undo stale / conflict / persistence failure | State unchanged, recovery local | Receipt reason + safe refresh / retry | No next-label advance on failure; current task projection retained |
| Another operation becomes latest | Rendered task result and undo label agree | Same result boundary updates body + receipt | No frame where old undo label is paired with new state |
| Create top-level / child | Insert at top of exact sibling group | Remaining-zone top insertion within target group | New row is first in named group; open lifetime and receipt appear together |
| Remaining-first / completed-lower | Status projection does not become persisted order | Per-group secondary completed pocket band | Raw move destinations remain exact despite projected y ordering |
| Completed stays historical | No separate register/page | Left lineage pockets below remaining group | Only-completed state remains on same time plane |
| Complete rest / hover / focus | Quiet but discoverable action | Outline control, text enhancement, system focus | Grayscale / keyboard test identifies action without hover or color |
| Complete pending | Last committed open row retained | Open cap + identity + pending label | No premature pocket or closed endpoint |
| Complete blocked | Parent unchanged; incomplete child recoverable | Local reason + `最初の未完了へ` | Branch opens and focus reaches descendant; no receipt update |
| Complete success / error | Commit folds; failure stays open | Atomic fold + latest receipt / origin error | Success creates completed pocket; failure keeps open lifetime |
| Pointer before / inside / parent end | Deterministic hierarchy move | Named seam / basin using exact adapter destination | Cross-parent fixtures announce committed parent / anchor |
| Absolute root end | Destination reachable below viewport content | Fixed root landing sill | With 600 completed items, pointer can root-append without reaching document end |
| Edge scrolling | Scroll while active destination persists | Separate top/bottom channels above sill | Slow/fast traversal retains preview; entering sill alone selects root end |
| Drag cancellation | Nothing commits | Esc / capture-loss cancel, origin focus return | Row / raw position / receipt unchanged |
| Keyboard placement equivalent | Same destinations and result | Named placement mode + explicit root-end option | Keyboard-only root append announces identical committed destination |
| Dense / long title / depth eight | Stable readable work surface | Virtualization, concise receipt, 2-line titles, compressed indent | 120 + 600 / 240-char / depth-eight fixture passes render and focus review |
| Empty / only completed / only remaining | Structure remains meaningful | Axis + hinge + create + receipt slot; no decorative cards | Each state retains correct plane and no false placeholders |

## Scale and accessibility risks

| Risk | Impact | Mitigation | Verification |
|---|---|---|---|
| 960×640 + receipt + scope fold | Rows may lose vertical working area | Fixed one-line receipt; max two lines at zoom; fold summary first | Parent +8 confirmation keeps commit/cancel and source visible |
| 200% zoom | Hinge split, long labels, sill targets may collide | Responsive wrap, right-title priority, 48px sill, no icon-only action | 960×640 at 200% completes delete/undo/root-end by keyboard |
| 120 remaining / 600 completed | DOM, focus and scan overload | Virtual row map, pocket aggregation, one history composite, viewport-constant receipt/sill | Tab-stop count does not scale with historical marks |
| 240-character Japanese title | Receipt or confirmation overwhelms layout | Concise undo label, 2-line visual clamp, full accessible description | Full identity is available without horizontal scroll |
| Parent +100 descendants | Confirmation becomes a second task browser | Count + 3 paths + `ほか97件`; optional composite preview | User can state scope; no 100 tab stops |
| Projection vs raw order | Wrong move anchor or misleading undo restore | Named destinations from raw model; projection labeled by status | Alternating remaining/completed siblings move deterministically |
| Deleted vs completed confusion | User searches history for deleted row | No deleted time mark; receipt explicitly says `削除` and undo | Grayscale test distinguishes delete success from complete fold |
| Receipt mistaken for undo history | Selective undo expectation | One action only; no disclosure arrow, list, counts or older labels | First-use test identifies only latest operation as reversible |
| Restart | Recovery appears lost or duplicated | Same receipt location sourced from persisted status | Restart produces one identical latest action, not a new entry |
| Stale / conflict / persistence failure | User assumes success or retries unsafe token | Last committed geometry; reason text; refreshed current label before retry | Fault injection produces no partial mutation / optimistic fold |
| Hover dependency | Completion/deletion inaccessible | Rest outline, named keyboard controls, focus text | Pointer-free flow reaches complete/delete and understands scope |
| High contrast / grayscale | Open/closed/pending/error collapse | Shapes, system borders, text labels, hatches; color additive only | Screenshot + Windows HC mode distinguish all seven completion states |
| Reduced motion | Delete/restore continuity may disappear | Focus transfer + fixed receipt + live result; motion optional | All results understandable with animation disabled |
| Live region overload during repeated undo | Labels and row changes announce twice | One atomic polite result; stable focus; suppress decorative announcements | Five repeated undo actions yield one result announcement each |
| Root sill vs edge scroll | Accidental root append while trying to scroll | Separate hit bands, dwell/position distinction, explicit destination text | Pointer path can scroll to multiple seams without destination switching |
| Only completed | Right surface seems empty/broken | Quiet current-empty text + create; left pockets keep vertical authority | No completed register or dashboard empty card appears |

## Anti-template rationale

- 選定案は snackbar / toast の undo pattern を採らない。Toast は timeout、focus移動、restart、repeated LIFO に弱く、消える通知が capability availability の唯一の表現になる。Fixed receipt は current status が available な間だけ存在し、history list にはならない。
- Delete confirmation を中央 modal にしない。Subtree の親子関係、left lifetime、right action origin を同時に確認する必要があり、modal はその spatial evidence を覆う。Inline scope fold と bracket は destructive scope に固有の表現である。
- Cards / dashboard tiles / separate completed tab / trash view は使わない。Task は row と temporal mark が primary object であり、container を増やすと remaining / completed / deleted の意味が別 navigation context に分裂する。
- Completed-lower pocket は generic accordion ではない。Retained hierarchy slot と committed time interval を同じ plane で圧縮する domain-specific structure で、600 completed tasks を別 register に逃がさず扱う。
- NOW commit receipt は activity feed ではない。表示するのは current token 一件だけで、operation kind / concise label / availability / resultを strict LIFO のまま扱う。
- Root landing sill は generic sticky footer ではない。Document end が viewport 外でも absolute root append を保証するため placement mode 中だけ現れる semantic destination である。
- Originality は色、rounded panels、icon set ではなく、**lineage pocket / NOW commit receipt / root landing sill** が locked time・hierarchy・reversibility semantics を一つの surface で接続する点から生まれる。

## Direction selection

- **Selected direction:** A — NOW commit receipt + inline scope fold
- **Selection owner:** Codex、product owner からの明示委任
- **Why it was selected:** Existing left-history / NOW / right-current structureを壊さず、mutation origin、pending truth、commit result、latest-only recovery の causal chain が最短である。Delete scope は hierarchy 上で確認でき、success 後の deleted row を ordinary history に残さず、undo は固定 receipt で即座に見つかる。Undo の居場所が root landing sill と競合せず、repeated LIFO / restart / keyboard focus が安定する。Completion control と move origin も right identity に留まり、established action-origin principle を保つ。
- **Rejected directions:** B は confirmation / recovery / root-end を一つの viewport edge に集約できるが、mode-switch で undo が隠れ、action origin から遠く、640px / 200% で permanent height cost が大きい。C は NOW と current operations の関係を強く表すが、120 rows 分の action chrome、icon grammar、right action-origin の分裂により calm density と accessibility を弱める。
- **Structural decisions now fixed:** Latest undo は hinge 上の non-temporal fixed receipt 一件のみ。Delete は right row から始まり leaf は light two-step、parent は inline scope fold + subtree bracket。Pending は committed geometryを維持し、success delete は no tombstone / no ordinary mark。Remaining-first / completed-lower は per sibling group の projectionで、raw destinationsは named adapter targets。Completion は outline rest → text hover/focus → committed-only fold。Placement 中は fixed root landing sill と独立 edge-scroll channels。Keyboard は同じ placement model と explicit root-end option。One logical scroll / composite history focus / no cards / no completed register / no trash / no redo / no selective undo。
- **Visual decisions still open:** Receipt / scope bracket / sill の exact border、semantic accent、Japanese typography、row / fold spacing、pending glyph animation、rest completion target size、standard-motion duration。いずれも grayscale / high contrast / 200% / reduced-motion evidence 後に選ぶ。
- **Integration questions:** Missing capability は現時点で見つかっていない。Adapter が current undo label/token を rendered task result と同じ revision boundary で供給できない、delete scope countを commit 前に authoritative に示せない、または placement destination を exact parent / before-sibling / parent-end / root-end として供給できない場合は integration を停止する。Older undo selection、partial subtree restore、trash/archive、redo、50-entry rule変更、新しい persisted ordering meaning が必要になった場合は Capability Change Request を発行し、UI state で模倣しない。
- **Acceptance checks:** Empty、only remaining、only completed、typical 8+8、historical 8+40、dense 120+600、depth eight、240-character title、delete descendants 1/8/100を 960×640 / 1280×800 / 200% で render review。Leaf / parent delete の confirm/cancel/pending/success/stale/persistence failure、create/rename/move/complete/reopen/deleteを跨ぐ repeated undo と restart、no undo / stale/conflict/failure、new-at-top、completed-lower、completion rest/hover/focus/pending/blocked/success/error、pointer root-end / top-bottom edge scroll / Esc cancel / keyboard root-end を確認する。Narrator で stable focus と一回の live announcement、grayscale / Windows high contrast / reduced motion、no deleted mark/tombstone/history list、no per-mark tab explosion、raw destination determinism を観察可能な gate とする。
