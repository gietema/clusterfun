export function InformationItem(
  index: number,
  columns: string[],
  item: any,
): JSX.Element {
  return (
    <div key={index}>
      <div className={"border-b border-gray-300 text-gray-800"}>
        <small>{columns[index]}</small>
      </div>
      <div>
        <small className="text-gray-800">{item}</small>
      </div>
    </div>
  );
}
