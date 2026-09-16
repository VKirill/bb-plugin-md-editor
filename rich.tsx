// Rich Markdown editor (Tiptap): formatted text edited in place, a style
// toolbar, Mermaid diagrams, KaTeX math, GFM tables and task lists.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState } from "@tiptap/react";
import type { Editor, ReactNodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import Highlight from "@tiptap/extension-highlight";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import { toast } from "sonner";
import { Emoji, FootnoteDef, FootnoteRef, Kbd, RawHtmlInline, RichBlockMath, RichInlineMath, Subscript, Superscript, installMinimalEscaping } from "./md-extensions";
import { CALLOUT_MENU, CalloutWithView, DetailsWithView, RawHtmlWithView } from "./views";
import { AgentDecorations } from "./decorations";
import { EditorContextMenu, currentFragmentMarkdown, type ContextItem, type ContextTarget } from "./context-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowTurnBackwardIcon,
  ArrowTurnForwardIcon,
  CheckListIcon,
  CodeIcon,
  CodeSquareIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  MinusSignIcon,
  QuoteDownIcon,
  GridTableIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
} from "@hugeicons/core-free-icons";
import { File01Icon, Folder01Icon, ZoomInIcon } from "@hugeicons/core-free-icons";
import { DiagramZoom } from "./diagram-zoom";
import { cn } from "@/lib/utils";
import { SHAPES, addAfter, addNode, deleteNode, isFlowchart, labelOf, nodeIdFromSvg, renameNode, reshapeNode, type Shape } from "./mermaid-edit";
import { looksLikeTree, parseTree } from "./tree";
import { t, type I18nKey } from "./i18n";

// ---------------------------------------------------------------- code

installMinimalEscaping(MarkdownManager as any);

const lowlight = createLowlight(common);

