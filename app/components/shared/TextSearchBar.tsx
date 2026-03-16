"use client";
import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  configAtom,
  uuidAtom,
  showPageAtom,
  similarityResultsAtom,
} from "@/app/store/atoms";
import { fetchSimilarVector, fetchTextSearch, fetchTextSearchStatus } from "@/app/lib/api";
import { encodeText, supportsTextSearch, supportsBrowserTextSearch } from "@/app/lib/clip";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";

function ProgressCircle({ progress }: { progress: number }) {
  const size = 20;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#1f2937"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
  );
}

export default function TextSearchBar() {
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const { replaceTop } = useBreadcrumbNav();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverModelReady, setServerModelReady] = useState<boolean | null>(null);

  const isBrowser = supportsBrowserTextSearch(config?.embeddings_model);

  // Check server model readiness on mount (only for server-side models)
  useEffect(() => {
    if (!config?.embeddings_model || isBrowser) return;
    if (!supportsTextSearch(config.embeddings_model)) return;
    fetchTextSearchStatus(uuid)
      .then((s) => setServerModelReady(s.ready))
      .catch(() => {});
  }, [uuid, config?.embeddings_model, isBrowser]);

  if (!supportsTextSearch(config?.embeddings_model)) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setProgress(null);
    setStatusMessage(null);
    try {
      let results;
      if (isBrowser) {
        setStatusMessage("Loading model...");
        setProgress(0);
        const embedding = await encodeText(
          config!.embeddings_model!,
          query.trim(),
          (p) => setProgress(p),
        );
        setProgress(null);
        setStatusMessage("Searching...");
        results = await fetchSimilarVector(uuid, embedding);
      } else {
        // Server-side: model may need to load on first call
        if (!serverModelReady) {
          setStatusMessage("Loading model on server (first search may take a moment)...");
        } else {
          setStatusMessage("Searching...");
        }
        results = await fetchTextSearch(uuid, query.trim());
        // Model is now loaded on the server
        setServerModelReady(true);
      }
      setStatusMessage(null);
      const ids = results.map((r) => r.media_id);
      const scores: Record<number, number> = {};
      for (const r of results) {
        scores[r.media_id] = r.similarity;
      }
      setSimilarityResults(scores);
      replaceTop(ids, `Search: ${query.trim()}`);
      setShowPage("grid");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Search failed";
      setError(msg);
    } finally {
      setSearching(false);
      setProgress(null);
      setStatusMessage(null);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Search by text..."
          className="min-w-0 flex-grow rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="shrink-0 rounded-md bg-gray-800 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
        >
          {searching ? "..." : "Search"}
        </button>
      </form>
      {(progress !== null || statusMessage) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {progress !== null ? (
            <ProgressCircle progress={progress} />
          ) : (
            <Spinner />
          )}
          <span className="text-xs text-gray-500">
            {progress !== null
              ? `Downloading model ${Math.round(progress)}%`
              : statusMessage}
          </span>
        </div>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
