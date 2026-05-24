"use client";
import React from "react";

interface EmptyStateProps {
  illustration: "preview" | "label" | "empty-result";
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

const ILLUSTRATIONS: Record<EmptyStateProps["illustration"], React.ReactNode> = {
  preview: (
    <svg className="h-12 w-12 text-gray-300" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="8" y="10" width="48" height="36" rx="3" />
      <circle cx="22" cy="24" r="4" />
      <path d="M8 38l14-14 18 18 6-6 10 10" />
      <path d="M32 56h0" strokeLinecap="round" strokeDasharray="2 4" />
      <path d="M32 50v2" strokeLinecap="round" />
    </svg>
  ),
  label: (
    <svg className="h-12 w-12 text-gray-300" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14h28l12 12-22 22-20-20V14z" />
      <circle cx="20" cy="24" r="3" />
      <path d="M52 8l4 4M48 12l8 8" />
    </svg>
  ),
  "empty-result": (
    <svg className="h-12 w-12 text-gray-300" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="28" cy="28" r="18" />
      <path d="m41 41 14 14" strokeLinecap="round" />
      <path d="M22 28h12" strokeLinecap="round" />
    </svg>
  ),
};

export default function EmptyState({ illustration, title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-6 text-center ${className ?? ""}`}>
      {ILLUSTRATIONS[illustration]}
      <p className="mt-3 text-xs font-medium text-gray-700">{title}</p>
      {hint && <p className="mt-1 max-w-[220px] text-[11px] leading-snug text-gray-500">{hint}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 rounded-md bg-teal-700 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-teal-800"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
