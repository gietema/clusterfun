"use client";
import { useState, useRef, useEffect } from "react";
import type { InformationValue } from "@/app/types";

interface InformationItemProps {
  label: string;
  value: InformationValue;
  onEdit?: (column: string, value: InformationValue) => void;
  onEditAll?: (column: string, value: InformationValue) => void;
}

function parseEditValue(input: string, originalValue: InformationValue): InformationValue {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (typeof originalValue === "number") {
    const num = Number(trimmed);
    if (!isNaN(num)) return num;
  }
  if (typeof originalValue === "boolean") {
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
  }
  return trimmed;
}

export default function InformationItem({ label, value, onEdit, onEditAll }: InformationItemProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    if (!onEdit) return;
    const parsed = parseEditValue(editValue, value);
    if (parsed !== value) {
      onEdit(label, parsed);
    }
    setEditing(false);
  };

  const handleApplyAll = () => {
    if (!onEditAll) return;
    const parsed = parseEditValue(editValue, value);
    onEditAll(label, parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="pt-2">
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className="mt-0.5 flex items-center gap-1">
          <input
            ref={inputRef}
            className="min-w-0 flex-grow rounded border border-gray-300 px-1.5 py-0.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button
            className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-xs font-medium text-white transition-colors hover:bg-gray-700"
            onClick={handleSave}
          >
            Save
          </button>
          <button
            className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
        {onEditAll && (
          <button
            className="mt-0.5 text-[10px] text-gray-400 transition-colors hover:text-gray-700"
            onClick={handleApplyAll}
          >
            Apply to page
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`pt-2${onEdit ? " group cursor-pointer" : ""}`}
      onClick={() => {
        if (!onEdit) return;
        setEditValue(String(value ?? ""));
        setEditing(true);
      }}
    >
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 group-hover:text-blue-700">
        {value === null || value === undefined ? <span className="text-gray-300 italic">empty</span> : String(value)}
      </div>
    </div>
  );
}
