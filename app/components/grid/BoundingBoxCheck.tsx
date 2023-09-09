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
    <div className="flex">
      <div className="grow">
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
        <label className="" htmlFor="flexCheckDefault">
          Show bbox label
        </label>
      </div>
    </div>
  );
}
