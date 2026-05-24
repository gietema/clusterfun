"use client";
import { useAtomValue } from "jotai";
import { faXmark, faTags, faMagnifyingGlass, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { configAtom } from "@/app/store/atoms";
import { getLabelColor } from "@/app/lib/label-colors";
import { useState } from "react";

interface SelectionActionBarProps {
  count: number;
  onClear: () => void;
  onLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
  onFindSimilar?: () => void;
}

export default function SelectionActionBar({
  count, onClear, onLabel, onRemoveLabel, onFindSimilar,
}: SelectionActionBarProps) {
  const config = useAtomValue(configAtom);
  const [showLabels, setShowLabels] = useState(false);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-lg">
      <span className="text-xs font-semibold text-gray-900">
        {count} selected
      </span>

      <div className="h-4 w-px bg-gray-200" />

      {/* Label */}
      <div className="relative">
        <button
          onClick={() => setShowLabels((s) => !s)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <FontAwesomeIcon icon={faTags} />
          Label
        </button>
        {showLabels && config?.labels && config.labels.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
            {config.labels.map((label, idx) => (
              <div key={label} className="flex items-center">
                <button
                  onClick={() => { onLabel(label); setShowLabels(false); }}
                  className="flex flex-1 items-center gap-2 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: getLabelColor(idx) }}
                  />
                  {label}
                </button>
                <button
                  onClick={() => { onRemoveLabel(label); setShowLabels(false); }}
                  className="px-2 py-1.5 text-[10px] text-gray-500 transition-colors hover:text-red-500"
                  title={`Remove "${label}" from selected`}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Find similar */}
      {onFindSimilar && (
        <button
          onClick={onFindSimilar}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          Find similar
        </button>
      )}

      <div className="h-4 w-px bg-gray-200" />

      {/* Clear */}
      <button
        onClick={onClear}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        title="Clear selection (Esc)"
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}
