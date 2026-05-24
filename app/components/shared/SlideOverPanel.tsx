"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface SlideOverPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Panel width — defaults to "max-w-2xl" */
  width?: string;
}

const DISMISS_THRESHOLD = 80; // px dragged right before we dismiss

/**
 * A slide-over panel that appears from the right side of the screen.
 * The grid stays visible behind a semi-transparent backdrop.
 *
 * Drag the header to the right to dismiss (Apple-style swipe-to-close).
 */
export default function SlideOverPanel({
  open,
  onClose,
  title,
  children,
  width = "max-w-2xl",
}: SlideOverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const [dragDx, setDragDx] = useState(0);

  // Close on Escape, trap Tab within the panel while open
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      // Focus trap
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset drag offset whenever we re-open
  useEffect(() => { if (open) setDragDx(0); }, [open]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartX.current == null) return;
    const dx = Math.max(0, e.clientX - dragStartX.current); // only allow rightward drag
    setDragDx(dx);
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragStartX.current == null) return;
    if (dragDx >= DISMISS_THRESHOLD) {
      onClose();
    } else {
      setDragDx(0);
    }
    dragStartX.current = null;
  }, [dragDx, onClose]);

  if (!open) return null;

  // Backdrop opacity also fades with drag
  const backdropOpacity = Math.max(0, 1 - dragDx / 240);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="motion-fade absolute inset-0 bg-black/30 backdrop-blur-sm"
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`motion-slide-in-right relative flex w-full ${width} flex-col bg-white shadow-2xl`}
        style={{
          transform: dragDx > 0 ? `translateX(${dragDx}px)` : undefined,
          transition: dragStartX.current == null ? "transform 200ms cubic-bezier(0.2, 0.8, 0.3, 1)" : "none",
        }}
      >
        {/* Drag handle / header */}
        <div
          className="flex shrink-0 cursor-grab items-center justify-between border-b border-gray-200 px-4 py-3 select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex items-center gap-2.5">
            {/* Grab indicator */}
            <span className="h-1 w-6 rounded-full bg-gray-300" aria-hidden />
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content — children manage their own scrolling */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
