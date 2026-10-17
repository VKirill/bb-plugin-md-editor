import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "@tiptap/core";

const dom = new JSDOM("<!doctype html><html lang='en'><body></body></html>", { url: "https://bb.test", pretendToBeVisual: true });
for (const key of ["window", "Window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "Text", "DOMParser", "MutationObserver", "KeyboardEvent", "MouseEvent", "Event", "CustomEvent", "getComputedStyle", "localStorage"] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) });
let smallScreen = true;
dom.window.matchMedia = (query: string) => ({ matches: smallScreen && query.includes("max-width"), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
Object.assign(globalThis, { matchMedia: dom.window.matchMedia });
let resize: ((entries: { contentRect: { width: number } }[]) => void) | undefined;
class TestResizeObserver {
  constructor(callback: typeof resize) { resize = callback; }
  observe() {} disconnect() {} unobserve() {}
}
Object.assign(globalThis, { ResizeObserver: TestResizeObserver });
Object.assign(dom.window, { ResizeObserver: TestResizeObserver });
Object.assign(dom.window.Range.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }), getClientRects: () => [] });

let Opener: any;
const content = "---\ntitle: Mobile document\n---\n\n# Reading\n\nOriginal paragraph.\n";
const writes: unknown[] = [];
const loaded = { content, sha256: "baseline", hostName: "Test", hostId: "host", absPath: "/test/read.md", rootPath: "/test" };
const rpc = { call: async (method: string, input: unknown) => {
  if (method === "open") return loaded;
  if (method === "stat") return { exists: true, sha256: "baseline" };
  if (method === "assetBase") return { baseUrl: "https://bb.test/assets", rootPath: "/test" };
  writes.push(input); return { outcome: "written", sha256: "saved" };
} };
const navigate = { openUrl() {}, toThread() {} };
const composer = { updateText() {}, focus() {} };
(globalThis as any).__bbPluginRuntime = { pluginSdkApp: {
  definePluginApp: (register: any) => { register({ contentScripts: { register() {} }, slots: { fileOpener: (slot: any) => { Opener = slot.component; } } }); return {}; },
  useRpc: () => rpc, useBbNavigate: () => navigate, useComposer: () => composer,
} };
const { PropertiesPanel } = await import("./app.tsx");
const { RichMarkdownEditor } = await import("./rich.tsx");
const { buildContextItems } = await import("./context-menu.tsx");
const { t } = await import("./i18n.ts");

async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); }); }
function host() { const el = document.createElement("div"); document.body.append(el); return { el, root: createRoot(el) }; }
async function click(el: Element | null) { assert.ok(el); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); await flush(); }
function button(el: Element, label: string) { return Array.from(el.querySelectorAll("button")).find(b => b.textContent?.trim() === label) ?? null; }

// This failed in the submitted PR: editingYaml hid both the card and the editor.
test("leaving YAML editing shows properties and hides its editor", async () => {
  const { el, root } = host();
  try {
    await act(async () => root.render(createElement(PropertiesPanel, { value: "title: Review title", onChange() {}, editable: true })));
    await click(el.querySelector("button"));
    await click(button(el, t("editYaml")));
    assert.ok(el.querySelector(".cm-editor"));
    await act(async () => root.render(createElement(PropertiesPanel, { value: "title: Review title", onChange() {}, editable: false })));
    assert.ok(el.textContent?.includes("Review title"));
    assert.equal(el.querySelector(".cm-editor"), null);
  } finally { await act(async () => root.unmount()); el.remove(); }
});

