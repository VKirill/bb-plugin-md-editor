// Right-click menu inside the rich editor. Contents depend on what was clicked:
// selection, table cell, link, image or plain caret. Shift+right-click keeps
// the native menu.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { modKey, t } from "./i18n";
import { cn } from "@/lib/utils";

export type ContextItem =
  | { label: string; hint?: string; danger?: boolean; disabled?: boolean; keepOpen?: boolean; onSelect: () => void }
  | { label: string; children: ContextItem[] }
  | "sep";

export type ContextTarget = { x: number; y: number; link: string | null; image: string | null; selection: { from: number; to: number } };

export type ContextActions = {
  quote: (comment?: string) => void;
  startComment: () => void;
  copyReference: () => void;
  editLink: () => void;
  openLink: (href: string) => void;
  openImage: (src: string) => void;
  insertItems: () => ContextItem[];
};

function selectionMarkdown(editor: Editor): string {
  const { state } = editor;
  const slice = state.selection.content();
  const manager = editor.markdown;
  if (!manager) return state.doc.textBetween(state.selection.from, state.selection.to, "\n");
  return manager.serialize({ type: "doc", content: slice.content.toJSON() ?? [] }).trim();
}

export function currentFragmentMarkdown(editor: Editor): string {
  if (!editor.state.selection.empty) return selectionMarkdown(editor);
  const { $from } = editor.state.selection;
  const depth = $from.depth > 0 ? 1 : 0;
  const node = $from.node(depth);
  const manager = editor.markdown;
  if (!node || !manager) return node?.textContent ?? "";
  return manager.serialize({ type: "doc", content: [node.toJSON()] }).trim();
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t("copied"));
  } catch {
    toast.error(t("copyFailed"));
  }
}

