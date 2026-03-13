import type { DropdownOption, Filter } from "@/app/types";
import ColumnDropdown from "./ColumnDropdown";
import FilterValueInput from "./FilterValueInput";

const OPERATOR_OPTIONS: DropdownOption[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "≠" },
  { value: ">=", label: "≥" },
  { value: "<=", label: "≤" },
  { value: "IN", label: "IN" },
  { value: "NOT IN", label: "NOT IN" },
];

interface FilterRowProps {
  filter: Filter;
  columns: DropdownOption[];
  onChange: (filter: Filter) => void;
  onRemove: () => void;
}

export default function FilterRow({ filter, columns, onChange, onRemove }: FilterRowProps) {
  return (
    <div className="mb-2 rounded border px-2 text-xs">
      <div className="w-full text-right">
        <button onClick={onRemove} className="text-red-500">&times;</button>
      </div>
      <div className="flex w-full">
        <div className="me-1 flex-grow">
          <ColumnDropdown
            options={columns}
            selected={filter.column}
            onChange={(col) => onChange({ ...filter, column: col })}
          />
        </div>
        <div className="flex-grow">
          <ColumnDropdown
            options={OPERATOR_OPTIONS}
            selected={filter.comparison}
            onChange={(op) => onChange({ ...filter, comparison: op })}
          />
        </div>
        <div className="ms-1 flex-grow">
          <FilterValueInput
            filter={filter}
            onValueChange={(values) => onChange({ ...filter, values })}
          />
        </div>
      </div>
    </div>
  );
}
