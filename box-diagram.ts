// Box-drawing maps agents write as ASCII art — fenced or as a bare block:
//
//   ┌─────────────┐
//   │ Layer title │
//   │ - item      │
//   └─────────────┘
//           ↓

export type BoxDiagramPart =
  | { kind: "box"; title: string; lines: string[] }
  | { kind: "arrow"; symbol: string }
  | { kind: "raw"; text: string };

export type ForkNode = { title: string; lines: string[] };
export type ForkDiagram = { root: ForkNode; branches: ForkNode[]; merge: ForkNode | null };

const TOP = /^[ \t]*[┌╔┏].*[┐╗┓][ \t]*$/;
const BOTTOM = /^[ \t]*[└╚┗].*[┘╝┛][ \t]*$/;
const SIDE = /^[ \t]*[│┃║].*[│┃║][ \t]*$/;
const BAR = /[─━═]/;
const ARROW = /^[ \t]*([↓↑←→▼▲◀▶⇓⇑⇨⇦⇩⇧]|-+>|<-+|\^|v)[ \t]*$/i;

function isFork(line: string): boolean {
  return /[┴┬┼]/.test(line);
}

export function isBoxTop(line: string): boolean {
  return TOP.test(line) && BAR.test(line) && !isFork(line);
}

export function isBoxBottom(line: string): boolean {
  return BOTTOM.test(line) && BAR.test(line) && !isFork(line);
}

export function isBoxSide(line: string): boolean {
  return SIDE.test(line);
}

export function isArrowLine(line: string): boolean {
  return ARROW.test(line);
}

export function isBoxDiagramLine(line: string): boolean {
  return isBoxTop(line) || isBoxBottom(line) || isBoxSide(line) || isArrowLine(line);
}

export function looksLikeForkDiagram(code: string): boolean {
  return /[┌╔┏].*[┴].*[┐╗┓]/.test(code) && /[└╚┗].*[┬].*[┘╝┛]/.test(code);
}

function arrowColumns(line: string): number[] {
  const at: number[] = [];
  for (let i = 0; i < line.length; i += 1) {
    if ("↓▼⇓".includes(line[i])) at.push(i);
  }
  return at;
}

function widestGap(line: string, lo: number, hi: number): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  let i = Math.max(0, lo);
  const limit = Math.min(line.length, Math.max(hi, lo) + 1);
  while (i < limit) {
    if (line[i] !== " ") {
      i += 1;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] === " ") j += 1;
    if (j - i >= 2 && (!best || j - i > best.end - best.start)) best = { start: i, end: j };
    i = j;
  }
  return best;
}

function splitRow(line: string, anchors: number[]): string[] {
  if (anchors.length < 2) return [line.trim()];
  const cells: string[] = [];
  let from = 0;
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const gap = widestGap(line, anchors[i], anchors[i + 1]);
    const cut = gap?.start ?? Math.floor((anchors[i] + anchors[i + 1]) / 2);
    cells.push(line.slice(from, cut).trim());
    from = gap?.end ?? cut;
  }
  cells.push(line.slice(from).trim());
  return cells;
}

function nodeFrom(rows: string[]): ForkNode {
  const filled = rows.map((row) => row.trim()).filter((row) => row !== "");
  return { title: filled[0] ?? "", lines: filled.slice(1) };
}

