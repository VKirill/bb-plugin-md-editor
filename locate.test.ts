import assert from "node:assert/strict";
import { test } from "node:test";
import { locate, type LocateSdk } from "./locate.ts";

const sdk: LocateSdk = {
  threads: {
    get: async ({ threadId }) => ({ environmentId: threadId === "thr_a" ? "env_a" : null }),
    storageLocation: async ({ threadId }) => ({ hostId: "host_mini", storageRootPath: `/data/${threadId}` }),
  },
  environments: {
    get: async ({ environmentId }) =>
      environmentId === "env_a" ? { hostId: "host_book", path: "/Users/me/Проект" } : { hostId: null, path: null },
  },
  projects: {
    get: async () => ({
      sources: [
        { hostId: "host_mini", path: "/mini/p", isDefault: true },
        { hostId: "host_book", path: "/book/p", isDefault: false },
      ],
    }),
  },
  system: { config: async () => ({ primaryHostId: "host_mini" }) },
};

const base = { threadId: null, environmentId: null, projectId: null };

test("workspace file uses its environment's machine and folder", async () => {
  assert.deepEqual(await locate(sdk, { ...base, kind: "workspace", environmentId: "env_a" }, "docs/a.md"), {
    hostId: "host_book",
    absPath: "/Users/me/Проект/docs/a.md",
    rootPath: "/Users/me/Проект",
  });
});

test("workspace file without environment resolves through its thread", async () => {
  const where = await locate(sdk, { ...base, kind: "workspace", threadId: "thr_a" }, "a.md");
  assert.equal(where.hostId, "host_book");
});

test("project source honours explicit host", async () => {
  const where = await locate(sdk, { ...base, kind: "workspace", projectId: "p", hostId: "host_book" }, "x.md");
  assert.deepEqual(where, { hostId: "host_book", absPath: "/book/p/x.md", rootPath: "/book/p" });
});

test("traversal out of workspace is refused", async () => {
  await assert.rejects(locate(sdk, { ...base, kind: "workspace", environmentId: "env_a" }, "../../etc/passwd"));
});

test("host file inherits the thread machine, never another", async () => {
  const where = await locate(sdk, { ...base, kind: "host", threadId: "thr_a" }, "/Users/me/AGENTS.md");
  assert.equal(where.hostId, "host_book");
  await assert.rejects(locate(sdk, { ...base, kind: "host", threadId: "thr_a" }, "relative.md"));
});

test("host file without context falls to the primary host", async () => {
  const where = await locate(sdk, { ...base, kind: "host" }, "/tmp/x.md");
  assert.equal(where.hostId, "host_mini");
});

test("thread storage", async () => {
  const where = await locate(sdk, { ...base, kind: "thread-storage", threadId: "thr_s" }, "artifacts/r.md");
  assert.deepEqual(where, { hostId: "host_mini", absPath: "/data/thr_s/artifacts/r.md", rootPath: "/data/thr_s" });
});

test("changed-file paths relative to an enclosing Git root resolve there", async () => {
  const existing = new Set(["/repo/.git", "/repo/.agents/notes.md", "/repo/apps/bot/README.md"]);
  const withFs: LocateSdk = {
    ...sdk,
    environments: { get: async () => ({ hostId: "host_ovh", path: "/repo/apps/bot" }) },
    hosts: { pathsExist: async ({ paths }) => ({ existence: Object.fromEntries(paths.map((p) => [p, existing.has(p)])) }) },
  };
  const src = { ...base, kind: "workspace" as const, environmentId: "env_bot" };
  assert.deepEqual(await locate(withFs, src, ".agents/notes.md"), { hostId: "host_ovh", absPath: "/repo/.agents/notes.md", rootPath: "/repo/apps/bot" });
  assert.equal((await locate(withFs, src, "README.md")).absPath, "/repo/apps/bot/README.md");
  assert.equal((await locate(withFs, src, "missing.md")).absPath, "/repo/apps/bot/missing.md");
});
