// Node views for agent-style Markdown blocks: callouts, <details>, raw HTML.
import { useMemo, useState } from "react";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { AsciiDiagram, Callout, Details, HtmlRegion, RawHtmlBlock } from "./md-extensions";
import { parseBoxDiagram, parseForkDiagram, type ForkNode } from "./box-diagram";
import { t } from "./i18n";
import { cn } from "@/lib/utils";

type Tone = "info" | "tip" | "important" | "warning" | "danger" | "success" | "quote";

const KIND_TONE: Record<string, Tone> = {
  note: "info", info: "info", abstract: "info", summary: "info", tldr: "info", todo: "info",
  tip: "tip", hint: "tip", example: "tip",
  important: "important", question: "important", help: "important", faq: "important",
  warning: "warning", caution: "warning", attention: "warning",
  danger: "danger", error: "danger", bug: "danger", failure: "danger",
  success: "success", check: "success", done: "success",
  quote: "quote",
};
const TONE_ICON: Record<Tone, string> = { info: "ℹ", tip: "💡", important: "❗", warning: "⚠", danger: "⛔", success: "✓", quote: "❝" };
export const CALLOUT_MENU = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;

function CalloutView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const kind = String(node.attrs.kind ?? "NOTE");
  const tone = KIND_TONE[kind.toLowerCase()] ?? "info";
  const fold = String(node.attrs.fold ?? "");
  const [collapsed, setCollapsed] = useState(fold === "-");
  const title = String(node.attrs.title ?? "");
  const label = kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
  return (
    <NodeViewWrapper className={cn("mdpro-callout", `mdpro-tone-${tone}`)} data-kind={kind.toLowerCase()}>
      <div className="mdpro-callout-head" contentEditable={false}>
        {fold ? (
          <button type="button" className="mdpro-callout-fold" aria-expanded={!collapsed} onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? "▸" : "▾"}
          </button>
        ) : null}
        <span className="mdpro-callout-icon" aria-hidden>{TONE_ICON[tone]}</span>
        <select
          className="mdpro-callout-kind"
          value={kind.toUpperCase()}
          aria-label={t("calloutType")}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ kind: event.target.value })}
        >
          {[...new Set([kind.toUpperCase(), ...CALLOUT_MENU])].map((k) => (
            <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <input
          className="mdpro-callout-title"
          value={title}
          placeholder={label}
          aria-label={t("calloutTitle")}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ title: event.target.value })}
        />
      </div>
      <NodeViewContent className={cn("mdpro-callout-body", collapsed && "mdpro-hidden")} />
    </NodeViewWrapper>
  );
}

function DetailsView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const [open, setOpen] = useState(Boolean(node.attrs.open));
  return (
    <NodeViewWrapper className={cn("mdpro-details", open && "is-open")}>
      <div className="mdpro-details-head" contentEditable={false}>
        <button type="button" className="mdpro-details-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▸"}
        </button>
        <input
          className="mdpro-details-summary"
          value={String(node.attrs.summary ?? "")}
          placeholder={t("detailsSummary")}
          aria-label={t("detailsSummary")}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ summary: event.target.value })}
        />
      </div>
      <NodeViewContent className={cn("mdpro-details-body", !open && "mdpro-hidden")} />
    </NodeViewWrapper>
  );
}

function commentInner(html: string): string | null {
  const match = /^\s*<!--([\s\S]*?)-->\s*$/.exec(html);
  return match ? match[1].replace(/^\s+|\s+$/g, "") : null;
}

function HtmlRegionView({ node }: ReactNodeViewProps) {
  const [open, setOpen] = useState(true);
  const key = String(node.attrs.key ?? "");
  return (
    <NodeViewWrapper className={cn("mdpro-region", open && "is-open")}>
      <div className="mdpro-region-head" contentEditable={false}>
        <button type="button" className="mdpro-details-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▸"}
        </button>
        <span className="mdpro-region-kind">{t("htmlRegion")}</span>
        <code className="mdpro-region-key">{key || "…"}</code>
        <span className="mdpro-region-hint">{open ? t("htmlPreserved") : t("htmlRegionCollapsed")}</span>
      </div>
      <NodeViewContent className={cn("mdpro-region-body", !open && "mdpro-hidden")} />
    </NodeViewWrapper>
  );
}

