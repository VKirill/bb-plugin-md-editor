import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePosix, resolveLink, type DocumentContext } from "./links.ts";

const workspaceDoc: DocumentContext = {
  source: { kind: "workspace", threadId: "thr_a", environmentId: "env_a" },
  hostId: "host_mini",
  absPath: "/Users/me/Проект/docs/guide/index.md",
  rootPath: "/Users/me/Проект",
};

test("relative link stays in the thread workspace", () => {
  assert.deepEqual(resolveLink("../REGISTRY.md", workspaceDoc), {
    type: "file",
    target: { kind: "workspace", environmentId: "env_a", path: "docs/REGISTRY.md" },
    location: null,
  });
});

test("percent-encoded Cyrillic and spaces decode", () => {
  const action = resolveLink("./%D0%9F%D0%BB%D0%B0%D0%BD%20v2.md", workspaceDoc);
  assert.equal(action?.type === "file" && action.target.path, "docs/guide/План v2.md");
});

test("link leaving the workspace becomes a host target on the same machine", () => {
  assert.deepEqual(resolveLink("../../../AGENTS.md", workspaceDoc), {
    type: "file",
    target: { kind: "host", hostId: "host_mini", path: "/Users/me/AGENTS.md" },
    location: null,
  });
});

test("absolute path inside workspace maps to workspace; line suffixes parse", () => {
  assert.deepEqual(resolveLink("/Users/me/Проект/a.md#L3-L7", workspaceDoc), {
    type: "file",
    target: { kind: "workspace", environmentId: "env_a", path: "a.md" },
    location: { kind: "range", startLine: 3, endLine: 7 },
  });
  const colon = resolveLink("b.ts:12", workspaceDoc);
  assert.deepEqual(colon?.type === "file" && colon.location, { kind: "range", startLine: 12, endLine: 12 });
});

test("urls, anchors and unknown schemes", () => {
  assert.deepEqual(resolveLink("https://example.com/x", workspaceDoc), { type: "url", url: "https://example.com/x" });
  assert.deepEqual(resolveLink("#Раздел", workspaceDoc), { type: "anchor", id: "Раздел" });
  assert.equal(resolveLink("javascript:alert(1)", workspaceDoc), null);
  assert.deepEqual(resolveLink("file:///etc/hosts", workspaceDoc), {
    type: "file",
    target: { kind: "host", hostId: "host_mini", path: "/etc/hosts" },
    location: null,
  });
});

test("thread storage documents keep storage identity", () => {
  const doc: DocumentContext = {
    source: { kind: "thread-storage", threadId: "thr_s", environmentId: null },
    hostId: "host_mini",
    absPath: "/data/threads/thr_s/artifacts/result.md",
    rootPath: "/data/threads/thr_s",
  };
  assert.deepEqual(resolveLink("../notes/handoff.md", doc), {
    type: "file",
    target: { kind: "thread-storage", threadId: "thr_s", path: "notes/handoff.md" },
    location: null,
  });
});

test("normalizePosix", () => {
  assert.equal(normalizePosix("/a/./b/../c//d"), "/a/c/d");
  assert.equal(normalizePosix("/../x"), "/x");
});

test("absolutizeLinks rewrites relative destinations from the document folder", async () => {
  const { absolutizeLinks } = await import("./links.ts");
  const src = [
    "[a](sub/Вложенный%20файл.md) [b](../up.md#L3 \"t\") ![i](img.png)",
    "[c](https://x.y) [d](#h) [e](/abs.md) [f](<with space.md>)",
    "```",
    "[code](keep.md)",
    "```",
    "[ref]: notes/r.md",
  ].join("\n");
  const out = absolutizeLinks(src, "/w/docs/index.md");
  assert.match(out, /\[a\]\(<\/w\/docs\/sub\/Вложенный файл\.md>\)/);
  assert.match(out, /\[b\]\(<\/w\/up\.md#L3> "t"\)/);
  assert.match(out, /!\[i\]\(<\/w\/docs\/img\.png>\)/);
  assert.match(out, /\[c\]\(https:\/\/x\.y\) \[d\]\(#h\) \[e\]\(\/abs\.md\) \[f\]\(<\/w\/docs\/with space\.md>\)/);
  assert.match(out, /\[code\]\(keep\.md\)/);
  assert.match(out, /\[ref\]: <\/w\/docs\/notes\/r\.md>/);
});
