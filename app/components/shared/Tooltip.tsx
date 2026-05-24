"use client";
import { useLayoutEffect, useRef, useState, useEffect, cloneElement } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom";
  delay?: number;
  children: React.ReactElement;
}

/**
 * Apple-style tooltip: small floating capsule with label + optional shortcut.
 * Portal-rendered so it escapes any overflow clipping.
 */
export default function Tooltip({ label, shortcut, side = "bottom", delay = 400, children }: TooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => setVisible(true), delay);
  };
  const handleMouseLeave = () => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    setVisible(false);
  };

  useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
  }, []);

  useLayoutEffect(() => {
    if (!visible) { setPos(null); return; }
    const update = () => {
      const trigger = triggerRef.current;
      const pop = popRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const pw = pop?.offsetWidth ?? 0;
      const ph = pop?.offsetHeight ?? 0;
      let top = side === "top" ? r.top - ph - 6 : r.bottom + 6;
      let left = r.left + r.width / 2 - pw / 2;
      // clamp to viewport
      const margin = 6;
      left = Math.max(margin, Math.min(window.innerWidth - pw - margin, left));
      top = Math.max(margin, Math.min(window.innerHeight - ph - margin, top));
      setPos({ top, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [visible, side]);

  const child = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Forward to existing ref if any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const childRef = (children as any).ref;
      if (typeof childRef === "function") childRef(node);
      else if (childRef && typeof childRef === "object") childRef.current = node;
    },
    onMouseEnter: (e: React.MouseEvent) => {
      handleMouseEnter();
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      handleMouseLeave();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      handleMouseEnter();
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      handleMouseLeave();
      children.props.onBlur?.(e);
    },
  });

  return (
    <>
      {child}
      {visible && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, opacity: pos ? 1 : 0 }}
          className="pointer-events-none z-[60] flex items-center gap-1.5 rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg motion-popover"
          role="tooltip"
        >
          <span>{label}</span>
          {shortcut && (
            <kbd className="rounded bg-white/15 px-1 py-px font-mono text-[10px] text-white/90">
              {shortcut}
            </kbd>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
