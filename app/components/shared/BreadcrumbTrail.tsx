"use client";
import { useAtomValue } from "jotai";
import {
  breadcrumbsAtom,
  mediaIndicesStackAtom,
  configAtom,
} from "@/app/store/atoms";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";

/**
 * Shows a compact context indicator when viewing a subset of data.
 * Displays the current context label (e.g. "label = tench") with a
 * count and a back button. Replaces the old breadcrumb trail.
 */
export default function BreadcrumbTrail() {
  const crumbs = useAtomValue(breadcrumbsAtom);
  const stack = useAtomValue(mediaIndicesStackAtom);
  const config = useAtomValue(configAtom);
  const { popSelection } = useBreadcrumbNav();

  // Only show when there's a context beyond "All"
  if (crumbs.length <= 1) return null;

  const current = crumbs[crumbs.length - 1];
  const stackLen = stack[stack.length - 1]?.length ?? 0;
  const count = current.filterCount ?? (stackLen > 0 ? stackLen : null);

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={popSelection}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        title="Back"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
        {current.label}
        {count != null && count > 0 && (
          <span className="ml-1 text-blue-500">({count.toLocaleString()})</span>
        )}
      </span>
    </div>
  );
}
