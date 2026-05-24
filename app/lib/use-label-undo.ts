import { useAtom, useAtomValue } from "jotai";
import toast from "react-hot-toast";
import React from "react";
import { labelUndoStackAtom, labelRedoStackAtom, mediaItemsAtom, uuidAtom } from "@/app/store/atoms";
import { saveLabel, deleteLabel } from "@/app/lib/api";
import type { LabelAction } from "@/app/types";

const MAX_STACK = 50;

const EXCLUDE_LABEL = "exclude";

function describeAction(action: LabelAction): string {
  const n = action.mediaIds.length;
  const items = `${n} item${n === 1 ? "" : "s"}`;
  if (action.label === EXCLUDE_LABEL) {
    return action.type === "add" ? `Excluded ${items}` : `Restored ${items}`;
  }
  return action.type === "add"
    ? `Added "${action.label}" to ${items}`
    : `Removed "${action.label}" from ${items}`;
}

export function useLabelUndo() {
  const uuid = useAtomValue(uuidAtom);
  const [undoStack, setUndoStack] = useAtom(labelUndoStackAtom);
  const [redoStack, setRedoStack] = useAtom(labelRedoStackAtom);
  const [, setMediaItems] = useAtom(mediaItemsAtom);

  const pushAction = (action: LabelAction) => {
    setUndoStack((prev) => [...prev.slice(-(MAX_STACK - 1)), action]);
    setRedoStack([]); // clear redo on new action

    // Apple-style toast with inline Undo
    toast.custom(
      (t) => React.createElement(
        "div",
        {
          className: `motion-popover pointer-events-auto flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-xl ${t.visible ? "" : "opacity-0"}`,
        },
        React.createElement("span", { className: "text-xs text-gray-700" }, describeAction(action)),
        React.createElement(
          "button",
          {
            onClick: () => { toast.dismiss(t.id); undo(); },
            className: "rounded px-2 py-0.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50",
          },
          "Undo",
        ),
        React.createElement("kbd", { className: "rounded border border-gray-200 bg-gray-50 px-1 text-[10px] text-gray-500" }, "⌘Z"),
      ),
      { duration: 4000, position: "bottom-center" },
    );
  };

  const applyInverse = (action: LabelAction) => {
    setMediaItems((items) =>
      items.map((m) => {
        if (!action.mediaIds.includes(m.index)) return m;
        const labels = m.labels ? [...m.labels] : [];
        if (action.type === "add") {
          return { ...m, labels: labels.filter((l) => l !== action.label) };
        } else {
          if (!labels.includes(action.label)) labels.push(action.label);
          return { ...m, labels };
        }
      }),
    );
  };

  const applyForward = (action: LabelAction) => {
    setMediaItems((items) =>
      items.map((m) => {
        if (!action.mediaIds.includes(m.index)) return m;
        const labels = m.labels ? [...m.labels] : [];
        if (action.type === "add") {
          if (!labels.includes(action.label)) labels.push(action.label);
          return { ...m, labels };
        } else {
          return { ...m, labels: labels.filter((l) => l !== action.label) };
        }
      }),
    );
  };

  const undo = async () => {
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-(MAX_STACK - 1)), action]);

    applyInverse(action);

    try {
      if (action.type === "add") {
        await deleteLabel(uuid, action.mediaIds, action.label);
      } else {
        await saveLabel(uuid, action.mediaIds, action.label);
      }
      toast(`Undid "${action.label}" on ${action.mediaIds.length} item${action.mediaIds.length === 1 ? "" : "s"}`, { duration: 2000 });
    } catch {
      toast.error("Undo failed — labels may be out of sync");
    }
  };

  const redo = async () => {
    if (redoStack.length === 0) return;

    const action = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-(MAX_STACK - 1)), action]);

    applyForward(action);

    try {
      if (action.type === "add") {
        await saveLabel(uuid, action.mediaIds, action.label);
      } else {
        await deleteLabel(uuid, action.mediaIds, action.label);
      }
      toast(`Redid "${action.label}" on ${action.mediaIds.length} item${action.mediaIds.length === 1 ? "" : "s"}`, { duration: 2000 });
    } catch {
      toast.error("Redo failed — labels may be out of sync");
    }
  };

  return { pushAction, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}
