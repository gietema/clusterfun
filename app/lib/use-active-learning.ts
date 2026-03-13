"use client";
import { useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  activeLearningAtom,
  configAtom,
  currentMediaIndicesAtom,
  mediaIndicesStackAtom,
  gridValuesAtom,
  uuidAtom,
} from "@/app/store/atoms";
import { fitProbe } from "./api";

export function useActiveLearning() {
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const setMediaIndicesStack = useSetAtom(mediaIndicesStackAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const [alState, setAlState] = useAtom(activeLearningAtom);

  const isAvailable = !!config?.embeddings;
  const isActive = alState !== null;

  const refit = useCallback(async () => {
    if (!uuid || !config?.embeddings) return;
    try {
      const result = await fitProbe(uuid, mediaIndices);
      setAlState({
        predictions: result.predictions,
        labelClasses: result.label_classes,
        nLabeled: result.n_labeled,
      });

      // Reorder grid by uncertainty: most uncertain first
      const orderedIds = result.predictions.map((p) => p.media_id);
      // Include any IDs from current selection not in predictions (already labeled)
      const predictionIdSet = new Set(orderedIds);
      const remaining = mediaIndices.filter((id) => !predictionIdSet.has(id));
      // Labeled items go to the end (they don't need attention)
      const newOrder = [...orderedIds, ...remaining];

      setMediaIndicesStack((prev) => [...prev.slice(0, -1), newOrder]);
      setGridValues((prev) => ({ ...prev, page: 0, sortBy: "", asc: true }));
    } catch {
      // Silently handle errors (e.g. not enough labels yet)
    }
  }, [uuid, config?.embeddings, mediaIndices, setAlState, setMediaIndicesStack, setGridValues]);

  const start = useCallback(async () => {
    await refit();
  }, [refit]);

  const stop = useCallback(() => {
    setAlState(null);
  }, [setAlState]);

  return { isAvailable, isActive, alState, start, stop, refit };
}
