"use client";
import { useState } from "react";
import { useAtomValue } from "jotai";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { saveAs } from "file-saver";
import {
  configAtom, currentMediaIndicesAtom, uuidAtom,
} from "@/app/store/atoms";
import { exportData } from "@/app/lib/api";
import type { ExportFormat } from "@/app/lib/api";
import Section from "../shared/Section";

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: "coco", label: "COCO", description: "JSON with images, annotations, and categories" },
  { value: "yolo", label: "YOLO", description: "Label files with normalized coordinates" },
  { value: "classification", label: "Folders", description: "Images organized into label-named folders" },
];

export default function ExportSection() {
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);

  const [format, setFormat] = useState<ExportFormat>("coco");
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [labelFilter, setLabelFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!config) return null;

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const blob = await exportData(uuid, {
        format,
        media_ids: selectionOnly && mediaIndices.length > 0 ? mediaIndices : undefined,
        label_filter: labelFilter || undefined,
      });
      saveAs(blob, `${uuid}_${format}.zip`);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const resp = (err as any).response;
        if (resp?.data instanceof Blob) {
          const text = await resp.data.text();
          try {
            const json = JSON.parse(text);
            setError(json.detail || "Export failed");
          } catch {
            setError(text || "Export failed");
          }
        } else {
          setError(resp?.data?.detail || "Export failed");
        }
      } else {
        setError(err instanceof Error ? err.message : "Export failed");
      }
    } finally {
      setExporting(false);
    }
  };

  const selected = FORMAT_OPTIONS.find((f) => f.value === format)!;

  return (
    <Section title="Export">
      {/* Format selector */}
      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
            Format
          </label>
          <div className="grid grid-cols-2 gap-1">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                  format === opt.value
                    ? "border-gray-800 bg-gray-800 font-medium text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-gray-500">{selected.description}</p>
        </div>

        {/* Selection filter */}
        {mediaIndices.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={selectionOnly}
              onChange={(e) => setSelectionOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Current selection only ({mediaIndices.length} items)
          </label>
        )}

        {/* Label filter */}
        {config.labels.length > 0 && (
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
              Label filter
            </label>
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
            >
              <option value="">All labels</option>
              {config.labels.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Export button */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
          {exporting ? "Exporting..." : `Export as ${selected.label}`}
        </button>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </Section>
  );
}
