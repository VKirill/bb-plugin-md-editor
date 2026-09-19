import assert from "node:assert/strict";
import { test } from "node:test";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Highlight from "@tiptap/extension-highlight";
import { MarkdownManager } from "@tiptap/markdown";
import { RichBlockMath, RichInlineMath, agentMarkdownExtensions, htmlRegionBound, installMinimalEscaping, matchHtmlRegion } from "./md-extensions.ts";

installMinimalEscaping(MarkdownManager as any);

const manager = new MarkdownManager({
  extensions: [StarterKit, TableKit, TaskList, TaskItem, Highlight, RichInlineMath, RichBlockMath, ...agentMarkdownExtensions],
  markedOptions: { gfm: true },
});
const roundTrip = (md: string) => manager.serialize(manager.parse(md));
const types = (md: string) => JSON.stringify(manager.parse(md));

test("callouts keep kind, fold, title and body", () => {
  const md = "> [!WARNING]- Осторожно\n> Текст **жирный**.\n>\n> Второй абзац.";
  assert.match(types(md), /"type":"callout","attrs":\{"kind":"WARNING","title":"Осторожно","fold":"-"\}/);
  assert.equal(roundTrip(md), md);
  assert.equal(roundTrip("> [!NOTE]"), "> [!NOTE]");
});

test("details with summary and markdown inside", () => {
  const md = "<details>\n<summary>Подробнее</summary>\n\nСкрытый **текст**.\n\n</details>";
  assert.match(types(md), /"type":"details","attrs":\{"summary":"Подробнее","open":false\}/);
  assert.equal(roundTrip(md), md);
});

test("raw HTML blocks and comments are preserved verbatim", () => {
  for (const md of ['<div align="center">\n  <img src="logo.png" width="80">\n</div>', "<!-- агент: не удалять -->", "<br/>"]) {
    assert.equal(roundTrip(md), md);
  }
});

test("paired HTML comment markers become a foldable region", () => {
  const md = "<!-- bb-project-folders:agents:start -->\n# Section rules\n\nInside the **region**.\n<!-- bb-project-folders:agents:end -->";
  assert.equal(htmlRegionBound("bb-project-folders:agents:start")?.key, "bb-project-folders:agents");
  assert.equal(htmlRegionBound("BEGIN rules")?.role, "start");
  assert.ok(matchHtmlRegion(md));
  assert.match(types(md), /"type":"htmlRegion","attrs":\{"key":"bb-project-folders:agents"/);
  assert.equal(roundTrip(md), md);
  assert.equal(roundTrip("<!-- lonely start:start -->"), "<!-- lonely start:start -->");
  const nested = "<!-- wrap:start -->\n<!-- wrap:start -->\nInner.\n<!-- wrap:end -->\n<!-- wrap:end -->";
  assert.equal(roundTrip(nested), nested);
});

test("BEGIN/END and #region comment pairs round-trip", () => {
  const begin = "<!-- BEGIN rules -->\nText.\n<!-- END rules -->";
  const region = "<!-- #region copy -->\nNote.\n<!-- #endregion -->";
  assert.match(types(begin), /"type":"htmlRegion","attrs":\{"key":"rules"/);
  assert.match(types(region), /"type":"htmlRegion","attrs":\{"key":"copy"/);
  assert.equal(roundTrip(begin), begin);
  assert.equal(roundTrip(region), region);
});

test("inline html, kbd, sup, sub, highlight", () => {
  const md = "Нажми <kbd>Cmd</kbd>+<kbd>S</kbd>, H<sub>2</sub>O, x<sup>2</sup>, ==важно==, строка<br>перенос и <span class=\"x\">спан</span>.";
  assert.equal(roundTrip(md), md);
  assert.match(types(md), /"kbd"/);
});

test("footnotes", () => {
  const md = "Текст со сноской[^1] и ещё[^note].\n\n[^1]: Первая сноска.\n\n[^note]: Вторая **сноска**.";
  assert.match(types(md), /"footnoteRef"/);
  assert.match(types(md), /"footnoteDef"/);
  assert.equal(roundTrip(md), md);
});

test("emoji shortcodes, but not times or unknown names", () => {
  const md = "Готово :white_check_mark: внимание :warning: в 10:30:45 и :notanemojixyz:";
  assert.match(types(md), /"emoji","attrs":\{"name":"white_check_mark"\}/);
  assert.equal(roundTrip(md), md);
});

test("math with $ and \\( \\[ delimiters", () => {
  const md = "Строка $a^2$ и \\(b^2\\), цена $5 и $10.\n\n$$\nE = mc^2\n$$\n\n\\[\n\\int_0^1 x\\,dx\n\\]";
  assert.equal(roundTrip(md), md);
});

test("plain markdown still round-trips", () => {
  const md = "# Заголовок\n\n- пункт\n\n- [ ] задача\n\n```diff\n- old\n+ new\n```";
  assert.equal(roundTrip(md), md);
});

test("agent text is not over-escaped", () => {
  for (const md of ["some_var_name and file_name.md", "price 5*3 = 15", "a [draft] note", "Map<K, V> and a < b", "path/to/file_name.ts:42", "AT&T and ~approx"]) {
    assert.equal(roundTrip(md), md.replace("Map<K, V>", "Map<K, V>"));
  }
  assert.equal(roundTrip("literal \\*stars\\*"), "literal \\*stars\\*");
});
