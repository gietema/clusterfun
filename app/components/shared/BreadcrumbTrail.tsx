"use client";
import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import {
  breadcrumbsAtom,
  mediaIndicesStackAtom,
  uuidAtom,
  configAtom,
} from "@/app/store/atoms";
import { fetchMediaThumbnails } from "@/app/lib/api";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";

export default function BreadcrumbTrail() {
  const crumbs = useAtomValue(breadcrumbsAtom);
  const stack = useAtomValue(mediaIndicesStackAtom);
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const { jumpTo } = useBreadcrumbNav();
  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  // Fetch thumbnails for breadcrumb representative items
  useEffect(() => {
    const ids = crumbs
      .map((c) => c.thumbnailId)
      .filter((id): id is number => id != null)
      .filter((id) => !thumbs[id]);

    if (ids.length === 0 || !uuid || uuid === "recent") return;

    const unique = [...new Set(ids)];
    fetchMediaThumbnails(uuid, unique, 32).then((results) => {
      setThumbs((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.src;
        return next;
      });
    });
  }, [crumbs, uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (crumbs.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {crumbs.map((crumb, i) => {
        const stackLen = stack[i]?.length ?? 0;
        const count = crumb.filterCount ?? (stackLen > 0 ? stackLen : (i === 0 ? (config?.total_count ?? 0) : null));
        const isLast = i === crumbs.length - 1;
        const thumb = crumb.thumbnailId != null ? thumbs[crumb.thumbnailId] : null;

        return (
          <div key={i} className="flex shrink-0 items-center gap-0.5">
            {i > 0 && (
              <svg className="h-3 w-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 18l6-6-6-6" />
              </svg>
            )}
            <button
              onClick={() => { if (!isLast) jumpTo(i); }}
              className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
                isLast
                  ? "bg-blue-50 font-medium text-blue-700"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              }`}
            >
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  className="h-5 w-5 rounded-sm object-cover"
                />
              )}
              <span className="max-w-[120px] truncate">{crumb.label}</span>
              {count != null && count > 0 && (
                <span className={`tabular-nums ${isLast ? "text-blue-500" : "text-gray-400"}`}>
                  ({count.toLocaleString()})
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
