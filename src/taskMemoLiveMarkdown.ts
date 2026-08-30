import { parser, GFM } from "@lezer/markdown";
import type { TreeCursor } from "@lezer/common";

/**
 * A source range measured in UTF-16 code units.
 *
 * JavaScript string offsets and Lezer offsets use UTF-16 code units.  Keeping
 * the range in that coordinate space lets an editor apply decorations without
 * translating Japanese text, emoji, or combining characters first.
 */
export interface MemoSourceRange {
  readonly from: number;
  readonly to: number;
}

/** A caret or selected source range supplied by an editor. */
export interface MemoSelection extends MemoSourceRange {}

/** Presentation roles for complete, supported Markdown constructs. */
export type MemoSemanticKind =
  | "heading"
  | "emphasis"
  | "strong"
  | "strikethrough"
  | "bullet-list"
  | "ordered-list"
  | "list-item"
  | "task"
  | "blockquote"
  | "link"
  | "link-text"
  | "inline-code"
  | "fenced-code"
  | "table"
  | "table-header"
  | "table-row"
  | "table-cell";

/** Markdown punctuation that an editor may conceal for an inactive construct. */
export type MemoDelimiterKind =
  | "heading"
  | "emphasis"
  | "strong"
  | "strikethrough"
  | "list"
  | "task"
  | "blockquote"
  | "link"
  | "inline-code"
  | "fenced-code"
  | "table";

/** A source-positioned semantic presentation range. */
export interface MemoSemanticRange extends MemoSourceRange {
  readonly kind: MemoSemanticKind;
}

/** A source-positioned delimiter and its active/inactive presentation state. */
export interface MemoDelimiterRange extends MemoSourceRange {
  readonly kind: MemoDelimiterKind;
  readonly disposition: "exposed" | "concealed";
}

/**
 * Controls whether complete Markdown delimiters are available as visible
 * editing cues when a selection intersects their construct.
 *
 * `active-exposed` is the 1.0 compatibility behavior and remains the default
 * for callers that do not provide projection options. `always-concealed` is
 * useful for an editor that should read as one rendered surface while still
 * retaining the exact source positions underneath.
 */
export type MemoDelimiterPolicy = "active-exposed" | "always-concealed";

/** Optional projection behavior.  Omitted options preserve 1.0 semantics. */
export interface MemoMarkdownProjectionOptions {
  readonly delimiterPolicy?: MemoDelimiterPolicy;
}

export type MemoProjectionState = "plain" | "projected" | "active-source" | "fallback";

export type MemoProjectionIssueCode = "invalid-selection" | "projection-failure";

/**
 * A privacy-safe diagnostic.  Projection errors never retain parser messages
 * or source text; only the stable code and an optional source position are
 * exposed.
 */
export interface MemoProjectionIssue {
  readonly code: MemoProjectionIssueCode;
  readonly from?: number;
  readonly to?: number;
}

/**
 * The complete UI-neutral result of projecting one task memo.
 *
 * `source` is the exact input string.  The projector never returns rendered
 * HTML or replacement text.  Consumers apply `semanticRanges` and
 * `delimiterRanges` as source decorations and continue to edit `source`.
 * `selections` and `normalizedSelections` contain the same normalized values;
 * the latter is an explicit alias for callers that prefer the contract's
 * terminology.
 */
export interface MemoLiveProjection {
  readonly source: string;
  readonly selections: readonly MemoSelection[];
  readonly normalizedSelections: readonly MemoSelection[];
  readonly semanticRanges: readonly MemoSemanticRange[];
  readonly delimiterRanges: readonly MemoDelimiterRange[];
  readonly state: MemoProjectionState;
  /** True only when parsing or source-positioned projection failed. */
  readonly fallback: boolean;
  readonly issue?: MemoProjectionIssue;
}

interface SyntaxNodeSnapshot {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly children: readonly SyntaxNodeSnapshot[];
}

const liveMarkdownParser = parser.configure(GFM);

function snapshotCursor(cursor: TreeCursor): SyntaxNodeSnapshot {
  const children: SyntaxNodeSnapshot[] = [];
  if (cursor.firstChild()) {
    do {
      children.push(snapshotCursor(cursor));
    } while (cursor.nextSibling());
    cursor.parent();
  }

  return {
    name: cursor.name,
    from: cursor.from,
    to: cursor.to,
    children,
  };
}

