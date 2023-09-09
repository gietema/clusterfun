import { faCheck, faClipboard } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "highlight.js/styles/atom-one-dark.css";
import React, { useState } from "react";
import Highlight from "react-highlight";

export default function CodeBlock({
  children,
  header,
}: {
  children: React.ReactNode;
  header?: boolean;
}): JSX.Element {
  if (header === undefined) {
    header = true;
  }
  const [copied, setCopied] = useState(false);

  const copyCode = (): void => {
    if (children === undefined || children === null) return;
    if (typeof children === "string") {
      void navigator.clipboard.writeText(children);
    } else if (typeof children === "object" && "props" in children) {
      void navigator.clipboard.writeText(children.props.children);
    } else {
      console.log("Could not copy code");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className="py-2">
      <div className="">
        {header && (
          <div className="rounded-t-md bg-black p-1 text-end">
            <button
              onClick={copyCode}
              className="button rounded bg-gray-500 p-2 text-xs text-white"
            >
              {copied ? (
                <FontAwesomeIcon icon={faCheck} className="px-2" />
              ) : (
                <FontAwesomeIcon icon={faClipboard} className="px-2" />
              )}
              {copied ? "Code copied!" : "Copy code"}
            </button>
          </div>
        )}
        <div
          className={`rounded-b-md p-1 ${!header && "rounded-md"}`}
          style={{ background: "#282c34" }}
        >
          <Highlight className={"python"}>{children}</Highlight>
        </div>
      </div>
    </div>
  );
}
