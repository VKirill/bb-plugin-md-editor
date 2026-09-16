// CodeMirror 6 Markdown source editor themed from BB's CSS variables.
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting, bracketMatching } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "transparent", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)", lineHeight: "1.6" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0 16px 0 8px" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--muted-foreground)", opacity: "0.6" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--accent) 45%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--primary) 25%, transparent) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-panels": { backgroundColor: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)" },
  ".cm-panel input, .cm-panel button": { fontSize: "12px" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklab, #f59e0b 30%, transparent)" },
});

const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "700", fontSize: "1.15em" },
  { tag: tags.heading2, fontWeight: "700", fontSize: "1.08em" },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--primary)", textDecoration: "underline" },
  { tag: tags.monospace, color: "color-mix(in oklab, var(--primary) 70%, var(--foreground))" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: "var(--muted-foreground)" },
  { tag: tags.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--muted-foreground)" },
]);

export type EditorHandle = { view: EditorView | null };

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  handle,
  language = "markdown",
  gutter = true,
}: {
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  handle: EditorHandle;
  language?: "markdown" | "yaml";
  gutter?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          ...(gutter ? [lineNumbers()] : []),
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          search({ top: true }),
          EditorView.lineWrapping,
          language === "yaml" ? yaml() : markdown(),
          syntaxHighlighting(highlight),
          theme,
          keymap.of([
            { key: "Mod-s", preventDefault: true, run: () => (callbacks.current.onSave(), true) },
            indentWithTab,
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    handle.view = view;
    return () => {
      handle.view = null;
      view.destroy();
    };
    // Created once; external replacements go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = handle.view;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value, handle]);

  return <div ref={host} className={gutter ? "h-full min-h-0 overflow-hidden" : "min-h-0"} />;
}

export function revealLines(view: EditorView, startLine: number, endLine: number) {
  const doc = view.state.doc;
  const from = doc.line(Math.min(Math.max(1, startLine), doc.lines)).from;
  const to = doc.line(Math.min(Math.max(1, endLine), doc.lines)).to;
  view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
  view.focus();
}
