// Right-click menu for BB's side-panel tab strip: close, close others / left /
// right / all, pin. BB has no tab-menu extension point, so this content script
// drives the strip's own close buttons. It keys on BB's data attributes and
// degrades to doing nothing if the strip markup changes.
import type { PluginContentScriptContext } from "@get-bb/plugin-sdk/app";
import { t } from "./i18n";

const STRIP = '[data-testid="secondary-panel-tab-strip"]';
const CONTENT = "[data-secondary-panel-tab-content]";
const CLOSE = "[data-tab-pill-close]";
const PINNED_ATTR = "data-mdpro-pinned";
const STORE_KEY = "md-editor:pinned-tabs";

type Pins = Record<string, string[]>;

function readPins(): Pins {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Pins;
  } catch {
    return {};
  }
}
function writePins(pins: Pins) {
  localStorage.setItem(STORE_KEY, JSON.stringify(pins));
}
/** Pins are remembered per route (thread / page), by tab label. */
const routeKey = () => location.pathname;

function tabItems(strip: Element): HTMLElement[] {
  const content = strip.querySelector(CONTENT);
  return content ? (Array.from(content.children) as HTMLElement[]) : [];
}
function labelOf(item: Element): string {
  return item.querySelector("span[title]")?.getAttribute("title") ?? item.textContent?.trim() ?? "";
}
function isPinned(item: Element) {
  return item.hasAttribute(PINNED_ATTR);
}

const CSS = `
[${PINNED_ATTR}] ${CLOSE} { display: none !important; }
[${PINNED_ATTR}] span[title]::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 9999px; background: var(--primary, #6366f1); vertical-align: middle; }
.mdpro-tabmenu { position: fixed; z-index: 2147483000; min-width: 220px; padding: 4px; border: 1px solid var(--border); border-radius: 10px; background: var(--popover, var(--background)); color: var(--popover-foreground, var(--foreground)); box-shadow: 0 10px 30px rgba(0,0,0,.18); font: 13px/1.3 var(--font-sans, system-ui, sans-serif); }
.mdpro-tabmenu button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 16px; padding: 6px 9px; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; text-align: left; cursor: default; }
.mdpro-tabmenu button:hover:not(:disabled) { background: var(--accent); }
.mdpro-tabmenu button:disabled { opacity: .4; }
.mdpro-tabmenu hr { height: 1px; margin: 4px 2px; border: 0; background: var(--border); }
`;

