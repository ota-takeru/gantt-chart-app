import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorSelection, EditorState, StateEffect, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { useEffect, useLayoutEffect, useRef, type ReactElement } from "react";
import { projectTaskMemoMarkdown, type MemoLiveProjection, type MemoSelection } from "./taskMemoLiveMarkdown";

export type MemoLiveEditorProps = {
  /** The exact source string currently owned by the memo draft. */
  value: string;
  /** Prevent local edits while a task-memo operation is pending. */
  disabled?: boolean;
  /** Called for local document changes only. */
  onChange: (value: string) => void;
  /** Notify the dialog boundary so commands cannot consume IME text. */
  onCompositionChange?: (composing: boolean) => void;
  /** Focus the same editor instance when it is first mounted. */
  autoFocus?: boolean;
};

type ValueElement = HTMLElement & { value?: string };

const semanticDecorationCache = new Map<string, ReturnType<typeof Decoration.mark>>();
const delimiterDecorationCache = new Map<string, ReturnType<typeof Decoration.mark>>();
const refreshProjectionEffect = StateEffect.define<null>();

function selectionRanges(view: EditorView): MemoSelection[] {
  return view.state.selection.ranges.map((range) => ({ from: range.from, to: range.to }));
}

function semanticDecoration(kind: string): ReturnType<typeof Decoration.mark> {
  const cached = semanticDecorationCache.get(kind);
  if (cached) return cached;
  const decoration = Decoration.mark({
    class: `memo-md-semantic memo-md-semantic-${kind}`,
    attributes: { "data-memo-md-semantic": kind },
  });
  semanticDecorationCache.set(kind, decoration);
  return decoration;
}

function delimiterDecoration(kind: string, disposition: "exposed" | "concealed"): ReturnType<typeof Decoration.mark> {
  const cacheKey = `${kind}:${disposition}`;
  const cached = delimiterDecorationCache.get(cacheKey);
  if (cached) return cached;
  const decoration = Decoration.mark({
    class: `memo-md-delimiter memo-md-delimiter-${kind} memo-md-delimiter-${disposition}`,
    attributes: {
      "data-memo-md-delimiter": kind,
      "data-memo-md-disposition": disposition,
    },
  });
  delimiterDecorationCache.set(cacheKey, decoration);
  return decoration;
}

function decorationsForProjection(projection: MemoLiveProjection): DecorationSet {
  const ranges: Array<{ from: number; to: number; value: ReturnType<typeof Decoration.mark> }> = [];
  for (const range of projection.semanticRanges) {
    if (range.to > range.from) ranges.push({ from: range.from, to: range.to, value: semanticDecoration(range.kind) });
  }
  for (const range of projection.delimiterRanges) {
    if (range.to > range.from) ranges.push({ from: range.from, to: range.to, value: delimiterDecoration(range.kind, range.disposition) });
  }
  return Decoration.set(ranges, true);
}

function projectionForView(view: EditorView): MemoLiveProjection {
  // Keep the 1.1 policy in force during composition.  IME safety is provided
  // by the composition event handlers and deferred external synchronization
  // below; projection never mutates or replaces the composition's source.
  return projectTaskMemoMarkdown(view.state.doc.toString(), selectionRanges(view), {
    delimiterPolicy: "always-concealed",
  });
}

function exposeProjectionMetadata(view: EditorView, projection: MemoLiveProjection): void {
  view.dom.dataset.memoProjectionState = projection.state;
  view.dom.dataset.memoProjectionFallback = projection.fallback ? "true" : "false";
}

function setCompatibilityValue(element: ValueElement, value: string): void {
  // CodeMirror intentionally uses a contenteditable div rather than a form
  // control. Keeping a non-visual value mirror makes controlled-form tooling
  // and the existing task tests able to inspect the exact source without
  // creating a second textbox or changing the editor's editing model.
  if (!Object.getOwnPropertyDescriptor(element, "value")?.set) {
    let current = value;
    Object.defineProperty(element, "value", {
      configurable: true,
      enumerable: false,
      get: () => current,
      set: (next: unknown) => { current = String(next); },
    });
  }
  element.value = value;
}

function setCompositionMetadata(view: EditorView, composing: boolean): void {
  const value = composing ? "true" : "false";
  view.dom.dataset.memoComposing = value;
  view.contentDOM.dataset.memoComposing = value;
}

