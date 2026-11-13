// Per-file scroll memory: chat switches remount the opener, so each .md
// file's rich/source scroll offsets are kept in localStorage under the
// plugin's md-editor: namespace. Storage is best-effort and never throws.

export type ScrollPos = { rich?: number; source?: number };

const STORE_KEY = "md-editor:scroll";
const LIMIT = 200;

/** Storage key for one file's scroll offsets (host + absolute path). */
export function scrollKey(hostId: string, absPath: string): string {
  return `md-editor:scroll:${hostId}:${absPath}`;
}

function readStore(): Record<string, ScrollPos> {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, ScrollPos>;
  } catch {
    return {};
  }
}

function writeStore(entries: Record<string, ScrollPos>): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {
    // Storage may be missing or full; scroll memory is best-effort.
  }
}

/** Saves the given offsets over the stored ones (an absent field keeps its
 *  last value), marks the key most-recently-used and drops oldest entries
 *  beyond LIMIT. */
export function saveScroll(key: string, pos: ScrollPos): void {
  const entries = readStore();
  const previous = entries[key];
  delete entries[key];
  const next: ScrollPos = previous && typeof previous === "object" ? { ...previous } : {};
  if (typeof pos.rich === "number") next.rich = pos.rich;
  if (typeof pos.source === "number") next.source = pos.source;
  if (next.rich === undefined && next.source === undefined) return;
  entries[key] = next;
  const keys = Object.keys(entries);
  for (const stale of keys.slice(0, Math.max(0, keys.length - LIMIT))) delete entries[stale];
  writeStore(entries);
}

export function loadScroll(key: string): ScrollPos | null {
  const pos = readStore()[key];
  if (!pos || typeof pos !== "object") return null;
  const next: ScrollPos = {};
  if (typeof pos.rich === "number") next.rich = pos.rich;
  if (typeof pos.source === "number") next.source = pos.source;
  return next.rich === undefined && next.source === undefined ? null : next;
}
