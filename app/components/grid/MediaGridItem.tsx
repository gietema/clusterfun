import { PreviewMedia } from "@/app/plots/components/PreviewMedia";
import { Media } from "@/app/plots/models/Media";
import { faFileAudio } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { configAtom, uuidAtom } from "../Previewer";
import MediaLabels from "./MediaLabels";

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
  updateLabel: (media: Media, label: string) => void;
}): JSX.Element {
  let info: JSX.Element = <></>;
  const elementRef = useRef<HTMLDivElement>(null);
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);

  if (config === undefined || config.labels === undefined) {
    return <></>;
  }

  useEffect(() => {
    const currentElement = elementRef.current;
    if (currentElement) {
      currentElement.addEventListener("keydown", keyPressHandler);
    }

    return () => {
      if (currentElement) {
        currentElement.removeEventListener("keydown", keyPressHandler);
      }
    };
  }, [config, props.media.index]);

  useEffect(() => {
    // Attach the event listener
    const currentElement = elementRef.current;
    if (currentElement) {
      currentElement.addEventListener("keydown", keyPressHandler);
    }
    // Clean up
    return () => {
      if (currentElement) {
        currentElement.removeEventListener("keydown", keyPressHandler);
      }
    };
  }, []); // Empty dependency array means this runs once on mount

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

  function keyPressHandler(event: any) {
    if (config === undefined || config.labels === undefined) {
      return;
    }
    const key = event.key;
    if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(key)) {
      // only add the label if the number is equal or less than the number of labels
      if (Number(key) <= config.labels.length) {
        handleLabel(Number(key) - 1);
      }
    }
  }

  function handleLabel(labelIndex: number) {
    if (config === undefined || config.labels === undefined) {
      return;
    }
    const label = config.labels[labelIndex];
    props.updateLabel(props.media, label);
  }

  return (
    <div
      ref={elementRef} // Attach the ref to the div
      tabIndex={0} // Make it focusable
      key={`${props.media.index}-${props.media.src}`}
      onClick={() => props.handleClick(props.media.index)}
      onMouseEnter={() => {
        props.handleHover(props.media.index);
        // focus the div
        elementRef.current?.focus();
      }}
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
      <MediaLabels
        mediaLabels={props.media.labels ? props.media.labels : []}
        handleLabel={handleLabel}
      />
    </div>
  );
}
