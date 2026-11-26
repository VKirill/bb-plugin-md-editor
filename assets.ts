import path from "node:path";
import type { Location } from "./locate.ts";

// The document may live on Windows while this server runs on POSIX.
const pathApi = (root: string) => /^[a-z]:[\\/]|^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/i.test(root) ? path.win32 : path.posix;

type ProjectSource = { hostId: string; path: string };

function contains(root: string, file: string): boolean {
  const api = pathApi(root);
  if (api !== pathApi(file)) return false;
  const relative = api.relative(root, file);
  return relative !== ".." && !relative.startsWith(`..${api.sep}`) && !api.isAbsolute(relative);
}

/** Keep previews scoped to the document's workspace or registered project. */
export function previewRoot(where: Location, sources: readonly ProjectSource[]): string {
  if (where.rootPath && contains(where.rootPath, where.absPath)) return where.rootPath;
  const matching = sources
    .filter((source) => source.hostId === where.hostId && contains(source.path, where.absPath))
    .sort((a, b) => b.path.length - a.path.length);
  return matching[0]?.path ?? pathApi(where.absPath).dirname(where.absPath);
}
