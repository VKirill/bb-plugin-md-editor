// Markdown syntax agents commonly write, parsed into dedicated nodes/marks and
// serialized back to the same source. Pure (no React/DOM) so it round-trips in
// tests; rich.tsx adds node views on top.
import { Mark, Node, mergeAttributes } from "@tiptap/core";
import type { JSONContent, MarkdownToken } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import { gemoji } from "gemoji";

type Token = MarkdownToken & Record<string, any>;

/** Index of the first match of `re` that begins a line, or -1. */
function lineStart(src: string, re: RegExp): number {
  const match = new RegExp(`(^|\\n)(?:${re.source})`, re.flags.replace("g", "")).exec(src);
  return match ? match.index + match[1].length : -1;
}

const blockChildren = (tokens: Token[], h: any): JSONContent[] => {
  const parse = h.parseBlockChildren ?? h.parseChildren;
  const out = parse(tokens ?? []) as JSONContent[];
  return out.length > 0 ? out : [{ type: "paragraph" }];
};

const isEmptyParagraphOnly = (node: JSONContent) =>
  !node.content || node.content.length === 0 || (node.content.length === 1 && node.content[0].type === "paragraph" && !node.content[0].content?.length);

// ---------------------------------------------------------------- callouts

export const CALLOUT_KINDS = ["note", "tip", "important", "warning", "caution", "info", "success", "danger", "bug", "example", "quote", "question", "failure", "abstract", "todo", "error", "check", "done", "help", "faq", "attention", "hint", "summary", "tldr"] as const;

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { kind: { default: "NOTE" }, title: { default: "" }, fold: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": String(node.attrs.kind).toLowerCase(), class: "mdpro-callout" }), 0];
  },
  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src: string) => lineStart(src, / {0,3}> ?\[![A-Za-z]+\]/),
    tokenize: (src: string, _tokens: Token[], lexer: any) => {
      const match = /^ {0,3}> ?\[!([A-Za-z]+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)((?: {0,3}>[^\n]*(?:\n|$))*)/.exec(src);
      if (!match) return undefined;
      const body = match[4].replace(/\n$/, "").split("\n").map((line) => line.replace(/^ {0,3}> ?/, "")).join("\n");
      return { type: "callout", raw: match[0], kind: match[1], fold: match[2], title: match[3].trim(), tokens: body.trim() ? lexer.blockTokens(body) : [] };
    },
  },
  parseMarkdown: (token: Token, h: any) =>
    h.createNode("callout", { kind: token.kind, title: token.title, fold: token.fold }, blockChildren(token.tokens ?? [], h)),
  renderMarkdown: (node: JSONContent, h: any) => {
    const a = node.attrs ?? {};
    const head = `> [!${a.kind}]${a.fold ?? ""}${a.title ? ` ${a.title}` : ""}`;
    if (isEmptyParagraphOnly(node)) return head;
    const body = h.renderChildren(node.content ?? [], "\n\n") as string;
    return `${head}\n${body.split("\n").map((line) => (line.trim() === "" ? ">" : `> ${line}`)).join("\n")}`;
  },
});

// ---------------------------------------------------------------- <details>

function matchDetails(src: string): { raw: string; open: boolean; summary: string; inner: string } | null {
  const head = /^ {0,3}<details(\s+open)?\s*>/i.exec(src);
  if (!head) return null;
  const tag = /<(\/?)details\b[^>]*>/gi;
  tag.lastIndex = head[0].length;
  let depth = 1;
  let end = -1;
  let closeLen = 0;
  let found: RegExpExecArray | null;
  while ((found = tag.exec(src))) {
    depth += found[1] ? -1 : 1;
    if (depth === 0) {
      end = found.index;
      closeLen = found[0].length;
      break;
    }
  }
  if (end === -1) return null;
  let inner = src.slice(head[0].length, end);
  const trail = /^[ \t]*(?:\n|$)/.exec(src.slice(end + closeLen))?.[0] ?? "";
  let summary = "";
  const sum = /^\s*<summary>([\s\S]*?)<\/summary>/i.exec(inner);
  if (sum) {
    summary = sum[1].trim();
    inner = inner.slice(sum[0].length);
  }
  return { raw: src.slice(0, end + closeLen) + trail, open: Boolean(head[1]), summary, inner: inner.replace(/^\s*\n/, "").replace(/\n\s*$/, "") };
}

