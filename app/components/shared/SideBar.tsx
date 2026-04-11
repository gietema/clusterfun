"use client";
import { useState } from "react";
import { useAtomValue, useSetAtom, useAtom } from "jotai";
import {
  configAtom, mediaAtom, uuidAtom,
  showPageAtom,
  similarityResultsAtom,
} from "@/app/store/atoms";
import { fetchSimilar, updateMetadata } from "@/app/lib/api";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import PreviewMedia from "./PreviewMedia";
import InformationItem from "./InformationItem";

export default function SideBar() {
  const [media, setMedia] = useAtom(mediaAtom);
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const [loading, setLoading] = useState(false);
  const { replaceTop } = useBreadcrumbNav();

  if (!media || !config) return <div />;

  const info = media.information;
  if (!info) return <div />;

  const entries = Object.entries(info).filter(
    ([key]) => key !== config.bounding_box,
  );

  const handleFindSimilar = async () => {
    if (!media || !config?.embeddings) return;
    setLoading(true);
    try {
      const results = await fetchSimilar(uuid, media.index);
      const ids = results.map((r) => r.media_id);
      const scores: Record<number, number> = {};
      for (const r of results) {
        scores[r.media_id] = r.similarity;
      }
      setSimilarityResults(scores);
      replaceTop(ids, `Similar to #${media.index}`);
      setShowPage("grid");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full border-l border-gray-200 pl-3">
      <div className="flex w-full flex-col" style={{ maxHeight: "calc(100vh - 35px)" }}>
        <div style={{ maxHeight: "300px" }}>
          <PreviewMedia
            media={media}
            boundingBoxColumn={config.bounding_box}
            displayLabel
          />
        </div>
        {config.embeddings && (
          <button
            onClick={handleFindSimilar}
            disabled={loading}
            className="mt-2 w-full cursor-pointer rounded-md bg-gray-800 px-3 py-1.5 text-center text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Find similar"}
          </button>
        )}
        <div className="overflow-y-auto" style={{ flexGrow: 1 }}>
          {entries.map(([key, value]) => (
            <InformationItem
              key={key}
              label={key}
              value={value}
              onEdit={(column, newValue) => {
                if (!media) return;
                updateMetadata(uuid, [media.index], column, newValue).catch(console.error);
                setMedia({
                  ...media,
                  information: { ...media.information, [column]: newValue },
                });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
