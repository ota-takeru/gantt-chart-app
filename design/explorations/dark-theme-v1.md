# Dark theme v1 — semantic visual specification

- 状態: ユーザー委任済みの dark-theme visual exploration。推奨 token system を選定済み。
- 入力: 指定された light-theme 証拠 4 枚だけ。`page-2026-08-23T16-03-23-427Z.png`（1280 typical）、`page-2026-08-23T16-02-05-465Z.png`（760 typical）、`page-2026-08-23T16-02-57-532Z.png`（760 delete）、`page-2026-08-23T16-03-36-413Z.png`（dense）。
- 固定するもの: left lifetime timeline、NOW hinge、right current-task tree、completed pocket、minimal copy、drag / reparent、undo / delete / rename / subtasks、既存 motion token と reduced-motion。
- 許可するもの: CSS custom property の値、`prefers-color-scheme` による theme metadata、background / border / text / marker / focus paint。
- 禁止するもの: DOM topology、element order、interaction、hit target、copy / aria-label、domain state、persistence、history、delete / undo semantics、timeline geometry、pocket packing、motion token の変更。

## Evidence reading

- 1280 typical は add input / plus が左、range・NOW・選択・再読込が右に一行で収まる。中央の status strip、左 timeline、NOW、右 current tree の層が明確である。
- 760 typical は add input / plus、range 操作、再読込が狭い幅で分かれる。dark theme はこの段差を再設計せず、既存の row / grouping を同じ位置で読めるようにする。
- 760 delete は淡い赤の confirmation surface、影響する子孫の list、`削除する`、`キャンセル` を持つ。dark theme は danger の意味を保つが、確認内容・focus・作業位置を変えない。
- Dense は `現在 120` / `履歴 600`、細い lifetime bars、completed pocket、`保留` などが同じ低インク面に共存する。dark theme は明るい色面を増やして密度を上げず、線・形・text を先に残す。

## Four lenses

### Information

- Background、surface、soft surface を分けるが、カードや新しい情報グループは作らない。left timeline、NOW、right tree の同じ関係を dark value に写像する。
- `text` / `muted` は既存の title、state、timestamp、control copy の hierarchy を保つ。`muted` は disabled の意味に流用せず、既存の quiet information に限る。
- `accent` / `accent-soft` は NOW、selection、valid placement など既存の semantic role に限定する。色を decoration、progress、work amount に使わない。
- completion、danger、warning、active、paused、queued は色だけでなく既存の state text、dot / cap / hatch / panel position で読めるようにする。
- completed pocket は dark surface の中で低密度のまま見える。明るい塗りつぶしや大きな badge を追加せず、閉じた endpoint、lane、既存 count / title の hierarchy を保つ。

### Interaction

- OS の `prefers-color-scheme` が dark になったときだけ token values が切り替わる。toggle、persisted preference、reload、focus移動、selection変更を追加しない。
- Hover、selected、focus、drag target は existing hit target / action origin のまま。dark value が hover / selected の境界を見えなくしない。
- Delete overlay は既存の impact list、確認、キャンセル、undo result を同じ focus order と role で表示する。色だけで dangerous action を伝えず、既存の panel border / text / button focus を保つ。
- Pending、error、stale、undo available / success は既存の geometry と status transition を維持する。theme switch は pending operation を commit / cancel しない。
- Reduced motion では color swap に transition を付けない。既存 motion token の利用箇所はそのまま、`prefers-reduced-motion` 時は既存の immediate state / focus / status behavior を維持する。

### Layout

- Timeline bar の x / y / width、NOW hinge の位置、right tree の indentation、completed pocket の高さ・順序は light / dark で不変。
- Surface boundary は `lines` と adjacent surface difference で見えるようにする。shadow、gradient、new divider、dark-theme-only panel を追加しない。
- Row hover / selected の underlay は left bar → NOW → right title を一続きにするが、row height、title wrap、complete hit area、drag seam を動かさない。
- Narrow、dense でも text が bright color noise にならないよう、state color は小面積 marker / border に限定し、body copy は `text` / `muted` を使う。
- Preview strip は既存 top strip の面と境界を暗く写像するだけで、preview mode の構造・文言を変えない。

### Visual

- Dark theme は near-black canvas、わずかに明るい surface、さらに明るい soft surface の三層で flat / low-ink を保つ。
- Token values は semantic role 単位で指定する。コンポーネントごとの ad-hoc hex、透明度だけの state、白い文字の一律適用を禁止する。
- Text、focus、state marker、NOW line、drag seam、danger border は WCAG の target を満たし、shape / position / text が color を補完する。
- Teal は既存 accent identity を保つが、dark canvas で vibrancy を上げすぎない。Amber / red は actual lifecycle / danger だけに使う。

## Recommended semantic token system