export const Details = Node.create({
  name: "details",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { summary: { default: "" }, open: { default: false } };
  },
  parseHTML() {
    return [{ tag: "div[data-details]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-details": "", class: "mdpro-details" }), 0];
  },
  markdownTokenizer: {
    name: "details",
    level: "block",
    start: (src: string) => lineStart(src, / {0,3}<details\b/i),
    tokenize: (src: string, _tokens: Token[], lexer: any) => {
      const found = matchDetails(src);
      if (!found) return undefined;
      return { type: "details", raw: found.raw, open: found.open, summary: found.summary, tokens: found.inner.trim() ? lexer.blockTokens(found.inner) : [] };
    },
  },
  parseMarkdown: (token: Token, h: any) => h.createNode("details", { summary: token.summary, open: token.open }, blockChildren(token.tokens ?? [], h)),
  renderMarkdown: (node: JSONContent, h: any) => {
    const a = node.attrs ?? {};
    const body = isEmptyParagraphOnly(node) ? "" : (h.renderChildren(node.content ?? [], "\n\n") as string);
    return `<details${a.open ? " open" : ""}>\n<summary>${a.summary ?? ""}</summary>\n\n${body}${body ? "\n\n" : ""}</details>`;
  },
});

// ---------------------------------------------------------------- raw HTML

const BLOCK_TAGS = "address|article|aside|blockquote|center|dialog|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|picture|pre|section|table|tbody|td|tfoot|th|thead|tr|ul|video|audio|iframe|img|svg|style|script|br";
const RAW_BLOCK = new RegExp(
  `^ {0,3}(?:<!--[\\s\\S]*?-->|<\\/?(?:${BLOCK_TAGS})(?=[\\s/>])[^\\n]*|<\\/?[A-Za-z][\\w-]*(?:\\s[^<>\\n]*)?\\/?>[ \\t]*(?=\\n|$))(?:\\n(?![ \\t]*\\n)[^\\n]*)*(?:\\n|$)`,
  "i",
);

export const RawHtmlBlock = Node.create({
  name: "rawHtml",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { html: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-raw-html]", getAttrs: (el) => ({ html: (el as HTMLElement).getAttribute("data-raw-html") ?? "" }) }];
  },
  renderHTML({ node }) {
    return ["div", { "data-raw-html": node.attrs.html, class: "mdpro-raw" }, node.attrs.html];
  },
  markdownTokenizer: {
    name: "rawHtml",
    level: "block",
    start: (src: string) => lineStart(src, / {0,3}<(?:!--|\/?[A-Za-z])/),
    tokenize: (src: string) => {
      if (/^ {0,3}<details\b/i.test(src)) return undefined;
      const match = RAW_BLOCK.exec(src);
      if (!match) return undefined;
      return { type: "rawHtml", raw: match[0], html: match[0].replace(/\n+$/, "") };
    },
  },
  parseMarkdown: (token: Token, h: any) => h.createNode("rawHtml", { html: token.html }),
  renderMarkdown: (node: JSONContent) => String(node.attrs?.html ?? ""),
});

export const RawHtmlInline = Node.create({
  name: "rawInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { html: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-raw-inline]", getAttrs: (el) => ({ html: (el as HTMLElement).getAttribute("data-raw-inline") ?? "" }) }];
  },
  renderHTML({ node }) {
    const html = String(node.attrs.html);
    return ["span", { "data-raw-inline": html, class: /^<br\b/i.test(html) ? "mdpro-br" : "mdpro-raw-inline" }, /^<br\b/i.test(html) ? "↵" : html];
  },
  markdownTokenizer: {
    name: "rawInline",
    level: "inline",
    start: (src: string) => src.search(/<(?:!--|\/?[A-Za-z])/),
    tokenize: (src: string) => {
      const match = /^(?:<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>)/.exec(src);
      if (!match) return undefined;
      return { type: "rawInline", raw: match[0], html: match[0] };
    },
  },
  parseMarkdown: (token: Token, h: any) => h.createNode("rawInline", { html: token.html }),
  renderMarkdown: (node: JSONContent) => String(node.attrs?.html ?? ""),
});

// ---------------------------------------------------------------- inline HTML marks

