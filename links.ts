// Resolves a link written inside a Markdown document to where BB should open
// it. Relative links resolve against the document's own directory on the
// document's own machine.

export type LiveFileTarget =
  | { kind: "workspace"; environmentId: string; path: string }
  | { kind: "host"; hostId: string; path: string }
  | { kind: "thread-storage"; threadId: string; path: string };

export type FileLocation = { kind: "range"; startLine: number; endLine: number } | null;

export type DocumentContext = {
  source: { kind: "host" | "thread-storage" | "workspace"; threadId: string | null; environmentId: string | null };
  hostId: string;
  absPath: string;
  rootPath: string | null;
};

export type LinkAction =
  | { type: "url"; url: string }
  | { type: "file"; target: LiveFileTarget; location: FileLocation }
  | { type: "anchor"; id: string };

export function normalizePosix(input: string): string {
  const absolute = input.startsWith("/");
  const out: string[] = [];
  for (const part of input.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
    } else out.push(part);
  }
  return (absolute ? "/" : "") + out.join("/");
}

export function dirnamePosix(input: string): string {
  const index = input.lastIndexOf("/");
  return index <= 0 ? "/" : input.slice(0, index);
}

function relativeWithin(root: string, absolute: string): string | null {
  const base = root.endsWith("/") ? root : `${root}/`;
  return absolute.startsWith(base) ? absolute.slice(base.length) : null;
}

export function resolveLink(href: string, doc: DocumentContext): LinkAction | null {
  const raw = href.trim();
  if (raw === "") return null;
  if (raw.startsWith("#")) return { type: "anchor", id: decodeSafe(raw.slice(1)) };
  if (/^(https?|mailto):/i.test(raw)) return { type: "url", url: raw };
  let pathPart: string;
  if (/^file:/i.test(raw)) {
    try {
      pathPart = decodeURIComponent(new URL(raw).pathname);
    } catch {
      return null;
    }
  } else if (/^[a-z][a-z0-9+-]*:(?!\d+(:\d+)?$)/i.test(raw)) {
    return null;
  } else {
    pathPart = decodeSafe(raw.split("?")[0]);
  }

  let location: FileLocation = null;
  const hashLines = /#L(\d+)(?:-L?(\d+))?$/.exec(pathPart);
  const colonLines = hashLines ? null : /:(\d+)(?::\d+)?$/.exec(pathPart);
  const lines = hashLines ?? colonLines;
  if (lines) {
    const start = Number(lines[1]);
    const end = Number(hashLines?.[2] ?? start);
    if (start > 0 && end >= start) location = { kind: "range", startLine: start, endLine: end };
    pathPart = pathPart.slice(0, lines.index);
  }
  pathPart = pathPart.replace(/#.*$/, "");
  if (pathPart === "") return null;

  const absolute = normalizePosix(pathPart.startsWith("/") ? pathPart : `${dirnamePosix(doc.absPath)}/${pathPart}`);
  const inside = doc.rootPath ? relativeWithin(normalizePosix(doc.rootPath), absolute) : null;
  if (inside !== null && doc.source.kind === "workspace" && doc.source.environmentId) {
    return { type: "file", target: { kind: "workspace", environmentId: doc.source.environmentId, path: inside }, location };
  }
  if (inside !== null && doc.source.kind === "thread-storage" && doc.source.threadId) {
    return { type: "file", target: { kind: "thread-storage", threadId: doc.source.threadId, path: inside }, location };
  }
  return { type: "file", target: { kind: "host", hostId: doc.hostId, path: absolute }, location };
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const INLINE_LINK = /(!?\[(?:[^\]\\]|\\.)*\]\()(<[^>\n]*>|[^)\s]+)((?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\))/g;
const REFERENCE_DEF = /^( {0,3}\[[^\]\n]+\]:\s*)(<[^>\n]*>|\S+)/gm;

/**
 * Rewrites relative link destinations to absolute paths from the document's
 * directory, so the host Markdown renderer (which resolves against the thread
 * workspace) links to the right file. Fenced code is left untouched.
 */
export function absolutizeLinks(content: string, absPath: string): string {
  const dir = dirnamePosix(absPath);
  const fix = (target: string) => {
    const bare = target.startsWith("<") ? target.slice(1, -1) : target;
    if (bare === "" || bare.startsWith("#") || bare.startsWith("/") || /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(bare)) return target;
    const hash = bare.indexOf("#");
    const pathPart = hash === -1 ? bare : bare.slice(0, hash);
    const suffix = hash === -1 ? "" : bare.slice(hash);
    let decoded = pathPart;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      /* keep literal */
    }
    return `<${normalizePosix(`${dir}/${decoded}`)}${suffix}>`;
  };
  const parts = content.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[^\n]*$)/m);
  return parts
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(INLINE_LINK, (_m, open: string, target: string, close: string) => `${open}${fix(target)}${close}`)
            .replace(REFERENCE_DEF, (_m, open: string, target: string) => `${open}${fix(target)}`),
    )
    .join("");
}