Light theme の既存値は変更せず、下表の dark values を OS dark mode の override として適用する。値はすべて semantic token で参照し、source の literal color を増やさない。

| Token | Dark value | 用途 | 非カラーの意味 |
|---|---|---|---|
| `background` | `#0E1214` | app canvas、timeline の最背面 | surface の外側の領域 |
| `surface` | `#151B1E` | timeline plane、current rows、通常 control | row / plane の基準面 |
| `soft` | `#1E282B` | status strip、pocket、input の静かな面 | supporting surface の位置 |
| `text` | `#F1F6F3` | task title、主要 copy、timestamp | text hierarchy の primary |
| `muted` | `#B7C3C0` | secondary label、range detail、quiet state | text の secondary hierarchy |
| `lines` | `#526267` | row rule、timeline rail、NOW 周辺の構造線 | line weight / alignment |
| `accent` | `#62D3C5` | existing teal accent、valid selection、主要な lifetime cue | accent line / cap / selected marker |
| `accent-soft` | `#1A4744` | accent の低面積 background、選択の soft fill | selected / valid の面 |
| `completion` | `#8BCDB7` | completed cap、pocket rail、completion cue | closed endpoint / pocket placement |
| `danger` | `#FF9B92` | delete border、error copy、failure marker | danger panel / border / error state |
| `warning` | `#F2C86F` | warning、preview cue、missing-data marker | warning shape / hatch / copy |
| `focus` | `#8DDCFF` | keyboard focus ring、focus-visible boundary | 2px ring + offset |
| `active` | `#F2B765` | existing `着手中` cue | filled dot + existing state label |
| `paused` | `#B7C3C0` | existing `保留` cue | quiet / hollow state marker + label |
| `queued` | `#9FBAC1` | existing queued / remaining cue | hollow marker + existing state label |
| `hover` | `#202D30` | pointer hover の row underlay | transient whole-row underlay |
| `selected` | `#224A4B` | persistent selected row / pocket underlay | outline + whole-row continuation |
| `NOW` | `#73DED3` | NOW rule、NOW label、open endpoint | vertical hinge + label + open cap |
| `drag-target` | `#5CCEC1` | valid seam / basin、placement preview | dashed / outlined drop geometry |
| `delete-overlay` | `#3B2527` | existing delete confirmation surface | panel boundary + impact list + buttons |
| `preview-strip` | `#2A251C` | existing `プレビュー` strip | top band + boundary; warning meaning remains |

### Token application rules

- `background` と `surface` は adjacent region が識別できる程度に分ける。`soft` は status / pocket / input の grouping に限り、primary content より明るくしない。
- `lines` は structural rule / rail / row boundary に使う。1px rule でも adjacent surface に対して非テキスト UI boundary の 3:1 目標を満たす。装飾的な薄線は state carrier にしない。
- `text` は通常本文 4.5:1 以上、primary title は 7:1 を目標にする。`muted` で意味のある state / control copy を表示する場合も 4.5:1 以上を守る。placeholder を muted より暗くしない。
- `accent`、`completion`、`danger`、`warning`、`active`、`queued` は marker と既存 text の両方に同じ色を強制しない。small marker は色、label / shape は text / geometry で冗長化する。
- `accent-soft`、`selected`、`delete-overlay`、`preview-strip` の上の本文は `text` またはそれと同等の高コントラスト値にする。dark surface の上に白を直接増やさず、semantic foreground を使う。
- `focus` は adjacent background / surface に対して 3:1 以上。outline と offset を使い、selected underlay だけに依存しない。
- `NOW` は垂直 rule、`NOW` label、open cap の三つで表す。accent 色が見えない場合でも位置と shape で boundary を理解できるようにする。
- `drag-target` は dashed seam / basin と outline を常に併用する。color fill のみで drop target を示さない。invalid target は既存 error / disabled representation を維持する。
- `delete-overlay` は `danger` border / existing impact content / confirm-cancel focus order を保つ。赤い面積を画面全体へ拡張しない。
- `preview-strip` は warning tone を使えるが、active や error と同じ色にしない。top strip と text の境界を保持する。

### Contrast target matrix

| 組合せ | 目標 | 備考 |
|---|---:|---|
| `text` on `background` / `surface` | ≥ 4.5:1（primary title は ≥ 7:1） | 通常文字の minimum |
| `muted` on `background` / `surface` | ≥ 4.5:1 | meaning-bearing secondary text に使用 |
| `accent` / `completion` on dark surface | ≥ 4.5:1 | small cap / label は shape と併用 |
| `danger` on `delete-overlay`、`warning` on `preview-strip` | ≥ 4.5:1 | warning / destructive copy |
| `focus` ring、selected / hover boundary、drag seam、NOW rule | ≥ 3:1 | non-text UI boundary |
| `lines` against adjacent structural surface | ≥ 3:1 target | 低コントラストの装飾線で state を表さない |

