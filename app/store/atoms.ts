import { atom } from "jotai";
import type { PlotConfig, Media, Filter, GridValues, LabelAction, PlotTrace, PredictionItem, PlotPanelConfig, ColumnInfo, BreadcrumbMeta } from "@/app/types";

export const dataAtom = atom<PlotTrace[] | undefined>(undefined);
export const configAtom = atom<PlotConfig | undefined>(undefined);
export const uuidAtom = atom<string>("recent");
export const mediaIndicesStackAtom = atom<Array<number[]>>([]);
export const currentMediaIndicesAtom = atom<number[]>(
  (get) => {
    const stack = get(mediaIndicesStackAtom);
    return stack.length > 0 ? stack[stack.length - 1] : [];
  },
);
export const breadcrumbsAtom = atom<BreadcrumbMeta[]>([]);
export const filtersAtom = atom<Filter[]>([]);
export const gridValuesAtom = atom<GridValues>({
  sortBy: "",
  asc: true,
  page: 0,
  numberOfColumns: 5,
  showColumnValues: [],
  showBboxLabel: false,
  subsample: 0,
});
export const mediaIndexAtom = atom<number | undefined>(undefined);
export const showPageAtom = atom<string>("grid");
export const mediaAtom = atom<Media | undefined>(undefined);
export const mediaItemsAtom = atom<Media[]>([]);
export const labelUndoStackAtom = atom<LabelAction[]>([]);
export const labelRedoStackAtom = atom<LabelAction[]>([]);
export const labelFilterAtom = atom<string | null>(null);
export const selectedProjectAtom = atom<string | null>(null);
export const sidebarWidthAtom = atom<number | null>(null);
export const similarityResultsAtom = atom<Record<number, number>>({});
export const selectedMediaAtom = atom<Set<number>>(new Set());

// Active learning state
export const activeLearningAtom = atom<{
  predictions: PredictionItem[];
  labelClasses: string[];
  nLabeled: number;
} | null>(null);

export const alMethodAtom = atom<string>("centroid");
export const alClassFilterAtom = atom<string | null>(null);
export const alSortByAtom = atom<"confidence" | "uncertainty">("confidence");
export const alFocusLabelsAtom = atom<string[] | null>(null);

export const mlpLayersAtom = atom<number>(1);

export const embeddingsCacheAtom = atom<{
  mediaIds: number[];
  embeddings: Float32Array;
  dimension: number;
  idToIndex: Map<number, number>;
} | null>(null);

// Plot interaction
export const dragModeAtom = atom<"select" | "lasso" | "pan">("select");

// Multi-plot panels
export const plotPanelsAtom = atom<PlotPanelConfig[]>([]);
export const plotPanelDataAtom = atom<Record<string, PlotTrace[]>>({});
export const highlightedPointsAtom = atom<Set<number>>(new Set());

// Column metadata (cached)
export const columnsAtom = atom<ColumnInfo[]>([]);

// Command palette
export const commandPaletteOpenAtom = atom<boolean>(false);

// Media detail panel (sidebar)
export const detailMediaIndexAtom = atom<number | undefined>(undefined);

// Grid overlay states (layers, not modes)
export const outlierHighlightAtom = atom<boolean>(false);
export const duplicateHighlightAtom = atom<boolean>(false);

// Analytics dock (plot panels)
export const bottomDockVisibleAtom = atom<boolean>(false);
export const bottomDockHeightAtom = atom<number>(300);
export const dockPositionAtom = atom<"bottom" | "top" | "right">("top");
export const dockWidthAtom = atom<number>(400);

// Focus mode (full-screen labeling)
export const focusModeAtom = atom<boolean>(false);

// Pane collapse (grid <-> sidebar)
export const sidebarCollapsedAtom = atom<boolean>(false);
export const gridCollapsedAtom = atom<boolean>(false);

// Live filtered count (written by GridView, read by toolbar's scope line)
export const filteredCountAtom = atom<number | null>(null);

// Max page index (written by GridView, read by toolbar pagination)
export const maxPageAtom = atom<number>(0);

// Cursor (keyboard-focused item index in the current grid). Drives arrow-key nav.
export const cursorIndexAtom = atom<number | null>(null);

// Quick Look overlay (Space-key preview)
export const quickLookOpenAtom = atom<boolean>(false);

// Left label rail collapsed state (defaults to collapsed — labels are not always primary)
export const labelRailCollapsedAtom = atom<boolean>(true);

// Text search
export const textSearchQueryAtom = atom<string>("");

// Insights tab persistent state
export const insightsColumnStatsAtom = atom<Record<string, import("@/app/types").ColumnStats>>({});

export const insightsOutliersAtom = atom<{
  ids: number[];
  media: import("@/app/types").Media[];
  groups?: { label: string; ids: number[]; media: import("@/app/types").Media[]; total: number }[];
}>({ ids: [], media: [] });

export const insightsDuplicatesAtom = atom<{
  groups: number[][];
  groupMedia: import("@/app/types").Media[][];  // per-group media previews
}>({ groups: [], groupMedia: [] });

export const insightsWeirdestAtom = atom<{
  ids: number[];
  media: import("@/app/types").Media[];
}>({ ids: [], media: [] });

// Persisted outlier settings so they survive tab switches
export const insightsOutlierGroupByAtom = atom<string | null>(null);

// Background task queue — persists across page switches
export interface BackgroundTask {
  id: string;
  type: "image_stats" | "outliers" | "duplicates" | "centroid_distance";
  viewUuid: string;
  label: string;
  status: "running" | "done" | "error";
  progress: number;
  done: number;
  total: number;
  startedAt: number;
  completedAt?: number;
  taskId?: string;  // server-side task ID for insights tasks
  phase?: string;   // current phase label (e.g. "Building index")
}
export const backgroundTasksAtom = atom<BackgroundTask[]>([]);
