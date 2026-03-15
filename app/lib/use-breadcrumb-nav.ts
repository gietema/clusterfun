"use client";
import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  dataAtom,
  mediaIndicesStackAtom,
  breadcrumbsAtom,
  gridValuesAtom,
  showPageAtom,
  similarityResultsAtom,
  textSearchQueryAtom,
  labelFilterAtom,
} from "@/app/store/atoms";

/**
 * Centralised helpers for pushing / popping the media-indices stack
 * together with breadcrumb metadata so every call-site stays in sync.
 */
export function useBreadcrumbNav() {
  const data = useAtomValue(dataAtom);
  const setStack = useSetAtom(mediaIndicesStackAtom);
  const setCrumbs = useSetAtom(breadcrumbsAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const setTextSearchQuery = useSetAtom(textSearchQueryAtom);
  const setLabelFilter = useSetAtom(labelFilterAtom);

  /** Push a new selection level and navigate to grid. */
  const pushSelection = useCallback(
    (indices: number[], label: string) => {
      setStack((prev) => {
        if (prev.length === 0 && data) {
          const allIndices = data.flatMap((d) => d.id ?? []);
          // Also push the "All" base crumb
          setCrumbs((c) =>
            c.length === 0
              ? [
                  { label: "All", thumbnailId: allIndices[0] },
                  { label, thumbnailId: indices[0] },
                ]
              : [...c, { label, thumbnailId: indices[0] }],
          );
          return [allIndices, indices];
        }
        setCrumbs((c) => [...c, { label, thumbnailId: indices[0] }]);
        return [...prev, indices];
      });
      setGridValues((prev) => ({ ...prev, page: 0 }));
      setShowPage("grid");
    },
    [data, setStack, setCrumbs, setGridValues, setShowPage],
  );

  /** Replace the top of the stack (e.g. for text search or find-similar). */
  const replaceTop = useCallback(
    (indices: number[], label: string) => {
      setStack((prev) => {
        if (prev.length > 1) {
          setCrumbs((c) => [
            ...c.slice(0, -1),
            { label, thumbnailId: indices[0] },
          ]);
          return [...prev.slice(0, -1), indices];
        }
        // Only base level or empty — just push
        if (prev.length === 0 && data) {
          const allIndices = data.flatMap((d) => d.id ?? []);
          setCrumbs([
            { label: "All", thumbnailId: allIndices[0] },
            { label, thumbnailId: indices[0] },
          ]);
          return [allIndices, indices];
        }
        setCrumbs((c) => [...c, { label, thumbnailId: indices[0] }]);
        return [...prev, indices];
      });
      setGridValues((prev) => ({ ...prev, page: 0 }));
    },
    [data, setStack, setCrumbs, setGridValues],
  );

  /** Pop one level (go back). */
  const popSelection = useCallback(() => {
    setStack((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
    setCrumbs((c) => {
      if (c.length <= 1) return c;
      return c.slice(0, -1);
    });
    setGridValues((prev) => ({ ...prev, page: 0 }));
    setSimilarityResults({});
    setTextSearchQuery("");
    setLabelFilter(null);
  }, [setStack, setCrumbs, setGridValues, setSimilarityResults, setTextSearchQuery, setLabelFilter]);

  /** Jump to a specific level in the breadcrumb trail (0-indexed). */
  const jumpTo = useCallback(
    (level: number) => {
      setStack((prev) => {
        if (level >= prev.length - 1) return prev; // already there
        return prev.slice(0, level + 1);
      });
      setCrumbs((c) => {
        if (level >= c.length - 1) return c;
        return c.slice(0, level + 1);
      });
      setGridValues((prev) => ({ ...prev, page: 0 }));
      setSimilarityResults({});
      setTextSearchQuery("");
      setLabelFilter(null);
    },
    [setStack, setCrumbs, setGridValues, setSimilarityResults, setTextSearchQuery, setLabelFilter],
  );

  /** Set the stack to [base, selection] — used by label filters. */
  const setBaseAndSelection = useCallback(
    (base: number[], selection: number[], label: string) => {
      setStack([base, selection]);
      setCrumbs([
        { label: "All", thumbnailId: base[0] },
        { label, thumbnailId: selection[0] },
      ]);
      setGridValues((prev) => ({ ...prev, page: 0 }));
    },
    [setStack, setCrumbs, setGridValues],
  );

  /** Initialise the stack with the "All" base level if empty. */
  const initBase = useCallback(
    (indices: number[]) => {
      setStack((prev) => (prev.length > 0 ? prev : [indices]));
      setCrumbs((c) =>
        c.length > 0 ? c : [{ label: "All", thumbnailId: indices[0] }],
      );
    },
    [setStack, setCrumbs],
  );

  /** Clear everything (used when navigating to a new view). */
  const reset = useCallback(() => {
    setStack([]);
    setCrumbs([]);
  }, [setStack, setCrumbs]);

  return {
    pushSelection,
    replaceTop,
    popSelection,
    jumpTo,
    setBaseAndSelection,
    initBase,
    reset,
  };
}
