// Maps a Markdown fragment back to line numbers in the file and formats a
// chat quote with a file reference.

const strip = (line: string) =>
  line
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*(?:\[![A-Za-z]+\][+-]?\s*)?|\|)/, "")
    .replace(/[*_`~|[\]\\]/g, "")
    .replace(/\]\([^)]*\)/g, "")
    .trim();

/** 1-based inclusive line range of `fragment` inside `source`, or null. */
export function findSourceLines(source: string, fragment: string, hintLine = 1): { start: number; end: number } | null {
  const sourceLines = source.split("\n");
  const fragLines = fragment.split("\n").map(strip).filter((line) => line.length > 0);
  if (fragLines.length === 0) return null;
  const find = (snippet: string, from: number) => {
    const needle = snippet.slice(0, 60);
    const order = [...sourceLines.keys()].filter((index) => index >= from);
    // Prefer matches closest to the hint.
    order.sort((a, b) => Math.abs(a - (hintLine - 1)) - Math.abs(b - (hintLine - 1)));
    for (const index of order) if (strip(sourceLines[index]).includes(needle)) return index;
    return -1;
  };
  const start = find(fragLines[0], 0);
  if (start === -1) return null;
  let end = start;
  if (fragLines.length > 1) {
    const last = fragLines[fragLines.length - 1];
    for (let index = start; index < sourceLines.length; index += 1) {
      if (strip(sourceLines[index]).includes(last.slice(0, 60))) {
        end = index;
        break;
      }
    }
  }
  return { start: start + 1, end: end + 1 };
}

export function lineLabel(range: { start: number; end: number } | null): string {
  if (!range) return "";
  return range.start === range.end ? `:${range.start}` : `:${range.start}-${range.end}`;
}

/** Chat draft block: a file reference line, the quoted Markdown, optional comment. */
export function formatChatQuote(input: { path: string; host?: string; range: { start: number; end: number } | null; markdown: string; comment?: string }): string {
  const lines = input.range ? (input.range.start === input.range.end ? `line ${input.range.start}` : `lines ${input.range.start}–${input.range.end}`) : "";
  const where = [lines, input.host].filter(Boolean).join(", ");
  const header = `\`${input.path}${lineLabel(input.range)}\`${where ? ` (${where})` : ""}`;
  const quoted = input.markdown.trim().split("\n").map((line) => (line.trim() ? `> ${line}` : ">")).join("\n");
  return [header, quoted, input.comment?.trim() ? `\n${input.comment.trim()}` : ""].filter(Boolean).join("\n");
}
