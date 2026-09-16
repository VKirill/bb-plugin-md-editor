// Visual-only decorations (never change the document): status badges and
// clickable BB entity references (thread ids, task keys).
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";
import { t } from "./i18n";

export type BadgeTone = "ok" | "fail" | "warn" | "info";

const WORD_TONES: [RegExp, BadgeTone][] = [
  [/\b(?:PASS(?:ED)?|OK|DONE|SUCCESS|RESOLVED|MERGED|READY)\b/g, "ok"],
  [/\b(?:FAIL(?:ED|URE)?|ERROR|BROKEN|REJECTED)\b/g, "fail"],
  [/\b(?:WARN(?:ING)?|BLOCKED|FLAKY|PARTIAL|WIP)\b/g, "warn"],
  [/\b(?:TODO|SKIP(?:PED)?|PENDING|N\/A)\b/g, "info"],
  [/✅|✔️?|☑️?/g, "ok"],
  [/❌|✖️?|⛔/g, "fail"],
  [/⚠️?/g, "warn"],
];

const CELL_TONES: [RegExp, BadgeTone][] = [
  [/^(?:pass(?:ed)?|ok|done|yes|success|ready|готово|сделано|да|работает|пройдено|успех)$/i, "ok"],
  [/^(?:fail(?:ed)?|error|no|broken|ошибка|нет|не работает|провал|сломано)$/i, "fail"],
  [/^(?:warn(?:ing)?|blocked|partial|wip|in progress|в работе|частично|блокер|риск)$/i, "warn"],
  [/^(?:todo|pending|skip(?:ped)?|n\/a|не сделано|ожидает|план|пропущено)$/i, "info"],
];

export const ENTITY_RE = /\b(thr_[a-z0-9]{8,14})\b|\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g;

export function findBadges(text: string): { from: number; to: number; tone: BadgeTone }[] {
  const found: { from: number; to: number; tone: BadgeTone }[] = [];
  for (const [re, tone] of WORD_TONES) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) found.push({ from: match.index, to: match.index + match[0].length, tone });
  }
  return found;
}

export function cellTone(text: string): BadgeTone | null {
  const clean = text.replace(/[✅❌⚠️✔✖☑⛔]/gu, "").trim();
  for (const [re, tone] of CELL_TONES) if (re.test(clean)) return tone;
  return null;
}

function build(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.name === "codeBlock" || node.type.name === "rawHtml") return false;
    if (node.type.name === "tableCell") {
      const tone = cellTone(node.textContent);
      if (tone && node.textContent.trim().length <= 24) {
        node.descendants((child, childPos) => {
          if (child.isText && child.text?.trim()) {
            const start = pos + 1 + childPos;
            decorations.push(Decoration.inline(start, start + child.nodeSize, { class: `mdpro-badge mdpro-badge-${tone}` }));
          }
        });
        return false;
      }
    }
    if (!node.isText || !node.text || node.marks.some((mark) => mark.type.name === "code")) return;
    if (parent?.type.name === "codeBlock") return;
    for (const badge of findBadges(node.text)) {
      decorations.push(Decoration.inline(pos + badge.from, pos + badge.to, { class: `mdpro-badge mdpro-badge-${badge.tone}` }));
    }
    ENTITY_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ENTITY_RE.exec(node.text))) {
      const attrs = match[1]
        ? { class: "mdpro-tool mdpro-entity mdpro-entity-thread", "data-thread": match[1], "data-tip": t("openThread") }
        : { class: "mdpro-tool mdpro-entity mdpro-entity-task", "data-task": match[2], "data-tip": t("openTask") };
      decorations.push(Decoration.inline(pos + match.index, pos + match.index + match[0].length, attrs));
    }
  });
  return DecorationSet.create(doc, decorations);
}

const key = new PluginKey("mdpro-decorations");

export const AgentDecorations = Extension.create({
  name: "agentDecorations",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});
