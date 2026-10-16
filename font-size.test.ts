import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("rich and source editors follow BB typography unless overridden", () => {
  const rich = readFileSync(new URL("./rich.tsx", import.meta.url), "utf8");
  const source = readFileSync(new URL("./editor.tsx", import.meta.url), "utf8");
  for (const css of [rich, source]) {
    assert.ok(css.includes("var(--mdpro-font-size, var(--text-base, 1rem))"));
  }
});

import { parseFontSize } from "./font-size.ts";

test("font size accepts the supported range and defaults safely for stale preferences", () => {
  for (const value of [null, undefined, "", " ", "auto", "NaN", "Infinity", "9", "33", "16.5", "16px"]) {
    assert.equal(parseFontSize(value), null, String(value));
  }
  for (const size of [10, 13, 16, 24, 32]) assert.equal(parseFontSize(String(size)), size);
});
