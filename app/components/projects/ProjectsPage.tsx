"use client";
import { useEffect, useRef, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  selectedProjectAtom, uuidAtom, showPageAtom,
  mediaIndicesStackAtom, gridValuesAtom, mediaItemsAtom,
  filtersAtom, labelFilterAtom, similarityResultsAtom,
} from "@/app/store/atoms";
import { fetchProjects, fetchProject, deleteProjectView, renameProjectView } from "@/app/lib/api";
import type { ProjectSummary, ProjectDetail, ProjectView } from "@/app/types";

const PLOT_TYPE_COLORS: Record<string, string> = {
  scatter: "#3B82F6",
  grid: "#10B981",
  histogram: "#F59E0B",
  violin: "#8B5CF6",
  bar_chart: "#EC4899",
  pie_chart: "#F97316",
  confusion_matrix: "#06B6D4",
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function ProjectList({ onSelect }: { onSelect: (name: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Loading projects...
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="mb-3 text-3xl text-gray-300">
          <svg className="mx-auto h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-gray-700">No projects yet</h2>
        <p className="text-sm text-gray-500">
          Create a project by passing <code className="rounded bg-gray-100 px-1 text-xs">project=&quot;name&quot;</code> to
          any plot function.
        </p>
        <pre className="mt-4 rounded-lg bg-gray-900 px-4 py-3 text-left text-xs text-gray-300">
          <code>{`import clusterfun as cfu\n\ncfu.scatter(df, x="x", y="y",\n           media="img",\n           project="my-dataset")`}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Projects</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <button
            key={p.name}
            onClick={() => onSelect(p.name)}
            className="group rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-gray-300 hover:shadow-sm"
          >
            <div className="mb-2 text-sm font-semibold text-gray-900 group-hover:text-blue-600">
              {p.name}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
              <span>{p.view_count} view{p.view_count !== 1 ? "s" : ""}</span>
              <span>{p.label_count} labeled</span>
            </div>
            <div className="mt-2 text-[10px] text-gray-400">
              {formatDate(p.created_at)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ViewRow({
  view,
  fallbackName,
  projectName,
  onNavigate,
  onRemoved,
}: {
  view: ProjectView;
  fallbackName: string;
  projectName: string;
  onNavigate: (uuid: string, type: string) => void;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(view.title ?? "");
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = PLOT_TYPE_COLORS[view.type] ?? "#6B7280";
  const displayTitle = view.title ?? fallbackName;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleRename = async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== (view.title ?? "")) {
      await renameProjectView(projectName, view.uuid, trimmed);
      view.title = trimmed;
    }
    setEditing(false);
  };

  const handleDelete = async () => {
    await deleteProjectView(projectName, view.uuid);
    onRemoved();
  };

  return (
    <div className="group flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all hover:border-gray-300 hover:shadow-sm">
      <span
        className="inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[10px] font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {view.type.replace("_", " ")}
      </span>

      {editing ? (
        <form
          className="flex min-w-0 flex-grow items-center gap-1.5"
          onSubmit={(e) => { e.preventDefault(); handleRename(); }}
        >
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
            className="min-w-0 flex-grow rounded border border-gray-300 px-2 py-0.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          />
          <button type="submit" className="text-xs text-gray-600 hover:text-gray-900">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-700">Cancel</button>
        </form>
      ) : (
        <button
          className="min-w-0 flex-grow text-left"
          onClick={() => onNavigate(view.uuid, view.type)}
        >
          <div className="truncate text-sm text-gray-900 group-hover:text-blue-600">
            {displayTitle}
          </div>
          <div className="text-[10px] text-gray-400">
            {formatDate(view.created_at)} {formatTime(view.created_at)}
          </div>
        </button>
      )}

      {!editing && !confirming && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); setEditTitle(view.title ?? ""); setEditing(true); }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title="Rename"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Remove from project"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}

      {confirming && (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] text-red-600">Remove?</span>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-700"
          >
            Yes
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
            className="text-[11px] text-gray-400 hover:text-gray-700"
          >
            No
          </button>
        </div>
      )}

      {!editing && !confirming && (
        <span className="shrink-0 text-[10px] text-gray-300">{view.uuid.slice(0, 8)}</span>
      )}
    </div>
  );
}

function ProjectDetailView({ name, onBack }: { name: string; onBack: () => void }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const setUuid = useSetAtom(uuidAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setMediaIndicesStack = useSetAtom(mediaIndicesStackAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const setMediaItems = useSetAtom(mediaItemsAtom);
  const setFilters = useSetAtom(filtersAtom);
  const setLabelFilter = useSetAtom(labelFilterAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);

  const reload = () => {
    setLoading(true);
    fetchProject(name)
      .then(setProject)
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewClick = (uuid: string, type: string) => {
    setMediaIndicesStack([]);
    setGridValues({ sortBy: "", asc: true, page: 0, numberOfColumns: 5, showColumnValues: [], showBboxLabel: false });
    setMediaItems([]);
    setFilters([]);
    setLabelFilter(null);
    setSimilarityResults({});
    setUuid(uuid);
    setShowPage(type === "grid" ? "grid" : "plot");
  };

  if (loading || !project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="mb-2 text-xs text-gray-400 transition-colors hover:text-gray-700"
        >
          &larr; All projects
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{project.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>Created {formatDate(project.created_at)}</span>
          <span>{project.label_count} labeled item{project.label_count !== 1 ? "s" : ""}</span>
          {project.label_names.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {project.label_names.map((l) => (
                <span key={l} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Views */}
      <h2 className="mb-3 text-sm font-medium text-gray-700">
        Views ({project.views.length})
      </h2>
      <div className="space-y-2">
        {project.views.map((view, idx) => (
          <ViewRow
            key={view.uuid}
            view={view}
            fallbackName={`View ${project.views.length - idx}`}
            projectName={project.name}
            onNavigate={handleViewClick}
            onRemoved={reload}
          />
        ))}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom);

  if (selectedProject) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <ProjectDetailView
          name={selectedProject}
          onBack={() => setSelectedProject(null)}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <ProjectList onSelect={setSelectedProject} />
    </div>
  );
}
