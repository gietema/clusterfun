"use client";
import { useEffect } from "react";
import toast from "react-hot-toast";

const SEEN_KEY = "clusterfun:firstRunHintSeen";

/**
 * Show a one-time "Press ? for shortcuts" toast on first session.
 * Marks seen in localStorage so it doesn't return.
 */
export default function FirstRunHint() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(SEEN_KEY) === "1") return;

    // Delay slightly so the app paints first
    const timer = setTimeout(() => {
      toast.custom(
        (t) => (
          <div className={`motion-popover pointer-events-auto flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-xl ${t.visible ? "" : "opacity-0"}`}>
            <span className="text-xs text-gray-700">
              Press <kbd className="rounded border border-gray-200 bg-gray-50 px-1 text-[10px] text-gray-700">?</kbd> for keyboard shortcuts
            </span>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="rounded px-2 py-0.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50"
            >
              Got it
            </button>
          </div>
        ),
        { duration: 6000, position: "bottom-center" },
      );
      window.localStorage.setItem(SEEN_KEY, "1");
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
