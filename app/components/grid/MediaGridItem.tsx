import { PreviewMedia } from "@/app/plots/components/PreviewMedia";
import { Media } from "@/app/plots/models/Media";
import { faFileAudio } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function MediaGridItem(props: {
  media: Media;
  handleClick: Function;
  handleHover: Function;
  infoColumns: string[];
  columns: number;
  showColumn?: string;
  boundingBoxColumn?: string;
  showBboxLabel: boolean;
  display?: string[];
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
      {props.media.type !== "audio" ? (
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
      ) : (
        <div>
          {props.display === null && (
            <div className="text-gray-300 hover:text-gray-500">
              <FontAwesomeIcon icon={faFileAudio} size="5x" />
            </div>
          )}
          {(props.display || []).map((display) => {
            return (
              <div key={display}>
                {props.infoColumns.indexOf(display) === -1 ? (
                  <div>{display}</div>
                ) : (
                  <div>
                    <div className="text-xs border-b border-gray-300 text-gray-500">
                      {display}
                    </div>
                    <div>
                      <small>
                        {
                          // @ts-ignore
                          props.media.information[
                            props.infoColumns.indexOf(display) - 2
                          ]
                        }
                      </small>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {info}
    </div>
  );
}
