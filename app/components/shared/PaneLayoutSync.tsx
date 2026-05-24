"use client";
import { useEffect, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  uuidAtom,
  sidebarCollapsedAtom,
  labelRailCollapsedAtom,
  bottomDockVisibleAtom,
  gridCollapsedAtom,
} from "@/app/store/atoms";

interface Layout {
  sidebarCollapsed: boolean;
  railCollapsed: boolean;
  dockVisible: boolean;
  gridCollapsed: boolean;
}

const STORAGE_PREFIX = "clusterfun:layout:";

/**
 * Persists pane layout (sidebar/rail/dock/grid collapsed states) per dataset uuid
 * to localStorage. On uuid change, restores the saved layout for that dataset.
 */
export default function PaneLayoutSync() {
  const uuid = useAtomValue(uuidAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const [railCollapsed, setRailCollapsed] = useAtom(labelRailCollapsedAtom);
  const [dockVisible, setDockVisible] = useAtom(bottomDockVisibleAtom);
  const [gridCollapsed, setGridCollapsed] = useAtom(gridCollapsedAtom);

  // Avoid persisting the initial restore back to storage
  const restoringRef = useRef(true);
  const lastUuidRef = useRef<string | null>(null);

  // Restore on uuid change
  useEffect(() => {
    if (!uuid || uuid === "recent" || typeof window === "undefined") return;
    if (lastUuidRef.current === uuid) return;
    lastUuidRef.current = uuid;
    restoringRef.current = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + uuid);
      if (raw) {
        const saved: Partial<Layout> = JSON.parse(raw);
        if (typeof saved.sidebarCollapsed === "boolean") setSidebarCollapsed(saved.sidebarCollapsed);
        if (typeof saved.railCollapsed === "boolean") setRailCollapsed(saved.railCollapsed);
        if (typeof saved.dockVisible === "boolean") setDockVisible(saved.dockVisible);
        if (typeof saved.gridCollapsed === "boolean") setGridCollapsed(saved.gridCollapsed);
      }
    } catch { /* ignore */ }
    // Allow persist after the next paint
    setTimeout(() => { restoringRef.current = false; }, 0);
  }, [uuid, setSidebarCollapsed, setRailCollapsed, setDockVisible, setGridCollapsed]);

  // Persist on change
  useEffect(() => {
    if (!uuid || uuid === "recent" || typeof window === "undefined") return;
    if (restoringRef.current) return;
    try {
      const layout: Layout = { sidebarCollapsed, railCollapsed, dockVisible, gridCollapsed };
      window.localStorage.setItem(STORAGE_PREFIX + uuid, JSON.stringify(layout));
    } catch { /* ignore (quota etc) */ }
  }, [uuid, sidebarCollapsed, railCollapsed, dockVisible, gridCollapsed]);

  return null;
}