実装時は最終 font weight、抗 aliasing、forced-colors、OS contrast setting を含む rendered screenshot で再確認する。下表の値は候補 token であり、コントラスト不足が出た場合は role 内で値を調整し、意味・構造・copy を変えない。

## State mapping: color + non-color semantics

| State / surface | Token mapping | 必須の非カラー carrier |
|---|---|---|
| active | `active` on `surface` | existing filled dot + `着手中` label、通常 current row |
| paused | `paused` on `surface` | existing quiet / hollow marker + `保留` label、active と別 shape |
| queued / remaining | `queued` or `muted` | existing state label、open lifetime rail、right current identity |
| completed | `completion` on `soft` / `surface` | closed cap、completed pocket position、既存 completion representation |
| selected | `selected` + `focus` if keyboard | persistent outline / whole logical row underlay |
| hover | `hover` + existing accent detail | transient row-wide underlay、action disclosure、no layout movement |
| NOW | `NOW` + `lines` | vertical hinge、`NOW` label、open cap、fixed position |
| valid drag target | `drag-target` + `lines` | dashed seam / basin、placement geometry |
| delete overlay | `delete-overlay` + `danger` | existing impact list、confirmation / cancel controls、panel boundary |
| error / stale / persistence failure | `danger` / `warning` | existing error text、hatch / border / retained committed geometry |
| pending | `soft` / `muted` | existing pending status、last committed row / pocket remains |
| preview strip | `preview-strip` + `warning` where already used | top strip position、existing preview text |

## Forced colors / system settings

- `@media (forced-colors: active)` では system colors を優先し、`Canvas` / `CanvasText`、`ButtonFace` / `ButtonText`、`Highlight` / `HighlightText`、`GrayText`、`Mark` / `MarkText` を semantic roles に割り当てる。custom dark hex を強制しない。
- `focus` は system `Highlight` と outline / offset、selected は system `Highlight` と persistent border、NOW は rule + label、danger は existing border + impact text とする。色が同じでも shape / text / position が残る。
- `forced-color-adjust: none` で重要 state を隠さない。native controls、keyboard focus、button border、dashed drag seam が OS contrast setting で視認できることを優先する。
- `prefers-contrast` が利用可能な環境では同じ semantic roles を高コントラスト値へ寄せるだけにし、DOM、copy、interaction、hit target は変えない。
- `prefers-color-scheme` の変更は CSS token の再評価だけ。selection、scroll、pending operation、undo token、domain state を reset しない。手動 toggle と preference persistence は作らない。

## Reduced motion compatibility

- Dark/light token switch、hover、selected、focus、NOW marker、drag preview、delete overlay の表示に新しい transition / animation を加えない。
- Existing motion token が既に適用されている state change はその token を維持する。`prefers-reduced-motion: reduce` では既存の reduced variant / immediate state / focus transfer / status announcement を使い、theme change で別 motion を発生させない。
- Color fade を state acknowledgement にしない。pending、success、failure、delete、Undo は既存 text、shape、geometry、focus、status を同時に利用する。

## Acceptance checks

| Scenario | 受け入れ条件 |
|---|---|
| 1280 typical | light と同じ left timeline / NOW / right tree / controls の位置、row height、indent、timeline width。dark surface の境界、title、range controls、status strip が target contrast を満たす。 |
| 760 narrow | narrow の既存 reflow / control order / hit target / copy を変更しない。timeline、NOW、right title が暗部で分離し、preview strip と status strip が混同されない。 |
| dense 120 / 600 | completed pocket の lower-density、count、individual marks、`現在 120` / `履歴 600` が読める。bright color noise、marker の混同、row virtualization / packing の変化がない。 |
| delete confirmation | existing red overlay、impact list、`削除する`、`キャンセル`、focus、row position、Undo result が light と同じ。danger が dark surface で 4.5:1 以上、panel を暗くして内容を消さない。 |
| hover | left bar → NOW → right task name が同じ row underlay。secondary action visibility、complete hover、focus ring が layout / timeline geometry を動かさない。 |
| selected | selected underlay / outline が hover と区別でき、selection が dark surface に埋もれない。selection を色だけで判定しない。 |
| active | existing `着手中`、filled marker、amber cue が quiet scale で読める。大きな card / heading / timer / progress fill が出ない。 |
| paused | existing `保留` と distinct marker が active と区別できる。amber を流用せず、label / shape が grayscale でも残る。 |
| completed | closed endpoint / pocket shape / existing title or count が lower density のまま読める。completed を danger / active と誤認しない。 |
| empty | `background` / `surface` / `lines` が空白を過度に埋めず、既存 empty controls / add path が visible。新しい empty copy / card がない。 |
| error / stale | existing danger / warning copy と border / hatch が `text` と同じ階層で読める。last committed hierarchy / timestamps / order を色変更で隠さない。 |
| pending | pending status と committed geometry が visible。dark token change で optimistic endpoint、fold、delete disappearance が起きない。 |
| drag / reparent | dashed seam / basin、focus、selected row が `drag-target` token と shape で見える。time bar は draggable / resizable に見えない。 |
| light↔dark OS switch | media query の再評価のみ。focus、selection、scroll、pending、Undo availability、domain state、history は同じ。manual toggle / persisted setting がない。 |
| keyboard / screen reader | aria-label、DOM order、composite history focus、state text、delete impact list を変更せず、focus ring は 3:1 以上。 |
| high contrast / grayscale | active / paused / queued / completed / NOW / drag / danger / selected / warning が shape、text、position、border で区別できる。 |
| 200% zoom | semantic colors の text reflow が既存の width / height / action order を壊さない。色だけに依存する情報がない。 |
| reduced motion | theme switch / state change に新しい animation がなく、既存 reduced-motion behavior、focus、status announce が保たれる。 |