function childrenNamed(node: SyntaxNodeSnapshot, name: string): readonly SyntaxNodeSnapshot[] {
  return node.children.filter((child) => child.name === name);
}

function hasChildNamed(node: SyntaxNodeSnapshot, name: string): boolean {
  return node.children.some((child) => child.name === name);
}

function isHeadingName(name: string): boolean {
  return /^ATXHeading[1-6]$/.test(name) || /^SetextHeading[12]$/.test(name);
}

/**
 * Lezer deliberately represents an unfinished construct as an ordinary
 * paragraph in most cases.  A few constructs still have a partial node
 * (notably fences and links), so require the closing evidence here before
 * concealing any punctuation.
 */
function isCompleteSupportedNode(node: SyntaxNodeSnapshot): boolean {
  if (isHeadingName(node.name)) return hasChildNamed(node, "HeaderMark");

  if (node.name === "Emphasis" || node.name === "StrongEmphasis" || node.name === "Strikethrough") {
    const markName = node.name === "Strikethrough" ? "StrikethroughMark" : "EmphasisMark";
    return childrenNamed(node, markName).length >= 2;
  }

  if (node.name === "InlineCode") return childrenNamed(node, "CodeMark").length >= 2;

  if (node.name === "FencedCode") {
    const marks = childrenNamed(node, "CodeMark");
    return marks.length >= 2 && node.children[0]?.name === "CodeMark" && node.children.at(-1)?.name === "CodeMark";
  }

  if (node.name === "Link") {
    // Inline links have at least an opening/closing parenthesis pair.  A
    // reference link has a LinkLabel child instead.  `[label]` alone has two
    // LinkMarks but neither completion signal and remains source text.
    return childrenNamed(node, "LinkMark").length >= 4 || hasChildNamed(node, "LinkLabel");
  }

  if (node.name === "Autolink") return childrenNamed(node, "LinkMark").length >= 2;

  if (node.name === "Blockquote") return hasChildNamed(node, "QuoteMark");
  if (node.name === "ListItem") return hasChildNamed(node, "ListMark");
  if (node.name === "Task") return hasChildNamed(node, "TaskMarker");
  if (node.name === "Table") return hasChildNamed(node, "TableDelimiter");

  // List/table child nodes are only emitted by the parser inside a complete
  // list/table.  They contain source content rather than their own closing
  // marker, so there is no extra completion check to perform.
  return true;
}

function semanticKindFor(node: SyntaxNodeSnapshot): MemoSemanticKind | undefined {
  if (isHeadingName(node.name)) return "heading";

  switch (node.name) {
    case "Emphasis":
      return "emphasis";
    case "StrongEmphasis":
      return "strong";
    case "Strikethrough":
      return "strikethrough";
    case "BulletList":
      return "bullet-list";
    case "OrderedList":
      return "ordered-list";
    case "ListItem":
      return "list-item";
    case "Task":
      return "task";
    case "Blockquote":
      return "blockquote";
    case "Link":
    case "Autolink":
      return "link";
    case "InlineCode":
      return "inline-code";
    case "FencedCode":
      return "fenced-code";
    case "Table":
      return "table";
    case "TableHeader":
      return "table-header";
    case "TableRow":
      return "table-row";
    case "TableCell":
      return "table-cell";
    default:
      return undefined;
  }
}

function isActiveRange(from: number, to: number, selections: readonly MemoSelection[]): boolean {
  return selections.some((selection) => {
    if (selection.from === selection.to) {
      // A caret at either edge belongs to the adjacent construct, which keeps
      // its editing delimiters available while the user is entering/leaving it.
      return selection.from >= from && selection.from <= to;
    }
    return selection.from < to && selection.to > from;
  });
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareSemanticRanges(left: MemoSemanticRange, right: MemoSemanticRange): number {
  return left.from - right.from || right.to - left.to || compareStrings(left.kind, right.kind);
}

function compareDelimiterRanges(left: MemoDelimiterRange, right: MemoDelimiterRange): number {
  return (
    left.from - right.from ||
    left.to - right.to ||
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.disposition, right.disposition)
  );
}

function nearestAncestor(
  ancestors: readonly SyntaxNodeSnapshot[],
  predicate: (node: SyntaxNodeSnapshot) => boolean,
): SyntaxNodeSnapshot | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    if (predicate(ancestors[index])) return ancestors[index];
  }
  return undefined;
}

