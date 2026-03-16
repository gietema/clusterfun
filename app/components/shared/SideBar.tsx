"use client";
import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom, useAtom } from "jotai";
import {
  configAtom, mediaAtom, uuidAtom,
  showPageAtom,
  similarityResultsAtom,
} from "@/app/store/atoms";
import { fetchSimilar, updateMetadata } from "@/app/lib/api";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import { buildExtraImageUrls } from "@/app/lib/media-utils";
import PreviewMedia from "./PreviewMedia";
import InformationItem from "./InformationItem";
import QACard from "./QACard";

export default function SideBar() {
  const [media, setMedia] = useAtom(mediaAtom);
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const [loading, setLoading] = useState(false);
  const [previewOverride, setPreviewOverride] = useState<string | null>(null);
  const { replaceTop } = useBreadcrumbNav();

  const vqaColumnSet = useMemo(
    () => {
      const s = new Set(config?.vqa ? Object.values(config.vqa) : []);
      s.add("_extra_images");
      return s;
    },
    [config?.vqa],
  );

  if (!media || !config) return <div />;

  const info = media.information;
  if (!info) return <div />;

  const entries = Object.entries(info).filter(
    ([key]) => key !== config.bounding_box && !vqaColumnSet.has(key),
  );

  const extras = buildExtraImageUrls(uuid, media.index, info);

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

  const previewMedia = previewOverride
    ? { ...media, src: previewOverride }
    : media;

  return (
    <div className="w-full border-l border-gray-200 pl-3">
      <div className="flex w-full flex-col" style={{ maxHeight: "calc(100vh - 35px)" }}>
        <div style={{ maxHeight: "300px" }}>
          <PreviewMedia
            media={previewMedia}
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
          {config.vqa?.question && info[config.vqa.question] != null && (
            <div className="pt-2">
              <QACard
                question={String(info[config.vqa.question])}
                answer={config.vqa.answer ? info[config.vqa.answer] : undefined}
                choices={config.vqa.choices ? info[config.vqa.choices] : undefined}
                explanation={config.vqa.explanation ? info[config.vqa.explanation] : undefined}
                extraImages={extras}
                onImageClick={(url) => setPreviewOverride(
                  previewOverride === url ? null : url,
                )}
                activeImageUrl={previewOverride}
              />
            </div>
          )}
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
