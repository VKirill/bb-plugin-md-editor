// Full-screen viewer for a rendered diagram: fit, zoom around the cursor, drag to pan.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, FitToScreenIcon, ZoomInIcon, ZoomOutIcon } from "@hugeicons/core-free-icons";
import { t } from "./i18n";

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const PAD = 32;

type View = { scale: number; x: number; y: number };

/** Copy of a Mermaid SVG with its own ids and natural pixel size. */
function prepareSvg(source: SVGSVGElement): { html: string; width: number; height: number } {
  const box = source.viewBox.baseVal;
  const rect = source.getBoundingClientRect();
  const width = box && box.width ? box.width : rect.width;
  const height = box && box.height ? box.height : rect.height;
  let html = source.outerHTML;
  // Markers and scoped styles reference the id; give the copy its own.
  if (source.id) html = html.split(source.id).join(`${source.id}-zoom`);
  const holder = document.createElement("div");
  holder.innerHTML = html;
  const svg = holder.querySelector("svg")!;
  svg.style.maxWidth = "none";
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  return { html: holder.innerHTML, width, height };
}

export function DiagramZoom({ source, onClose }: { source: SVGSVGElement; onClose: () => void }) {
  const diagram = useMemo(() => prepareSvg(source), [source]);
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const fit = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((width - PAD * 2) / diagram.width, (height - PAD * 2) / diagram.height)));
    setView({ scale, x: (width - diagram.width * scale) / 2, y: (height - diagram.height * scale) / 2 });
  }, [diagram]);

  // Zoom keeping the stage point (px, py) in place; defaults to the centre.
  const zoomBy = useCallback((factor: number, px?: number, py?: number) => {
    const el = stage.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = px ?? rect.width / 2;
    const cy = py ?? rect.height / 2;
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  useLayoutEffect(fit, [fit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "+" || event.key === "=") zoomBy(1.25);
      else if (event.key === "-") zoomBy(0.8);
      else if (event.key === "0") fit();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", fit);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", fit);
    };
  }, [onClose, zoomBy, fit]);

  // React's onWheel is passive; preventDefault needs a native listener.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        // Clamp so a mouse-wheel notch zooms ~1.3x while trackpad pinches stay smooth.
        const delta = Math.max(-25, Math.min(25, event.deltaY));
        zoomBy(Math.exp(-delta * 0.01), event.clientX - rect.left, event.clientY - rect.top);
      } else {
        setView((v) => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  return createPortal(
    <div className="mdpro-zoom" role="dialog" aria-label={t("zoomDiagram")} data-bb-ru-skip onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="mdpro-zoom-card">
        <div
          ref={stage}
          className="mdpro-zoom-stage"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            drag.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start) return;
            drag.current = { x: event.clientX, y: event.clientY };
            setView((v) => ({ ...v, x: v.x + event.clientX - start.x, y: v.y + event.clientY - start.y }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onDoubleClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            zoomBy(2, event.clientX - rect.left, event.clientY - rect.top);
          }}
        >
          <div
            className="mdpro-zoom-content"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            dangerouslySetInnerHTML={{ __html: diagram.html }}
          />
        </div>
        <div className="mdpro-zoom-bar">
          <button type="button" className="mdpro-zoom-btn" data-tip={`${t("zoomOut")} (−)`} aria-label={t("zoomOut")} onClick={() => zoomBy(0.8)}>
            <HugeiconsIcon icon={ZoomOutIcon} size={16} strokeWidth={1.8} />
          </button>
          <span className="mdpro-zoom-level">{Math.round(view.scale * 100)}%</span>
          <button type="button" className="mdpro-zoom-btn" data-tip={`${t("zoomIn")} (+)`} aria-label={t("zoomIn")} onClick={() => zoomBy(1.25)}>
            <HugeiconsIcon icon={ZoomInIcon} size={16} strokeWidth={1.8} />
          </button>
          <button type="button" className="mdpro-zoom-btn" data-tip={`${t("zoomFit")} (0)`} aria-label={t("zoomFit")} onClick={fit}>
            <HugeiconsIcon icon={FitToScreenIcon} size={16} strokeWidth={1.8} />
          </button>
          <span className="mdpro-zoom-sep" />
          <button type="button" className="mdpro-zoom-btn" data-tip={`${t("zoomClose")} (Esc)`} aria-label={t("zoomClose")} onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
          </button>
        </div>
        <div className="mdpro-zoom-hint">{t("zoomHint")}</div>
      </div>
    </div>,
    document.body,
  );
}