function detectLanguage(code: string): string | null {
  if (code.trim().length < 12) return null;
  try {
    const result = lowlight.highlightAuto(code);
    return (result.data?.language as string | undefined) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- mermaid

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
let mermaidSeq = 0;
function loadMermaid() {
  mermaidReady ??= import("mermaid").then((module) => module.default);
  return mermaidReady;
}
function isDark() {
  return document.documentElement.classList.contains("dark");
}

type MenuState = { x: number; y: number; nodeId: string | null; editing: boolean } | null;

function MermaidDiagram({ code, onChange }: { code: string; onChange: ((next: string) => void) | null }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const editable = onChange !== null && isFlowchart(code);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: isDark() ? "dark" : "default" });
        const { svg: rendered } = await mermaid.render(`mdpro-mermaid-${++mermaidSeq}`, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message.split("\n")[0] : String(cause));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.type === "mousedown" && (event.target as Element).closest?.(".mdpro-menu")) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const openMenu = (event: React.MouseEvent, editing = false) => {
    if (!editable || !box.current) return;
    event.preventDefault();
    event.stopPropagation();
    const group = (event.target as Element).closest("g.node");
    const nodeId = group ? nodeIdFromSvg(group) : null;
    const rect = box.current.getBoundingClientRect();
    setDraft(nodeId ? labelOf(code, nodeId) : "");
    setMenu({ x: Math.min(event.clientX - rect.left, rect.width - 220), y: event.clientY - rect.top, nodeId, editing: editing && nodeId !== null });
  };
  const apply = (next: string) => {
    onChange?.(next);
    setMenu(null);
  };

  return (
    <div ref={box} className="relative">
      {error ? (
        <div className="mdpro-diagram-error">{t("mermaidError")}: {error}</div>
      ) : !svg ? (
        <div className="mdpro-diagram-loading">{t("drawing")}</div>
      ) : (
        <div
          className={cn("mdpro-diagram", editable && "mdpro-diagram-editable")}
          onContextMenu={(event) => openMenu(event)}
          onDoubleClick={(event) => openMenu(event, true)}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {editable && svg && !error ? <div className="mdpro-diagram-hint">{t("diagramHint")}</div> : null}
      {menu ? (
        <div className="mdpro-menu" style={{ left: Math.max(4, menu.x), top: menu.y }} role="menu">
          {menu.nodeId && menu.editing ? (
            <form
              className="mdpro-menu-form"
              onSubmit={(event) => {
                event.preventDefault();
                apply(renameNode(code, menu.nodeId!, draft));
              }}
            >
              <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={t("blockText")} />
              <button type="submit">OK</button>
            </form>
          ) : null}
          {menu.nodeId ? (
            <>
              <div className="mdpro-menu-title">{t("block")} «{labelOf(code, menu.nodeId)}»</div>
              {!menu.editing ? <button role="menuitem" onClick={() => setMenu({ ...menu, editing: true })}>{t("editText")}</button> : null}
              <button role="menuitem" onClick={() => apply(addAfter(code, menu.nodeId!, t("newBlock")).code)}>{t("addAfter")}</button>
              <button role="menuitem" onClick={() => apply(addAfter(code, menu.nodeId!, t("condition"), "diamond").code)}>{t("addConditionAfter")}</button>
              <button role="menuitem" onClick={() => apply(addAfter(addAfter(code, menu.nodeId!, t("yes"), "rect", t("edgeYes")).code, menu.nodeId!, t("no"), "rect", t("edgeNo")).code)}>{t("addYesNo")}</button>
              <div className="mdpro-menu-sep" />
              <div className="mdpro-menu-title">{t("shape")}</div>
              <div className="mdpro-menu-grid">
                {SHAPES.map((shape) => (
                  <button key={shape.id} role="menuitem" onClick={() => apply(reshapeNode(code, menu.nodeId!, shape.id as Shape))}>{t(`shape.${shape.id}` as I18nKey)}</button>
                ))}
              </div>
              <div className="mdpro-menu-sep" />
              <button role="menuitem" className="mdpro-menu-danger" onClick={() => apply(deleteNode(code, menu.nodeId!))}>{t("deleteBlock")}</button>
            </>
          ) : (
            <>
              <button role="menuitem" onClick={() => apply(addNode(code, t("newBlock")).code)}>{t("addBlock")}</button>
              <button role="menuitem" onClick={() => apply(addNode(code, t("condition"), "diamond").code)}>{t("addCondition")}</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TreeView({ code }: { code: string }) {
  const nodes = useMemo(() => parseTree(code), [code]);
  return (
    <div className="mdpro-tree" role="tree">
      {nodes.map((node, index) => (
        <div key={index} role="treeitem" className="mdpro-tree-row" style={{ paddingLeft: `${node.depth * 20 + 12}px` }}>
          {Array.from({ length: node.depth }, (_, level) => (
            <span key={level} aria-hidden className="mdpro-tree-guide" style={{ left: `${level * 20 + 19}px` }} />
          ))}
          <HugeiconsIcon icon={node.folder ? Folder01Icon : File01Icon} size={15} strokeWidth={1.8} className={node.folder ? "mdpro-tree-folder" : "mdpro-tree-file"} />
          <span className={cn("mdpro-tree-name", node.folder && "font-semibold")}>{node.name}{node.folder ? "/" : ""}</span>
          {node.comment ? <span className="mdpro-tree-comment">{node.comment}</span> : null}
        </div>
      ))}
    </div>
  );
}

const COLLAPSE_LINES = 24;

function CodeBlockView({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const lower = language.toLowerCase();
  const mermaid = lower === "mermaid";
  const tree = lower === "tree" || (language === "" && looksLikeTree(node.textContent));
  const visual = mermaid || tree;
  const [editing, setEditing] = useState(!visual || node.textContent.trim() === "");
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoomSvg, setZoomSvg] = useState<SVGSVGElement | null>(null);
  const diagramBox = useRef<HTMLDivElement>(null);
  const detected = useMemo(() => (language || visual ? null : detectLanguage(node.textContent)), [language, visual, node.textContent]);
  const effective = lower || detected || "";
  const lineCount = node.textContent.split("\n").length;
  const collapsible = !visual && lineCount > COLLAPSE_LINES;
  const jsonPretty = useMemo(() => {
    if (effective !== "json") return null;
    try {
      const pretty = JSON.stringify(JSON.parse(node.textContent), null, 2);
      return pretty === node.textContent ? null : pretty;
    } catch {
      return null;
    }
  }, [effective, node.textContent]);

  const setCode = (next: string) => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return;
    editor
      .chain()
      .command(({ tr, state }) => {
        tr.replaceWith(pos + 1, pos + 1 + node.content.size, next ? state.schema.text(next) : []);
        return true;
      })
      .run();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <NodeViewWrapper className={cn("mdpro-code", visual && "mdpro-code-mermaid", effective === "diff" && "mdpro-code-diff")}>
      <div className="mdpro-code-bar" contentEditable={false}>
        <input
          className="mdpro-code-lang"
          value={language}
          placeholder={tree ? t("treeAuto") : detected ? `${detected} · ${t("auto")}` : t("language")}
          aria-label={t("codeLanguage")}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ language: event.target.value || null })}
        />
        <span className="mdpro-code-actions">
          {jsonPretty && editor.isEditable ? (
            <button type="button" className="mdpro-chip" onClick={() => setCode(jsonPretty)}>{t("formatJson")}</button>
          ) : null}
          {mermaid ? (
            <button
              type="button"
              className="mdpro-chip mdpro-chip-icon"
              data-tip={t("zoomDiagram")}
              aria-label={t("zoomDiagram")}
              onClick={() => setZoomSvg(diagramBox.current?.querySelector<SVGSVGElement>(".mdpro-diagram svg") ?? null)}
            >
              <HugeiconsIcon icon={ZoomInIcon} size={15} strokeWidth={1.8} />
            </button>
          ) : null}
          {visual ? (
            <button type="button" className="mdpro-chip" onClick={() => setEditing((v) => !v)}>
              {editing ? t("hideCode") : t("editCode")}
            </button>
          ) : null}
          <button type="button" className="mdpro-chip" onClick={() => void copy()}>{copied ? t("copied") : t("copy")}</button>
        </span>
      </div>
      {mermaid ? (
        <div ref={diagramBox} contentEditable={false}>
          <MermaidDiagram code={node.textContent} onChange={editor.isEditable ? setCode : null} />
          {zoomSvg ? <DiagramZoom source={zoomSvg} onClose={() => setZoomSvg(null)} /> : null}
        </div>
      ) : null}
      {tree ? (
        <div contentEditable={false}>
          <TreeView code={node.textContent} />
        </div>
      ) : null}
      <pre spellCheck={false} className={cn(visual && !editing && "mdpro-hidden", collapsible && !expanded && "mdpro-code-collapsed")}>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {collapsible ? (
        <button type="button" className="mdpro-code-expand" contentEditable={false} onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("collapse") : t("showAllLines").replace("{n}", String(lineCount))}
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}

const RichCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight, defaultLanguage: null });

// ---------------------------------------------------------------- images

export type AssetResolver = (src: string) => string;

function openLightbox(src: string, alt: string) {
  const overlay = document.createElement("div");
  overlay.className = "mdpro-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", alt || "Image");
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  overlay.appendChild(img);
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
}

function imageExtension(resolve: { current: AssetResolver }) {
  return Image.extend({
    addNodeView() {
      return ({ node }) => {
        const img = document.createElement("img");
        let current = node;
        const apply = (n: typeof node) => {
          current = n;
          img.src = resolve.current(String(n.attrs.src ?? ""));
          img.alt = String(n.attrs.alt ?? "");
          if (n.attrs.title) img.title = String(n.attrs.title);
        };
        img.addEventListener("dblclick", () => openLightbox(img.src, String(current.attrs.alt ?? "")));
        img.addEventListener("click", (event) => {
          if (event.metaKey || event.ctrlKey) openLightbox(img.src, String(current.attrs.alt ?? ""));
        });
        img.addEventListener("error", () => img.classList.add("mdpro-img-broken"));
        apply(node);
        return {
          dom: img,
          update: (updated) => {
            if (updated.type !== node.type) return false;
            apply(updated);
            return true;
          },
        };
      };
    },
  }).configure({ inline: true, allowBase64: true });
}

// ---------------------------------------------------------------- navigation helpers

export type Heading = { level: number; text: string; pos: number };

export function headingsOf(editor: Editor): Heading[] {
  const list: Heading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") list.push({ level: Number(node.attrs.level), text: node.textContent, pos });
    return node.type.name !== "heading";
  });
  return list;
}

function flash(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos);
  const element = dom instanceof HTMLElement ? dom : (dom?.parentElement ?? null);
  if (!element) return;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  element.classList.remove("mdpro-flash");
  void element.offsetWidth;
  element.classList.add("mdpro-flash");
  setTimeout(() => element.classList.remove("mdpro-flash"), 2200);
}

export function scrollToPos(editor: Editor, pos: number) {
  flash(editor, pos);
  editor.commands.setTextSelection(Math.min(pos + 1, editor.state.doc.content.size));
}

