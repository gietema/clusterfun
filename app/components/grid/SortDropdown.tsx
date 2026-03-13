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
    <>
      <select
        className="grow text-xs"
        onChange={(e) => onSort(e.target.value, gridValues.asc)}
        value={gridValues.sortBy}
      >
        <option value="">Order by</option>
        {columns.slice(2).map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
      <button onClick={() => onSort(gridValues.sortBy, !gridValues.asc)}>
        <FontAwesomeIcon icon={gridValues.asc ? faSortAlphaAsc : faSortAlphaDesc} />
      </button>
    </>
  );
}
