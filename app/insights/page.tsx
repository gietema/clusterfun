"use client";
import { Provider } from "jotai";
import { Toaster } from "react-hot-toast";
import { useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";
import { configAtom, dataAtom, uuidAtom } from "@/app/store/atoms";
import { fetchPlotData, fetchUuid } from "@/app/lib/api";
import InsightsPage from "@/app/components/insights/InsightsPage";

function InsightsRoute() {
  const [uuid, setUuid] = useAtom(uuidAtom);
  const setConfig = useSetAtom(configAtom);
  const setData = useSetAtom(dataAtom);

  // Read uuid from query (?uuid=...) on mount; fall back to /api/uuid
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("uuid");
    if (fromQuery) {
      setUuid(fromQuery);
    } else {
      fetchUuid().then(setUuid).catch(() => {});
    }
  }, [setUuid]);

  // Load config/data for the chosen view
  useEffect(() => {
    if (!uuid || uuid === "recent") return;
    fetchPlotData(uuid).then(({ config, data }) => {
      setConfig(config);
      setData(data);
    }).catch(() => {});
  }, [uuid, setConfig, setData]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Mini header — sticks to Apple-style chrome */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3">
        <a
          href="/"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-gray-700 transition-colors hover:bg-gray-100"
          title="Back to grid"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </a>
        <div className="h-5 w-px bg-gray-200" />
        <h1 className="text-[13px] font-semibold tracking-tight text-gray-900">Insights</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <InsightsPage />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Provider>
      <Toaster />
      <InsightsRoute />
    </Provider>
  );
}