export function buildContextItems(editor: Editor, target: ContextTarget, actions: ContextActions): ContextItem[] {
  const hasSelection = target.selection.from !== target.selection.to;
  const chain = () => editor.chain().focus();
  const inTable = editor.isActive("table");
  const items: ContextItem[] = [
    { label: hasSelection ? t("ctxQuote") : t("ctxQuoteBlock"), onSelect: () => actions.quote() },
    { label: t("ctxComment"), keepOpen: true, onSelect: actions.startComment },
    "sep",
  ];

  if (target.link) {
    items.push(
      { label: t("ctxOpenLink"), onSelect: () => actions.openLink(target.link!) },
      { label: t("ctxCopyLink"), onSelect: () => void copyText(target.link!) },
      { label: t("ctxEditLink"), onSelect: actions.editLink },
      { label: t("ctxRemoveLink"), onSelect: () => chain().extendMarkRange("link").unsetLink().run() },
      "sep",
    );
  }
  if (target.image) {
    items.push(
      { label: t("ctxViewImage"), onSelect: () => actions.openImage(target.image!) },
      { label: t("ctxCopyImagePath"), onSelect: () => void copyText(target.image!) },
      "sep",
    );
  }

  if (hasSelection) {
    items.push(
      { label: t("ctxCut"), hint: modKey("X"), onSelect: () => {
        void copyText(selectionMarkdown(editor)).then(() => editor.chain().focus().deleteSelection().run());
      } },
      { label: t("ctxCopy"), hint: modKey("C"), onSelect: () => void copyText(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n")) },
      { label: t("ctxCopyMarkdown"), onSelect: () => void copyText(selectionMarkdown(editor)) },
    );
  }
  items.push({
    label: t("ctxPaste"),
    hint: modKey("V"),
    onSelect: () => {
      navigator.clipboard.readText().then(
        (text) => chain().insertContent(text, { contentType: "markdown" }).run(),
        () => toast.message(t("ctxPasteHint")),
      );
    },
  });
  if (!hasSelection) items.push({ label: t("ctxSelectAll"), hint: modKey("A"), onSelect: () => chain().selectAll().run() });
  items.push("sep");

  if (hasSelection) {
    items.push({
      label: t("ctxFormat"),
      children: [
        { label: t("bold"), hint: modKey("B"), onSelect: () => chain().toggleBold().run() },
        { label: t("italic"), hint: modKey("I"), onSelect: () => chain().toggleItalic().run() },
        { label: t("strike"), onSelect: () => chain().toggleStrike().run() },
        { label: t("highlight"), onSelect: () => chain().toggleHighlight().run() },
        { label: t("inlineCode"), hint: modKey("E"), onSelect: () => chain().toggleCode().run() },
        { label: t("link"), hint: modKey("K"), onSelect: actions.editLink },
        "sep",
        { label: t("ctxClearFormat"), onSelect: () => chain().unsetAllMarks().run() },
      ],
    });
  }
  items.push({
    label: t("ctxTurnInto"),
    children: [
      { label: t("ctxParagraph"), onSelect: () => chain().setParagraph().run() },
      { label: t("h1"), onSelect: () => chain().setHeading({ level: 1 }).run() },
      { label: t("h2"), onSelect: () => chain().setHeading({ level: 2 }).run() },
      { label: t("h3"), onSelect: () => chain().setHeading({ level: 3 }).run() },
      "sep",
      { label: t("bulletList"), onSelect: () => chain().toggleBulletList().run() },
      { label: t("orderedList"), onSelect: () => chain().toggleOrderedList().run() },
      { label: t("taskList"), onSelect: () => chain().toggleTaskList().run() },
      { label: t("quote"), onSelect: () => chain().toggleBlockquote().run() },
      { label: t("codeBlock"), onSelect: () => chain().toggleCodeBlock().run() },
      "sep",
      ...(["NOTE", "TIP", "WARNING"] as const).map((kind) => ({
        label: `${t("ctxCallout")}: ${kind.charAt(0) + kind.slice(1).toLowerCase()}`,
        onSelect: () => chain().wrapIn("callout", { kind, title: "", fold: "" }).run(),
      })),
    ],
  });
  if (inTable) {
    items.push({
      label: t("table"),
      children: [
        { label: t("ctxRowAbove"), onSelect: () => chain().addRowBefore().run() },
        { label: t("ctxRowBelow"), onSelect: () => chain().addRowAfter().run() },
        { label: t("ctxColLeft"), onSelect: () => chain().addColumnBefore().run() },
        { label: t("ctxColRight"), onSelect: () => chain().addColumnAfter().run() },
        "sep",
        { label: t("deleteRow"), onSelect: () => chain().deleteRow().run() },
        { label: t("deleteColumn"), onSelect: () => chain().deleteColumn().run() },
        { label: t("ctxDeleteTable"), danger: true, onSelect: () => chain().deleteTable().run() },
      ],
    });
  }
  items.push({ label: t("insert"), children: actions.insertItems() });
  items.push("sep", { label: t("ctxCopyReference"), onSelect: actions.copyReference });
  return items;
}

function Flyout({ items, onClose, className, style }: { items: ContextItem[]; onClose: () => void; className?: string; style?: React.CSSProperties }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div className={cn("mdpro-menu mdpro-ctx", className)} style={style} role="menu">
      {items.map((item, index) => {
        if (item === "sep") return <div key={index} className="mdpro-menu-sep" />;
        if ("children" in item) {
          return (
            <div key={index} className="mdpro-ctx-parent" onMouseEnter={() => setOpenIndex(index)} onMouseLeave={() => setOpenIndex((v) => (v === index ? null : v))}>
              <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={openIndex === index} onClick={() => setOpenIndex(index)}>
                <span>{item.label}</span>
                <span className="mdpro-menu-hint">›</span>
              </button>
              {openIndex === index ? <Flyout items={item.children} onClose={onClose} className="mdpro-ctx-sub" /> : null}
            </div>
          );
        }
        return (
          <button
            key={index}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(item.danger && "mdpro-menu-danger")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!item.keepOpen) onClose();
              item.onSelect();
            }}
          >
            <span className="truncate">{item.label}</span>
            {item.hint ? <span className="mdpro-menu-hint">{item.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function EditorContextMenu({ state, editor, actions, onClose }: { state: ContextTarget; editor: Editor; actions: Omit<ContextActions, "startComment">; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const [pos, setPos] = useState({ left: state.x, top: state.y });

  // A right-button mouseup can collapse the selection after the menu opens; restore it.
  const restore = () => {
    const { from, to } = state.selection;
    const max = editor.state.doc.content.size;
    if (from <= max && to <= max) editor.commands.setTextSelection({ from, to });
  };
  useEffect(() => {
    const timer = setTimeout(restore, 0);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ left: Math.max(8, Math.min(state.x, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(state.y, window.innerHeight - rect.height - 8)) });
  }, [state.x, state.y, commenting]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", close, true);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const wrap = (fn: () => void) => () => {
    restore();
    fn();
  };
  const withRestore = (list: ContextItem[]): ContextItem[] =>
    list.map((item) => (item === "sep" ? item : "children" in item ? { ...item, children: withRestore(item.children) } : { ...item, onSelect: wrap(item.onSelect) }));
  const items = withRestore(buildContextItems(editor, state, { ...actions, startComment: () => setCommenting(true) }));

  return (
    <div ref={box} data-bb-ru-skip="" className={cn("mdpro-ctx-root", pos.left + 560 > window.innerWidth && "mdpro-ctx-flip")} style={{ left: pos.left, top: pos.top }}>
      {commenting ? (
        <form
          className="mdpro-menu mdpro-ctx mdpro-ctx-comment"
          onSubmit={(event) => {
            event.preventDefault();
            restore();
            actions.quote(comment);
            onClose();
          }}
        >
          <div className="mdpro-menu-title">{t("ctxCommentTitle")}</div>
          <textarea
            autoFocus
            rows={3}
            value={comment}
            placeholder={t("ctxCommentPlaceholder")}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                restore();
                actions.quote(comment);
                onClose();
              }
            }}
          />
          <div className="mdpro-ctx-comment-actions">
            <span className="mdpro-menu-hint">{t("mathHint")}</span>
            <button type="submit">{t("ctxAddToChat")}</button>
          </div>
        </form>
      ) : (
        <Flyout items={items} onClose={onClose} />
      )}
    </div>
  );
}