function syncExternalValue(view: EditorView, value: string, suppressChangeRef: { current: boolean }): void {
  const current = view.state.doc.toString();
  if (current === value || view.composing || view.compositionStarted) return;

  const main = view.state.selection.main;
  const anchor = Math.min(value.length, main.anchor);
  const head = Math.min(value.length, main.head);
  suppressChangeRef.current = true;
  try {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: EditorSelection.single(anchor, head),
    });
  } finally {
    suppressChangeRef.current = false;
  }
}

function memoTheme(dark: boolean): Extension {
  return EditorView.theme({
    "&": {
      height: "100%",
      color: "var(--ink)",
      backgroundColor: "var(--surface)",
    },
    ".cm-scroller": {
      overflow: "auto",
      overscrollBehavior: "contain",
      fontFamily: "inherit",
      lineHeight: "1.55",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "9px 10px",
      caretColor: "var(--ink)",
      fontSize: "13px",
    },
    ".cm-scroller, .cm-content": {
      color: "var(--ink)",
      backgroundColor: "var(--surface)",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-focused": {
      outline: "none",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--ink)",
    },
    ".memo-md-semantic-heading": {
      fontWeight: "800",
      fontSize: "1.12em",
    },
    ".memo-md-semantic-strong": {
      fontWeight: "800",
    },
    ".memo-md-semantic-emphasis": {
      fontStyle: "italic",
    },
    ".memo-md-semantic-strikethrough": {
      textDecoration: "line-through",
    },
    ".memo-md-semantic-bullet-list, .memo-md-semantic-ordered-list, .memo-md-semantic-list-item, .memo-md-semantic-task": {
      fontWeight: "600",
    },
    ".memo-md-semantic-blockquote": {
      borderLeft: "3px solid var(--line)",
      paddingLeft: "8px",
      color: "var(--muted)",
    },
    ".memo-md-semantic-link, .memo-md-semantic-link-text": {
      color: "var(--accent)",
      textDecoration: "underline",
      textDecorationThickness: "1px",
    },
    ".memo-md-semantic-inline-code, .memo-md-semantic-fenced-code": {
      fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      backgroundColor: "var(--soft)",
      borderRadius: "2px",
    },
    ".memo-md-semantic-inline-code": {
      padding: "0 2px",
    },
    ".memo-md-semantic-fenced-code": {
      display: "inline-block",
      minWidth: "100%",
      padding: "1px 4px",
    },
    ".memo-md-semantic-table-cell": {
      borderBottom: "1px solid var(--line)",
    },
    ".memo-md-semantic-table-header": {
      fontWeight: "800",
    },
    ".memo-md-semantic-table-row": {
      borderBottom: "1px solid var(--line)",
    },
    ".memo-md-semantic-table": {
      textDecoration: "underline",
      textDecorationColor: "var(--line)",
      textDecorationThickness: "1px",
    },
    ".memo-md-delimiter-concealed": {
      color: "transparent",
      textShadow: "none",
      userSelect: "text",
    },
    ".memo-md-delimiter-exposed": {
      color: "inherit",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "var(--focus-soft)",
    },
  }, { dark });
}

type ProjectionPluginValue = {
  decorations: DecorationSet;
  projection: MemoLiveProjection;
};

function projectionPlugin(): Extension {
  return ViewPlugin.fromClass(class implements ProjectionPluginValue {
    decorations: DecorationSet;
    projection: MemoLiveProjection;

    constructor(view: EditorView) {
      this.projection = projectionForView(view);
      this.decorations = decorationsForProjection(this.projection);
      exposeProjectionMetadata(view, this.projection);
    }

    update(update: ViewUpdate): void {
      const projectionRefreshRequested = update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(refreshProjectionEffect)));
      if (!update.docChanged && !update.selectionSet && !projectionRefreshRequested) return;
      this.projection = projectionForView(update.view);
      this.decorations = decorationsForProjection(this.projection);
      exposeProjectionMetadata(update.view, this.projection);
    }
  }, { decorations: (value) => value.decorations });
}

