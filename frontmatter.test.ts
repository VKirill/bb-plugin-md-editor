import assert from "node:assert/strict";
import { test } from "node:test";
import { joinFrontMatter, splitFrontMatter } from "./frontmatter.ts";

test("splits YAML front matter from body", () => {
  const doc = splitFrontMatter("---\ntitle: Тест\ntags: [a, b]\n---\n\n# Заголовок\n");
  assert.equal(doc.frontMatter, "title: Тест\ntags: [a, b]");
  assert.equal(doc.body, "# Заголовок\n");
  assert.equal(joinFrontMatter(doc.frontMatter, doc.body), "---\ntitle: Тест\ntags: [a, b]\n---\n\n# Заголовок\n");
});

test("no front matter; horizontal rule later is not front matter", () => {
  const doc = splitFrontMatter("# A\n\n---\n\ntext\n");
  assert.equal(doc.frontMatter, null);
  assert.equal(joinFrontMatter(null, doc.body), "# A\n\n---\n\ntext\n");
});

test("CRLF files keep CRLF", () => {
  const doc = splitFrontMatter("---\r\na: 1\r\n---\r\nbody\r\n");
  assert.equal(doc.frontMatter, "a: 1");
  assert.equal(doc.eol, "\r\n");
  assert.equal(joinFrontMatter(doc.frontMatter, "body\n", doc.eol), "---\r\na: 1\r\n---\r\n\r\nbody\r\n");
});

test("empty front matter block", () => {
  const doc = splitFrontMatter("---\n\n---\nbody");
  assert.equal(doc.frontMatter, "");
});