async function closeItems(strip: Element, labels: string[]) {
  // Close one at a time, re-querying after each re-render; right to left.
  for (const label of [...labels].reverse()) {
    const item = tabItems(strip).find((candidate) => labelOf(candidate) === label && !isPinned(candidate));
    const button = item?.querySelector<HTMLButtonElement>(CLOSE);
    if (!button) continue;
    button.click();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
}

export function mountTabMenu(context: PluginContentScriptContext) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  let menu: HTMLDivElement | null = null;

  const applyPins = () => {
    const pinned = new Set(readPins()[routeKey()] ?? []);
    document.querySelectorAll(STRIP).forEach((strip) => {
      for (const item of tabItems(strip)) {
        const want = pinned.has(labelOf(item)) && item.querySelector(CLOSE) !== null;
        if (want !== isPinned(item)) item.toggleAttribute(PINNED_ATTR, want);
      }
    });
  };

  const hide = () => {
    menu?.remove();
    menu = null;
  };

  const show = (strip: Element, item: HTMLElement) => {
    hide();
    const items = tabItems(strip);
    const index = items.indexOf(item);
    const closable = (list: HTMLElement[]) => list.filter((i) => i.querySelector(CLOSE) && !isPinned(i)).map(labelOf);
    const label = labelOf(item);
    const pinned = isPinned(item);
    const others = closable(items.filter((i) => i !== item));
    const left = closable(items.slice(0, index));
    const right = closable(items.slice(index + 1));
    const all = closable(items);

    const entries: ({ text: string; disabled?: boolean; run: () => void } | "sep")[] = [
      { text: t("tabClose"), disabled: pinned || !item.querySelector(CLOSE), run: () => void closeItems(strip, [label]) },
      { text: t("tabCloseOthers"), disabled: others.length === 0, run: () => void closeItems(strip, others) },
      { text: t("tabCloseLeft"), disabled: left.length === 0, run: () => void closeItems(strip, left) },
      { text: t("tabCloseRight"), disabled: right.length === 0, run: () => void closeItems(strip, right) },
      { text: t("tabCloseAll"), disabled: all.length === 0, run: () => void closeItems(strip, all) },
      "sep",
      {
        text: pinned ? t("tabUnpin") : t("tabPin"),
        disabled: !item.querySelector(CLOSE) && !pinned,
        run: () => {
          const pins = readPins();
          const key = routeKey();
          const set = new Set(pins[key] ?? []);
          if (pinned) set.delete(label);
          else set.add(label);
          pins[key] = [...set];
          writePins(pins);
          applyPins();
        },
      },
    ];

    menu = document.createElement("div");
    menu.className = "mdpro-tabmenu";
    menu.setAttribute("data-bb-ru-skip", "");
    menu.setAttribute("role", "menu");
    for (const entry of entries) {
      if (entry === "sep") {
        menu.appendChild(document.createElement("hr"));
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = entry.text;
      button.disabled = Boolean(entry.disabled);
      button.addEventListener("click", () => {
        hide();
        entry.run();
      });
      menu.appendChild(button);
    }
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    // Open under the clicked tab. A visible browser tab is a native view painted
    // above the page and would cover the menu, so then move it left of the panel.
    const stripRect = strip.getBoundingClientRect();
    const tabRect = item.getBoundingClientRect();
    // The native view fills the browser tab's container, which starts left of
    // the tab strip, so measure the widest ancestor of the visible address bar.
    let browserLeft: number | null = null;
    for (const bar of Array.from(document.querySelectorAll('[data-testid="browser-tab-nav-bar"]'))) {
      const r = bar.getBoundingClientRect();
      if (r.width === 0 || r.left >= stripRect.right || r.right <= stripRect.left) continue;
      let left = Math.min(r.left, stripRect.left);
      for (let el = bar.parentElement, depth = 0; el && depth < 6; el = el.parentElement, depth += 1) {
        const a = el.getBoundingClientRect();
        // Stop at containers that reach into the chat column.
        if (a.width >= window.innerWidth * 0.95 || a.left < stripRect.left - 160) break;
        left = Math.min(left, a.left);
      }
      browserLeft = browserLeft === null ? left : Math.min(browserLeft, left);
    }
    let x = Math.min(tabRect.left, window.innerWidth - rect.width - 8);
    if (browserLeft !== null && browserLeft - rect.width - 8 >= 8) x = browserLeft - rect.width - 8;
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.min(tabRect.bottom + 4, window.innerHeight - rect.height - 8)}px`;
  };

  const onContextMenu = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const strip = target?.closest?.(STRIP);
    const content = strip?.querySelector(CONTENT);
    if (!strip || !content) return;
    const item = tabItems(strip).find((candidate) => candidate.contains(target));
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    show(strip, item);
  };
  const onPointerDown = (event: Event) => {
    if (menu && !menu.contains(event.target as Node)) hide();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") hide();
  };

  document.addEventListener("contextmenu", onContextMenu, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", hide);
  window.addEventListener("resize", hide);
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyPins();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  applyPins();

  const dispose = () => {
    observer.disconnect();
    document.removeEventListener("contextmenu", onContextMenu, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", hide);
    window.removeEventListener("resize", hide);
    hide();
    style.remove();
    document.querySelectorAll(`[${PINNED_ATTR}]`).forEach((node) => node.removeAttribute(PINNED_ATTR));
  };
  context.signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
