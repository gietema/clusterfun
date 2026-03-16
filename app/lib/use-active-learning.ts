"use client";
import { useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { PredictionItem, ProbeSortBy } from "@/app/types";
import {
  activeLearningAtom,
  alMethodAtom,
  alClassFilterAtom,
  alSortByAtom,
  alFocusLabelsAtom,
  mlpLayersAtom,
  configAtom,
  currentMediaIndicesAtom,
  embeddingsCacheAtom,
  mediaIndicesStackAtom,
  gridValuesAtom,
  uuidAtom,
} from "@/app/store/atoms";
import { fetchEmbeddings, fetchAllLabels, fitProbe } from "./api";
import { getMethod } from "./active-learning";
import type { EmbeddingData } from "./active-learning";

/** Above this threshold, use server-side AL instead of downloading embeddings. */
const SERVER_THRESHOLD = 50_000;

/** Sort (and optionally filter) predictions for grid display. */
function sortPredictions(
  predictions: PredictionItem[],
  classFilter: string | null,
  sortBy: ProbeSortBy,
): PredictionItem[] {
  let items = classFilter
    ? predictions.filter((p) => p.predicted_class === classFilter)
    : [...predictions];

  if (classFilter) {
    items.sort((a, b) =>
      sortBy === "uncertainty"
        ? b.uncertainty - a.uncertainty
        : (b.probabilities[classFilter] ?? 0) - (a.probabilities[classFilter] ?? 0),
    );
  } else {
    items.sort((a, b) =>
      sortBy === "uncertainty"
        ? b.uncertainty - a.uncertainty
        : b.score - a.score,
    );
  }

  return items;
}

export function useActiveLearning() {
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const setMediaIndicesStack = useSetAtom(mediaIndicesStackAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const [alState, setAlState] = useAtom(activeLearningAtom);
  const [methodId, setMethodId] = useAtom(alMethodAtom);
  const [mlpLayers, setMlpLayers] = useAtom(mlpLayersAtom);
  const [embCache, setEmbCache] = useAtom(embeddingsCacheAtom);
  const [classFilter, setClassFilterAtom] = useAtom(alClassFilterAtom);
  const [sortBy, setSortByAtom] = useAtom(alSortByAtom);
  const [focusLabels, setFocusLabels] = useAtom(alFocusLabelsAtom);

  const isAvailable = !!config?.embeddings;
  const isActive = alState !== null;

  const applyOrder = useCallback(
    (predictions: PredictionItem[], filter: string | null, sort: ProbeSortBy) => {
      const sorted = sortPredictions(predictions, filter, sort);
      const orderedIds = sorted.map((p) => p.media_id);
      const idSet = new Set(orderedIds);

      // When mediaIndices is empty (grid view = "all items"), generate the
      // full ID range so predictions appear first, then everything else.
      const baseIds = mediaIndices.length > 0
        ? mediaIndices
        : Array.from({ length: config?.total_count ?? 0 }, (_, i) => i);

      const remaining = baseIds.filter((id) => !idSet.has(id));
      const newIds = [...orderedIds, ...remaining];

      setMediaIndicesStack((prev) => {
        if (prev.length === 0) return [newIds];
        return [...prev.slice(0, -1), newIds];
      });
      setGridValues((prev) => ({ ...prev, page: 0 }));
    },
    [mediaIndices, config?.total_count, setMediaIndicesStack, setGridValues],
  );

  const refitServerSide = useCallback(
    async () => {
      if (!uuid) return;
      // Send [] to score all items — avoids serializing millions of IDs.
      // The server streams through all embeddings; applyOrder intersects
      // the results with the current mediaIndices for display.
      const result = await fitProbe(
        uuid,
        [],
        sortBy,
        focusLabels ?? undefined,
        5000,
        methodId,
        mlpLayers,
      );

      const validFilter =
        classFilter && result.label_classes.includes(classFilter)
          ? classFilter
          : null;
      if (validFilter !== classFilter) setClassFilterAtom(validFilter);

      setAlState({
        predictions: result.predictions,
        labelClasses: result.label_classes,
        nLabeled: result.n_labeled,
      });

      applyOrder(result.predictions, validFilter, sortBy);
    },
    [uuid, mediaIndices, sortBy, focusLabels, methodId, mlpLayers, classFilter, setAlState, setClassFilterAtom, applyOrder],
  );

  const refitClientSide = useCallback(
    async () => {
      if (!uuid || !config?.embeddings) return;

      let embData: EmbeddingData;
      if (embCache) {
        embData = embCache;
      } else {
        const resp = await fetchEmbeddings(uuid);
        const flat = new Float32Array(resp.media_ids.length * resp.dimension);
        for (let i = 0; i < resp.embeddings.length; i++) {
          flat.set(resp.embeddings[i], i * resp.dimension);
        }
        const idToIndex = new Map<number, number>();
        for (let i = 0; i < resp.media_ids.length; i++) {
          idToIndex.set(resp.media_ids[i], i);
        }
        embData = {
          mediaIds: resp.media_ids,
          embeddings: flat,
          dimension: resp.dimension,
          idToIndex,
        };
        setEmbCache(embData);
      }

      const labelsRaw = await fetchAllLabels(uuid);
      const labelsMap = new Map<number, string>();
      const focusSet = focusLabels ? new Set(focusLabels) : null;
      for (const [idStr, labelList] of Object.entries(labelsRaw)) {
        if (labelList.length > 0) {
          const label = labelList[0];
          if (!focusSet || focusSet.has(label)) {
            labelsMap.set(parseInt(idStr), label);
          }
        }
      }

      if (labelsMap.size === 0) return;

      const method = getMethod(methodId);
      const nClasses = new Set(labelsMap.values()).size;
      const effectiveMethod =
        nClasses < method.minClasses ? getMethod("centroid") : method;

      const result = effectiveMethod.fit({
        embeddings: embData,
        labels: labelsMap,
        scopeIds: mediaIndices,
        sortBy,
        options: { mlpLayers },
      });

      const validFilter =
        classFilter && result.label_classes.includes(classFilter)
          ? classFilter
          : null;
      if (validFilter !== classFilter) setClassFilterAtom(validFilter);

      setAlState({
        predictions: result.predictions,
        labelClasses: result.label_classes,
        nLabeled: result.n_labeled,
      });

      applyOrder(result.predictions, validFilter, sortBy);
    },
    [
      uuid,
      config?.embeddings,
      mediaIndices,
      methodId,
      mlpLayers,
      embCache,
      sortBy,
      classFilter,
      focusLabels,
      setAlState,
      setEmbCache,
      setClassFilterAtom,
      applyOrder,
    ],
  );

  const refit = useCallback(
    async () => {
      if (!uuid || !config?.embeddings) return;
      try {
        // Use server-side for large datasets (avoids downloading all embeddings).
        // When mediaIndices is empty (grid view = "all items"), use total_count.
        const itemCount = mediaIndices.length > 0 ? mediaIndices.length : (config?.total_count ?? 0);
        const useServer = !embCache && itemCount > SERVER_THRESHOLD;
        if (useServer) {
          await refitServerSide();
        } else {
          await refitClientSide();
        }
      } catch (err) {
        console.error("Active learning refit failed:", err);
      }
    },
    [uuid, config?.embeddings, embCache, mediaIndices.length, refitServerSide, refitClientSide],
  );

  const setClassFilter = useCallback(
    (filter: string | null) => {
      setClassFilterAtom(filter);
      if (alState) {
        applyOrder(alState.predictions, filter, sortBy);
      }
    },
    [setClassFilterAtom, alState, sortBy, applyOrder],
  );

  const setSortBy = useCallback(
    (sort: ProbeSortBy) => {
      setSortByAtom(sort);
      if (alState) {
        applyOrder(alState.predictions, classFilter, sort);
      }
    },
    [setSortByAtom, alState, classFilter, applyOrder],
  );

  const stop = useCallback(() => {
    setAlState(null);
    setClassFilterAtom(null);
  }, [setAlState, setClassFilterAtom]);

  return {
    isAvailable,
    isActive,
    alState,
    stop,
    refit,
    methodId,
    setMethodId,
    mlpLayers,
    setMlpLayers,
    classFilter,
    setClassFilter,
    sortBy,
    setSortBy,
    focusLabels,
    setFocusLabels,
  };
}
