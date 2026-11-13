import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const dom = new JSDOM("<!doctype html><html lang='en'><body></body></html>", { url: "https://bb.test", pretendToBeVisual: true });
for (const key of ["window", "Window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "Text", "DOMParser", "MutationObserver", "KeyboardEvent", "MouseEvent", "Event", "CustomEvent", "getComputedStyle", "localStorage"] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
class TestResizeObserver {
  observe() {} disconnect() {} unobserve() {}
}
Object.assign(globalThis, { ResizeObserver: TestResizeObserver });
Object.assign(dom.window, { ResizeObserver: TestResizeObserver });
Object.assign(dom.window.Range.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }), getClientRects: () => [] });
Object.defineProperty(dom.window.Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: () => {} });

let Opener: any;
const content = "---\ntitle: Scroll document\n---\n\n# Reading\n\nFirst paragraph.\n\nSecond paragraph.\n";
const loaded = { content, sha256: "baseline", hostName: "Test", hostId: "host", absPath: "/test/read.md", rootPath: "/test" };
const rpc = { call: async (method: string) => {
  if (method === "open") return loaded;
  if (method === "stat") return { exists: true, sha256: "baseline" };
  if (method === "assetBase") return { baseUrl: "https://bb.test/assets", rootPath: "/test" };
  return { outcome: "written", sha256: "saved" };
} };
const navigate = { openUrl() {}, toThread() {} };
const composer = { updateText() {}, focus() {} };
(globalThis as any).__bbPluginRuntime = { pluginSdkApp: {
  definePluginApp: (register: any) => { register({ contentScripts: { register() {} }, slots: { fileOpener: (slot: any) => { Opener = slot.component; } } }); return {}; },
  useRpc: () => rpc, useBbNavigate: () => navigate, useComposer: () => composer,
} };
const { saveScroll, scrollKey } = await import("./scroll-memory.ts");
await import("./app.tsx");

async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); }); }
function host() { const el = document.createElement("div"); document.body.append(el); return { el, root: createRoot(el) }; }
const props = { path: "read.md", source: { kind: "host", experimental_hostId: "host", threadId: null, environmentId: null, projectId: null }, experimental_lineRange: null, Original: () => null };

test("the rich scroll offset survives an opener remount", async () => {
  const first = host();
  await act(async () => first.root.render(createElement(Opener, props)));
  await flush();
  await flush();
  const scroller = first.el.querySelector(".mdpro-scroll");
  assert.ok(scroller);
  await act(async () => {
    scroller.scrollTop = 640;
    scroller.dispatchEvent(new dom.window.Event("scroll"));
  });
  await act(async () => first.root.unmount());
  first.el.remove();

  const second = host();
  try {
    await act(async () => second.root.render(createElement(Opener, props)));
    await flush();
    await flush();
    const restored = second.el.querySelector(".mdpro-scroll");
    assert.ok(restored);
    assert.equal(restored.scrollTop, 640);
  } finally {
    await act(async () => second.root.unmount());
    second.el.remove();
  }
});

test("a targeted open ignores the saved scroll offset", async () => {
  saveScroll(scrollKey("host", "/test/read.md"), { rich: 640 });
  const { el, root } = host();
  try {
    await act(async () => root.render(createElement(Opener, { ...props, experimental_lineRange: { startLineNumber: 2, endLineNumber: 2 } })));
    await flush();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    const scroller = el.querySelector(".mdpro-scroll");
    assert.ok(scroller);
    assert.notEqual(scroller.scrollTop, 640);
  } finally {
    await act(async () => root.unmount());
    el.remove();
  }
});
