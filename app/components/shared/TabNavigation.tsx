"use client";
import { useAtom, useAtomValue } from "jotai";
import { configAtom, showPageAtom } from "@/app/store/atoms";

export default function TabNavigation() {
  const config = useAtomValue(configAtom);
  const [showPage, setShowPage] = useAtom(showPageAtom);

  if (!config) return null;

  return (
    <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-3">
      <button
        onClick={() => setShowPage("plot")}
        className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
          showPage === "plot"
            ? "border-gray-900 text-gray-900"
            : "border-transparent text-gray-400 hover:text-gray-600"
        }`}
      >
        Plot
      </button>
      <button
        onClick={() => setShowPage("grid")}
        className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
          showPage === "grid"
            ? "border-gray-900 text-gray-900"
            : "border-transparent text-gray-400 hover:text-gray-600"
        }`}
      >
        Grid
      </button>
      <button
        onClick={() => setShowPage("docs")}
        className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
          showPage === "docs"
            ? "border-gray-900 text-gray-900"
            : "border-transparent text-gray-400 hover:text-gray-600"
        }`}
      >
        Docs
      </button>
    </div>
  );
}
