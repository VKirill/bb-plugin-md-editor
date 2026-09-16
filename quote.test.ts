import assert from "node:assert/strict";
import { test } from "node:test";
import { findSourceLines, formatChatQuote } from "./quote.ts";

const source = ["---", "title: T", "---", "", "# Заголовок", "", "Первый **абзац** текста.", "Вторая строка.", "", "- пункт `один`", "- пункт два", "", "Первый абзац текста."].join("\n");

test("maps a fragment to source lines, preferring the hint", () => {
  assert.deepEqual(findSourceLines(source, "Первый **абзац** текста.\nВторая строка."), { start: 7, end: 8 });
  assert.deepEqual(findSourceLines(source, "- пункт `один`\n- пункт два"), { start: 10, end: 11 });
  assert.deepEqual(findSourceLines(source, "# Заголовок"), { start: 5, end: 5 });
  assert.deepEqual(findSourceLines(source, "Первый абзац текста.", 13), { start: 13, end: 13 });
  assert.equal(findSourceLines(source, "нет такого"), null);
});

test("formats a chat quote with reference and comment", () => {
  assert.equal(
    formatChatQuote({ path: "/w/doc.md", host: "MAC Mini", range: { start: 7, end: 8 }, markdown: "Первый **абзац**\n\nВторая", comment: "перепиши короче" }),
    "`/w/doc.md:7-8` (lines 7–8, MAC Mini)\n> Первый **абзац**\n>\n> Вторая\n\nперепиши короче",
  );
  assert.equal(formatChatQuote({ path: "a.md", range: null, markdown: "x" }), "`a.md`\n> x");
});