/** Finds the block showing Markdown source line `line` (1-based) and scrolls to it. */
export function revealSourceLine(editor: Editor, source: string, line: number): boolean {
  const lines = source.split("\n");
  for (let index = Math.max(0, line - 1); index < Math.min(lines.length, line + 5); index += 1) {
    const snippet = lines[index]
      .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*(?:\[![A-Za-z]+\][+-]?\s*)?|\|)/, "")
      .replace(/[*_`~|[\]]/g, "")
      .replace(/\(([^)]*)\)/g, "")
      .trim()
      .slice(0, 40);
    if (snippet.length < 3) continue;
    let found = -1;
    editor.state.doc.descendants((node, pos) => {
      if (found !== -1) return false;
      if (node.isTextblock && node.textContent.includes(snippet)) {
        found = pos;
        return false;
      }
      return true;
    });
    if (found !== -1) {
      scrollToPos(editor, found);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- editor

export type RichEditorProps = {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  onReady: (editor: Editor, normalized: string) => void;
  onLink: (href: string, event: MouseEvent) => boolean;
  onThread: (threadId: string) => void;
  /** Quote Markdown into the chat composer; `ratio` is the fragment position in the doc (0..1). */
  onQuote: (markdown: string, comment: string | undefined, ratio: number) => void;
  onReference: (markdown: string, ratio: number) => void;
  onEditMath: (latex: string, apply: (latex: string) => void) => void;
  onEditLink: (href: string, apply: (href: string | null) => void) => void;
  resolveAsset: { current: AssetResolver };
  toolbarEnd?: ReactNode;
};

export function RichMarkdownEditor(props: RichEditorProps) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const [menu, setMenu] = useState<ContextTarget | null>(null);
  const savedSelection = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    contentType: "markdown",
    content: props.initialMarkdown,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, enableClickSelection: false },
      }),
      RichCodeBlock,
      imageExtension(props.resolveAsset),
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      RichInlineMath.configure({
        katexOptions: { throwOnError: false, output: "mathml" },
        onClick: (node, pos) =>
          callbacks.current.onEditMath(String(node.attrs.latex ?? ""), (latex) =>
            editor?.chain().setNodeSelection(pos).updateInlineMath({ latex }).focus().run(),
          ),
      }),
      RichBlockMath.configure({
        katexOptions: { throwOnError: false, output: "mathml", displayMode: true },
        onClick: (node, pos) =>
          callbacks.current.onEditMath(String(node.attrs.latex ?? ""), (latex) =>
            editor?.chain().setNodeSelection(pos).updateBlockMath({ latex }).focus().run(),
          ),
      }),
      RawHtmlInline,
      RawHtmlWithView,
      Emoji,
      FootnoteRef,
      Subscript,
      Superscript,
      Kbd,
      FootnoteDef,
      DetailsWithView,
      CalloutWithView,
      AgentDecorations,
      Placeholder.configure({ placeholder: t("placeholder") }),
      Markdown.configure({ markedOptions: { gfm: true } }),
    ],
    editorProps: {
      attributes: { class: "mdpro-prose", spellcheck: "true" },
      handleDOMEvents: {
        mousedown: (view, event) => {
          // Remember the selection before a right-click can collapse it.
          if (event.button === 2) {
            const { from, to, empty } = view.state.selection;
            savedSelection.current = empty ? null : { from, to };
          }
          return false;
        },
        contextmenu: (view, event) => {
          if (event.shiftKey) return false;
          event.preventDefault();
          const target = event.target as Element | null;
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const saved = savedSelection.current;
          savedSelection.current = null;
          if (saved && coords && coords.pos >= saved.from && coords.pos <= saved.to) {
            editor?.commands.setTextSelection(saved);
          } else if (coords) {
            const { from, to, empty } = view.state.selection;
            if (empty || coords.pos < from || coords.pos > to) editor?.commands.setTextSelection(coords.pos);
          }
          const selection = view.state.selection;
          setMenu({
            x: event.clientX,
            y: event.clientY,
            selection: { from: selection.from, to: selection.to },
            link: target?.closest?.("a[href]")?.getAttribute("href") ?? null,
            image: (target instanceof HTMLImageElement ? target.src : null),
          });
          return true;
        },
        click: (view, event) => {
          const target = event.target as Element | null;
          const ref = target?.closest?.("[data-footnote-ref]");
          if (ref) {
            const id = ref.getAttribute("data-footnote-ref");
            view.dom.querySelector(`[data-footnote-def="${CSS.escape(id ?? "")}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
            return true;
          }
          const thread = target?.closest?.("[data-thread]");
          if (thread && !event.altKey) {
            callbacks.current.onThread(thread.getAttribute("data-thread") ?? "");
            return true;
          }
          const task = target?.closest?.("[data-task]");
          if (task && !event.altKey) {
            const key = task.getAttribute("data-task") ?? "";
            if (event.metaKey || event.ctrlKey) {
              void navigator.clipboard.writeText(key).then(() => toast.success(t("copied")));
            } else {
              // Tasks has no SDK navigation for other plugins; its route is /plugins/tasks/tasks/task/<KEY>.
              window.history.pushState({}, "", `/plugins/tasks/tasks/task/${encodeURIComponent(key)}`);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
            return true;
          }
          const anchor = target?.closest?.("a[href]");
          if (!anchor || event.altKey) return false;
          const handled = callbacks.current.onLink(anchor.getAttribute("href") ?? "", event);
          if (handled) event.preventDefault();
          return handled;
        },
      },
    },
    onCreate: ({ editor: created }) => callbacks.current.onReady(created, created.getMarkdown()),
    onUpdate: ({ editor: updated }) => callbacks.current.onChange(updated.getMarkdown()),
  });

  if (!editor) return null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar editor={editor} onEditLink={props.onEditLink} end={props.toolbarEnd} />
      <div className="mdpro-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="w-full max-w-4xl px-5 py-6">
          <EditorContent editor={editor} />
        </div>
      </div>
      {menu ? (
        <EditorContextMenu
          state={menu}
          editor={editor}
          onClose={() => setMenu(null)}
          actions={{
            quote: (comment) => {
              const ratio = editor.state.selection.from / Math.max(1, editor.state.doc.content.size);
              callbacks.current.onQuote(currentFragmentMarkdown(editor), comment, ratio);
            },
            copyReference: () => {
              const ratio = editor.state.selection.from / Math.max(1, editor.state.doc.content.size);
              callbacks.current.onReference(currentFragmentMarkdown(editor), ratio);
            },
            editLink: () => editLinkFlow(editor, callbacks.current.onEditLink),
            openLink: (href) => callbacks.current.onLink(href, new MouseEvent("click")),
            openImage: (src) => openLightbox(src, ""),
            insertItems: () => toContextItems(insertMenuItems(editor)),
          }}
        />
      ) : null}
    </div>
  );
}

function toContextItems(items: MenuItem[]): ContextItem[] {
  const out: ContextItem[] = [];
  for (const item of items) {
    if (item === "sep") out.push("sep");
    else if ("heading" in item) continue;
    else out.push({ label: item.label, hint: item.hint, onSelect: item.onSelect });
  }
  return out;
}

// ---------------------------------------------------------------- toolbar

type ToolButtonProps = { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode };

