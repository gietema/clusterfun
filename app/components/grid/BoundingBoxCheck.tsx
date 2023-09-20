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
    <div className="flex lg:ps-2 border-b py-1 lg:py-0 border-gray-300 lg:border-b-0 lg:border-r">
      <div className="grow flex py-2 lg:py-0">
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
        <label
          className="text-xs ps-2 flex items-center flex-row"
          htmlFor="flexCheckDefault"
        >
          Show bbox label
        </label>
      </div>
    </div>
  );
}
