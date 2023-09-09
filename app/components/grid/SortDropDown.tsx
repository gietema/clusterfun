import {
  faSortAlphaAsc,
  faSortAlphaDesc,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { GridValues } from "../Grid";

interface SortDropDownProps {
  columns: string[];
  gridValues: GridValues;
  handleSort: Function;
}

export default function SortDropdown({
  columns,
  gridValues,
  handleSort,
}: SortDropDownProps) {
  return (
    <div className="flex text-xs">
      <select
        name=""
        className={"grow"}
        onChange={(e) => handleSort(e.target.value, gridValues.asc)}
        value={gridValues.sortBy}
      >
        <option value="" defaultValue={""}>
          Order by
        </option>
        {columns.slice(2).map((column: string) => {
          return (
            <option value={column} key={column}>
              {column}
            </option>
          );
        })}
      </select>
      <button
        className=""
        type="button"
        onClick={() => {
          handleSort(gridValues.sortBy, !gridValues.asc);
        }}
      >
        <FontAwesomeIcon
          icon={gridValues.asc ? faSortAlphaAsc : faSortAlphaDesc}
        />
      </button>
    </div>
  );
}