export function MemoLiveEditor({ value, disabled = false, onChange, onCompositionChange, autoFocus = true }: MemoLiveEditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartmentRef = useRef(new Compartment());
  const themeCompartmentRef = useRef(new Compartment());
  const suppressChangeRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onCompositionChangeRef = useRef(onCompositionChange);
  const deferredExternalValueRef = useRef<string | null>(null);
  onChangeRef.current = onChange;
  onCompositionChangeRef.current = onCompositionChange;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const colorSchemeMedia = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          projectionPlugin(),
          markdown({ base: markdownLanguage, completeHTMLTags: false, pasteURLAsLink: false }),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...markdownKeymap]),
          EditorView.lineWrapping,
          themeCompartmentRef.current.of(memoTheme(colorSchemeMedia?.matches === true)),
          editableCompartmentRef.current.of([
            EditorView.editable.of(!disabled),
            EditorView.contentAttributes.of({
              role: "textbox",
              "aria-label": "メモ本文",
              "aria-multiline": "true",
              "aria-disabled": disabled ? "true" : "false",
              autocomplete: "off",
              spellcheck: "false",
            }),
          ]),
          EditorView.updateListener.of((update) => {
            const source = update.state.doc.toString();
            setCompatibilityValue(update.view.contentDOM as ValueElement, source);
            if (update.docChanged && !suppressChangeRef.current) onChangeRef.current(source);
            if (update.docChanged && !update.view.composing && deferredExternalValueRef.current === source) {
              deferredExternalValueRef.current = null;
            }
          }),
          EditorView.domEventHandlers({
            compositionstart(_event, currentView) {
              setCompositionMetadata(currentView, true);
              onCompositionChangeRef.current?.(true);
              return false;
            },
            change(event, currentView) {
              // Contenteditable editors do not normally emit a useful change
              // event, but accepting one keeps external form/test adapters
              // compatible without adding a hidden duplicate control.
              const target = event.target as ValueElement | null;
              const next = target?.value;
              if (typeof next !== "string" || next === currentView.state.doc.toString()) return false;
              const main = currentView.state.selection.main;
              const anchor = Math.min(next.length, main.anchor);
              const head = Math.min(next.length, main.head);
              currentView.dispatch({
                changes: { from: 0, to: currentView.state.doc.length, insert: next },
                selection: EditorSelection.single(anchor, head),
              });
              return true;
            },
            compositionend(_event, currentView) {
              setCompositionMetadata(currentView, false);
              onCompositionChangeRef.current?.(false);
              queueMicrotask(() => {
                if (!currentView.composing && !currentView.compositionStarted) {
                  currentView.dispatch({ effects: refreshProjectionEffect.of(null) });
                  const deferred = deferredExternalValueRef.current;
                  if (deferred !== null) {
                    deferredExternalValueRef.current = null;
                    syncExternalValue(currentView, deferred, suppressChangeRef);
                  }
                }
              });
              return false;
            },
          }),
        ],
      }),
      parent: host,
    });
    viewRef.current = view;
    setCompositionMetadata(view, false);
    setCompatibilityValue(view.contentDOM as ValueElement, value);
    if (autoFocus) view.focus();

    let removeColorSchemeListener: (() => void) | undefined;
    if (colorSchemeMedia) {
      const onColorSchemeChange = (event: MediaQueryListEvent): void => {
        view.dispatch({
          effects: themeCompartmentRef.current.reconfigure(memoTheme(event.matches)),
        });
      };
      if (typeof colorSchemeMedia.addEventListener === "function") {
        colorSchemeMedia.addEventListener("change", onColorSchemeChange);
        removeColorSchemeListener = () => colorSchemeMedia.removeEventListener("change", onColorSchemeChange);
      } else if (typeof colorSchemeMedia.addListener === "function") {
        colorSchemeMedia.addListener(onColorSchemeChange);
        removeColorSchemeListener = () => colorSchemeMedia.removeListener(onColorSchemeChange);
      }
    }

    return () => {
      removeColorSchemeListener?.();
      viewRef.current = null;
      view.destroy();
    };
    // The editor is deliberately mounted once. Changes to value, disabled,
    // and callbacks are synchronized below without replacing this instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.composing || view.compositionStarted) {
      deferredExternalValueRef.current = value;
      return;
    }
    syncExternalValue(view, value, suppressChangeRef);
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure([
        EditorView.editable.of(!disabled),
        EditorView.contentAttributes.of({
          role: "textbox",
          "aria-label": "メモ本文",
          "aria-multiline": "true",
          "aria-disabled": disabled ? "true" : "false",
          autocomplete: "off",
          spellcheck: "false",
        }),
      ]),
    });
  }, [disabled]);

  return <div className="memo-live-editor" data-memo-live-editor="true">
    <span className="memo-textarea-label" aria-hidden="true">メモ本文</span>
    <div ref={hostRef} className="memo-live-editor-host" />
  </div>;
}
