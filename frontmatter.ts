// YAML front matter is kept out of the rich editor and written back verbatim
// unless the user edits it in the properties panel.

export type SplitDocument = { frontMatter: string | null; body: string; eol: "\n" | "\r\n" };

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitFrontMatter(content: string): SplitDocument {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const source = content.startsWith("﻿") ? content.slice(1) : content;
  const match = FRONT_MATTER.exec(source);
  if (!match) return { frontMatter: null, body: content, eol };
  return { frontMatter: match[1], body: source.slice(match[0].length).replace(/^\r?\n/, ""), eol };
}

export function joinFrontMatter(frontMatter: string | null, body: string, eol: "\n" | "\r\n" = "\n"): string {
  const text = body.endsWith("\n") ? body : `${body}\n`;
  const joined = frontMatter === null ? text : `---\n${frontMatter.replace(/\s+$/, "")}\n---\n\n${text}`;
  return eol === "\r\n" ? joined.replace(/\r?\n/g, "\r\n") : joined;
}
