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
  project?: string;
  total_count?: number;
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

// ── Annotation ──
export type AnnotationTool = "rectangle" | "polygon";

export interface RectangleData {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface PolygonData {
  points: [number, number][];
}

export interface Annotation {
  id: string;
  type: AnnotationTool;
  label: string;
  color?: string;
  data: RectangleData | PolygonData;
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
  subsample: number; // 0 = all, otherwise percentage (1, 5, 10, 25, 50)
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
  n_unique: number;
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
  | { type: "categorical"; data: CategoricalStat[]; total_unique?: number }
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

// ── Active Learning ──
export interface PredictionItem {
  media_id: number;
  predicted_class: string;
  uncertainty: number;
  probabilities: Record<string, number>;
  score: number;
}

export type ProbeSortBy = "confidence" | "uncertainty";

export interface ProbeResponse {
  predictions: PredictionItem[];
  label_classes: string[];
  n_labeled: number;
}

// ── Plot Builder ──
export interface PlotPanelConfig {
  id: string;
  type: string;
  x?: string;
  y?: string;
  color?: string;
  colorIsCategorical?: boolean;
  bins?: number;
  sampleSize?: number;
  method?: string;
  nNeighbors?: number;
}

// ── Outlier / Duplicate Detection ──
export interface OutlierResult {
  media_id: number;
  score: number;
  group?: string | null;
  group_total?: number | null;
}

export interface DuplicateGroup {
  group_id: number;
  media_ids: number[];
  similarity: number;
}

// ── Breadcrumb ──
export interface BreadcrumbMeta {
  label: string;
  thumbnailId?: number;
  /** Server-side filters for this breadcrumb level (scalable alternative to ID arrays). */
  filters?: Filter[];
  /** Cached count for filter-based breadcrumbs (avoids re-fetching). */
  filterCount?: number;
}

// ── Projects ──
export interface ProjectSummary {
  name: string;
  created_at: string;
  view_count: number;
  label_count: number;
}

export interface ProjectView {
  uuid: string;
  type: string;
  created_at: string;
  title?: string;
}

export interface ProjectDetail {
  name: string;
  created_at: string;
  label_count: number;
  label_names: string[];
  views: ProjectView[];
}
