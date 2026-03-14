"use client";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { sidebarWidthAtom } from "@/app/store/atoms";

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
  const dragging = useRef(false);
  const currentWidth = useRef(0);

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
    if (mainRef.current) mainRef.current.style.width = `calc(100% - ${w}px)`;
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

  return (
    <div ref={containerRef} className="flex h-full w-full">
      <div ref={mainRef} style={{ width: `calc(100% - ${sw}px)` }} className="h-full min-w-0 flex-shrink-0">
        {children}
      </div>
      <div
        onMouseDown={onMouseDown}
        className="flex w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center hover:bg-gray-200 active:bg-gray-300"
      >
        <div className="h-8 w-0.5 rounded-full bg-gray-300" />
      </div>
      <div ref={sidebarRef} style={{ width: `${sw}px` }} className="min-w-0 flex-shrink-0 overflow-hidden">
        {sidebar}
      </div>
    </div>
  );
}
