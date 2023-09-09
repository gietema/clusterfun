import { PreviewMedia } from "@/app/plots/components/PreviewMedia";
import { Media } from "@/app/plots/models/Media";

export default function MediaGridItem(props: {
  media: Media;
  handleClick: Function;
  handleHover: Function;
  infoColumns: string[];
  columns: number;
  showColumn?: string;
  boundingBoxColumn?: string;
  showBboxLabel: boolean;
}): JSX.Element {
  let info: JSX.Element = <></>;
  if (props.showColumn != null && props.media.information != null) {
    const columnIndex = props.infoColumns.slice(2).indexOf(props.showColumn);
    info = (
      <div className="truncate">
        <div>
          <small>{props.media.information[columnIndex]}</small>
        </div>
      </div>
    );
  }
  return (
    <div
      key={`${props.media.index}-${props.media.src}`}
      onClick={() => props.handleClick(props.media.index)}
      onMouseEnter={() => props.handleHover(props.media.index)}
    >
      <PreviewMedia
        media={props.media}
        boundingBoxColumnIndex={
          props.boundingBoxColumn != null
            ? props.infoColumns.indexOf(props.boundingBoxColumn)
            : undefined
        }
        displayLabel={props.showBboxLabel}
        columns={props.columns}
      />
      {info}
    </div>
  );
}