function htmlMark(name: string, tag: string) {
  return Mark.create({
    name,
    excludes: "",
    parseHTML() {
      return [{ tag }];
    },
    renderHTML({ HTMLAttributes }) {
      return [tag, HTMLAttributes, 0];
    },
    markdownTokenizer: {
      name,
      level: "inline",
      start: (src: string) => src.toLowerCase().indexOf(`<${tag}>`),
      tokenize: (src: string, _tokens: Token[], lexer: any) => {
        const match = new RegExp(`^<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i").exec(src);
        if (!match) return undefined;
        return { type: name, raw: match[0], tokens: lexer.inlineTokens(match[1]) };
      },
    },
    parseMarkdown: (token: Token, h: any) => h.applyMark(name, h.parseInline(token.tokens ?? [])),
    renderMarkdown: (node: JSONContent, h: any) => `<${tag}>${h.renderChildren(node)}</${tag}>`,
  });
}

export const Kbd = htmlMark("kbd", "kbd");
export const Superscript = htmlMark("superscript", "sup");
export const Subscript = htmlMark("subscript", "sub");

// ---------------------------------------------------------------- footnotes

export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { id: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "sup[data-footnote-ref]", getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-footnote-ref") ?? "" }) }];
  },
  renderHTML({ node }) {
    return ["sup", { "data-footnote-ref": node.attrs.id, class: "mdpro-fnref" }, String(node.attrs.id)];
  },
  markdownTokenizer: {
    name: "footnoteRef",
    level: "inline",
    start: (src: string) => src.indexOf("[^"),
    tokenize: (src: string) => {
      const match = /^\[\^([^\]\s]+)\](?!:)/.exec(src);
      if (!match) return undefined;
      return { type: "footnoteRef", raw: match[0], id: match[1] };
    },
  },
  parseMarkdown: (token: Token, h: any) => h.createNode("footnoteRef", { id: token.id }),
  renderMarkdown: (node: JSONContent) => `[^${node.attrs?.id ?? ""}]`,
});

export const FootnoteDef = Node.create({
  name: "footnoteDef",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return { id: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-footnote-def]", getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-footnote-def") ?? "" }) }];
  },
  renderHTML({ node }) {
    return ["div", { "data-footnote-def": node.attrs.id, id: `mdpro-fn-${node.attrs.id}`, class: "mdpro-fndef" }, 0];
  },
  markdownTokenizer: {
    name: "footnoteDef",
    level: "block",
    start: (src: string) => lineStart(src, / {0,3}\[\^[^\]\s]+\]:/),
    tokenize: (src: string, _tokens: Token[], lexer: any) => {
      const match = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?: {2,}|\t)[^\n]*)*)(?:\n|$)/.exec(src);
      if (!match) return undefined;
      const text = match[2].replace(/\n(?: {2,}|\t)/g, " ");
      return { type: "footnoteDef", raw: match[0], id: match[1], tokens: lexer.inlineTokens(text) };
    },
  },
  parseMarkdown: (token: Token, h: any) => h.createNode("footnoteDef", { id: token.id }, h.parseInline(token.tokens ?? [])),
  renderMarkdown: (node: JSONContent, h: any) => `[^${node.attrs?.id ?? ""}]: ${h.renderChildren(node.content ?? [])}`,
});

// ---------------------------------------------------------------- emoji

export const EMOJI = new Map<string, string>();
for (const entry of gemoji) for (const name of entry.names) EMOJI.set(name, entry.emoji);

export const Emoji = Node.create({
  name: "emoji",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { name: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-emoji]", getAttrs: (el) => ({ name: (el as HTMLElement).getAttribute("data-emoji") ?? "" }) }];
  },
  renderHTML({ node }) {
    const name = String(node.attrs.name);
    return ["span", { "data-emoji": name, class: "mdpro-emoji", title: `:${name}:` }, EMOJI.get(name) ?? `:${name}:`];
  },
  markdownTokenizer: {
    name: "emoji",
    level: "inline",
    start: (src: string) => {
      const re = /:([a-z0-9_+-]+):/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(src))) {
        if (EMOJI.has(match[1])) return match.index;
        re.lastIndex = match.index + 1;
      }
      return -1;
    },
    tokenize: (src: string) => {
      const match = /^:([a-z0-9_+-]+):/.exec(src);
      if (!match || !EMOJI.has(match[1])) return undefined;
      return { type: "emoji", raw: match[0], name: match[1] };
    },
  },
  parseMarkdown: (token: Token, h: any) => h.createNode("emoji", { name: token.name }),
  renderMarkdown: (node: JSONContent) => `:${node.attrs?.name ?? ""}:`,
});

// ---------------------------------------------------------------- math

function firstIndex(src: string, needles: string[]): number {
  const found = needles.map((needle) => src.indexOf(needle)).filter((index) => index !== -1);
  return found.length ? Math.min(...found) : -1;
}

/** `$x$` (not prices like "$5 and $10") and `\(x\)`, keeping the delimiter. */
export const RichInlineMath = InlineMath.extend({
  addAttributes() {
    return { ...this.parent?.(), delimiter: { default: "$", rendered: false } };
  },
  markdownTokenizer: {
    name: "inlineMath",
    level: "inline",
    start: (src: string) => firstIndex(src, ["$", "\\("]),
    tokenize: (src: string) => {
      const dollar = /^\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\d$])/.exec(src);
      if (dollar) return { type: "inlineMath", raw: dollar[0], latex: dollar[1], delimiter: "$" };
      const paren = /^\\\(([\s\S]+?)\\\)/.exec(src);
      if (paren) return { type: "inlineMath", raw: paren[0], latex: paren[1].trim(), delimiter: "\\(" };
      return undefined;
    },
  },
  parseMarkdown: (token: Token, h: any) => h.createNode("inlineMath", { latex: token.latex, delimiter: token.delimiter ?? "$" }),
  renderMarkdown: (node: JSONContent) => {
    const latex = String(node.attrs?.latex ?? "");
    return node.attrs?.delimiter === "\\(" ? `\\(${latex}\\)` : `$${latex}$`;
  },
});

/** `$$…$$` and `\[…\]`, single- or multi-line, keeping the delimiter and layout. */
export const RichBlockMath = BlockMath.extend({
  addAttributes() {
    return { ...this.parent?.(), delimiter: { default: "$$", rendered: false }, multiline: { default: true, rendered: false } };
  },
  markdownTokenizer: {
    name: "blockMath",
    level: "block",
    start: (src: string) => lineStart(src, / {0,3}(?:\$\$|\\\[)/),
    tokenize: (src: string) => {
      const dollar = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src);
      if (dollar) return { type: "blockMath", raw: dollar[0], latex: dollar[1].trim(), delimiter: "$$", multiline: dollar[1].includes("\n") };
      const bracket = /^ {0,3}\\\[([\s\S]+?)\\\][ \t]*(?:\n|$)/.exec(src);
      if (bracket) return { type: "blockMath", raw: bracket[0], latex: bracket[1].trim(), delimiter: "\\[", multiline: bracket[1].includes("\n") };
      return undefined;
    },
  },
  parseMarkdown: (token: Token, h: any) => h.createNode("blockMath", { latex: token.latex, delimiter: token.delimiter ?? "$$", multiline: token.multiline ?? true }),
  renderMarkdown: (node: JSONContent) => {
    const latex = String(node.attrs?.latex ?? "");
    const [open, close] = node.attrs?.delimiter === "\\[" ? ["\\[", "\\]"] : ["$$", "$$"];
    return node.attrs?.multiline === false ? `${open}${latex}${close}` : `${open}\n${latex}\n${close}`;
  },
});

/** marked gives later-registered tokenizers precedence: generic ones first, specific last. */
export const agentMarkdownExtensions = [RawHtmlInline, RawHtmlBlock, Emoji, FootnoteRef, Subscript, Superscript, Kbd, FootnoteDef, Details, Callout];

// ---------------------------------------------------------------- escaping

/**
 * Escape only characters that would otherwise change meaning, so agent text
 * like `file_name.md`, `5*3`, `[draft]` or `Map<K, V>` is written back as-is.
 */
export function escapeTextMinimal(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const prev = text[i - 1] ?? " ";
    const next = text[i + 1] ?? " ";
    const word = (c: string) => /[\p{L}\p{N}]/u.test(c);
    const space = (c: string) => /\s/.test(c);
    switch (ch) {
      case "\\":
        out += /[!-/:-@[-`{-~]/.test(next) ? "\\\\" : "\\";
        break;
      case "`":
        out += "\\`";
        break;
      case "_":
        out += word(prev) && word(next) ? "_" : space(next) || space(prev) && space(next) ? "_" : "\\_";
        break;
      case "*":
        out += (space(prev) && space(next)) || (/\d/.test(prev) && /\d/.test(next)) ? "*" : "\\*";
        break;
      case "~":
        out += next === "~" || prev === "~" ? "\\~" : "~";
        break;
      case "[": {
        const rest = text.slice(i);
        out += /^\[[^\]]*\](?:\(|\[|:)/.test(rest) || /^\[[!^]/.test(rest) ? "\\[" : "[";
        break;
      }
      case "<":
        out += /^<(?:!--|\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>|[a-z][a-z\d+.-]*:[^\s<>]*>)/i.test(text.slice(i)) ? "&lt;" : "<";
        break;
      case "&":
        out += /^&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/i.test(text.slice(i)) ? "&amp;" : "&";
        break;
      default:
        out += ch;
    }
  }
  return out;
}

type ManagerClass = { prototype: { encodeTextForMarkdown: (text: string, node: any, parent: any) => string; codeTypes: Set<string> } };

export function installMinimalEscaping(Manager: ManagerClass) {
  const proto = Manager.prototype as any;
  if (proto.__mdproEscaping) return;
  proto.__mdproEscaping = true;
  proto.encodeTextForMarkdown = function (this: any, text: string, node: any, parentNode: any) {
    const inCode = (parentNode?.type != null && this.codeTypes.has(parentNode.type)) || (node.marks ?? []).some((m: any) => this.codeTypes.has(typeof m === "string" ? m : m.type));
    return inCode ? text : escapeTextMinimal(text);
  };
}
