import assert from "node:assert/strict";
import { test } from "node:test";
import { dirnamePath, isAbsolutePath, normalizePath, relativeWithin, resolvePath } from "./paths.ts";
import { parseTree } from "./tree.ts";

test("path roots determine the dialect, independent of this OS", () => {
  for (const root of ["C:\\", "C:/", "\\\\server\\share\\", "//server/share/"]) {
    assert.ok(isAbsolutePath(root));
    assert.equal(normalizePath(`${root}a/../b\\c`), `${normalizePath(root)}b/c`);
    assert.equal(normalizePath(`${root}../../x`), `${normalizePath(root)}x`);
    assert.equal(dirnamePath(`${root}index.md`), normalizePath(root));
    assert.equal(resolvePath(root, "docs\\a.md"), `${normalizePath(root)}docs/a.md`);
    assert.equal(resolvePath(`${root}docs`, "\\assets\\a.png"), `${normalizePath(root)}assets/a.png`);
    assert.equal(resolvePath(`${root}docs`, "/assets/a.png"), `${normalizePath(root)}assets/a.png`);
  }
  assert.equal(isAbsolutePath("C:relative.md"), false);
  assert.equal(normalizePath("/a/./b/../c//d"), "/a/c/d");
  assert.equal(normalizePath("/a/literal\\name"), "/a/literal\\name");
  assert.equal(dirnamePath("/index.md"), "/");
});

test("containment checks separators, Windows casing, drive and share identity", () => {
  assert.equal(relativeWithin("C:\\Repo", "c:/repo/docs/A.md"), "docs/A.md");
  assert.equal(relativeWithin("C:\\Repo", "C:/Repo-copy/a.md"), null);
  assert.equal(relativeWithin("C:\\Repo", "D:/Repo/a.md"), null);
  assert.equal(relativeWithin("\\\\server\\share", "//SERVER/SHARE/docs/a.md"), "docs/a.md");
  assert.equal(relativeWithin("\\\\server\\share", "//server/other/a.md"), null);
  assert.equal(relativeWithin("/Repo", "/repo/a.md"), null);
  assert.equal(relativeWithin("/", "/a.md"), "a.md");
});

test("tree folders accept Windows separators", () => {
  assert.deepEqual(parseTree("C:\\Repo\\\n├── docs\\\n└── README.md").map(({ name, folder }) => ({ name, folder })), [
    { name: "C:\\Repo", folder: true }, { name: "docs", folder: true }, { name: "README.md", folder: false },
  ]);
});
