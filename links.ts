// Resolves a link written inside a Markdown document to where BB should open
// it. Relative links resolve against the document's own directory on the
// document's own machine.

import { dirnamePath, encodePathSegments, isWindowsPath, relativeWithin, resolvePath } from "./paths";
import { decodeHTMLStrict } from "entities";

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

export function resolveLink(href: string, doc: DocumentContext): LinkAction | null {
  const raw = href.trim();
  if (raw === "") return null;
  if (raw.startsWith("#")) return { type: "anchor", id: decodeSafe(raw.slice(1)) };
  if (/^(https?|mailto):/i.test(raw)) return { type: "url", url: raw };
  let pathPart = localHrefPath(raw);
  if (pathPart === null) return null;

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
  pathPart = decodeSafe(pathPart.replace(/#.*$/, ""));
  if (pathPart === "") return null;

  const absolute = resolvePath(dirnamePath(doc.absPath), pathPart);
  const inside = doc.rootPath ? relativeWithin(doc.rootPath, absolute) : null;
  if (inside !== null && doc.source.kind === "workspace" && doc.source.environmentId) {
    return { type: "file", target: { kind: "workspace", environmentId: doc.source.environmentId, path: inside }, location };
  }
  if (inside !== null && doc.source.kind === "thread-storage" && doc.source.threadId) {
    return { type: "file", target: { kind: "thread-storage", threadId: doc.source.threadId, path: inside }, location };
  }
  return { type: "file", target: { kind: "host", hostId: doc.hostId, path: absolute }, location };
}

/** Keep URL syntax separate from percent-encoded filename characters. */
function localHrefPath(raw: string): string | null {
  let pathPart: string;
  if (/^file:/i.test(raw)) {
    try {
      const url = new URL(raw);
      pathPart = url.host && url.host !== "localhost" ? `//${url.host}${url.pathname}` : url.pathname;
      if (/^\/[a-z]:\//i.test(pathPart)) pathPart = pathPart.slice(1);
      pathPart += url.hash;
    } catch {
      return null;
    }
  } else if (!isWindowsPath(raw) && /^[a-z][a-z0-9+.-]*:(?!\d+(:\d+)?$)/i.test(raw)) {
    return null;
  } else {
    pathPart = raw.split("?")[0];
  }
  return pathPart;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Maps local images to the preview root, with each filename segment encoded once. */
export function resolveAssetUrl(src: string, absPath: string, base: { baseUrl: string; rootPath: string }): string {
  const pathPart = localHrefPath(src);
  if (!pathPart) return src;
  const decoded = decodeSafe(pathPart.split(/[?#]/)[0]);
  const absolute = resolvePath(dirnamePath(absPath), decoded);
  const relative = relativeWithin(base.rootPath, absolute);
  return relative === null ? src : `${base.baseUrl.replace(/\/?$/, "/")}${encodePathSegments(relative)}`;
}

const INLINE_LINK = /(!?\[(?:[^\]\\]|\\.)*\]\()(<[^>\n]*>|[^)\s]+)((?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\))/g;
const REFERENCE_DEF = /^( {0,3}\[[^\]\n]+\]:\s*)(<[^>\n]*>|\S+)/gm;

/**
 * Rewrites relative link destinations to absolute paths from the document's
 * directory, so the host Markdown renderer (which resolves against the thread
 * workspace) links to the right file. Fenced code is left untouched.
 */
export function absolutizeLinks(content: string, absPath: string): string {
  const dir = dirnamePath(absPath);
  const fix = (target: string) => {
    const bare = target.startsWith("<") ? target.slice(1, -1) : target;
    if (bare === "" || bare.startsWith("#") || (!isWindowsPath(bare) && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(bare))) return target;
    // Protect characters supplied by Markdown syntax before splitting URL
    // fragments. For example, &#35; names a literal # in the filename.
    let destination = bare;
    if (!isWindowsPath(absPath) && !isWindowsPath(bare)) {
      destination = destination.replace(/\\(.)/g, (match, character: string) =>
        "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".includes(character) ? encodeURIComponent(character) : match);
    }
    destination = destination.replace(/&(?:#[0-9]{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g, (reference) => {
      const decoded = decodeHTMLStrict(reference);
      return decoded === reference ? reference : encodeURIComponent(decoded);
    });
    const suffixIndex = destination.search(/[?#]|:\d+(?::\d+)?$/);
    const pathPart = suffixIndex === -1 ? destination : destination.slice(0, suffixIndex);
    const suffix = suffixIndex === -1 ? "" : destination.slice(suffixIndex);
    let decoded = pathPart;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      /* keep literal */
    }
    const absolute = resolvePath(dir, decoded);
    // File URLs keep Windows drive letters out of the URL-scheme parser and
    // preserve UNC authorities in the host Markdown renderer.
    const encoded = isWindowsPath(absolute)
      ? /^[a-z]:/i.test(absolute)
        ? `file:///${absolute.slice(0, 2)}/${encodePathSegments(absolute.slice(3))}`
        : `file:${encodePathSegments(absolute)}`
      : encodePathSegments(absolute);
    return `<${encoded}${suffix}>`;
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
