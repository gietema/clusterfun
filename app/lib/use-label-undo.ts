import { useAtom, useAtomValue } from "jotai";
import toast from "react-hot-toast";
import { labelUndoStackAtom, mediaItemsAtom, uuidAtom } from "@/app/store/atoms";
import { saveLabel, deleteLabel } from "@/app/lib/api";
import type { LabelAction } from "@/app/types";

const MAX_UNDO_STACK = 50;

export function useLabelUndo() {
  const uuid = useAtomValue(uuidAtom);
  const [undoStack, setUndoStack] = useAtom(labelUndoStackAtom);
  const [, setMediaItems] = useAtom(mediaItemsAtom);

  const pushAction = (action: LabelAction) => {
    setUndoStack((prev) => [...prev.slice(-(MAX_UNDO_STACK - 1)), action]);
  };

  const undo = async () => {
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    // Apply inverse operation to local state
    setMediaItems((items) =>
      items.map((m) => {
        if (!action.mediaIds.includes(m.index)) return m;
        const labels = m.labels ? [...m.labels] : [];
        if (action.type === "add") {
          // Undo an add → remove the label
          return { ...m, labels: labels.filter((l) => l !== action.label) };
        } else {
          // Undo a remove → add the label back
          if (!labels.includes(action.label)) labels.push(action.label);
          return { ...m, labels };
        }
      }),
    );

    // Call inverse API
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

  return { pushAction, undo, canUndo: undoStack.length > 0 };
}
