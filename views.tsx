// Node views for agent-style Markdown blocks: callouts, <details>, raw HTML.
import { useState } from "react";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { Callout, Details, RawHtmlBlock } from "./md-extensions";
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

function RawHtmlView({ node, updateAttributes, editor, selected }: ReactNodeViewProps) {
  const html = String(node.attrs.html ?? "");
  const comment = /^\s*<!--/.test(html);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(html);
  return (
    <NodeViewWrapper className={cn("mdpro-raw", comment && "mdpro-raw-comment", selected && "is-selected")} contentEditable={false}>
      <div className="mdpro-raw-head">
        <span>{comment ? t("htmlComment") : "HTML"}</span>
        <span className="mdpro-raw-note">{t("htmlPreserved")}</span>
        {editor.isEditable ? (
          <button
            type="button"
            className="mdpro-chip"
            onClick={() => {
              if (editing) updateAttributes({ html: draft });
              else setDraft(html);
              setEditing((v) => !v);
            }}
          >
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

export const CalloutWithView = Callout.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView) });
export const DetailsWithView = Details.extend({ addNodeView: () => ReactNodeViewRenderer(DetailsView) });
export const RawHtmlWithView = RawHtmlBlock.extend({ addNodeView: () => ReactNodeViewRenderer(RawHtmlView) });
