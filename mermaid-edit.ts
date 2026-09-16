// Text-level edits of Mermaid flowcharts driven from the rendered diagram.
// Operates on the source so the Markdown stays the single source of truth.

export type Shape = "rect" | "round" | "stadium" | "circle" | "diamond" | "hexagon" | "subroutine" | "database";

export const SHAPES: { id: Shape; label: string; open: string; close: string }[] = [
  { id: "rect", label: "Rectangle", open: "[", close: "]" },
  { id: "round", label: "Rounded", open: "(", close: ")" },
  { id: "stadium", label: "Stadium", open: "([", close: "])" },
  { id: "circle", label: "Circle", open: "((", close: "))" },
  { id: "diamond", label: "Condition", open: "{", close: "}" },
  { id: "hexagon", label: "Hexagon", open: "{{", close: "}}" },
  { id: "subroutine", label: "Subroutine", open: "[[", close: "]]" },
  { id: "database", label: "Database", open: "[(", close: ")]" },
];

// Longest openers first so "((" wins over "(".
const OPENERS = [...SHAPES].sort((a, b) => b.open.length - a.open.length);

export function isFlowchart(code: string): boolean {
  return /^\s*(?:%%.*\n\s*)*(flowchart|graph)\b/i.test(code);
}

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idToken = (id: string) => new RegExp(`(^|[^\\w-])(${escapeRe(id)})(?![\\w-])`, "g");

type Declaration = { start: number; end: number; shape: (typeof SHAPES)[number]; text: string };

/** First `ID<shape>text<close>` in the source. */
export function findDeclaration(code: string, id: string): Declaration | null {
  const re = idToken(id);
  let match: RegExpExecArray | null;
  while ((match = re.exec(code))) {
    const idStart = match.index + match[1].length;
    const after = idStart + id.length;
    const shape = OPENERS.find((s) => code.startsWith(s.open, after));
    if (!shape) continue;
    const textStart = after + shape.open.length;
    const close = code.indexOf(shape.close, textStart);
    const newline = code.indexOf("\n", textStart);
    if (close === -1 || (newline !== -1 && newline < close)) continue;
    return { start: idStart, end: close + shape.close.length, shape, text: code.slice(textStart, close) };
  }
  return null;
}

export function labelOf(code: string, id: string): string {
  const text = findDeclaration(code, id)?.text ?? id;
  return text.replace(/^"(.*)"$/, "$1");
}

function quote(text: string): string {
  const clean = text.replace(/"/g, "'").replace(/\n/g, " ").trim() || " ";
  return /[[\](){}<>|#;:]/.test(clean) ? `"${clean}"` : clean;
}

function setNode(code: string, id: string, shapeId: Shape | null, text: string | null): string {
  const found = findDeclaration(code, id);
  const shape = SHAPES.find((s) => s.id === shapeId) ?? found?.shape ?? SHAPES[0];
  const label = text !== null ? quote(text) : found?.text ?? id;
  const replacement = `${id}${shape.open}${label}${shape.close}`;
  if (found) return code.slice(0, found.start) + replacement + code.slice(found.end);
  const re = idToken(id);
  const match = re.exec(code);
  if (!match) return append(code, replacement);
  const idStart = match.index + match[1].length;
  return code.slice(0, idStart) + replacement + code.slice(idStart + id.length);
}

export const renameNode = (code: string, id: string, text: string) => setNode(code, id, null, text);
export const reshapeNode = (code: string, id: string, shape: Shape) => setNode(code, id, shape, null);

export function nextId(code: string): string {
  let n = 1;
  while (idToken(`N${n}`).test(code)) n += 1;
  return `N${n}`;
}

function indentOf(code: string): string {
  return /\n([ \t]+)\S/.exec(code)?.[1] ?? "    ";
}

function append(code: string, line: string): string {
  return `${code.replace(/\s*$/, "")}\n${indentOf(code)}${line}`;
}

export function addNode(code: string, text = "New block", shape: Shape = "rect"): { code: string; id: string } {
  const id = nextId(code);
  const s = SHAPES.find((x) => x.id === shape)!;
  return { code: append(code, `${id}${s.open}${quote(text)}${s.close}`), id };
}

export function addAfter(code: string, from: string, text = "New block", shape: Shape = "rect", edgeLabel?: string): { code: string; id: string } {
  const id = nextId(code);
  const s = SHAPES.find((x) => x.id === shape)!;
  const arrow = edgeLabel ? `-->|${quote(edgeLabel)}|` : "-->";
  return { code: append(code, `${from} ${arrow} ${id}${s.open}${quote(text)}${s.close}`), id };
}

export function connect(code: string, from: string, to: string): string {
  return append(code, `${from} --> ${to}`);
}

const EDGE = /\s*(<?(?:-{2,}|={2,}|-\.+-?)(?:>|o|x)?(?:\|[^|\n]*\|)?)\s*/;

/** Node ids in a simple statement line, in order, with inline declarations. */
function statementNodes(line: string): { id: string; decl: string }[] | null {
  const body = line.trim().replace(/;$/, "");
  if (body === "" || /^(%%|flowchart\b|graph\b|subgraph\b|end\b|classDef\b|class\b|style\b|linkStyle\b|click\b|direction\b)/.test(body)) return null;
  const parts = body.split(new RegExp(EDGE.source, "g")).filter((_, index) => index % 2 === 0);
  const nodes: { id: string; decl: string }[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    const id = /^[\w-]+/.exec(trimmed)?.[0];
    if (!id) return null;
    nodes.push({ id, decl: trimmed.replace(/:::[\w-]+$/, "") });
  }
  return nodes;
}

/** Removes a node and its edges; reconnects direct predecessors to successors. */
export function deleteNode(code: string, id: string): string {
  const lines = code.split("\n");
  const kept: string[] = [];
  const preserved: string[] = [];
  const preds = new Set<string>();
  const succs = new Set<string>();
  for (const line of lines) {
    const nodes = statementNodes(line);
    if (!nodes || !nodes.some((n) => n.id === id)) {
      kept.push(line);
      continue;
    }
    nodes.forEach((node, index) => {
      if (node.id === id) {
        if (index > 0) preds.add(nodes[index - 1].id);
        if (index < nodes.length - 1) succs.add(nodes[index + 1].id);
      } else if (node.decl !== node.id) {
        preserved.push(node.decl);
      }
    });
    // Keep sub-chains that don't involve the node.
    const indent = /^\s*/.exec(line)?.[0] ?? "    ";
    let chain: string[] = [];
    const flush = () => {
      if (chain.length > 1) kept.push(indent + chain.join(" --> "));
      chain = [];
    };
    for (const node of nodes) {
      if (node.id === id) flush();
      else chain.push(node.decl);
    }
    flush();
  }
  let result = kept.join("\n");
  for (const decl of preserved) {
    const declId = /^[\w-]+/.exec(decl)![0];
    if (!findDeclaration(result, declId)) result = append(result, decl);
  }
  for (const p of preds) for (const s of succs) if (p !== s) result = connect(result, p, s);
  return result;
}

/** Mermaid renders node groups with ids like `flowchart-A-0` or `mermaid-1-flowchart-A-0`. */
export function nodeIdFromSvg(element: Element): string | null {
  const dataId = element.getAttribute("data-id");
  if (dataId) return dataId;
  const match = /flowchart-(.+)-\d+$/.exec(element.id);
  return match ? match[1] : null;
}