## Structural thesis applicability

三つの structural thesis はこの依頼には適用しない。spatial model、primary object、action origin、pending / success / failure / undo、time / history representation が locked されており、dark theme でそれらを変えると visual-only scope を越えるためである。

| Exploration lens | dark-theme で変更しない理由 |
|---|---|
| Spatial model | left timeline / NOW hinge / right current tree / completed pocket が locked。別 pane、card、sidebar、sheet は構造変更になる。 |
| Primary object / action origin | current task row、right-side actions、left history、drag / reparent origin が locked。テーマで action origin を再配置しない。 |
| State/result expression | completion、delete、Undo、pending、error、focus recovery が locked。色だけを変え、state transition や confirmation path を変えない。 |
| Temporal/history representation | lifetime interval、NOW、completed pocket、clip / endpoint semantics が locked。dark token は geometry / semantics に触れない。 |

したがって A/B/C を token 差として発明しない。ユーザーが委任した選択は「同じ構造を OS dark preference で semantic token に写像する一方向」であり、これは token-only の superficial directions を三つ並べるより、scope と受入条件を正確に保つ。

## Anti-template rationale

- Dark theme は generic dashboard の dark surface 化ではない。time-oriented work surface の line / rail / NOW / pocket hierarchy を低輝度面へ移し、primary task row の読みやすさを先に守る。
- 色は state の唯一の carrier ではない。active / paused / queued / completed は既存 label と marker、NOW は rule と label、drag は dashed geometry、delete は impact panel と focus、selected は outline と underlay を併用する。
- Cards、dashboard tiles、dark-only sidebars、new modal、theme toggle は作らない。既存の low-ink row composition、action origin、history surface、OS preference に対して機能的な追加理由がない。
- `accent-soft`、`selected`、`delete-overlay`、`preview-strip` は面積を制限し、強い色を dense rows 全体へ広げない。Originality は neon contrast ではなく既存 time / hierarchy grammar の semantic dark mapping にある。

## Direction selection

- **Selected direction:** Semantic dark token mapping under `prefers-color-scheme: dark`
- **Selection owner:** User delegated implementation / recommendation to Codex。
- **Why it was selected:** Locked structure、interaction、domain、copy を一切変えず、1280 / 760 / dense / delete evidence の hierarchy と contrast を暗色面へ移せる。OS preference に自動追従し、toggle / persistence / reload / state reset を追加しない。
- **Rejected directions:** Spatial alternates、dark-only cards / panels、manual theme toggle、token-only A/B/C variants は scope violation または superficial direction になるため採用しない。
- **Structural decisions now fixed:** no structural change、no DOM change、no copy change、no interaction change、same lifetime / NOW / pocket / tree / drag / reparent / undo / delete / rename / subtasks、semantic token only、OS media query only、existing motion / reduced-motion only。
- **Visual decisions now fixed:** token roles and dark values above、contrast targets、color + non-color carriers、forced-colors mapping、preview / delete / NOW / active / paused semantics。
- **Visual decisions still open:** final rendered contrast adjustment within each semantic role、exact border alpha / stroke width、system control rendering、OS-specific font anti-aliasing。これらは token / CSS metadata の範囲を越えない。
- **Integration questions:** existing source が semantic token hook、`prefers-color-scheme` media query、forced-colors override を受けられるかだけ確認する。DOM、interaction、copy、domain adapter が必要になった場合は dark-theme scope を止め、Capability Change Request とする。
- **Acceptance checks:** token pair contrast、1280 / 760 / dense / delete、hover / selected、active / paused / completed / empty / error / pending、drag / NOW、OS switch、forced-colors、grayscale、200% zoom、keyboard / screen reader、reduced motion を既存 light screenshots と構造比較して確認する。
