interface BoundingBoxCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function BoundingBoxCheckbox({ checked, onChange }: BoundingBoxCheckboxProps) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
      <input
        type="checkbox"
        className="rounded"
        checked={checked}
        onChange={() => onChange(!checked)}
      />
      Show bbox label
    </label>
  );
}
