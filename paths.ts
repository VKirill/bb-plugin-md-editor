// Lexical paths on the document's machine, independent of the browser/server OS.
// Use forward slashes at the UI boundary; the server selects node:path's dialect.
export function isWindowsPath(input: string): boolean {
  return /^[a-z]:[\\/]/i.test(input) || /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(input);
}

export function isAbsolutePath(input: string): boolean {
  return input.startsWith("/") || isWindowsPath(input);
}

export function normalizePath(input: string, windows = isWindowsPath(input)): string {
  const value = windows ? input.replace(/\\/g, "/") : input;
  const drive = /^[a-z]:\//i.exec(value)?.[0];
  const unc = windows ? /^\/\/[^/]+\/[^/]+(?:\/|$)/.exec(value)?.[0] : undefined;
  const root = drive ?? (unc ? `${unc.replace(/\/$/, "")}/` : value.startsWith("/") ? "/" : "");
  const parts: string[] = [];
  for (const part of value.slice(root.length).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts.at(-1) !== "..") parts.pop();
      else if (!root) parts.push(part);
    } else parts.push(part);
  }
  return root + parts.join("/");
}

export function dirnamePath(input: string): string {
  const normalized = normalizePath(input);
  const root = /^[a-z]:\//i.exec(normalized)?.[0]
    ?? (isWindowsPath(normalized) ? /^\/\/[^/]+\/[^/]+\//.exec(normalized)?.[0] : undefined)
    ?? "/";
  return normalized.slice(0, Math.max(root.length, normalized.lastIndexOf("/")));
}

export function resolvePath(directory: string, target: string): string {
  if (isWindowsPath(directory) && /^[\\/](?![\\/])/.test(target)) {
    const normalized = normalizePath(directory);
    const root = /^[a-z]:\//i.exec(normalized)?.[0] ?? /^\/\/[^/]+\/[^/]+\//.exec(normalized)![0];
    return normalizePath(`${root}${target.slice(1)}`, true);
  }
  return isAbsolutePath(target) ? normalizePath(target) : normalizePath(`${directory}/${target}`, isWindowsPath(directory));
}

/** A separator-delimited descendant (or the root itself), never a prefix sibling. */
export function relativeWithin(root: string, absolute: string): string | null {
  const base = normalizePath(root).replace(/\/$/, "");
  const target = normalizePath(absolute);
  const windows = isWindowsPath(root);
  if (windows !== isWindowsPath(absolute)) return null;
  const key = (value: string) => windows ? value.toLowerCase() : value;
  if (key(target.replace(/\/$/, "")) === key(base)) return "";
  return key(target).startsWith(`${key(base)}/`) ? target.slice(base.length + 1) : null;
}

export function encodePathSegments(input: string): string {
  return input.split("/").map(encodeURIComponent).join("/");
}
