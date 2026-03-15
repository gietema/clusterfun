"use client";
import { useState } from "react";
import { useAtomValue } from "jotai";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation, faCopy, faMagicWandSparkles } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import {
  configAtom, uuidAtom, currentMediaIndicesAtom,
  embeddingsCacheAtom,
} from "@/app/store/atoms";
import { fetchEmbeddings, fetchOutliers, fetchDuplicates, fetchCentroidDistance } from "@/app/lib/api";
import type { EmbeddingsResponse, InsightsTaskResponse } from "@/app/lib/api";
import {
  computeOutlierScores, findDuplicates, computeDistanceFromCentroid,
} from "@/app/lib/outlier-detection";
import type { EmbeddingData } from "@/app/lib/active-learning/types";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";

type InsightMode = "outliers" | "duplicates" | "weirdest" | null;

export default function InsightsPanel() {
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const embeddingsCache = useAtomValue(embeddingsCacheAtom);
  const { replaceTop } = useBreadcrumbNav();

  const [loading, setLoading] = useState<InsightMode>(null);
  const [outlierResults, setOutlierResults] = useState<{ ids: number[]; count: number } | null>(null);
  const [duplicateResults, setDuplicateResults] = useState<{ groups: number[][]; count: number } | null>(null);

  if (!config?.embeddings) return null;

  const USE_BROWSER = mediaIndices.length <= 5000 && embeddingsCache != null;

  const ensureEmbeddings = async (): Promise<EmbeddingData | null> => {
    if (embeddingsCache) return embeddingsCache;
    try {
      const resp: EmbeddingsResponse = await fetchEmbeddings(uuid, mediaIndices.slice(0, 5000));
      const flat = new Float32Array(resp.embeddings.flat());
      const idToIndex = new Map(resp.media_ids.map((id, idx) => [id, idx]));
      return {
        mediaIds: resp.media_ids,
        embeddings: flat,
        dimension: resp.dimension,
        idToIndex,
      };
    } catch {
      return null;
    }
  };

  const isTaskResponse = (data: any): data is InsightsTaskResponse =>
    data && typeof data === "object" && "task_id" in data;

  const handleOutliers = async () => {
    setLoading("outliers");
    try {
      let ids: number[];
      if (USE_BROWSER) {
        const emb = await ensureEmbeddings();
        if (!emb) {
          toast.error("Could not load embeddings");
          return;
        }
        const results = computeOutlierScores(emb, mediaIndices.slice(0, 5000), 15);
        ids = results.map((r) => r.mediaId);
      } else {
        const response = await fetchOutliers(uuid, mediaIndices, 20, 200);
        if (isTaskResponse(response)) {
          toast("Analysis running in background — check the Insights tab");
          return;
        }
        ids = (response as import("@/app/types").OutlierResult[]).map((r) => r.media_id);
      }
      setOutlierResults({ ids, count: ids.length });
    } catch (e) {
      console.error("Outlier detection failed:", e);
      toast.error("Outlier detection failed");
    } finally {
      setLoading(null);
    }
  };

  const handleDuplicates = async () => {
    setLoading("duplicates");
    try {
      let groups: number[][];
      if (USE_BROWSER) {
        const emb = await ensureEmbeddings();
        if (!emb) {
          toast.error("Could not load embeddings");
          return;
        }
        const results = findDuplicates(emb, mediaIndices.slice(0, 5000), 0.95);
        groups = results.map((g) => g.mediaIds);
      } else {
        const response = await fetchDuplicates(uuid, mediaIndices, 0.95, 100);
        if (isTaskResponse(response)) {
          toast("Analysis running in background — check the Insights tab");
          return;
        }
        groups = (response as import("@/app/types").DuplicateGroup[]).map((g) => g.media_ids);
      }
      setDuplicateResults({ groups, count: groups.length });
    } catch (e) {
      console.error("Duplicate detection failed:", e);
      toast.error("Duplicate detection failed");
    } finally {
      setLoading(null);
    }
  };

  const handleWeirdest = async () => {
    setLoading("weirdest");
    try {
      let ids: number[];
      if (USE_BROWSER) {
        const emb = await ensureEmbeddings();
        if (!emb) {
          toast.error("Could not load embeddings");
          return;
        }
        const results = computeDistanceFromCentroid(emb, mediaIndices.slice(0, 5000));
        ids = results.map((r) => r.mediaId);
      } else {
        const response = await fetchCentroidDistance(uuid, mediaIndices, 200);
        if (isTaskResponse(response)) {
          toast("Analysis running in background — check the Insights tab");
          return;
        }
        ids = (response as import("@/app/lib/api").CentroidDistanceResult[]).map((r) => r.media_id);
      }
      replaceTop(ids, "Weirdest");
    } catch (e) {
      console.error("Weirdest detection failed:", e);
      toast.error("Weirdness detection failed");
    } finally {
      setLoading(null);
    }
  };

  const viewOutliers = () => {
    if (!outlierResults) return;
    replaceTop(outlierResults.ids, "Outliers");
  };

  const viewDuplicateGroup = (group: number[], i: number) => {
    replaceTop(group, `Dup group ${i + 1}`);
  };

  const viewAllDuplicates = () => {
    if (!duplicateResults) return;
    const allIds = duplicateResults.groups.flat();
    replaceTop(allIds, "Duplicates");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={handleOutliers}
          disabled={loading !== null}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faTriangleExclamation} className={loading === "outliers" ? "animate-pulse" : ""} />
          {loading === "outliers" ? "Finding..." : "Find outliers"}
        </button>
        <button
          onClick={handleDuplicates}
          disabled={loading !== null}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faCopy} className={loading === "duplicates" ? "animate-pulse" : ""} />
          {loading === "duplicates" ? "Finding..." : "Find duplicates"}
        </button>
        <button
          onClick={handleWeirdest}
          disabled={loading !== null}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faMagicWandSparkles} className={loading === "weirdest" ? "animate-pulse" : ""} />
          {loading === "weirdest" ? "Finding..." : "Show weirdest"}
        </button>
      </div>

      {outlierResults && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
          <div className="mb-1 font-medium text-amber-800">
            {outlierResults.count} potential outliers
          </div>
          <button
            onClick={viewOutliers}
            className="rounded bg-amber-200 px-2 py-0.5 text-amber-900 transition-colors hover:bg-amber-300"
          >
            View in grid
          </button>
        </div>
      )}

      {duplicateResults && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs">
          <div className="mb-1 font-medium text-blue-800">
            {duplicateResults.count} duplicate group{duplicateResults.count !== 1 ? "s" : ""} found
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={viewAllDuplicates}
              className="rounded bg-blue-200 px-2 py-0.5 text-blue-900 transition-colors hover:bg-blue-300"
            >
              View all
            </button>
            {duplicateResults.groups.slice(0, 5).map((group, i) => (
              <button
                key={i}
                onClick={() => viewDuplicateGroup(group, i)}
                className="rounded bg-blue-100 px-2 py-0.5 text-blue-800 transition-colors hover:bg-blue-200"
              >
                Group {i + 1} ({group.length})
              </button>
            ))}
            {duplicateResults.groups.length > 5 && (
              <span className="px-1 py-0.5 text-blue-600">
                +{duplicateResults.groups.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