function delimiterKindFor(
  child: SyntaxNodeSnapshot,
  ancestors: readonly SyntaxNodeSnapshot[],
): { readonly kind: MemoDelimiterKind; readonly construct: SyntaxNodeSnapshot } | undefined {
  switch (child.name) {
    case "HeaderMark": {
      const construct = nearestAncestor(ancestors, (node) => isHeadingName(node.name));
      return construct ? { kind: "heading", construct } : undefined;
    }
    case "EmphasisMark": {
      const construct = nearestAncestor(
        ancestors,
        (node) => node.name === "Emphasis" || node.name === "StrongEmphasis",
      );
      return construct
        ? { kind: construct.name === "StrongEmphasis" ? "strong" : "emphasis", construct }
        : undefined;
    }
    case "StrikethroughMark": {
      const construct = nearestAncestor(ancestors, (node) => node.name === "Strikethrough");
      return construct ? { kind: "strikethrough", construct } : undefined;
    }
    case "ListMark": {
      const construct = nearestAncestor(ancestors, (node) => node.name === "ListItem");
      return construct ? { kind: "list", construct } : undefined;
    }
    case "TaskMarker": {
      const construct = nearestAncestor(ancestors, (node) => node.name === "Task");
      return construct ? { kind: "task", construct } : undefined;
    }
    case "QuoteMark": {
      const construct = nearestAncestor(ancestors, (node) => node.name === "Blockquote");
      return construct ? { kind: "blockquote", construct } : undefined;
    }
    case "LinkMark": {
      const construct = nearestAncestor(ancestors, (node) => node.name === "Link" || node.name === "Autolink");
      return construct ? { kind: "link", construct } : undefined;
    }
    case "CodeMark": {
      const construct = nearestAncestor(ancestors, (node) => node.name === "InlineCode" || node.name === "FencedCode");
      return construct
        ? { kind: construct.name === "FencedCode" ? "fenced-code" : "inline-code", construct }
        : undefined;
    }
    case "TableDelimiter": {
      const construct = nearestAncestor(ancestors, (node) => node.name === "Table");
      return construct ? { kind: "table", construct } : undefined;
    }
    default:
      return undefined;
  }
}

function linkTextRange(node: SyntaxNodeSnapshot): MemoSemanticRange | undefined {
  const marks = childrenNamed(node, "LinkMark");
  if (marks.length < 2) return undefined;

  const from = marks[0].to;
  const to = marks[1].from;
  if (to <= from) return undefined;
  return { from, to, kind: "link-text" };
}

function isValidRange(range: MemoSourceRange, sourceLength: number): boolean {
  return (
    Number.isSafeInteger(range.from) &&
    Number.isSafeInteger(range.to) &&
    range.from >= 0 &&
    range.from <= range.to &&
    range.to <= sourceLength
  );
}

function validateRanges(
  sourceLength: number,
  semanticRanges: readonly MemoSemanticRange[],
  delimiterRanges: readonly MemoDelimiterRange[],
): void {
  for (let index = 0; index < semanticRanges.length; index += 1) {
    const range = semanticRanges[index];
    if (!isValidRange(range, sourceLength)) throw new Error("invalid semantic range");
    if (index > 0 && compareSemanticRanges(semanticRanges[index - 1], range) > 0) {
      throw new Error("unordered semantic ranges");
    }
  }

  for (let index = 0; index < delimiterRanges.length; index += 1) {
    const range = delimiterRanges[index];
    if (!isValidRange(range, sourceLength)) throw new Error("invalid delimiter range");
    if (index > 0 && compareDelimiterRanges(delimiterRanges[index - 1], range) > 0) {
      throw new Error("unordered delimiter ranges");
    }
  }
}

function normalizeOffset(value: unknown, sourceLength: number): { readonly value: number; readonly changed: boolean } {
  if (typeof value !== "number" || !Number.isFinite(value)) return { value: 0, changed: true };
  const integer = Math.trunc(value);
  const clamped = Math.min(sourceLength, Math.max(0, integer));
  return { value: clamped, changed: integer !== value || clamped !== integer };
}

