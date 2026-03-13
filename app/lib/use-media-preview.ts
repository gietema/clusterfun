import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { mediaAtom, mediaIndexAtom, showPageAtom, uuidAtom } from "@/app/store/atoms";
import { fetchMedia } from "@/app/lib/api";

export function useMediaPreview() {
  const uuid = useAtomValue(uuidAtom);
  const setMediaIndex = useSetAtom(mediaIndexAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const setShowPage = useSetAtom(showPageAtom);

  /** Fetch full media and navigate to the media page. */
  const openMedia = useCallback(
    async (index: number) => {
      setMediaIndex(index);
      const media = await fetchMedia(uuid, index, true);
      setSideMedia(media);
      setShowPage("media");
    },
    [uuid, setMediaIndex, setSideMedia, setShowPage],
  );

  /** Fetch thumbnail for sidebar preview (hover). */
  const previewMedia = useCallback(
    (index: number | undefined) => {
      setMediaIndex(index);
      if (index == null) return;
      fetchMedia(uuid, index, false).then(setSideMedia);
    },
    [uuid, setMediaIndex, setSideMedia],
  );

  /** Fetch full media without changing the page (next/prev navigation). */
  const navigateToMedia = useCallback(
    async (index: number) => {
      setMediaIndex(index);
      const media = await fetchMedia(uuid, index, true);
      setSideMedia(media);
    },
    [uuid, setMediaIndex, setSideMedia],
  );

  return { openMedia, previewMedia, navigateToMedia };
}
