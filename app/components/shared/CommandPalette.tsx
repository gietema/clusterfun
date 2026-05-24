"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  commandPaletteOpenAtom,
  configAtom,
  showPageAtom,
  uuidAtom,
  bottomDockVisibleAtom,
} from "@/app/store/atoms";

interface Command {
  id: string;
  label: string;
  category: string;
  keywords: string[];
  icon: React.ReactNode;
  action: () => void;
}

const NAV_ICON = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const ANALYSIS_ICON = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.997.398-.997.95v8a1 1 0 0 0 1 1h8Z" />
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
  </svg>
);
const EXPORT_ICON = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);
const VIEW_ICON = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
  </svg>
);

export default function CommandPalette() {
  const [open, setOpen] = useAtom(commandPaletteOpenAtom);
  const config = useAtomValue(configAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const uuid = useAtomValue(uuidAtom);
  const setDockVisible = useSetAtom(bottomDockVisibleAtom);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build command list
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Navigation
    cmds.push({
      id: "nav-grid", label: "Go to Grid", category: "Navigation",
      keywords: ["grid", "gallery", "browse", "images"],
      icon: VIEW_ICON,
      action: () => setShowPage("grid"),
    });
    cmds.push({
      id: "nav-plot", label: "Toggle Analytics Panels", category: "Navigation",
      keywords: ["plot", "chart", "scatter", "histogram", "analytics", "dock"],
      icon: NAV_ICON,
      action: () => { setShowPage("grid"); setDockVisible((v) => !v); },
    });
    cmds.push({
      id: "nav-insights", label: "Open Insights", category: "Navigation",
      keywords: ["insights", "analysis", "statistics", "outliers"],
      icon: ANALYSIS_ICON,
      action: () => setShowPage("insights"),
    });
    cmds.push({
      id: "nav-projects", label: "Open Projects", category: "Navigation",
      keywords: ["projects", "datasets", "switch", "browse"],
      icon: NAV_ICON,
      action: () => setShowPage("projects"),
    });
    cmds.push({
      id: "nav-docs", label: "Open Documentation", category: "Navigation",
      keywords: ["docs", "documentation", "help", "guide"],
      icon: NAV_ICON,
      action: () => setShowPage("docs"),
    });
    cmds.push({
      id: "nav-shortcuts", label: "Keyboard Shortcuts", category: "Navigation",
      keywords: ["keyboard", "shortcuts", "keys", "help"],
      icon: NAV_ICON,
      action: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true })),
    });

    if (config) {
      // Analysis actions
      if (config.embeddings) {
        cmds.push({
          id: "analysis-outliers", label: "Find Outliers", category: "Analysis",
          keywords: ["outliers", "anomalies", "unusual", "detect"],
          icon: ANALYSIS_ICON,
          action: () => setShowPage("insights"),
        });
        cmds.push({
          id: "analysis-duplicates", label: "Find Duplicates", category: "Analysis",
          keywords: ["duplicates", "similar", "copies", "near-duplicates"],
          icon: ANALYSIS_ICON,
          action: () => setShowPage("insights"),
        });
        cmds.push({
          id: "analysis-weirdest", label: "Show Weirdest Items", category: "Analysis",
          keywords: ["weird", "unusual", "centroid", "distance", "strange"],
          icon: ANALYSIS_ICON,
          action: () => setShowPage("insights"),
        });
      }

      // Export
      cmds.push({
        id: "export-csv", label: "Download CSV", category: "Export",
        keywords: ["csv", "download", "export", "data", "spreadsheet"],
        icon: EXPORT_ICON,
        action: () => {
          // Trigger CSV download via the existing API
          import("@/app/lib/api").then(({ downloadGridCsv }) => {
            downloadGridCsv(uuid, []).then((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "data.csv";
              a.click();
              URL.revokeObjectURL(url);
            });
          });
        },
      });

      // View actions
      cmds.push({
        id: "view-focus", label: "Enter Focus Mode", category: "View",
        keywords: ["focus", "labeling", "review", "fullscreen"],
        icon: VIEW_ICON,
        action: () => {
          // Focus mode is managed within GridView — dispatch a key event
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
        },
      });
    }

    return cmds;
  }, [config, uuid, setShowPage]);

  // Filter commands by query
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase();
    return commands.filter((cmd) =>
      cmd.label.toLowerCase().includes(lower) ||
      cmd.keywords.some((kw) => kw.includes(lower)),
    );
  }, [commands, query]);

  // Group by category for display
  const grouped = useMemo(() => {
    const groups: { category: string; commands: Command[] }[] = [];
    const seen = new Set<string>();
    for (const cmd of filtered) {
      if (!seen.has(cmd.category)) {
        seen.add(cmd.category);
        groups.push({ category: cmd.category, commands: [] });
      }
      groups.find((g) => g.category === cmd.category)!.commands.push(cmd);
    }
    return groups;
  }, [filtered]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Global Cmd+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);

  const executeCommand = useCallback((cmd: Command) => {
    setOpen(false);
    cmd.action();
  }, [setOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        executeCommand(filtered[selectedIndex]);
      }
    }
  }, [filtered, selectedIndex, executeCommand, setOpen]);

  // Keep selected index in bounds when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <svg className="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No commands found
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.category}>
              <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {group.category}
              </div>
              {group.commands.map((cmd) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={cmd.id}
                    data-index={idx}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                      idx === selectedIndex
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span className="shrink-0 text-gray-500">{cmd.icon}</span>
                    <span>{cmd.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
