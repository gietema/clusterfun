interface BoundingBoxCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function BoundingBoxCheckbox({ checked, onChange }: BoundingBoxCheckboxProps) {
  return (
    <div className="flex border-b border-gray-300 py-1 lg:border-b-0 lg:border-r lg:ps-2 lg:py-0">
      <div className="flex grow items-center py-2 lg:py-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onChange(!checked)}
        />
        <label className="flex items-center ps-2 text-xs">Show bbox label</label>
      </div>
    </div>
  );
}
