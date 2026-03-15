import { atom } from "jotai";
import type { PlotConfig, Media, Filter, GridValues, LabelAction, PlotTrace, PredictionItem, PlotPanelConfig, ColumnInfo } from "@/app/types";

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
export const showPageAtom = atom<string>("plot");
export const mediaAtom = atom<Media | undefined>(undefined);
export const mediaItemsAtom = atom<Media[]>([]);
export const labelUndoStackAtom = atom<LabelAction[]>([]);
export const labelRedoStackAtom = atom<LabelAction[]>([]);
export const labelFilterAtom = atom<string | null>(null);
export const selectedProjectAtom = atom<string | null>(null);
export const sidebarWidthAtom = atom<number | null>(null);
export const similarityResultsAtom = atom<Record<number, number>>({});

// Active learning state
export const activeLearningAtom = atom<{
  predictions: PredictionItem[];
  labelClasses: string[];
  nLabeled: number;
} | null>(null);

export const alMethodAtom = atom<string>("centroid");
export const alClassFilterAtom = atom<string | null>(null);
export const alSortByAtom = atom<"confidence" | "uncertainty">("confidence");

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

// Text search
export const textSearchQueryAtom = atom<string>("");

// Insights tab persistent state
export const insightsColumnStatsAtom = atom<Record<string, import("@/app/types").ColumnStats>>({});

export const insightsOutliersAtom = atom<{
  ids: number[];
  media: import("@/app/types").Media[];
  groups?: { label: string; ids: number[]; media: import("@/app/types").Media[] }[];
}>({ ids: [], media: [] });

export const insightsDuplicatesAtom = atom<{
  groups: number[][];
  media: import("@/app/types").Media[];
}>({ groups: [], media: [] });

export const insightsWeirdestAtom = atom<{
  ids: number[];
  media: import("@/app/types").Media[];
}>({ ids: [], media: [] });

// Background task queue — persists across page switches
export interface BackgroundTask {
  id: string;
  type: "image_stats";
  viewUuid: string;
  label: string;
  status: "running" | "done" | "error";
  progress: number;
  done: number;
  total: number;
  startedAt: number;
  completedAt?: number;
}
export const backgroundTasksAtom = atom<BackgroundTask[]>([]);
