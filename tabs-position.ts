/** Dropdown under the clicked tab, clamped to the viewport. */
export function tabMenuPosition(
  tab: { left: number; bottom: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const x = Math.min(Math.max(8, tab.left), Math.max(8, viewport.width - menu.width - 8));
  const y = Math.min(tab.bottom + 4, Math.max(8, viewport.height - menu.height - 8));
  return { x, y };
}
