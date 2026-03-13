import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import {
  mediaAtom,
  mediaIndexAtom,
  showPageAtom,
  uuidAtom,
} from "@/app/store/atoms";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import { makeMedia } from "./helpers";

const mockFetchMedia = vi.fn();

vi.mock("@/app/lib/api", () => ({
  fetchMedia: (...args: any[]) => mockFetchMedia(...args),
}));

describe("useMediaPreview", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createStore();
    store.set(uuidAtom, "test-uuid");
  });

  function renderMediaPreviewHook() {
    return renderHook(() => useMediaPreview(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });
  }

  describe("previewMedia (hover)", () => {
    it("fetches media without base64", async () => {
      const media = makeMedia({ index: 5 });
      mockFetchMedia.mockResolvedValueOnce(media);
      const { result } = renderMediaPreviewHook();

      act(() => {
        result.current.previewMedia(5);
      });
      expect(mockFetchMedia).toHaveBeenCalledWith("test-uuid", 5, false);
      await waitFor(() => {
        expect(store.get(mediaAtom)?.index).toBe(5);
      });
    });

    it("sets mediaIndex", () => {
      mockFetchMedia.mockResolvedValueOnce(makeMedia({ index: 3 }));
      const { result } = renderMediaPreviewHook();
      act(() => {
        result.current.previewMedia(3);
      });
      expect(store.get(mediaIndexAtom)).toBe(3);
    });

    it("handles undefined index (mouse leave)", () => {
      const { result } = renderMediaPreviewHook();
      act(() => {
        result.current.previewMedia(undefined);
      });
      expect(mockFetchMedia).not.toHaveBeenCalled();
      expect(store.get(mediaIndexAtom)).toBeUndefined();
    });
  });

  describe("openMedia (click)", () => {
    it("fetches media with base64 and navigates to media page", async () => {
      const media = makeMedia({ index: 7 });
      mockFetchMedia.mockResolvedValueOnce(media);
      const { result } = renderMediaPreviewHook();

      await act(async () => {
        await result.current.openMedia(7);
      });
      expect(mockFetchMedia).toHaveBeenCalledWith("test-uuid", 7, true);
      expect(store.get(showPageAtom)).toBe("media");
      expect(store.get(mediaIndexAtom)).toBe(7);
      expect(store.get(mediaAtom)?.index).toBe(7);
    });

    it("skips fetch when same item was already fetched with base64", async () => {
      const media = makeMedia({ index: 3 });
      mockFetchMedia.mockResolvedValue(media);
      const { result } = renderMediaPreviewHook();

      // First openMedia fetches
      await act(async () => {
        await result.current.openMedia(3);
      });
      expect(mockFetchMedia).toHaveBeenCalledTimes(1);

      // Second openMedia for same index skips fetch
      await act(async () => {
        await result.current.openMedia(3);
      });
      expect(mockFetchMedia).toHaveBeenCalledTimes(1); // No additional call
      expect(store.get(showPageAtom)).toBe("media");
    });

    it("re-fetches when hover was for same index (no base64)", async () => {
      const media = makeMedia({ index: 5 });
      mockFetchMedia.mockResolvedValue(media);
      const { result } = renderMediaPreviewHook();

      // First: hover (no base64)
      act(() => {
        result.current.previewMedia(5);
      });
      await waitFor(() => {
        expect(mockFetchMedia).toHaveBeenCalledTimes(1);
      });

      // Then: click (needs base64) - should re-fetch
      await act(async () => {
        await result.current.openMedia(5);
      });
      expect(mockFetchMedia).toHaveBeenCalledTimes(2);
      expect(mockFetchMedia).toHaveBeenLastCalledWith("test-uuid", 5, true);
    });
  });

  describe("navigateToMedia (arrow keys)", () => {
    it("fetches media with base64 without changing page", async () => {
      const media = makeMedia({ index: 10 });
      mockFetchMedia.mockResolvedValueOnce(media);
      store.set(showPageAtom, "media"); // Already on media page
      const { result } = renderMediaPreviewHook();

      await act(async () => {
        await result.current.navigateToMedia(10);
      });
      expect(mockFetchMedia).toHaveBeenCalledWith("test-uuid", 10, true);
      expect(store.get(mediaAtom)?.index).toBe(10);
      expect(store.get(mediaIndexAtom)).toBe(10);
      // Page should remain "media" (not changed)
      expect(store.get(showPageAtom)).toBe("media");
    });
  });
});
