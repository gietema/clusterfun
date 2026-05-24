"use client";
import { useEffect } from "react";
import { useAtom } from "jotai";
import {
  sidebarCollapsedAtom,
  labelRailCollapsedAtom,
  bottomDockVisibleAtom,
  gridCollapsedAtom,
} from "@/app/store/atoms";

/**
 * Global pane-collapse shortcuts:
 *   ⌘\           toggle preview sidebar
 *   ⌘⇧L          toggle label rail
 *   ⌘⇧A          toggle analytics dock
 *   ⌘.           grid-only focus (hide rail, sidebar, analytics)
 */
export default function PaneShortcuts() {
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const [railCollapsed, setRailCollapsed] = useAtom(labelRailCollapsedAtom);
  const [dockVisible, setDockVisible] = useAtom(bottomDockVisibleAtom);
  const [, setGridCollapsed] = useAtom(gridCollapsedAtom);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      if (e.key === "\\") {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
      } else if (e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        setRailCollapsed((v) => !v);
      } else if (e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        setDockVisible((v) => !v);
      } else if (e.key === ".") {
        e.preventDefault();
        // Grid-only focus: hide everything else, restore grid
        setRailCollapsed(true);
        setSidebarCollapsed(true);
        setDockVisible(false);
        setGridCollapsed(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setSidebarCollapsed, setRailCollapsed, setDockVisible, setGridCollapsed]);

  return null;
}