function ToolButton({ label, active, disabled, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "mdpro-tool flex h-7 min-w-7 shrink-0 items-center justify-center rounded px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />;
const Glyph = ({ icon }: { icon: typeof TextBoldIcon }) => <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />;

type MenuItem = { label: string; hint?: string; indent?: number; onSelect: () => void } | "sep" | { heading: string };

function ToolMenu({ label, children, items, align = "start" }: { label: string; children: ReactNode; items: () => MenuItem[]; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <ToolButton label={label} active={open} onClick={() => setOpen((v) => !v)}>{children}</ToolButton>
      {open ? (
        <div className={cn("mdpro-menu mdpro-toolmenu", align === "end" && "mdpro-toolmenu-end")} role="menu">
          {items().map((item, index) =>
            item === "sep" ? (
              <div key={index} className="mdpro-menu-sep" />
            ) : "heading" in item ? (
              <div key={index} className="mdpro-menu-title">{item.heading}</div>
            ) : (
              <button
                key={index}
                role="menuitem"
                style={item.indent ? { paddingLeft: 9 + item.indent * 12 } : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span className="truncate">{item.label}</span>
                {item.hint ? <span className="mdpro-menu-hint">{item.hint}</span> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

const MERMAID_TEMPLATES: { key: I18nKey; code: string }[] = [
  { key: "mmFlowchart", code: "flowchart LR\n  A[Start] --> B{Check?}\n  B -->|yes| C[Done]\n  B -->|no| D[Fix]" },
  { key: "mmSequence", code: "sequenceDiagram\n  participant U as User\n  participant A as Agent\n  U->>A: Request\n  A-->>U: Result" },
  { key: "mmGantt", code: "gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Work\n  Research :a1, 2026-09-16, 3d\n  Build    :after a1, 5d" },
  { key: "mmClass", code: "classDiagram\n  class Editor {\n    +open(path)\n    +save()\n  }\n  Editor <|-- MarkdownPro" },
  { key: "mmState", code: "stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review\n  Review --> Done\n  Done --> [*]" },
  { key: "mmEr", code: "erDiagram\n  PROJECT ||--o{ TASK : has\n  TASK }o--|| AGENT : assigned" },
  { key: "mmMindmap", code: "mindmap\n  root((Topic))\n    Idea A\n    Idea B\n      Detail" },
  { key: "mmPie", code: "pie title Share\n  \"A\" : 45\n  \"B\" : 35\n  \"C\" : 20" },
  { key: "mmTimeline", code: "timeline\n  title Milestones\n  2026-09 : Start\n  2026-10 : Release" },
];

export function editLinkFlow(editor: Editor, onEditLink: RichEditorProps["onEditLink"]) {
  const chain = () => editor.chain().focus();
  const current = String(editor.getAttributes("link").href ?? "");
  const hasLink = editor.isActive("link");
  onEditLink(current, (href) => {
    if (!href) chain().extendMarkRange("link").unsetLink().run();
    else if (editor.state.selection.empty && !hasLink) chain().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else chain().extendMarkRange("link").setLink({ href }).run();
  });
}

export function insertMenuItems(editor: Editor): MenuItem[] {
  const chain = () => editor.chain().focus();
  const nextFootnoteId = () => {
    const ids = new Set<string>();
    editor.state.doc.descendants((node) => {
      if (node.type.name === "footnoteRef" || node.type.name === "footnoteDef") ids.add(String(node.attrs.id));
    });
    let n = 1;
    while (ids.has(String(n))) n += 1;
    return String(n);
  };
  return [
    { heading: t("callouts") },
    ...CALLOUT_MENU.map((kind) => ({
      label: kind.charAt(0) + kind.slice(1).toLowerCase(),
      hint: `[!${kind}]`,
      onSelect: () => chain().insertContent({ type: "callout", attrs: { kind, title: "", fold: "" }, content: [{ type: "paragraph" }] }).run(),
    })),
    "sep",
    { label: t("detailsBlock"), hint: "<details>", onSelect: () => chain().insertContent({ type: "details", attrs: { summary: t("detailsSummary"), open: true }, content: [{ type: "paragraph" }] }).run() },
    {
      label: t("footnote"),
      hint: "[^1]",
      onSelect: () => {
        const id = nextFootnoteId();
        chain().insertContent({ type: "footnoteRef", attrs: { id } }).run();
        editor.chain().insertContentAt(editor.state.doc.content.size, { type: "footnoteDef", attrs: { id }, content: [{ type: "text", text: t("footnoteText") }] }).run();
      },
    },
    { label: t("formula"), hint: "$$", onSelect: () => chain().insertBlockMath({ latex: "E = mc^2" }).run() },
    { label: t("divider"), hint: "---", onSelect: () => chain().setHorizontalRule().run() },
    "sep",
    { heading: t("mermaid") },
    ...MERMAID_TEMPLATES.map((tpl) => ({
      label: t(tpl.key),
      onSelect: () => chain().insertContent({ type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: tpl.code }] }).run(),
    })),
  ];
}

function Toolbar({ editor, onEditLink, end }: { editor: Editor; onEditLink: RichEditorProps["onEditLink"]; end?: ReactNode }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      let tasks = 0;
      let done = 0;
      e.state.doc.descendants((node) => {
        if (node.type.name === "taskItem") {
          tasks += 1;
          if (node.attrs.checked) done += 1;
        }
      });
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        highlight: e.isActive("highlight"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        task: e.isActive("taskList"),
        quote: e.isActive("blockquote"),
        codeBlock: e.isActive("codeBlock"),
        link: e.isActive("link"),
        table: e.isActive("table"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        tasks,
        done,
      };
    },
  });
  const chain = () => editor.chain().focus();
  const editLink = () => editLinkFlow(editor, onEditLink);
  const insertMenu = () => insertMenuItems(editor);
  const tocMenu = (): MenuItem[] => {
    const headings = headingsOf(editor);
    if (headings.length === 0) return [{ heading: t("noHeadings") }];
    const min = Math.min(...headings.map((h) => h.level));
    return headings.map((h) => ({ label: h.text || "—", indent: h.level - min, onSelect: () => scrollToPos(editor, h.pos) }));
  };
  const jumpToOpenTask = () => {
    let target = -1;
    editor.state.doc.descendants((node, pos) => {
      if (target !== -1) return false;
      if (node.type.name === "taskItem" && !node.attrs.checked) {
        target = pos;
        return false;
      }
      return true;
    });
    if (target !== -1) scrollToPos(editor, target);
  };

  return (
    <div role="toolbar" aria-label={t("formatting")} className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
      <ToolButton label={t("undo")} disabled={!s.canUndo} onClick={() => chain().undo().run()}><Glyph icon={ArrowTurnBackwardIcon} /></ToolButton>
      <ToolButton label={t("redo")} disabled={!s.canRedo} onClick={() => chain().redo().run()}><Glyph icon={ArrowTurnForwardIcon} /></ToolButton>
      <Divider />
      <ToolButton label={t("bold")} active={s.bold} onClick={() => chain().toggleBold().run()}><Glyph icon={TextBoldIcon} /></ToolButton>
      <ToolButton label={t("italic")} active={s.italic} onClick={() => chain().toggleItalic().run()}><Glyph icon={TextItalicIcon} /></ToolButton>
      <ToolButton label={t("strike")} active={s.strike} onClick={() => chain().toggleStrike().run()}><Glyph icon={TextStrikethroughIcon} /></ToolButton>
      <ToolButton label={t("highlight")} active={s.highlight} onClick={() => chain().toggleHighlight().run()}><span className="mdpro-hl-glyph">A</span></ToolButton>
      <ToolButton label={t("inlineCode")} active={s.code} onClick={() => chain().toggleCode().run()}><Glyph icon={CodeIcon} /></ToolButton>
      <Divider />
      <ToolButton label={t("h1")} active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>H1</ToolButton>
      <ToolButton label={t("h2")} active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>H2</ToolButton>
      <ToolButton label={t("h3")} active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>H3</ToolButton>
      <Divider />
      <ToolButton label={t("link")} active={s.link} onClick={editLink}><Glyph icon={Link01Icon} /></ToolButton>
      <ToolButton label={t("bulletList")} active={s.bullet} onClick={() => chain().toggleBulletList().run()}><Glyph icon={LeftToRightListBulletIcon} /></ToolButton>
      <ToolButton label={t("orderedList")} active={s.ordered} onClick={() => chain().toggleOrderedList().run()}><Glyph icon={LeftToRightListNumberIcon} /></ToolButton>
      <ToolButton label={t("taskList")} active={s.task} onClick={() => chain().toggleTaskList().run()}><Glyph icon={CheckListIcon} /></ToolButton>
      <ToolButton label={t("quote")} active={s.quote} onClick={() => chain().toggleBlockquote().run()}><Glyph icon={QuoteDownIcon} /></ToolButton>
      <Divider />
      <ToolButton label={t("codeBlock")} active={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}><Glyph icon={CodeSquareIcon} /></ToolButton>
      <ToolButton label={s.table ? t("addRow") : t("table")} onClick={() => (s.table ? chain().addRowAfter().run() : chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>
        <Glyph icon={GridTableIcon} />
      </ToolButton>
      {s.table ? (
        <>
          <ToolButton label={t("addColumn")} onClick={() => chain().addColumnAfter().run()}><span className="text-[11px]">{t("colPlus")}</span></ToolButton>
          <ToolButton label={t("deleteRow")} onClick={() => chain().deleteRow().run()}><span className="text-[11px]">{t("rowMinus")}</span></ToolButton>
          <ToolButton label={t("deleteColumn")} onClick={() => chain().deleteColumn().run()}><span className="text-[11px]">{t("colMinus")}</span></ToolButton>
        </>
      ) : null}
      <ToolMenu label={t("insert")} items={insertMenu}>
        <span className="text-[11px]">{t("insert")} ▾</span>
      </ToolMenu>
      <ToolMenu label={t("contents")} items={tocMenu}>
        <span className="text-[11px]">{t("contents")} ▾</span>
      </ToolMenu>
      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        {s.tasks > 0 ? (
          <button type="button" className="mdpro-tool mdpro-progress" data-tip={t("tasksProgressTip")} data-tip-align="end" onClick={jumpToOpenTask}>
            <span className="mdpro-progress-bar"><span style={{ width: `${Math.round((s.done / s.tasks) * 100)}%` }} /></span>
            {s.done}/{s.tasks}
          </button>
        ) : null}
        {end}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- styles

export const RICH_CSS = `
.mdpro-prose { --mdpro-serif: "Charter", "Iowan Old Style", "Source Serif Pro", Georgia, "Times New Roman", serif; --mdpro-accent: #6366f1; outline: none; font-size: 16px; line-height: 1.75; color: var(--foreground); min-height: 60vh; word-wrap: break-word; }
.mdpro-prose > * + * { margin-top: 0.9em; }
.mdpro-prose > :first-child { margin-top: 0; }
.mdpro-prose h1, .mdpro-prose h2, .mdpro-prose h3, .mdpro-prose h4 { font-family: var(--mdpro-serif); font-weight: 700; letter-spacing: -0.01em; color: var(--foreground); }
.mdpro-prose h1 { font-size: 2.15em; line-height: 1.15; margin-top: 1.1em; padding-bottom: .3em; border-bottom: 2px solid var(--border); }
.mdpro-prose h2 { font-size: 1.6em; line-height: 1.25; margin-top: 1.6em; padding-bottom: .25em; border-bottom: 1px solid var(--border); }
.mdpro-prose h3 { font-size: 1.3em; line-height: 1.3; margin-top: 1.4em; }
.mdpro-prose h4 { font-size: 1.1em; margin-top: 1.2em; }
.mdpro-prose h5, .mdpro-prose h6 { font-weight: 650; margin-top: 1em; color: var(--muted-foreground); }
.mdpro-prose strong { font-weight: 700; }
.mdpro-prose s { color: var(--muted-foreground); }
.mdpro-prose a { color: var(--mdpro-accent); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; cursor: pointer; }
.dark .mdpro-prose { --mdpro-accent: #a5b4fc; }
.mdpro-prose ul { list-style: disc; padding-left: 1.6em; }
.mdpro-prose ol { list-style: decimal; padding-left: 1.6em; }
.mdpro-prose li::marker { color: var(--muted-foreground); }
.mdpro-prose li > p { margin: 0; }
.mdpro-prose li + li { margin-top: .35em; }
.mdpro-prose ul[data-type="taskList"] { list-style: none; padding-left: .2em; }
.mdpro-prose ul[data-type="taskList"] li { display: flex; gap: .6em; align-items: flex-start; }
.mdpro-prose ul[data-type="taskList"] li > label { margin-top: .32em; user-select: none; }
.mdpro-prose ul[data-type="taskList"] li > label input { width: 1em; height: 1em; accent-color: var(--mdpro-accent); }
.mdpro-prose ul[data-type="taskList"] li > div { flex: 1; }
.mdpro-prose ul[data-type="taskList"] li[data-checked="true"] > div { color: var(--muted-foreground); text-decoration: line-through; }
.mdpro-prose blockquote { margin-left: 0; padding: .8em 1.2em; border-left: 4px solid var(--mdpro-accent); border-radius: 0 12px 12px 0; background: color-mix(in oklab, var(--mdpro-accent) 8%, transparent); color: var(--foreground); }
.mdpro-prose blockquote > * + * { margin-top: .5em; }
.mdpro-prose hr { border: none; border-top: 2px solid var(--border); margin: 2em 0; }
.mdpro-prose hr.ProseMirror-selectednode { border-top-color: var(--mdpro-accent); }
.mdpro-prose code { font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace); font-size: .86em; color: #c026d3; background: color-mix(in oklab, var(--muted) 85%, transparent); padding: .15em .4em; border-radius: 6px; }
.dark .mdpro-prose code { color: #f0abfc; }
.mdpro-prose img { max-width: 100%; border-radius: 10px; }
.mdpro-prose img.ProseMirror-selectednode { outline: 2px solid var(--mdpro-accent); }
.mdpro-prose .tableWrapper { overflow-x: auto; margin: 1.2em 0; }
.mdpro-prose table { border-collapse: collapse; width: 100%; font-size: .95em; }
.mdpro-prose th, .mdpro-prose td { border: 1px solid var(--border); padding: .65em .9em; vertical-align: top; position: relative; min-width: 4em; }
.mdpro-prose th { background: color-mix(in oklab, var(--muted) 90%, transparent); font-weight: 650; text-align: left; }
.mdpro-prose td > p, .mdpro-prose th > p { margin: 0; }
.mdpro-prose .selectedCell::after { content: ""; position: absolute; inset: 0; background: color-mix(in oklab, var(--mdpro-accent) 15%, transparent); pointer-events: none; }
.mdpro-prose p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--muted-foreground); float: left; height: 0; pointer-events: none; }
.mdpro-code { margin: 1.2em 0; border-radius: 14px; overflow: visible; background: #1a1f2b; color: #e6e8ee; }
.mdpro-code-bar { display: flex; align-items: center; gap: .5em; padding: .45em .9em 0; }
.mdpro-code-lang { background: transparent; border: none; outline: none; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #8b93a7; width: 12em; font-family: var(--font-mono, ui-monospace, monospace); }
.mdpro-chip { margin-left: auto; font-size: 11px; color: #aab2c5; padding: .15em .6em; border-radius: 6px; }
.mdpro-chip:hover { background: rgba(255,255,255,.08); color: #fff; }
.mdpro-code pre { margin: 0; border-radius: 0 0 14px 14px; padding: .6em 1.2em 1.1em; overflow-x: auto; font-size: 13.5px; line-height: 1.65; }
.mdpro-code .hljs-comment, .mdpro-code .hljs-quote { color: #7d8799; font-style: italic; }
.mdpro-code .hljs-keyword, .mdpro-code .hljs-selector-tag, .mdpro-code .hljs-doctag, .mdpro-code .hljs-meta .hljs-keyword { color: #ff7b72; }
.mdpro-code .hljs-string, .mdpro-code .hljs-regexp, .mdpro-code .hljs-addition, .mdpro-code .hljs-meta .hljs-string { color: #a5d6ff; }
.mdpro-code .hljs-number, .mdpro-code .hljs-literal, .mdpro-code .hljs-variable.constant_, .mdpro-code .hljs-symbol { color: #79c0ff; }
.mdpro-code .hljs-title, .mdpro-code .hljs-title.function_, .mdpro-code .hljs-section { color: #d2a8ff; }
.mdpro-code .hljs-title.class_, .mdpro-code .hljs-type, .mdpro-code .hljs-built_in { color: #ffa657; }
.mdpro-code .hljs-attr, .mdpro-code .hljs-attribute, .mdpro-code .hljs-property, .mdpro-code .hljs-selector-class, .mdpro-code .hljs-selector-id { color: #79c0ff; }
.mdpro-code .hljs-name, .mdpro-code .hljs-tag { color: #7ee787; }
.mdpro-code .hljs-variable, .mdpro-code .hljs-template-variable, .mdpro-code .hljs-params { color: #ffa198; }
.mdpro-code .hljs-meta, .mdpro-code .hljs-bullet, .mdpro-code .hljs-link { color: #8b949e; }
.mdpro-code .hljs-deletion { color: #ffa198; background: rgba(248,81,73,.12); }
.mdpro-code .hljs-emphasis { font-style: italic; }
.mdpro-code .hljs-strong { font-weight: 700; }
.mdpro-code pre code { background: none; color: inherit; padding: 0; font-size: inherit; border-radius: 0; }
.mdpro-code-mermaid { background: color-mix(in oklab, var(--muted) 55%, transparent); color: var(--foreground); border: 1px solid var(--border); }
.mdpro-code-mermaid .mdpro-code-lang, .mdpro-code-mermaid .mdpro-chip { color: var(--muted-foreground); }
.mdpro-code-mermaid .mdpro-chip:hover { background: var(--accent); color: var(--foreground); }
.mdpro-code-mermaid pre { background: #1a1f2b; color: #e6e8ee; }
.mdpro-hidden { display: none; }
.mdpro-chip-icon { position: relative; display: inline-flex; align-items: center; padding: .2em .45em; }
.mdpro-chip-icon[data-tip]:hover::after, .mdpro-zoom-btn[data-tip]:hover::after { content: attr(data-tip); position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); white-space: nowrap; background: var(--foreground); color: var(--background); font-size: 11px; font-weight: 500; line-height: 1.3; padding: 4px 8px; border-radius: 6px; z-index: 60; pointer-events: none; opacity: 0; animation: mdpro-tip 120ms ease-out 350ms forwards; }
.mdpro-zoom-btn[data-tip]:hover::after { top: auto; bottom: calc(100% + 8px); }
.mdpro-zoom { position: fixed; inset: 0; z-index: 2147483000; display: flex; padding: 3vmin; background: rgba(0,0,0,.55); }
.mdpro-zoom-card { position: relative; flex: 1; overflow: hidden; border: 1px solid var(--border); border-radius: 14px; background: var(--background); color: var(--foreground); box-shadow: 0 20px 60px rgba(0,0,0,.35); }
.mdpro-zoom-stage { position: absolute; inset: 0; overflow: hidden; cursor: grab; touch-action: none; user-select: none; }
.mdpro-zoom-stage:active { cursor: grabbing; }
.mdpro-zoom-content { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.mdpro-zoom-content svg { display: block; }
.mdpro-zoom-bar { position: absolute; left: 50%; bottom: 36px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; padding: 4px; border: 1px solid var(--border); border-radius: 10px; background: var(--popover, var(--background)); box-shadow: 0 6px 20px rgba(0,0,0,.15); }
.mdpro-zoom-btn { position: relative; display: inline-flex; padding: 6px; border-radius: 7px; color: var(--muted-foreground); }
.mdpro-zoom-btn:hover { background: var(--accent); color: var(--foreground); }
.mdpro-zoom-level { min-width: 3.4em; text-align: center; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--muted-foreground); }
.mdpro-zoom-sep { width: 1px; height: 18px; margin: 0 3px; background: var(--border); }
.mdpro-zoom-hint { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; font-size: 11px; color: var(--muted-foreground); pointer-events: none; }
.mdpro-diagram-editable .node { cursor: context-menu; }
.mdpro-diagram-editable .node:hover rect, .mdpro-diagram-editable .node:hover polygon, .mdpro-diagram-editable .node:hover circle, .mdpro-diagram-editable .node:hover path { stroke: var(--mdpro-accent, #6366f1) !important; stroke-width: 2px !important; }
.mdpro-diagram-hint { padding: 0 1.2em .7em; font-size: 11px; color: var(--muted-foreground); text-align: center; }
.mdpro-menu { position: absolute; z-index: 70; min-width: 210px; max-width: 280px; padding: 4px; border: 1px solid var(--border); border-radius: 10px; background: var(--popover, var(--background)); color: var(--popover-foreground, var(--foreground)); box-shadow: 0 10px 30px rgba(0,0,0,.18); font-size: 13px; }
.mdpro-menu button { display: block; width: 100%; text-align: left; padding: 6px 9px; border-radius: 6px; }
.mdpro-menu button:hover { background: var(--accent); }
.mdpro-menu-title { padding: 6px 9px 2px; font-size: 11px; color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mdpro-menu-sep { height: 1px; margin: 4px 2px; background: var(--border); }
.mdpro-menu-grid { display: grid; grid-template-columns: 1fr 1fr; }
.mdpro-menu-grid button { font-size: 12px; padding: 5px 8px; }
.mdpro-menu-danger { color: var(--destructive); }
.mdpro-menu-form { display: flex; gap: 4px; padding: 4px; }
.mdpro-menu-form input { flex: 1; min-width: 0; height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--background); outline: none; }
.mdpro-menu-form button { width: auto; padding: 0 10px; background: var(--primary); color: var(--primary-foreground); }
.mdpro-tree { padding: .6em 0 1em; font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace); font-size: 13px; }
.mdpro-tree-row { position: relative; display: flex; align-items: center; gap: 7px; min-height: 26px; padding-right: 12px; border-radius: 6px; }
.mdpro-tree-row:hover { background: var(--accent); }
.mdpro-tree-guide { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--border); }
.mdpro-tree-folder { color: #e0a526; flex-shrink: 0; }
.mdpro-tree-file { color: var(--muted-foreground); flex-shrink: 0; }
.mdpro-tree-name { white-space: nowrap; }
.mdpro-tree-comment { margin-left: auto; padding-left: 16px; color: var(--muted-foreground); font-family: var(--font-sans, inherit); font-size: 12px; text-align: right; }
.mdpro-diagram { display: flex; justify-content: center; padding: 1em 1.2em 1.4em; overflow-x: auto; }
.mdpro-diagram svg { max-width: 100%; height: auto; }
.mdpro-diagram-error, .mdpro-diagram-loading { padding: .75em 1.2em; font-size: 12px; color: var(--muted-foreground); }
.mdpro-diagram-error { color: var(--destructive); }
.mdpro-prose [data-type="block-math"] { display: block; text-align: center; padding: .6em 0; cursor: pointer; overflow-x: auto; }
.mdpro-prose [data-type="inline-math"] { cursor: pointer; }
.mdpro-prose [data-type="block-math"]:hover, .mdpro-prose [data-type="inline-math"]:hover { background: color-mix(in oklab, var(--mdpro-accent) 10%, transparent); border-radius: 6px; }
.mdpro-prose math { font-size: 1.12em; }
.mdpro-tool { position: relative; }
.mdpro-tool[data-tip]:hover::after, .mdpro-tool[data-tip]:focus-visible::after { content: attr(data-tip); position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); white-space: nowrap; background: var(--foreground); color: var(--background); font-size: 11px; font-weight: 500; line-height: 1.3; padding: 4px 8px; border-radius: 6px; z-index: 60; pointer-events: none; opacity: 0; animation: mdpro-tip 120ms ease-out 350ms forwards; }
.mdpro-tool[data-tip-align="end"]:hover::after, .mdpro-tool[data-tip-align="end"]:focus-visible::after { left: auto; right: 0; transform: none; }
@keyframes mdpro-tip { to { opacity: 1; } }
.mdpro-callout { margin: 1.1em 0; padding: .7em 1em .8em; border-left: 4px solid var(--c); border-radius: 0 12px 12px 0; background: color-mix(in oklab, var(--c) 9%, transparent); --c: #3b82f6; }
.mdpro-tone-tip { --c: #10b981; } .mdpro-tone-important { --c: #8b5cf6; } .mdpro-tone-warning { --c: #f59e0b; } .mdpro-tone-danger { --c: #ef4444; } .mdpro-tone-success { --c: #22c55e; } .mdpro-tone-quote { --c: #94a3b8; }
.mdpro-callout-head { display: flex; align-items: center; gap: .4em; margin-bottom: .25em; color: var(--c); font-weight: 650; font-size: .92em; }
.mdpro-callout-icon { width: 1.2em; text-align: center; }
.mdpro-callout-kind { field-sizing: content; appearance: none; background: transparent; border: 0; color: inherit; font: inherit; cursor: pointer; padding: 0 .2em; border-radius: 4px; }
.mdpro-callout-kind:hover { background: color-mix(in oklab, var(--c) 15%, transparent); }
.mdpro-callout-title { flex: 1; min-width: 4em; background: transparent; border: 0; outline: none; color: var(--foreground); font: inherit; font-weight: 600; }
.mdpro-callout-title:not(:focus)::placeholder { color: transparent; }
.mdpro-callout-title::placeholder { color: color-mix(in oklab, var(--foreground) 35%, transparent); font-weight: 500; }
.mdpro-callout-fold, .mdpro-details-toggle { width: 1.3em; color: inherit; border-radius: 4px; }
.mdpro-callout-body > * + *, .mdpro-details-body > * + * { margin-top: .6em; }
.mdpro-details { margin: 1em 0; border: 1px solid var(--border); border-radius: 12px; padding: .5em .9em; }
.mdpro-details.is-open { padding-bottom: .9em; }
.mdpro-details-head { display: flex; align-items: center; gap: .4em; font-weight: 600; }
.mdpro-details-summary { flex: 1; background: transparent; border: 0; outline: none; font: inherit; color: var(--foreground); }
.mdpro-details-body { margin-top: .5em; padding-left: 1.7em; }
.mdpro-raw { margin: 1em 0; border: 1px dashed var(--border); border-radius: 10px; background: color-mix(in oklab, var(--muted) 35%, transparent); font-size: 12.5px; }
.mdpro-raw.is-selected { outline: 2px solid var(--mdpro-accent, #6366f1); }
.mdpro-raw-head { display: flex; align-items: center; gap: .6em; padding: .35em .8em; color: var(--muted-foreground); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.mdpro-raw-note { text-transform: none; letter-spacing: 0; opacity: .8; }
.mdpro-raw-head .mdpro-chip { margin-left: auto; color: var(--muted-foreground); }
.mdpro-raw-head .mdpro-chip:hover { background: var(--accent); color: var(--foreground); }
.mdpro-raw-code { margin: 0; padding: 0 .9em .7em; white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono, ui-monospace, Menlo, monospace); color: var(--muted-foreground); }
.mdpro-raw-comment .mdpro-raw-code { font-style: italic; }
.mdpro-raw-edit { display: block; width: calc(100% - 1.6em); margin: 0 .8em .8em; padding: .5em; border: 1px solid var(--border); border-radius: 6px; background: var(--background); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12.5px; }
.mdpro-prose .mdpro-raw-inline { font-family: var(--font-mono, ui-monospace, monospace); font-size: .78em; color: var(--muted-foreground); background: color-mix(in oklab, var(--muted) 60%, transparent); border-radius: 4px; padding: 0 .3em; }
.mdpro-prose .mdpro-br { color: var(--muted-foreground); font-size: .8em; padding: 0 .15em; }
.mdpro-prose kbd { display: inline-block; font-family: var(--font-mono, ui-monospace, monospace); font-size: .8em; line-height: 1.4; padding: .05em .45em; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 5px; background: var(--background); color: var(--foreground); }
.mdpro-prose mark { background: color-mix(in oklab, #facc15 45%, transparent); color: inherit; border-radius: 3px; padding: 0 .1em; }
.mdpro-hl-glyph { padding: 0 .25em; border-radius: 3px; background: color-mix(in oklab, #facc15 55%, transparent); color: var(--foreground); font-weight: 700; }
.mdpro-prose .mdpro-fnref { cursor: pointer; color: var(--mdpro-accent); font-size: .72em; font-weight: 600; padding: 0 .1em; }
.mdpro-prose .mdpro-fnref::before { content: "["; } .mdpro-prose .mdpro-fnref::after { content: "]"; }
.mdpro-prose .mdpro-fndef { font-size: .88em; color: var(--muted-foreground); padding-left: 1.8em; position: relative; }
.mdpro-prose .mdpro-fndef::before { content: attr(data-footnote-def) "."; position: absolute; left: 0; font-weight: 600; color: var(--mdpro-accent); }
.mdpro-prose .mdpro-fndef:first-of-type, .mdpro-prose :not(.mdpro-fndef) + .mdpro-fndef { margin-top: 2em; padding-top: .8em; border-top: 1px solid var(--border); }
.mdpro-prose .mdpro-emoji { font-size: 1.05em; }
.mdpro-badge { display: inline-block; padding: 0 .45em; border-radius: 9999px; font-size: .82em; font-weight: 600; line-height: 1.5; --b: #3b82f6; color: color-mix(in oklab, var(--b) 80%, var(--foreground)); background: color-mix(in oklab, var(--b) 14%, transparent); }
.mdpro-badge-ok { --b: #16a34a; } .mdpro-badge-fail { --b: #dc2626; } .mdpro-badge-warn { --b: #d97706; } .mdpro-badge-info { --b: #64748b; }
.mdpro-prose .mdpro-entity { border-bottom: 1px dashed var(--mdpro-accent); cursor: pointer; }
.mdpro-prose .mdpro-entity-thread:hover, .mdpro-prose .mdpro-entity-task:hover { background: color-mix(in oklab, var(--mdpro-accent) 10%, transparent); }
.mdpro-lightbox { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 3vmin; background: rgba(0,0,0,.78); cursor: zoom-out; }
.mdpro-lightbox img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.mdpro-prose img { cursor: zoom-in; }
.mdpro-prose img.mdpro-img-broken { min-width: 120px; min-height: 40px; outline: 1px dashed var(--border); }
.mdpro-code-actions { margin-left: auto; display: flex; gap: .25em; }
.mdpro-code .mdpro-chip { margin-left: 0; }
.mdpro-code-collapsed { max-height: 24.5em; overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, #000 80%, transparent); mask-image: linear-gradient(to bottom, #000 80%, transparent); }
.mdpro-code-expand { display: block; width: 100%; padding: .45em; font-size: 12px; color: #aab2c5; border-top: 1px solid rgba(255,255,255,.08); border-radius: 0 0 14px 14px; }
.mdpro-code-expand:hover { color: #fff; background: rgba(255,255,255,.05); }
.mdpro-code-diff .hljs-addition { display: inline-block; width: 100%; color: #aff5b4; background: rgba(46,160,67,.18); }
.mdpro-code-diff .hljs-deletion { display: inline-block; width: 100%; color: #ffdcd7; background: rgba(248,81,73,.18); }
.mdpro-code-diff .hljs-meta { color: #79c0ff; }
.mdpro-toolmenu { top: calc(100% + 4px); left: 0; max-height: 60vh; overflow-y: auto; }
.mdpro-toolmenu-end { left: auto; right: 0; }
.mdpro-toolmenu button { display: flex; align-items: center; gap: 1em; justify-content: space-between; }
.mdpro-menu-hint { color: var(--muted-foreground); font-size: 11px; font-family: var(--font-mono, ui-monospace, monospace); }
.mdpro-progress { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border-radius: 6px; font-size: 11px; color: var(--muted-foreground); }
.mdpro-progress:hover { background: var(--accent); color: var(--foreground); }
.mdpro-progress-bar { width: 42px; height: 5px; border-radius: 9999px; background: var(--border); overflow: hidden; }
.mdpro-progress-bar > span { display: block; height: 100%; background: #22c55e; }
.mdpro-flash { animation: mdpro-flash 2.2s ease-out; border-radius: 6px; }
@keyframes mdpro-flash { 0%, 35% { background: color-mix(in oklab, #facc15 40%, transparent); } 100% { background: transparent; } }
.mdpro-props-card { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: color-mix(in oklab, var(--muted) 30%, transparent); }
.mdpro-props-grid { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; font-size: 12.5px; }
.mdpro-props-grid dt { color: var(--muted-foreground); }
.mdpro-props-grid dd { margin: 0; word-break: break-word; }
.mdpro-tag { font-size: 11.5px; padding: 1px 8px; border-radius: 9999px; background: color-mix(in oklab, var(--mdpro-accent, #6366f1) 12%, transparent); color: color-mix(in oklab, var(--mdpro-accent, #6366f1) 80%, var(--foreground)); }
.mdpro-chip-plain { margin-left: 0; font-size: 11.5px; color: var(--muted-foreground); padding: 2px 8px; border: 1px solid var(--border); border-radius: 6px; }
.mdpro-chip-plain:hover { background: var(--accent); color: var(--foreground); }
.mdpro-props-card .mdpro-badge, .mdpro-props-card .mdpro-tag { --mdpro-accent: #6366f1; }
.mdpro-ctx-root { position: fixed; z-index: 2147483000; }
.mdpro-ctx { position: relative; min-width: 230px; max-width: 320px; }
.mdpro-ctx button { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.mdpro-ctx button:disabled { opacity: .4; }
.mdpro-ctx-parent { position: relative; }
.mdpro-ctx-sub { position: absolute; left: calc(100% - 4px); top: -5px; }
.mdpro-ctx-flip .mdpro-ctx-sub { left: auto; right: calc(100% - 4px); }
.mdpro-ctx-comment { width: 320px; display: flex; flex-direction: column; gap: 6px; padding: 8px; }
.mdpro-ctx-comment textarea { width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--background); color: var(--foreground); font: inherit; resize: vertical; outline: none; }
.mdpro-ctx-comment-actions { display: flex; align-items: center; justify-content: space-between; }
.mdpro-ctx-comment-actions button { width: auto; padding: 5px 12px; background: var(--primary); color: var(--primary-foreground); }
.mdpro-ctx-comment-actions button:hover { background: var(--primary); opacity: .9; }
`;
