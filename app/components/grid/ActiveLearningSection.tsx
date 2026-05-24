"use client";
import { useState } from "react";
import { useAtomValue } from "jotai";
import {
  faBolt, faStop, faArrowsRotate,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { configAtom } from "@/app/store/atoms";
import { useActiveLearning } from "@/app/lib/use-active-learning";
import { AL_METHODS } from "@/app/lib/active-learning";
import Section from "../shared/Section";

export default function ActiveLearningSection() {
  const config = useAtomValue(configAtom);
  const {
    isAvailable, isActive, alState, stop, refit,
    methodId, setMethodId, mlpLayers, setMlpLayers,
    classFilter, setClassFilter, sortBy, setSortBy,
    focusLabels, setFocusLabels,
  } = useActiveLearning();

  const [loading, setLoading] = useState(false);

  if (!isAvailable) return null;

  const handleFit = async () => {
    setLoading(true);
    await refit();
    setLoading(false);
  };

  return (
    <Section title="Active learning" defaultOpen>
      <div className="space-y-2">
        {/* Focus labels — which labels to train on */}
        {config && config.labels.length > 1 && (
          <div>
            <div className="mb-1 text-xs text-gray-500">Train on</div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFocusLabels(null)}
                className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                  focusLabels === null
                    ? "bg-gray-800 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              {config.labels.map((label) => {
                const isOn = focusLabels === null || focusLabels.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => {
                      if (focusLabels === null) {
                        // Switching from "all" → deselect this one
                        setFocusLabels(config.labels.filter((l) => l !== label));
                      } else if (isOn) {
                        const next = focusLabels.filter((l) => l !== label);
                        setFocusLabels(next.length === 0 ? null : next);
                      } else {
                        const next = [...focusLabels, label];
                        setFocusLabels(next.length === config.labels.length ? null : next);
                      }
                    }}
                    className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                      isOn
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-600"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Method selection */}
        <div>
          <div className="mb-1 text-xs text-gray-500">Method</div>
          <div className="flex items-center gap-1.5">
            <select
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              className="min-w-0 flex-grow rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
            >
              {AL_METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {methodId === "mlp" && (
              <div className="flex items-center gap-0.5 rounded-md border border-gray-200 p-0.5">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMlpLayers(n)}
                    className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                      mlpLayers === n
                        ? "bg-gray-800 text-white"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                    title={`${n} hidden layer${n > 1 ? "s" : ""}`}
                  >
                    {n}L
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {AL_METHODS.find((m) => m.id === methodId)?.description}
          </div>
        </div>

        {/* Action */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleFit}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            <FontAwesomeIcon icon={isActive ? faArrowsRotate : faBolt} className={loading ? "animate-spin" : ""} />
            {loading ? "Fitting..." : isActive ? "Refit" : "Suggest next"}
          </button>
          {isActive && (
            <button
              onClick={stop}
              className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100"
              title="Stop active learning"
            >
              <FontAwesomeIcon icon={faStop} />
            </button>
          )}
          {alState && (
            <span className="text-xs text-gray-500">
              {alState.nLabeled} labeled
            </span>
          )}
        </div>

        {/* Results (when active) */}
        {isActive && (
          <div className="space-y-2 border-t border-gray-100 pt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "confidence" | "uncertainty")}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
              >
                <option value="confidence">most similar first</option>
                <option value="uncertainty">most uncertain first</option>
              </select>
            </div>

            {/* Class filter pills */}
            {alState && alState.labelClasses.length > 1 && (
              <div>
                <div className="mb-1 text-xs text-gray-500">Filter by class</div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setClassFilter(null)}
                    className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                      classFilter === null
                        ? "bg-gray-800 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    All
                  </button>
                  {alState.labelClasses.map((cls) => {
                    const count = alState.predictions.filter((p) => p.predicted_class === cls).length;
                    return (
                      <button
                        key={cls}
                        onClick={() => setClassFilter(cls)}
                        className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                          classFilter === cls
                            ? "bg-gray-800 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {cls} <span className="opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