function RawHtmlView({ node, updateAttributes, editor, selected }: ReactNodeViewProps) {
  const html = String(node.attrs.html ?? "");
  const inner = commentInner(html);
  const comment = inner !== null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(html);
  const toggleEdit = () => {
    if (editing) updateAttributes({ html: draft });
    else setDraft(html);
    setEditing((v) => !v);
  };
  if (comment && !editing) {
    return (
      <NodeViewWrapper className={cn("mdpro-comment", selected && "is-selected")} contentEditable={false}>
        <span className="mdpro-comment-mark" aria-hidden>{"<!--"}</span>
        <span className="mdpro-comment-text">{inner || t("htmlComment")}</span>
        <span className="mdpro-comment-mark" aria-hidden>{"-->"}</span>
        {editor.isEditable ? (
          <button type="button" className="mdpro-chip" onClick={toggleEdit}>{t("editCode")}</button>
        ) : null}
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper className={cn("mdpro-raw", comment && "mdpro-raw-comment", selected && "is-selected")} contentEditable={false}>
      <div className="mdpro-raw-head">
        <span>{comment ? t("htmlComment") : "HTML"}</span>
        <span className="mdpro-raw-note">{t("htmlPreserved")}</span>
        {editor.isEditable ? (
          <button type="button" className="mdpro-chip" onClick={toggleEdit}>
            {editing ? t("apply") : t("editCode")}
          </button>
        ) : null}
      </div>
      {editing ? (
        <textarea className="mdpro-raw-edit" value={draft} rows={Math.min(14, draft.split("\n").length + 1)} onChange={(event) => setDraft(event.target.value)} />
      ) : (
        <pre className="mdpro-raw-code">{html}</pre>
      )}
    </NodeViewWrapper>
  );
}

function AsciiCard({ node }: { node: ForkNode }) {
  return (
    <div className="mdpro-ascii-box">
      {node.title ? <div className="mdpro-ascii-title">{node.title}</div> : null}
      {node.lines.map((line, lineIndex) => (
        <div key={lineIndex} className="mdpro-ascii-line">{line}</div>
      ))}
    </div>
  );
}

export function BoxDiagramView({ code }: { code: string }) {
  const fork = useMemo(() => parseForkDiagram(code), [code]);
  const parts = useMemo(() => (fork ? null : parseBoxDiagram(code)), [code, fork]);
  if (fork) {
    return (
      <div className="mdpro-ascii mdpro-ascii-fork" role="img" aria-label={t("asciiDiagram")}>
        {fork.root.title ? <AsciiCard node={fork.root} /> : null}
        <div className="mdpro-ascii-arrow" aria-hidden>↓</div>
        <div className="mdpro-ascii-rail mdpro-ascii-rail-split" aria-hidden />
        <div className="mdpro-ascii-branches">
          {fork.branches.map((branch, index) => (
            <div key={index} className="mdpro-ascii-branch">
              <div className="mdpro-ascii-arrow" aria-hidden>↓</div>
              <AsciiCard node={branch} />
              {fork.merge ? <div className="mdpro-ascii-arrow" aria-hidden>↓</div> : null}
            </div>
          ))}
        </div>
        {fork.merge ? (
          <>
            <div className="mdpro-ascii-rail mdpro-ascii-rail-join" aria-hidden />
            <div className="mdpro-ascii-arrow" aria-hidden>↓</div>
            <AsciiCard node={fork.merge} />
          </>
        ) : null}
      </div>
    );
  }
  if (!parts) return <pre className="mdpro-ascii-fallback">{code}</pre>;
  return (
    <div className="mdpro-ascii" role="img" aria-label={t("asciiDiagram")}>
      {parts.map((part, index) => {
        if (part.kind === "arrow") {
          return <div key={index} className="mdpro-ascii-arrow" aria-hidden>{part.symbol}</div>;
        }
        if (part.kind === "raw") {
          return <pre key={index} className="mdpro-ascii-raw">{part.text}</pre>;
        }
        return <AsciiCard key={index} node={part} />;
      })}
    </div>
  );
}

function AsciiDiagramView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="mdpro-ascii-node">
      <BoxDiagramView code={String(node.attrs.text ?? "")} />
    </NodeViewWrapper>
  );
}

export const CalloutWithView = Callout.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView) });
export const DetailsWithView = Details.extend({ addNodeView: () => ReactNodeViewRenderer(DetailsView) });
export const HtmlRegionWithView = HtmlRegion.extend({ addNodeView: () => ReactNodeViewRenderer(HtmlRegionView) });
export const RawHtmlWithView = RawHtmlBlock.extend({ addNodeView: () => ReactNodeViewRenderer(RawHtmlView) });
export const AsciiDiagramWithView = AsciiDiagram.extend({ addNodeView: () => ReactNodeViewRenderer(AsciiDiagramView) });
