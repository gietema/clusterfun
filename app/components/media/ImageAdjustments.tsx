"use client";

interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
  invert: boolean;
}

interface ImageAdjustmentsProps {
  values: Adjustments;
  onChange: (values: Adjustments) => void;
}

function Slider({ label, value, onChange, min = 0, max = 200 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs text-gray-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-24"
      />
      <span className="w-10 text-right text-xs text-gray-400">{value}%</span>
    </div>
  );
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: false,
  invert: false,
};

export function adjustmentsToFilter(a: Adjustments): string {
  const parts: string[] = [];
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness}%)`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast}%)`);
  if (a.saturation !== 100) parts.push(`saturate(${a.saturation}%)`);
  if (a.grayscale) parts.push("grayscale(100%)");
  if (a.invert) parts.push("invert(100%)");
  return parts.length > 0 ? parts.join(" ") : "none";
}

export default function ImageAdjustments({ values, onChange }: ImageAdjustmentsProps) {
  const isDefault =
    values.brightness === 100 &&
    values.contrast === 100 &&
    values.saturation === 100 &&
    !values.grayscale &&
    !values.invert;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-gray-200 bg-gray-50 px-3 py-1.5">
      <Slider
        label="Brightness"
        value={values.brightness}
        onChange={(v) => onChange({ ...values, brightness: v })}
      />
      <Slider
        label="Contrast"
        value={values.contrast}
        onChange={(v) => onChange({ ...values, contrast: v })}
      />
      <Slider
        label="Saturation"
        value={values.saturation}
        onChange={(v) => onChange({ ...values, saturation: v })}
      />
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
        <input
          type="checkbox"
          checked={values.grayscale}
          onChange={(e) => onChange({ ...values, grayscale: e.target.checked })}
          className="rounded"
        />
        Grayscale
      </label>
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
        <input
          type="checkbox"
          checked={values.invert}
          onChange={(e) => onChange({ ...values, invert: e.target.checked })}
          className="rounded"
        />
        Invert
      </label>
      {!isDefault && (
        <button
          onClick={() => onChange(DEFAULT_ADJUSTMENTS)}
          className="text-xs text-gray-400 transition-colors hover:text-gray-700"
        >
          Reset
        </button>
      )}
    </div>
  );
}
