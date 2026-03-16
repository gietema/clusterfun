"use client";
import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { configAtom, showPageAtom } from "@/app/store/atoms";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

export default function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);
  const config = useAtomValue(configAtom);
  const showPage = useAtomValue(showPageAtom);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  const groups: ShortcutGroup[] = [
    {
      title: "Navigation",
      shortcuts: [
        { keys: ["?"], description: "Toggle this help" },
        { keys: ["Esc"], description: "Go back / close overlay" },
        ...(config?.embeddings_model
          ? [{ keys: ["\u2318", "K"], description: "Focus text search" }]
          : []),
      ],
    },
    {
      title: "Grid view",
      shortcuts: [
        { keys: ["F"], description: "Enter focus mode" },
        { keys: ["1"], description: "Toggle 1st label on hovered item" },
        { keys: ["2\u20139"], description: "Toggle 2nd\u20139th label" },
      ],
    },
    {
      title: "Focus mode",
      shortcuts: [
        { keys: ["\u2190"], description: "Previous item" },
        { keys: ["\u2192"], description: "Next item" },
        { keys: ["Space"], description: "Skip item" },
        { keys: ["Backspace"], description: "Go back" },
        { keys: ["1\u20139"], description: "Apply label" },
        { keys: ["Y"], description: "Accept suggestion" },
        { keys: ["N"], description: "Reject suggestion" },
        { keys: ["Esc"], description: "Exit focus mode" },
      ],
    },
    {
      title: "Media detail",
      shortcuts: [
        { keys: ["\u2190"], description: "Previous item" },
        { keys: ["\u2192"], description: "Next item" },
        { keys: ["Esc"], description: "Back to grid" },
      ],
    },
    {
      title: "Labels",
      shortcuts: [
        { keys: ["\u2318", "Z"], description: "Undo label" },
        { keys: ["\u2318", "\u21E7", "Z"], description: "Redo label" },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Keyboard shortcuts</h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            Esc
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-600">{shortcut.description}</span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {shortcut.keys.map((key, j) => (
                        <kbd
                          key={j}
                          className="inline-flex min-w-[22px] items-center justify-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-600"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[11px] text-gray-400">
          Press <kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-px text-[10px] font-medium text-gray-500">?</kbd> to toggle
        </p>
      </div>
    </div>
  );
}
