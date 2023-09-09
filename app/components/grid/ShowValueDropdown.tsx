import { GridValues } from "../Grid";

interface ShowValueDropdownProps {
  columns: string[];
  gridValues: GridValues;
  setGridValues: Function;
}

export default function ShowValueDropdown({
  columns,
  gridValues,
  setGridValues,
}: ShowValueDropdownProps) {
  return (
    <select
      className={"w-full text-xs"}
      onChange={(e) =>
        setGridValues({
          ...gridValues,
          showColumnValue: e.target.value,
        })
      }
      value={gridValues.showColumnValue}
    >
      <option value="" defaultValue={""}>
        Show value
      </option>
      {columns.slice(2).map((infoColumn: string) => (
        <option key={infoColumn} value={infoColumn}>
          {infoColumn}
        </option>
      ))}
    </select>
  );
}