function normalizeSelections(
  sourceLength: number,
  selections: readonly MemoSelection[] | undefined,
): { readonly values: readonly MemoSelection[]; readonly changed: boolean } {
  const values: MemoSelection[] = [];
  let changed = !Array.isArray(selections);

  for (const selection of Array.isArray(selections) ? selections : []) {
    const from = normalizeOffset((selection as Partial<MemoSelection> | undefined)?.from, sourceLength);
    const to = normalizeOffset((selection as Partial<MemoSelection> | undefined)?.to, sourceLength);
    let normalizedFrom = from.value;
    let normalizedTo = to.value;
    let selectionChanged = from.changed || to.changed;

    if (normalizedFrom > normalizedTo) {
      [normalizedFrom, normalizedTo] = [normalizedTo, normalizedFrom];
      selectionChanged = true;
    }

    values.push({ from: normalizedFrom, to: normalizedTo });
    changed ||= selectionChanged;
  }

  return { values, changed };
}

function fallbackProjection(
  source: string,
  selections: readonly MemoSelection[],
  issue: MemoProjectionIssue,
): MemoLiveProjection {
  return {
    source,
    selections,
    normalizedSelections: selections,
    semanticRanges: [],
    delimiterRanges: [],
    state: "fallback",
    fallback: true,
    issue,
  };
}

/**
 * Project exact task-memo Markdown into source-positioned live decorations.
 *
 * The function is pure: it performs no task API calls, persistence, logging,
 * HTML rendering, URL resolution, or resource access.  Unsupported and
 * incomplete syntax is simply omitted from the decoration lists so its exact
 * source remains editable.  If parsing or range projection itself fails, the
 * result contains the exact source with `fallback: true` and no decorations.
 */
export function projectTaskMemoMarkdown(
  source: string,
  selections: readonly MemoSelection[] = [],
  options: MemoMarkdownProjectionOptions = {},
): MemoLiveProjection {
  const normalized = normalizeSelections(source.length, selections);
  // Treat an omitted or malformed runtime option as the compatibility policy.
  // The public type keeps this narrow for TypeScript callers while the
  // fallback protects JavaScript consumers from accidentally changing the
  // existing 1.0 behavior.
  const delimiterPolicy: MemoDelimiterPolicy = options?.delimiterPolicy === "always-concealed"
    ? "always-concealed"
    : "active-exposed";
  const issue: MemoProjectionIssue | undefined = normalized.changed ? { code: "invalid-selection" } : undefined;

  try {
    const tree = liveMarkdownParser.parse(source);
    const root = snapshotCursor(tree.cursor());
    const semanticRanges: MemoSemanticRange[] = [];
    const delimiterRanges: MemoDelimiterRange[] = [];

    const collect = (node: SyntaxNodeSnapshot, ancestors: readonly SyntaxNodeSnapshot[]): void => {
      const path = [...ancestors, node];
      const semanticKind = semanticKindFor(node);
      const complete = semanticKind !== undefined && isCompleteSupportedNode(node);

      if (complete && semanticKind !== undefined) {
        semanticRanges.push({ from: node.from, to: node.to, kind: semanticKind });
        if (node.name === "Link" || node.name === "Autolink") {
          const textRange = linkTextRange(node);
          if (textRange) semanticRanges.push(textRange);
        }
      }

      for (const child of node.children) {
        const delimiter = complete ? delimiterKindFor(child, path) : undefined;
        if (delimiter && isCompleteSupportedNode(delimiter.construct)) {
          delimiterRanges.push({
            from: child.from,
            to: child.to,
            kind: delimiter.kind,
            disposition: delimiterPolicy === "always-concealed"
              ? "concealed"
              : isActiveRange(delimiter.construct.from, delimiter.construct.to, normalized.values)
              ? "exposed"
              : "concealed",
          });
        }
        collect(child, path);
      }
    };

    collect(root, []);
    semanticRanges.sort(compareSemanticRanges);
    delimiterRanges.sort(compareDelimiterRanges);
    validateRanges(source.length, semanticRanges, delimiterRanges);

    const hasExposedDelimiter = delimiterRanges.some((range) => range.disposition === "exposed");
    const state: MemoProjectionState = hasExposedDelimiter
      ? "active-source"
      : semanticRanges.length > 0
        ? "projected"
        : "plain";

    return {
      source,
      selections: normalized.values,
      normalizedSelections: normalized.values,
      semanticRanges,
      delimiterRanges,
      state,
      fallback: false,
      ...(issue ? { issue } : {}),
    };
  } catch {
    return fallbackProjection(source, normalized.values, { code: "projection-failure" });
  }
}
