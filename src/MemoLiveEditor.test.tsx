import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { MemoLiveEditor } from "./MemoLiveEditor";

beforeAll(() => {
  if (!Range.prototype.getClientRects) {
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  }
});

describe("MemoLiveEditor", () => {
  it("mounts one named contenteditable textbox with source-positioned live decorations", () => {
    render(<MemoLiveEditor value={"# 見出し\n\n**強調** and `code`"} onChange={vi.fn()} />);

    const textbox = screen.getByRole("textbox", { name: "メモ本文" });
    expect(textbox).toHaveAttribute("contenteditable", "true");
    expect(document.querySelectorAll("[role='textbox']")).toHaveLength(1);
    expect(document.querySelector("[data-memo-md-semantic='heading']")).toBeInTheDocument();
    expect(document.querySelector("[data-memo-md-semantic='strong']")).toBeInTheDocument();
    expect(document.querySelector("[data-memo-md-semantic='inline-code']")).toBeInTheDocument();
    expect(document.querySelectorAll(".memo-md-delimiter-concealed").length).toBeGreaterThan(0);
    expect(textbox).toHaveTextContent("# 見出し");
  });

  it("keeps raw HTML and image source literal and inert", () => {
    render(<MemoLiveEditor value={'<script>alert("unsafe")</script> ![image](https://example.test/image.png)'} onChange={vi.fn()} />);

    const textbox = screen.getByRole("textbox", { name: "メモ本文" });
    expect(textbox).toHaveTextContent('<script>alert("unsafe")</script> ![image](https://example.test/image.png)');
    expect(textbox.querySelector("script, img, a")).toBeNull();
    expect(document.querySelector("[data-memo-md-semantic='link']")).toBeNull();
  });

  it("keeps a construct's complete delimiters concealed when the caret enters it", async () => {
    render(<MemoLiveEditor value="前置 **強調**" onChange={vi.fn()} />);
    const textbox = screen.getByRole("textbox", { name: "メモ本文" });
    expect(document.querySelectorAll("[data-memo-md-delimiter='strong'][data-memo-md-disposition='concealed']")).toHaveLength(2);
    const user = userEvent.setup();
    textbox.focus();
    await user.keyboard("{End}");
    expect(document.querySelectorAll("[data-memo-md-delimiter='strong'][data-memo-md-disposition='concealed']")).toHaveLength(2);
    expect(document.querySelectorAll("[data-memo-md-delimiter='strong'][data-memo-md-disposition='exposed']")).toHaveLength(0);
  });

  it("keeps complete delimiters concealed while IME composition is active", async () => {
    render(<MemoLiveEditor value="前置 **強調**" onChange={vi.fn()} />);
    const textbox = screen.getByRole("textbox", { name: "メモ本文" });
    const user = userEvent.setup();

    fireEvent.compositionStart(textbox);
    await user.keyboard("{ArrowLeft}");

    expect(textbox).toHaveAttribute("data-memo-composing", "true");
    expect(document.querySelectorAll("[data-memo-md-delimiter='strong'][data-memo-md-disposition='concealed']")).toHaveLength(2);
    expect(document.querySelectorAll("[data-memo-md-delimiter='strong'][data-memo-md-disposition='exposed']")).toHaveLength(0);
    fireEvent.compositionEnd(textbox);
  });

  it("tracks the OS color scheme in CodeMirror's dark-theme facet", () => {
    let matches = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const originalMatchMedia = window.matchMedia;
    const matchMedia = vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      },
    }) as MediaQueryList);
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });

    try {
      render(<MemoLiveEditor value="" onChange={vi.fn()} autoFocus={false} />);
      const editorElement = document.querySelector<HTMLElement>(".cm-editor");
      expect(editorElement).not.toBeNull();
      const view = EditorView.findFromDOM(editorElement!);
      expect(view).not.toBeNull();
      expect(view!.state.facet(EditorView.darkTheme)).toBe(false);

      matches = true;
      for (const listener of listeners) listener({ matches, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent);

      expect(view!.state.facet(EditorView.darkTheme)).toBe(true);
    } finally {
      Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
    }
  });

  it("reports local edits without requiring a save or a second preview surface", async () => {
    const onChange = vi.fn();
    render(<MemoLiveEditor value="" onChange={onChange} />);
    const textbox = screen.getByRole("textbox", { name: "メモ本文" });

    await userEvent.type(textbox, "draft");

    expect(onChange).toHaveBeenCalled();
    expect(document.querySelectorAll("[role='textbox']")).toHaveLength(1);
  });

  it("keeps editor-local undo separate from the parent draft callback", async () => {
    const onChange = vi.fn();
    render(<MemoLiveEditor value="" onChange={onChange} />);
    const textbox = screen.getByRole("textbox", { name: "メモ本文" });
    const user = userEvent.setup();

    await user.type(textbox, "abc");
    expect(textbox).toHaveValue("abc");
    await user.keyboard("{Control>}z{/Control}");

    expect(textbox).toHaveValue("");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("applies controlled external source changes without remounting the editor", () => {
    const { rerender } = render(<MemoLiveEditor value="before" onChange={vi.fn()} />);
    const editorNode = document.querySelector(".cm-editor");
    const textbox = screen.getByRole("textbox", { name: "メモ本文" });

    rerender(<MemoLiveEditor value="after" onChange={vi.fn()} />);

    expect(document.querySelector(".cm-editor")).toBe(editorNode);
    expect(textbox).toHaveValue("after");
  });
});