test("node views follow Edit/View without replacing the editor or losing changes", async () => {
  const { el, root } = host();
  let editor: Editor | undefined;
  const markdown = '> [!NOTE] Title\n> Read me.\n\n```json\n{"a":1}\n```\n\n<div>Preserved HTML</div>\n';
  const props = { initialMarkdown: markdown, showToolbar: false, resolveAsset: { current: (src: string) => src }, onReady: (value: Editor) => { editor = value; }, onChange() {}, onLink: () => false, onThread() {}, onQuote() {}, onReference() {}, onEditMath() {}, onEditLink() {} };
  try {
    await act(async () => root.render(createElement(RichMarkdownEditor, { ...props, editable: false })));
    await flush();
    assert.ok(editor);
    const original = editor;
    assert.equal(el.querySelector<HTMLInputElement>(".mdpro-callout-title")?.disabled, true);
    assert.equal(el.querySelector<HTMLInputElement>(".mdpro-code-lang")?.disabled, true);
    assert.equal(el.querySelector(".mdpro-prose")?.getAttribute("contenteditable"), "false");
    const items = buildContextItems(editor, { x: 0, y: 0, link: "https://example.com", image: null, selection: { from: 0, to: 0 } }, { quote() {}, startComment() {}, copyReference() {}, editLink() {}, openLink() {}, openImage() {}, insertItems: () => [] });
    const labels = items.filter(item => item !== "sep").map(item => item.label);
    assert.ok(labels.includes(t("ctxQuoteBlock")));
    assert.ok(labels.includes(t("ctxCopyReference")));
    assert.ok(labels.includes(t("ctxOpenLink")));
    assert.ok(!labels.includes(t("ctxPaste")));
    assert.ok(!labels.includes(t("ctxEditLink")));
    await act(async () => root.render(createElement(RichMarkdownEditor, { ...props, editable: true })));
    assert.equal(editor, original);
    assert.equal(el.querySelector<HTMLInputElement>(".mdpro-callout-title")?.disabled, false);
    assert.equal(el.querySelector<HTMLInputElement>(".mdpro-code-lang")?.disabled, false);
    await act(async () => { editor!.commands.insertContentAt(editor!.state.doc.content.size, "Unsaved text."); });
    const edited = editor.getMarkdown();
    await click(button(el.querySelector(".mdpro-raw")!, t("editCode")));
    assert.ok(el.querySelector(".mdpro-raw-edit"));
    await act(async () => root.render(createElement(RichMarkdownEditor, { ...props, editable: false })));
    assert.equal(editor, original);
    assert.equal(editor.getMarkdown(), edited);
    assert.equal(el.querySelector<HTMLInputElement>(".mdpro-callout-title")?.disabled, true);
    assert.equal(el.querySelector<HTMLInputElement>(".mdpro-code-lang")?.disabled, true);
    assert.equal(el.querySelector(".mdpro-raw-edit"), null);
  } finally { await act(async () => root.unmount()); el.remove(); }
});

test("mobile modes keep source read-only and resizing never enables editing", async () => {
  const { el, root } = host();
  localStorage.setItem("md-editor:autosave", "off");
  const props = { path: "read.md", source: { kind: "host", experimental_hostId: "host", threadId: null, environmentId: null, projectId: null }, experimental_lineRange: null, Original: () => null };
  try {
    await act(async () => root.render(createElement(Opener, props)));
    await flush();
    assert.equal(el.querySelector(".mdpro-prose")?.getAttribute("contenteditable"), "false");
    await click(button(el, t("rawShort")));
    assert.equal(el.querySelector(".cm-content")?.getAttribute("contenteditable"), "false");
    await act(async () => { smallScreen = false; resize?.([{ contentRect: { width: 1200 } }]); });
    assert.equal(el.querySelector(".cm-content")?.getAttribute("contenteditable"), "false");
    await click(button(el, t("editShort")));
    assert.equal(el.querySelector(".mdpro-prose")?.getAttribute("contenteditable"), "true");
    await act(async () => { smallScreen = true; resize?.([{ contentRect: { width: 390 } }]); });
    assert.equal(el.querySelector(".mdpro-prose")?.getAttribute("contenteditable"), "true");
    assert.ok(el.querySelector('[role="toolbar"]'), "formatting stays visible in Edit after narrowing the panel");
    await act(async () => { smallScreen = false; resize?.([{ contentRect: { width: 1200 } }]); });
    assert.ok(button(el, t("formattedShort")), "mode controls stay available on wide panels in Edit");
    await click(button(el, t("formattedShort")));
    assert.equal(el.querySelector(".mdpro-prose")?.getAttribute("contenteditable"), "false");
    assert.equal(writes.length, 0);
  } finally { smallScreen = true; await act(async () => root.unmount()); el.remove(); }
});
