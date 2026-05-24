"use client";
import { useState } from "react";
import { faDrawPolygon, faSquare, faTrash, faDownload, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Annotation, AnnotationTool, RectangleData, PolygonData } from "@/app/types";
import { COLORS } from "@/app/lib/constants";

interface AnnotationToolbarProps {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  currentLabel: string;
  onLabelChange: (label: string) => void;
  labels: string[];
  onAddLabel: (label: string) => void;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onDeleteAnnotation: (id: string) => void;
  onExport: () => void;
}

function getLabelColor(label: string, allLabels: string[]): string {
  const idx = allLabels.indexOf(label);
  return COLORS[(idx === -1 ? allLabels.length : idx) % COLORS.length];
}

export default function AnnotationToolbar({
  tool,
  onToolChange,
  currentLabel,
  onLabelChange,
  labels,
  onAddLabel,
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
  onDeleteAnnotation,
  onExport,
}: AnnotationToolbarProps) {
  const [newLabelInput, setNewLabelInput] = useState("");
  const [showNewLabel, setShowNewLabel] = useState(false);

  const handleAddLabel = () => {
    const trimmed = newLabelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      onAddLabel(trimmed);
      onLabelChange(trimmed);
    }
    setNewLabelInput("");
    setShowNewLabel(false);
  };

  return (
    <div className="flex flex-col gap-3 border-l border-gray-200 p-3" style={{ width: 260, minWidth: 260 }}>
      {/* Tool selection */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Tool</div>
        <div className="flex gap-1">
          <button
            onClick={() => onToolChange("rectangle")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors ${
              tool === "rectangle"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <FontAwesomeIcon icon={faSquare} />
            Rectangle
          </button>
          <button
            onClick={() => onToolChange("polygon")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors ${
              tool === "polygon"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <FontAwesomeIcon icon={faDrawPolygon} />
            Polygon
          </button>
        </div>
      </div>

      {/* Label selection */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Label</div>
        <div className="flex flex-col gap-1">
          {labels.map((label) => (
            <button
              key={label}
              onClick={() => onLabelChange(label)}
              className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                currentLabel === label
                  ? "bg-gray-800 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: getLabelColor(label, labels) }}
              />
              {label}
            </button>
          ))}
          {showNewLabel ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddLabel();
              }}
              className="flex gap-1"
            >
              <input
                autoFocus
                value={newLabelInput}
                onChange={(e) => setNewLabelInput(e.target.value)}
                onBlur={() => {
                  if (!newLabelInput.trim()) setShowNewLabel(false);
                }}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                placeholder="Label name..."
              />
              <button
                type="submit"
                className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowNewLabel(true)}
              className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
              New label
            </button>
          )}
        </div>
      </div>

      {/* Annotation list */}
      <div className="flex-1 overflow-y-auto">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Annotations ({annotations.length})
        </div>
        {annotations.length === 0 ? (
          <div className="text-xs text-gray-500">
            Draw on the image to create annotations
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {annotations.map((ann) => {
              const isSelected = ann.id === selectedAnnotationId;
              let dims = "";
              if (ann.type === "rectangle") {
                const d = ann.data as RectangleData;
                dims = `${Math.round(d.xmax - d.xmin)}x${Math.round(d.ymax - d.ymin)}`;
              } else {
                const d = ann.data as PolygonData;
                dims = `${d.points.length} pts`;
              }
              return (
                <div
                  key={ann.id}
                  onClick={() => onSelectAnnotation(isSelected ? null : ann.id)}
                  className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{
                        backgroundColor:
                          ann.color || getLabelColor(ann.label, labels),
                      }}
                    />
                    <span className="font-medium">{ann.label}</span>
                    <span className="text-gray-500">{dims}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAnnotation(ann.id);
                    }}
                    className="rounded p-0.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Delete annotation"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Export button */}
      {annotations.length > 0 && (
        <button
          onClick={onExport}
          className="flex items-center justify-center gap-1.5 rounded bg-gray-100 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-200"
        >
          <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
          Export annotations
        </button>
      )}
    </div>
  );
}
