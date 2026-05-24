import { faSortAlphaAsc, faSortAlphaDesc } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { GridValues } from "@/app/types";

interface SortDropdownProps {
  columns: string[];
  gridValues: GridValues;
  onSort: (column: string, ascending: boolean) => void;
}

export default function SortDropdown({ columns, gridValues, onSort }: SortDropdownProps) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
        onChange={(e) => onSort(e.target.value, gridValues.asc)}
        value={gridValues.sortBy}
      >
        <option value="">Order by</option>
        {columns.slice(2).map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
      <button
        className="text-gray-500 transition-colors hover:text-gray-900"
        onClick={() => onSort(gridValues.sortBy, !gridValues.asc)}
      >
        <FontAwesomeIcon icon={gridValues.asc ? faSortAlphaAsc : faSortAlphaDesc} />
      </button>
    </div>
  );
}
