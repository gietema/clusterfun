"use client";
import { useAtom } from "jotai";
import { dragModeAtom } from "@/app/store/atoms";

const modes = [
  { id: "select" as const, label: "Box select", icon: BoxIcon },
  { id: "lasso" as const, label: "Lasso select", icon: LassoIcon },
  { id: "pan" as const, label: "Pan & zoom", icon: PanIcon },
];

function BoxIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
      <rect x="2" y="2" width="12" height="12" rx="1" strokeDasharray="3 2" />
    </svg>
  );
}

function LassoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
      <path d="M3 10C2 7 3 3 8 3s7 3 6 7-5 4-8 2" strokeDasharray="3 2" />
      <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PanIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
      <path d="M8 2v12M2 8h12M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" />
    </svg>
  );
}

export default function SelectionToolbar() {
  const [dragMode, setDragMode] = useAtom(dragModeAtom);

  return (
    <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5 shadow-sm">
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <button
            key={mode.id}
            onClick={() => setDragMode(mode.id)}
            className={`rounded px-1.5 py-1 transition-colors ${
              dragMode === mode.id
                ? "bg-gray-800 text-white"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
            title={mode.label}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
