import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { previewRoot } from "./assets.ts";

const sources = [
  { hostId: "mac", path: "/docs/Project A" },
  { hostId: "mac", path: "/docs/Project B" },
  { hostId: "other", path: "/docs/Project B/Docs" },
];

test("foreign host document uses its own registered project for sibling images", () => {
  const where = { hostId: "mac", absPath: "/docs/Project B/Docs/talk/slides/01.md", rootPath: "/docs/Project A" };
  assert.equal(previewRoot(where, sources), "/docs/Project B");
});

test("workspace previews retain their existing root", () => {
  assert.equal(previewRoot({ hostId: "mac", absPath: "/docs/Project A/a.md", rootPath: "/docs/Project A" }, sources), "/docs/Project A");
});

test("similar prefixes and sources on other machines cannot widen preview scope", () => {
  const where = { hostId: "mac", absPath: "/docs/Project A-copy/slides/a.md", rootPath: "/docs/Project A" };
  assert.equal(previewRoot(where, sources), "/docs/Project A-copy/slides");
});

test("the most specific enclosing registered source wins", () => {
  const where = { hostId: "mac", absPath: "/docs/Project B/Docs/talk/a.md", rootPath: null };
  assert.equal(previewRoot(where, [...sources, { hostId: "mac", path: "/docs/Project B/Docs/talk" }]), "/docs/Project B/Docs/talk");
});

for (const root of ["C:\\Project", "C:/Project", "\\\\server\\share\\Project"]) {
  test(`preview roots use the document's path syntax: ${root}`, () => {
    const windowsSources = [{ hostId: "win", path: root }];
    assert.equal(previewRoot({ hostId: "win", absPath: `${root}/docs/a.md`, rootPath: null }, windowsSources), root);
    assert.equal(previewRoot({ hostId: "win", absPath: `${root}/docs/a.md`, rootPath: root }, windowsSources), root);
    assert.equal(previewRoot({ hostId: "win", absPath: `${root}-other/docs/a.md`, rootPath: root }, windowsSources), path.win32.dirname(`${root}-other/docs/a.md`));
  });
}
