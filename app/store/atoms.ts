import { atom } from "jotai";
import type { PlotConfig, Media, Filter, GridValues, LabelAction, PlotTrace, PredictionItem, PlotPanelConfig } from "@/app/types";

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
});
export const mediaIndexAtom = atom<number | undefined>(undefined);
export const showPageAtom = atom<string>("plot");
export const mediaAtom = atom<Media | undefined>(undefined);
export const mediaItemsAtom = atom<Media[]>([]);
export const labelUndoStackAtom = atom<LabelAction[]>([]);
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
export const columnsAtom = atom<{ name: string; dtype: string }[]>([]);
