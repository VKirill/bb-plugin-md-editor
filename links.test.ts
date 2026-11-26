import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveLink, type DocumentContext } from "./links.ts";
import { normalizePath } from "./paths.ts";

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

test("normalizePath", () => {
  assert.equal(normalizePath("/a/./b/../c//d"), "/a/c/d");
  assert.equal(normalizePath("/../x"), "/x");
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
  assert.match(out, /\[a\]\(<\/w\/docs\/sub\/%D0%92%D0%BB%D0%BE%D0%B6%D0%B5%D0%BD%D0%BD%D1%8B%D0%B9%20%D1%84%D0%B0%D0%B9%D0%BB\.md>\)/);
  assert.match(out, /\[b\]\(<\/w\/up\.md#L3> "t"\)/);
  assert.match(out, /!\[i\]\(<\/w\/docs\/img\.png>\)/);
  assert.match(out, /\[c\]\(https:\/\/x\.y\) \[d\]\(#h\) \[e\]\(<\/abs\.md>\) \[f\]\(<\/w\/docs\/with%20space\.md>\)/);
  assert.match(out, /\[code\]\(keep\.md\)/);
  assert.match(out, /\[ref\]: <\/w\/docs\/notes\/r\.md>/);
});

for (const root of ["C:\\Project", "C:/Project", "\\\\server\\share\\Project"]) {
  test(`Windows links and assets: ${root}`, async () => {
    const { absolutizeLinks, resolveAssetUrl } = await import("./links.ts");
    const doc = { ...workspaceDoc, absPath: `${root}/docs/index.md`, rootPath: root };
    for (const href of ["../README.md", "..\\README.md", `${root}/README.md`]) {
      assert.deepEqual(resolveLink(href, doc), {
        type: "file", target: { kind: "workspace", environmentId: "env_a", path: "README.md" }, location: null,
      });
    }
    const lineAction = resolveLink(`${root}/README.md#L2-L5`, doc);
    assert.deepEqual(lineAction?.type === "file" && lineAction.location,
      { kind: "range", startLine: 2, endLine: 5 });
    const encoded = "images/%D0%9F%D0%BB%D0%B0%D0%BD%20%231%25.png";
    const base = { rootPath: root, baseUrl: "https://bb.test/preview" };
    assert.equal(resolveAssetUrl(encoded, doc.absPath, base), `https://bb.test/preview/docs/${encoded}`);
    assert.equal(resolveAssetUrl(`${root}/docs/${encoded}`, doc.absPath, base), `https://bb.test/preview/docs/${encoded}`);
    assert.equal(resolveAssetUrl("../../outside.png", doc.absPath, base), "../../outside.png");
    assert.equal(resolveAssetUrl("https://example.com/a.png", doc.absPath, base), "https://example.com/a.png");
    const rewritten = absolutizeLinks(`[a](${encoded}#L2)`, doc.absPath);
    const href = /\(<(.*)>\)/.exec(rewritten)![1];
    assert.deepEqual(resolveLink(href, doc), {
      type: "file", target: { kind: "workspace", environmentId: "env_a", path: "docs/images/План #1%.png" },
      location: { kind: "range", startLine: 2, endLine: 2 },
    });
  });
}

test("drive and UNC file URLs preserve their roots and decoded filename characters", () => {
  const doc = { ...workspaceDoc, absPath: "C:\\Project\\docs\\index.md", rootPath: "C:\\Project" };
  assert.deepEqual(resolveLink("file:///C:/Project/a%23b.md#L3", doc), {
    type: "file", target: { kind: "workspace", environmentId: "env_a", path: "a#b.md" },
    location: { kind: "range", startLine: 3, endLine: 3 },
  });
  assert.deepEqual(resolveLink("file://server/share/a%20b.md", doc), {
    type: "file", target: { kind: "host", hostId: "host_mini", path: "//server/share/a b.md" }, location: null,
  });
  assert.deepEqual(resolveLink("D:\\Other\\a.md:12:4", doc), {
    type: "file", target: { kind: "host", hostId: "host_mini", path: "D:/Other/a.md" },
    location: { kind: "range", startLine: 12, endLine: 12 },
  });
});

test("absolutizing native Windows destinations emits encoded file URLs and preserves line suffixes", async () => {
  const { absolutizeLinks } = await import("./links.ts");
  const content = '[drive](<C:\\Project\\a b.md>) [unc](<\\\\server\\share\\a b.md>) [line](../a.md:12:4)';
  assert.equal(absolutizeLinks(content, 'C:\\Project\\docs\\index.md'),
    '[drive](<file:///C:/Project/a%20b.md>) [unc](<file://server/share/a%20b.md>) [line](<file:///C:/Project/a.md:12:4>)');
});

test("absolutizing preserves Markdown entities, escapes and literal percent-encoded entity text", async () => {
  const { absolutizeLinks } = await import("./links.ts");
  for (const directory of ["/w", "C:/w", "\\\\server\\share\\w"]) {
    const src = '[amp](a&amp;b.md) [hash](a&#35;b.md#L2) [percent](a&#x25;b.md) [named](a&copy;b.md) [literal](a%26amp%3Bb.md)';
    const rewritten = absolutizeLinks(src, `${directory}/index.md`);
    const hrefs = [...rewritten.matchAll(/\(<([^>]+)>\)/g)].map(match => match[1]);
    assert.equal(hrefs.length, 5);
    const doc = { ...workspaceDoc, absPath: `${directory}/index.md`, rootPath: directory };
    for (const [index, name] of ["a&b.md", "a#b.md", "a%b.md", "a©b.md", "a&amp;b.md"].entries()) {
      const action = resolveLink(hrefs[index], doc);
      assert.equal(action?.type === "file" && action.target.path, name);
    }
  }
  assert.equal(absolutizeLinks('[x](a\\#b.md)', '/w/index.md'), '[x](</w/a%23b.md>)');
  assert.equal(absolutizeLinks('[x](a\\&amp;b.md)', '/w/index.md'), '[x](</w/a%26amp%3Bb.md>)');
});
