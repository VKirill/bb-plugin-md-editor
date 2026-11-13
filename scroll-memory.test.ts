import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { loadScroll, saveScroll, scrollKey } from "./scroll-memory.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://bb.test" });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: dom.window.localStorage });

test("scroll positions round-trip per file key", () => {
  localStorage.clear();
  const key = scrollKey("host", "/docs/a.md");
  assert.equal(loadScroll(key), null);
  saveScroll(key, { rich: 120, source: 40 });
  assert.deepEqual(loadScroll(key), { rich: 120, source: 40 });
  assert.equal(loadScroll(scrollKey("host", "/docs/b.md")), null);
});

test("saving one scroller keeps the other's last position", () => {
  localStorage.clear();
  const key = scrollKey("host", "/docs/a.md");
  saveScroll(key, { rich: 120 });
  saveScroll(key, { source: 40 });
  assert.deepEqual(loadScroll(key), { rich: 120, source: 40 });
});

test("corrupt JSON and missing localStorage never throw", () => {
  localStorage.clear();
  const key = scrollKey("host", "/docs/a.md");
  localStorage.setItem("md-editor:scroll", "{not json");
  assert.equal(loadScroll(key), null);
  assert.doesNotThrow(() => saveScroll(key, { rich: 1 }));
  const storage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
  try {
    assert.equal(loadScroll(key), null);
    assert.doesNotThrow(() => saveScroll(key, { rich: 2 }));
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  }
});

test("storage keeps at most 200 files and drops the oldest", () => {
  localStorage.clear();
  for (let i = 0; i < 201; i += 1) saveScroll(scrollKey("host", `/docs/f${i}.md`), { rich: i });
  assert.equal(loadScroll(scrollKey("host", "/docs/f0.md")), null);
  assert.deepEqual(loadScroll(scrollKey("host", "/docs/f1.md")), { rich: 1 });
  assert.deepEqual(loadScroll(scrollKey("host", "/docs/f200.md")), { rich: 200 });
});
