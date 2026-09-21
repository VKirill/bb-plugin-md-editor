// Parses ASCII/Unicode directory trees that agents write in code blocks:
//
//   project/
//   ├── src/            # comment
//   │   └── app.ts
//   └── README.md
//
// into nodes with depth, name, folder flag and comment.

export type TreeNode = { depth: number; name: string; comment: string | null; folder: boolean };

const BRANCH = /^((?:[│|┃ \t]|&nbsp;)*)(?:├──|└──|├─|└─|┣━━|┗━━|\|--|\+--|`--|\\--|[-*]\s)?\s*/;
const COMMENT = /\s+(?:#|\/\/|<--|←|—|--)\s*(.*)$/;

export function looksLikeTree(code: string): boolean {
  const lines = code.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 2) return false;
  if (lines.some((line) => /^[ \t]*[┌╔┏].*[┐╗┓][ \t]*$/.test(line) && /[─━═]/.test(line))) return false;
  const branchy = lines.filter((line) => /[├└│┣┗]|(?:^|\s)(?:\|--|\+--|`--)/.test(line)).length;
  return branchy >= Math.max(1, Math.ceil((lines.length - 1) * 0.5));
}

export function parseTree(code: string): TreeNode[] {
  const rows: { indent: number; name: string; comment: string | null }[] = [];
  for (const raw of code.replace(/\t/g, "    ").split("\n")) {
    if (raw.trim() === "") continue;
    const prefix = BRANCH.exec(raw)?.[0] ?? "";
    let rest = raw.slice(prefix.length);
    let comment: string | null = null;
    const match = COMMENT.exec(rest);
    if (match) {
      comment = match[1].trim() || null;
      rest = rest.slice(0, match.index);
    }
    const name = rest.trim();
    if (name === "") continue;
    rows.push({ indent: prefix.length, name, comment });
  }
  // Map distinct indents to depths.
  const levels = [...new Set(rows.map((row) => row.indent))].sort((a, b) => a - b);
  const nodes: TreeNode[] = rows.map((row) => ({
    depth: levels.indexOf(row.indent),
    name: row.name.replace(/\/$/, ""),
    comment: row.comment,
    folder: row.name.endsWith("/"),
  }));
  nodes.forEach((node, index) => {
    const next = nodes[index + 1];
    if (next && next.depth > node.depth) node.folder = true;
  });
  return nodes;
}
