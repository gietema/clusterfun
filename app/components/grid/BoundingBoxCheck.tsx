import { GridValues } from "../Grid";

interface BoundingBoxCheckboxProps {
  gridValues: GridValues;
  setGridValues: Function;
}

export default function BoundingBoxCheckbox({
  gridValues,
  setGridValues,
}: BoundingBoxCheckboxProps) {
  return (
    <div className="flex ps-2">
      <div className="grow flex py-2">
        <input
          className=""
          type="checkbox"
          value=""
          id="flexCheckDefault"
          checked={gridValues.showBboxLabel}
          onChange={() => {
            setGridValues({
              ...gridValues,
              showBboxLabel: !gridValues.showBboxLabel,
            });
          }}
        />
        <label className="text-xs ps-2" htmlFor="flexCheckDefault">
          Show bbox label
        </label>
      </div>
    </div>
  );
}
