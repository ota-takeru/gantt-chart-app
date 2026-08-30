import { describe, expect, it } from "vitest";
import { projectTaskMemoMarkdown, type MemoLiveProjection, type MemoSourceRange } from "./taskMemoLiveMarkdown";

function rangesOf(projection: MemoLiveProjection, kind: string) {
  return projection.semanticRanges.filter((range) => range.kind === kind);
}

function delimitersOf(projection: MemoLiveProjection, kind: string) {
  return projection.delimiterRanges.filter((range) => range.kind === kind);
}

function sourceForRange(source: string, range: MemoSourceRange): string {
  return source.slice(range.from, range.to);
}

function expectBoundedRanges(projection: MemoLiveProjection): void {
  const sourceLength = projection.source.length;
  for (const range of [...projection.semanticRanges, ...projection.delimiterRanges]) {
    expect(Number.isSafeInteger(range.from)).toBe(true);
    expect(Number.isSafeInteger(range.to)).toBe(true);
    expect(range.from).toBeGreaterThanOrEqual(0);
    expect(range.from).toBeLessThanOrEqual(range.to);
    expect(range.to).toBeLessThanOrEqual(sourceLength);
  }
}

describe("task-memo-live-markdown contract", () => {
  it("S1 projects complete CommonMark and GFM constructs from the exact source", () => {
    const source = [
      "# Heading",
      "",
      "**strong** *emphasis* ~~struck~~",
      "- [x] task",
      "> quote",
      "[link](https://example.test) `inline code`",
      "```ts",
      "const value = 1;",
      "```",
      "| head | value |",
      "| --- | --- |",
      "| cell | 42 |",
    ].join("\n");

    const projection = projectTaskMemoMarkdown(source, []);

    expect(projection.source).toBe(source);
    expect(projection.state).toBe("projected");
    expect(projection.fallback).toBe(false);
    for (const kind of [
      "heading",
      "strong",
      "emphasis",
      "strikethrough",
      "bullet-list",
      "list-item",
      "task",
      "blockquote",
      "link",
      "link-text",
      "inline-code",
      "fenced-code",
      "table",
      "table-header",
      "table-row",
      "table-cell",
    ]) {
      expect(rangesOf(projection, kind)).not.toHaveLength(0);
    }

    expect(delimitersOf(projection, "strong").every((range) => range.disposition === "concealed")).toBe(true);
    expect(delimitersOf(projection, "table").every((range) => range.disposition === "concealed")).toBe(true);
    expectBoundedRanges(projection);

    const changed = projectTaskMemoMarkdown(source.replace("Heading", "Changed"), []);
    expect(changed.source).toContain("# Changed");
    expect(sourceForRange(changed.source, rangesOf(changed, "heading")[0])).toBe("# Changed");
  });

  it("S2 exposes every delimiter for an active construct and conceals unrelated delimiters", () => {
    const source = "**bold🙂** and `code` and [link](https://example.test)";
    const boldContent = source.indexOf("bold");
    const projection = projectTaskMemoMarkdown(source, [{ from: boldContent, to: boldContent }]);

    expect(projection.state).toBe("active-source");
    expect(delimitersOf(projection, "strong")).toEqual([
      { from: 0, to: 2, kind: "strong", disposition: "exposed" },
      { from: source.indexOf("**", boldContent), to: source.indexOf("**", boldContent) + 2, kind: "strong", disposition: "exposed" },
    ]);
    expect(delimitersOf(projection, "inline-code").every((range) => range.disposition === "concealed")).toBe(true);
    expect(delimitersOf(projection, "link").every((range) => range.disposition === "concealed")).toBe(true);
  });

  it("1.1 keeps every complete delimiter concealed under the always-concealed policy", () => {
    const source = "**bold🙂** and `code` and [link](https://example.test)";
    const boldContent = source.indexOf("bold");
    const projection = projectTaskMemoMarkdown(
      source,
      [{ from: boldContent, to: boldContent }],
      { delimiterPolicy: "always-concealed" },
    );

    expect(projection.source).toBe(source);
    expect(projection.state).toBe("projected");
    expect(projection.fallback).toBe(false);
    expect(projection.delimiterRanges.length).toBeGreaterThan(0);
    expect(projection.delimiterRanges.every((range) => range.disposition === "concealed")).toBe(true);
    expect(projection.delimiterRanges.some((range) => range.disposition === "exposed")).toBe(false);
  });

  it("S3 leaves incomplete, unsupported, and raw HTML source untouched and inert", () => {
    const incomplete = projectTaskMemoMarkdown("**unfinished [link](https://example.test", []);
    expect(incomplete.source).toBe("**unfinished [link](https://example.test");
    expect(incomplete.semanticRanges).toEqual([]);
    expect(incomplete.delimiterRanges).toEqual([]);
    expect(incomplete.state).toBe("plain");

    const unsupported = projectTaskMemoMarkdown("---", []);
    expect(unsupported.source).toBe("---");
    expect(unsupported.semanticRanges).toEqual([]);
    expect(unsupported.delimiterRanges).toEqual([]);

    const rawHtml = projectTaskMemoMarkdown('<script>alert("unsafe")</script>', []);
    expect(rawHtml.source).toBe('<script>alert("unsafe")</script>');
    expect(rawHtml.semanticRanges).toEqual([]);
    expect(rawHtml.delimiterRanges).toEqual([]);
    expect(rawHtml.fallback).toBe(false);
  });

  it("S4 preserves Unicode source and UTF-16 offsets while normalizing selections", () => {
    const source = "見出し🙂 **café**\n空白  ";
    const projection = projectTaskMemoMarkdown(source, [
      { from: source.length + 10, to: -5 },
      { from: 3.8, to: 1.2 },
    ]);

    expect(projection.source).toBe(source);
    expect(projection.normalizedSelections).toEqual([
      { from: 0, to: source.length },
      { from: 1, to: 3 },
    ]);
    expect(projection.selections).toBe(projection.normalizedSelections);
    expect(projection.issue).toEqual({ code: "invalid-selection" });
    expectBoundedRanges(projection);
    expect(Array.from(source).length).toBeLessThan(source.length);
  });

  it("keeps empty, exact-limit, and over-limit drafts projectable", () => {
    const empty = projectTaskMemoMarkdown("", [{ from: 9, to: -4 }]);
    expect(empty.source).toBe("");
    expect(empty.state).toBe("plain");
    expect(empty.fallback).toBe(false);
    expect(empty.normalizedSelections).toEqual([{ from: 0, to: 0 }]);

    const exactLimit = "🙂".repeat(4_000);
    const exact = projectTaskMemoMarkdown(exactLimit, []);
    expect(Array.from(exact.source)).toHaveLength(4_000);
    expect(exact.source).toBe(exactLimit);
    expect(exact.fallback).toBe(false);

    const overLimit = `${exactLimit}a`;
    const over = projectTaskMemoMarkdown(overLimit, []);
    expect(Array.from(over.source)).toHaveLength(4_001);
    expect(over.source).toBe(overLimit);
    expect(over.fallback).toBe(false);
    expectBoundedRanges(over);
  });

  it("returns deterministic, ordered ranges without exposing source content in diagnostics", () => {
    const source = "# 見出し\n\n**bold** and `code`";
    const first = projectTaskMemoMarkdown(source, []);
    const second = projectTaskMemoMarkdown(source, []);

    expect(second).toEqual(first);
    expect(first.semanticRanges).toEqual(
      [...first.semanticRanges].sort((left, right) => left.from - right.from || right.to - left.to || left.kind.localeCompare(right.kind)),
    );
    expect(first.delimiterRanges).toEqual(
      [...first.delimiterRanges].sort(
        (left, right) =>
          left.from - right.from ||
          left.to - right.to ||
          left.kind.localeCompare(right.kind) ||
          left.disposition.localeCompare(right.disposition),
      ),
    );
    expect(JSON.stringify(first.issue ?? "")).not.toContain(source);
    expectBoundedRanges(first);
  });
});
