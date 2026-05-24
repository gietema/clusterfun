"use client";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
  sidebarWidthAtom,
  sidebarCollapsedAtom,
  gridCollapsedAtom,
} from "@/app/store/atoms";

interface ResizableLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

const MIN_SIDEBAR = 200;
const MAX_SIDEBAR_FRACTION = 0.5;
const DEFAULT_SIDEBAR_FRACTION = 0.25;

export default function ResizableLayout({ sidebar, children }: ResizableLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useAtom(sidebarWidthAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const [gridCollapsed, setGridCollapsed] = useAtom(gridCollapsedAtom);
  const dragging = useRef(false);
  const currentWidth = useRef(0);

  // Last-resort safety net: if both panes ever get collapsed (e.g. via deep-link state),
  // force the grid back open. Click handlers in GridView / Sidebar normally prevent this.
  useEffect(() => {
    if (sidebarCollapsed && gridCollapsed) {
      setGridCollapsed(false);
      setSidebarCollapsed(false);
    }
  }, [sidebarCollapsed, gridCollapsed, setGridCollapsed, setSidebarCollapsed]);

  // Initialize sidebar width from container on first mount
  useEffect(() => {
    if (containerRef.current && sidebarWidth === null) {
      const w = Math.round(containerRef.current.offsetWidth * DEFAULT_SIDEBAR_FRACTION);
      setSidebarWidth(w);
      currentWidth.current = w;
    } else if (sidebarWidth !== null) {
      currentWidth.current = sidebarWidth;
    }
  }, [sidebarWidth, setSidebarWidth]);

  const applyWidth = useCallback((w: number) => {
    if (mainRef.current) mainRef.current.style.width = `calc(100% - ${w}px - 6px)`;
    if (sidebarRef.current) sidebarRef.current.style.width = `${w}px`;
    currentWidth.current = w;
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const maxSidebar = rect.width * MAX_SIDEBAR_FRACTION;
      const newWidth = Math.max(MIN_SIDEBAR, Math.min(maxSidebar, rect.right - e.clientX));
      applyWidth(newWidth);
    };

    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setSidebarWidth(currentWidth.current);
        window.dispatchEvent(new Event("resize"));
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [applyWidth, setSidebarWidth]);

  const sw = sidebarWidth ?? 300;

  // Layout math
  const showSidebar = !sidebarCollapsed;
  const showGrid = !gridCollapsed;
  const showDivider = showSidebar && showGrid;

  // Each pane keeps its natural size. When the OTHER pane is collapsed, the grid takes
  // the remaining space (it's the "main" content), but the sidebar stays at its fixed
  // width — expanding it to fill the screen would just be empty whitespace.
  const mainStyle = showSidebar
    ? { width: `calc(100% - ${sw}px - 6px)` }
    : { flex: 1 };

  const sidebarStyle = { width: `${sw}px` };

  return (
    <div ref={containerRef} className="relative flex h-full w-full overflow-hidden">
      {/* Main pane — GridView is responsible for rendering its own internal collapse states
          (grid section and charts section are siblings inside it). */}
      <div
        ref={mainRef}
        style={mainStyle}
        className="flex h-full min-w-0 flex-shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out"
      >
        {children}
      </div>

      {/* Drag handle with hover collapse buttons */}
      {showDivider && (
        <div
          onMouseDown={onMouseDown}
          className="group relative flex w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center hover:bg-gray-100 active:bg-gray-200"
        >
          <div className="h-8 w-0.5 rounded-full bg-gray-200 transition-colors group-hover:bg-gray-300" />

          {/* Collapse arrows — visible on hover */}
          <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setGridCollapsed(true); }}
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
              title="Collapse main pane"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setSidebarCollapsed(true); }}
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
              title="Collapse sidebar"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Sidebar pane (expanded) */}
      {showSidebar && (
        <div
          ref={sidebarRef}
          style={sidebarStyle}
          className="flex h-full min-w-0 flex-shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out"
        >
          {sidebar}
        </div>
      )}

      {/* Sidebar collapsed strip — vertical rail on the right edge */}
      {sidebarCollapsed && (
        <div className="flex h-full w-10 shrink-0 flex-col items-center gap-1 border-l border-gray-200 bg-gray-50/40 py-2">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
            title="Show preview pane"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>
      )}

    </div>
  );
}
