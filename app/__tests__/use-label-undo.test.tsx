import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import {
  labelUndoStackAtom,
  mediaItemsAtom,
  uuidAtom,
} from "@/app/store/atoms";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import { makeMediaList } from "./helpers";

const mockSaveLabel = vi.fn();
const mockDeleteLabel = vi.fn();

vi.mock("@/app/lib/api", () => ({
  saveLabel: (...args: any[]) => mockSaveLabel(...args),
  deleteLabel: (...args: any[]) => mockDeleteLabel(...args),
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    error: vi.fn(),
  }),
}));

describe("useLabelUndo", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveLabel.mockResolvedValue(undefined);
    mockDeleteLabel.mockResolvedValue(undefined);
    store = createStore();
    store.set(uuidAtom, "test-uuid");
    store.set(mediaItemsAtom, makeMediaList(3));
  });

  function renderUndoHook() {
    return renderHook(() => useLabelUndo(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });
  }

  it("starts with canUndo = false", () => {
    const { result } = renderUndoHook();
    expect(result.current.canUndo).toBe(false);
  });

  it("pushAction makes canUndo = true", () => {
    const { result } = renderUndoHook();
    act(() => {
      result.current.pushAction({ type: "add", label: "good", mediaIds: [0] });
    });
    expect(result.current.canUndo).toBe(true);
    expect(store.get(labelUndoStackAtom)).toHaveLength(1);
  });

  it("undo reverses an add action (removes label locally)", async () => {
    // Set up: items with label "good" on index 0
    const items = makeMediaList(3);
    items[0] = { ...items[0], labels: ["good"] };
    store.set(mediaItemsAtom, items);
    store.set(labelUndoStackAtom, [
      { type: "add" as const, label: "good", mediaIds: [0] },
    ]);

    const { result } = renderUndoHook();
    await act(async () => {
      await result.current.undo();
    });

    // Label should be removed from local state
    const updatedItems = store.get(mediaItemsAtom);
    expect(updatedItems[0].labels).not.toContain("good");

    // deleteLabel API should be called (inverse of add)
    expect(mockDeleteLabel).toHaveBeenCalledWith("test-uuid", [0], "good");
    expect(store.get(labelUndoStackAtom)).toHaveLength(0);
  });

  it("undo reverses a remove action (adds label back)", async () => {
    // Set up: items WITHOUT label (it was removed)
    store.set(labelUndoStackAtom, [
      { type: "remove" as const, label: "bad", mediaIds: [1] },
    ]);

    const { result } = renderUndoHook();
    await act(async () => {
      await result.current.undo();
    });

    // Label should be added back to local state
    const updatedItems = store.get(mediaItemsAtom);
    expect(updatedItems[1].labels).toContain("bad");

    // saveLabel API should be called (inverse of remove)
    expect(mockSaveLabel).toHaveBeenCalledWith("test-uuid", [1], "bad");
  });

  it("undo does nothing when stack is empty", async () => {
    const { result } = renderUndoHook();
    await act(async () => {
      await result.current.undo();
    });
    expect(mockSaveLabel).not.toHaveBeenCalled();
    expect(mockDeleteLabel).not.toHaveBeenCalled();
  });

  it("multiple undo operations work in LIFO order", async () => {
    store.set(labelUndoStackAtom, [
      { type: "add" as const, label: "first", mediaIds: [0] },
      { type: "add" as const, label: "second", mediaIds: [1] },
    ]);

    const { result } = renderUndoHook();
    // First undo should undo "second"
    await act(async () => {
      await result.current.undo();
    });
    expect(mockDeleteLabel).toHaveBeenCalledWith("test-uuid", [1], "second");

    // Second undo should undo "first"
    await act(async () => {
      await result.current.undo();
    });
    expect(mockDeleteLabel).toHaveBeenCalledWith("test-uuid", [0], "first");
    expect(result.current.canUndo).toBe(false);
  });

  it("stack is limited to 50 actions", () => {
    const { result } = renderUndoHook();
    for (let i = 0; i < 60; i++) {
      act(() => {
        result.current.pushAction({ type: "add", label: `label-${i}`, mediaIds: [i] });
      });
    }
    expect(store.get(labelUndoStackAtom)).toHaveLength(50);
    // The oldest actions should be dropped
    expect(store.get(labelUndoStackAtom)[0].label).toBe("label-10");
  });
});