/** Split–join maps: one root, N columns under ┴…┬, optional merge. */
export function parseForkDiagram(code: string): ForkDiagram | null {
  if (!looksLikeForkDiagram(code)) return null;
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  const splitAt = lines.findIndex((line) => /[┌╔┏]/.test(line) && /┴/.test(line));
  const joinAt = lines.findIndex((line) => /[└╚┗]/.test(line) && /┬/.test(line));
  if (splitAt < 0 || joinAt <= splitAt) return null;

  let anchors: number[] = [];
  for (let i = splitAt + 1; i < joinAt; i += 1) {
    const cols = arrowColumns(lines[i]);
    if (cols.length >= 2) {
      anchors = cols;
      break;
    }
  }
  if (anchors.length < 2) return null;

  const skip = (line: string) => line.trim() === "" || isArrowLine(line) || arrowColumns(line).length >= 2;
  const root = nodeFrom(lines.slice(0, splitAt).filter((line) => !skip(line)));
  const columns: string[][] = anchors.map(() => []);
  for (let i = splitAt + 1; i < joinAt; i += 1) {
    if (skip(lines[i]) || (/[┴┬┌┐└┘─]/.test(lines[i]) && !/[A-Za-zА-Яа-яЁё]/.test(lines[i]))) continue;
    splitRow(lines[i], anchors).forEach((cell, index) => {
      if (cell && index < columns.length) columns[index].push(cell);
    });
  }
  const branches = columns.map(nodeFrom).filter((node) => node.title);
  if (branches.length < 2) return null;
  const merge = nodeFrom(lines.slice(joinAt + 1).filter((line) => !skip(line)));
  return { root, branches, merge: merge.title ? merge : null };
}

export function looksLikeBoxDiagram(code: string): boolean {
  if (/[┴┬┼]/.test(code)) return false;
  let tops = 0;
  let bots = 0;
  let sides = 0;
  for (const line of code.split("\n")) {
    if (isBoxTop(line)) tops += 1;
    if (isBoxBottom(line)) bots += 1;
    if (isBoxSide(line)) sides += 1;
  }
  return tops >= 1 && bots >= 1 && sides >= 1;
}

function innerOf(line: string): string {
  return line.replace(/^[ \t]*[│┃║]/, "").replace(/[│┃║][ \t]*$/, "").trim();
}

export function parseBoxDiagram(code: string): BoxDiagramPart[] | null {
  if (!looksLikeBoxDiagram(code)) return null;
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  const parts: BoxDiagramPart[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (isBoxTop(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !isBoxBottom(lines[i])) {
        if (isBoxSide(lines[i])) body.push(innerOf(lines[i]));
        else if (lines[i].trim() !== "") body.push(lines[i].trim());
        i += 1;
      }
      if (i < lines.length && isBoxBottom(lines[i])) i += 1;
      const filled = body.filter((row) => row !== "");
      parts.push({ kind: "box", title: filled[0] ?? "", lines: filled.slice(1) });
      continue;
    }
    if (isArrowLine(line)) {
      parts.push({ kind: "arrow", symbol: ARROW.exec(line)?.[1] ?? line.trim() });
      i += 1;
      continue;
    }
    parts.push({ kind: "raw", text: line });
    i += 1;
  }
  return parts.some((part) => part.kind === "box") ? parts : null;
}

/** Consume a bare (unfenced) vertical box map starting at the first line of `src`. */
export function matchAsciiDiagram(src: string): { raw: string; text: string } | null {
  if (!isBoxTop(src.split("\n", 1)[0] ?? "")) return null;
  const lines = src.split("\n");
  let i = 0;
  let lastInclusive = -1;
  let complete = 0;
  let inBox = false;
  let empties = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      if (!inBox) {
        empties += 1;
        if (empties >= 2) break;
      }
      i += 1;
      continue;
    }
    empties = 0;
    if (isBoxTop(line)) {
      inBox = true;
      i += 1;
      continue;
    }
    if (inBox && (isBoxSide(line) || isBoxBottom(line))) {
      if (isBoxBottom(line)) {
        inBox = false;
        complete += 1;
        lastInclusive = i;
      }
      i += 1;
      continue;
    }
    if (!inBox && isArrowLine(line)) {
      lastInclusive = i;
      i += 1;
      continue;
    }
    break;
  }
  if (complete < 1 || lastInclusive < 0) return null;
  const text = lines.slice(0, lastInclusive + 1).join("\n");
  const trail = src.slice(text.length).startsWith("\n") ? "\n" : "";
  return { raw: text + trail, text };
}
