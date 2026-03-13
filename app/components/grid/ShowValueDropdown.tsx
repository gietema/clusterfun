interface ShowValueDropdownProps {
  columns: string[];
  value: string | undefined;
  onChange: (value: string) => void;
}

export default function ShowValueDropdown({ columns, value, onChange }: ShowValueDropdownProps) {
  return (
    <select
      className="w-full grow text-xs"
      onChange={(e) => onChange(e.target.value)}
      value={value ?? ""}
    >
      <option value="">Show value</option>
      {columns.slice(2).map((col) => (
        <option key={col} value={col}>{col}</option>
      ))}
    </select>
  );
}
