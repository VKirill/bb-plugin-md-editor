import type { PluginContentScriptContext } from "@get-bb/plugin-sdk/app";

const SOURCE = `(() => {
  if (window.__bbNativeOverlayGuard) return;
  window.__bbNativeOverlayGuard = true;
  const selector = [
    '[role="dialog"][data-state="open"]',
    '[role="alertdialog"][data-state="open"]',
    '[data-bb-portaled-overlay][data-state="open"]',
    "[data-radix-dialog-overlay]",
    "[data-radix-alert-dialog-overlay]",
  ].join(",");
  const overlayOpen = () => document.querySelector(selector) !== null;
  const intended = new Map();
  let wrapping = false;
  let overlay = false;
  const wrap = () => {
    const browser = window.bbDesktop && window.bbDesktop.browser;
    if (!browser || browser.__bbOverlayGuard) return false;
    browser.__bbOverlayGuard = true;
    const origAttach = browser.attach.bind(browser);
    const origDetach = browser.detach.bind(browser);
    const origSetVisible = browser.setVisible.bind(browser);
    const origWithoutFocus = browser.setVisibleWithoutFocus
      ? browser.setVisibleWithoutFocus.bind(browser)
      : null;
    const origOnState = browser.onState ? browser.onState.bind(browser) : null;
    const apply = (tabId, visible) => {
      wrapping = true;
      origSetVisible({ tabId, visible });
      wrapping = false;
    };
    const replay = () => {
      for (const [tabId, visible] of intended) apply(tabId, visible && !overlay);
    };
    browser.attach = (request) => {
      if (typeof request.tabId === "string") {
        intended.set(request.tabId, request.visible !== false);
      }
      origAttach({
        ...request,
        visible: request.visible !== false && !overlayOpen(),
      });
    };
    browser.detach = (tabId) => {
      intended.delete(tabId);
      origDetach(tabId);
    };
    browser.setVisible = (request) => {
      if (!wrapping && request && typeof request.tabId === "string") {
        intended.set(request.tabId, Boolean(request.visible));
      }
      origSetVisible({
        ...request,
        visible: Boolean(request.visible) && !overlay,
      });
    };
    if (origWithoutFocus) {
      browser.setVisibleWithoutFocus = (request) => {
        if (!wrapping && request && typeof request.tabId === "string") {
          intended.set(request.tabId, Boolean(request.visible));
        }
        origWithoutFocus({
          ...request,
          visible: Boolean(request.visible) && !overlay,
        });
      };
    }
    const sync = () => {
      const next = overlayOpen();
      if (next === overlay) return;
      overlay = next;
      replay();
    };
    if (origOnState) {
      origOnState((state) => {
        if (state && typeof state.tabId === "string" && !intended.has(state.tabId)) {
          intended.set(state.tabId, true);
        }
      });
    }
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["role", "data-state", "data-bb-browser-dimming", "data-radix-dialog-overlay", "data-radix-alert-dialog-overlay"],
    });
    overlay = overlayOpen();
    if (overlay) replay();
    return true;
  };
  if (wrap()) return;
  const timer = setInterval(() => {
    if (wrap()) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 15000);
})();`;

export function mountBrowserLayer(context: PluginContentScriptContext) {
  const existing = document.querySelector("script[data-bb-native-overlay-guard]");
  if (existing) return () => undefined;
  const script = document.createElement("script");
  script.dataset.bbNativeOverlayGuard = "";
  script.textContent = SOURCE;
  (document.head || document.documentElement).appendChild(script);
  const dispose = () => {
    script.remove();
  };
  context.signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
