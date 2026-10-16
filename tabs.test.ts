import assert from "node:assert/strict";
import { test } from "node:test";
import { tabMenuPosition } from "./tabs-position.ts";

test("tab menu opens under the clicked tab", () => {
  const pos = tabMenuPosition(
    { left: 1200, bottom: 40 },
    { width: 220, height: 180 },
    { width: 1600, height: 900 },
  );
  assert.equal(pos.x, 1200);
  assert.equal(pos.y, 44);
});

test("tab menu stays on screen near the right edge", () => {
  const pos = tabMenuPosition(
    { left: 1500, bottom: 40 },
    { width: 220, height: 180 },
    { width: 1600, height: 900 },
  );
  assert.equal(pos.x, 1372);
});

test("tab menu does not jump left when a browser pane is open", () => {
  const withBrowser = tabMenuPosition(
    { left: 991, bottom: 38 },
    { width: 220, height: 180 },
    { width: 1600, height: 900 },
  );
  assert.equal(withBrowser.x, 991);
  assert.equal(withBrowser.y, 42);
});
