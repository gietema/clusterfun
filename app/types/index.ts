// ── Media ──
export type MediaType = "image" | "video" | "audio";
export type InformationValue = string | number | boolean | null;

export interface Media {
  index: number;
  src: string;
  information?: Record<string, InformationValue>;
  width?: number;
  height?: number;
  type?: MediaType;
  labels?: string[];
}

// ── Config ──
export interface PlotConfig {
  type: string;
  media: string;
  columns: string[];
  labels: string[];
  title?: string;
  x?: string;
  y?: string;
  color?: string;
  size?: string;
  symbol?: string;
  bounding_box?: string;
  colors?: string[];
  x_names?: string[];
  display?: string[];
  hline?: number;
  vline?: number;
  embeddings?: string;
  embeddings_model?: string;
}

// ── Bounding Box ──
export interface BoundingBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  color?: string;
  label?: string;
}

// ── Filter ──
export interface Filter {
  column: string;
  comparison: string;
  values: string[];
}

// ── Grid ──
export interface GridValues {
  sortBy: string;
  asc: boolean;
  page: number;
  numberOfColumns: number;
  showColumnValues: string[];
  showBboxLabel: boolean;
}

// ── Dimension ──
export interface Dimension {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

export interface HeightWidth {
  height: number;
  width: number;
}

// ── Column Info ──
export interface ColumnInfo {
  name: string;
  dtype: string;
}

// ── Dropdown Option ──
export interface DropdownOption {
  value: string;
  label: string;
  dtype?: string;
}

// ── Label Count ──
export interface LabelCount {
  label: string;
  inCurrentSelection: number;
  inEntireDataset: number;
}

// ── Media Metadata ──
export interface MediaMetadata {
  index: number;
  information: Record<string, InformationValue>;
}

// ── Plot Trace ──
export interface PlotTrace {
  id: number[];
  type?: "scattergl" | "scatter";
  mode?: "markers";
  x?: (number | string)[];
  y?: (number | string)[];
  name?: string;
  marker?: {
    color?: (number | string)[] | string;
    colorscale?: string;
    showscale?: boolean;
    opacity?: number;
  };
}

// ── Column Stats ──
export interface CategoricalStat {
  label: string;
  count: number;
}

export interface NumericStats {
  bins: number[];
  counts: number[];
  min: number;
  max: number;
}

export type ColumnStats =
  | { type: "categorical"; data: CategoricalStat[] }
  | ({ type: "numeric" } & NumericStats);

// ── Similarity ──
export interface SimilarityResult {
  media_id: number;
  similarity: number;
}

// ── Label Undo ──
export interface LabelAction {
  type: "add" | "remove";
  label: string;
  mediaIds: number[];
}
