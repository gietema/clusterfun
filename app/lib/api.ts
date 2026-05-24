import axios from "axios";
import type { Media, PlotConfig, Filter, ColumnInfo, LabelCount, PlotTrace, ColumnStats, MediaMetadata, SimilarityResult, ProbeResponse, ProbeSortBy, OutlierResult, DuplicateGroup, ProjectSummary, ProjectDetail, Annotation, InformationValue } from "@/app/types";
import { API_URL } from "./constants";
import { createMedia } from "./media-utils";

// ── Plot data ──

export async function fetchUuid(): Promise<string> {
  const { data } = await axios.get(`${API_URL}/uuid`);
  return data;
}

export async function fetchPlotData(uuid: string): Promise<{ config: PlotConfig; data: PlotTrace[] }> {
  const { data } = await axios.get(`${API_URL}/views/${uuid}`);
  return { config: data.config as PlotConfig, data: data.data as PlotTrace[] };
}

export async function fetchConfig(uuid: string): Promise<PlotConfig> {
  const { data } = await axios.get(`${API_URL}/views/${uuid}/config`);
  return data;
}

export async function fetchFilteredPlotData(uuid: string, filters: Filter[]): Promise<PlotTrace[] | undefined> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/filter`, filters);
  return data;
}

// ── Media ──

export async function fetchMedia(uuid: string, index: number, asBase64 = false): Promise<Media> {
  const { data } = await axios.get(
    `${API_URL}/views/${uuid}/media/${index}?as_base64=${asBase64}`,
  );
  return createMedia(data);
}

export async function fetchMediaItems(
  uuid: string,
  mediaIds: number[],
  page = 0,
  sortColumn?: string,
  ascending?: boolean,
  filters?: Filter[],
): Promise<Media[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/media`, {
    media_ids: mediaIds.length > 10_000 ? [] : mediaIds,
    page,
    sort_column: sortColumn ?? null,
    ascending: ascending ?? null,
    filters: filters ?? null,
  });
  return data.map(createMedia);
}

export async function fetchMediaMetadata(
  uuid: string,
  mediaIds: number[],
): Promise<MediaMetadata[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/media-metadata`, {
    media_ids: mediaIds,
  });
  return data;
}

export async function fetchMediaThumbnails(
  uuid: string,
  mediaIds: number[],
  maxSize = 64,
): Promise<{ id: number; src: string }[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/media-thumbnails`, {
    media_ids: mediaIds,
    max_size: maxSize,
  });
  return data;
}

// ── Columns ──

export async function fetchColumns(uuid: string): Promise<ColumnInfo[]> {
  const { data } = await axios.get<ColumnInfo[]>(`${API_URL}/views/${uuid}/columns`);
  return data;
}

export async function fetchColumnValues(
  uuid: string,
  column: string,
  mediaIds: number[],
): Promise<{ label: string; count: number }[]> {
  const { data } = await axios.post(
    `${API_URL}/views/${uuid}/columns/${column}/values`,
    { media_ids: mediaIds },
  );
  return data;
}

// ── Filtered Count ──

export async function fetchFilteredCount(
  uuid: string,
  filters: Filter[],
): Promise<number> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/count`, { filters });
  return data.count;
}

// ── Column Stats ──

export async function fetchColumnStats(
  uuid: string,
  mediaIds: number[],
  column: string,
  offset = 0,
  limit = 50,
): Promise<ColumnStats> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/column-stats`, {
    media_ids: mediaIds,
    column,
    offset,
    limit,
  });
  return data;
}

// ── Labels ──

export async function saveLabel(uuid: string, mediaIds: number[], label: string): Promise<void> {
  await axios.post(`${API_URL}/views/${uuid}/label`, {
    label: { title: label },
    media_indices: { media_ids: mediaIds },
  });
}

export async function deleteLabel(uuid: string, mediaIds: number[], label: string): Promise<void> {
  await axios.delete(`${API_URL}/views/${uuid}/label`, {
    data: {
      label: { title: label },
      media_indices: { media_ids: mediaIds },
    },
  });
}

export async function fetchLabelCounts(uuid: string, mediaIds: number[]): Promise<LabelCount[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/labels-count`, {
    media_ids: mediaIds,
  });
  return data;
}

export async function downloadLabelCsv(uuid: string, mediaIds: number[], label?: string): Promise<Blob> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/label-download`, {
    label: { title: label ?? "" },
    media_indices: { media_ids: mediaIds },
  });
  return new Blob([data], { type: "text/csv;charset=utf-8" });
}

export async function saveLabelAsGrid(uuid: string, mediaIds: number[], label?: string): Promise<string> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/label-to-grid`, {
    label: { title: label ?? "" },
    media_indices: { media_ids: mediaIds },
  });
  return data;
}

// ── Similarity ──

export async function fetchTextSearchStatus(uuid: string): Promise<{ ready: boolean; model: string | null }> {
  const { data } = await axios.get(`${API_URL}/views/${uuid}/text-search/status`);
  return data;
}

export async function fetchSimilar(
  uuid: string,
  mediaId: number,
  limit = 1000,
): Promise<SimilarityResult[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/similar`, {
    media_id: mediaId,
    limit,
  });
  return data;
}

export async function fetchTextSearch(
  uuid: string,
  query: string,
  limit = 1000,
): Promise<SimilarityResult[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/search-text`, {
    query,
    limit,
  });
  return data;
}

export async function fetchSimilarVector(
  uuid: string,
  embedding: number[],
  limit = 1000,
): Promise<SimilarityResult[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/similar-vector`, {
    embedding,
    limit,
  });
  return data;
}

// ── Active Learning ──

export async function fitProbe(
  uuid: string,
  mediaIds: number[] = [],
  sortBy: ProbeSortBy = "confidence",
  focusLabels?: string[],
  limit = 5000,
  method = "auto",
  mlpLayers = 1,
): Promise<ProbeResponse> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/active-learning/probe`, {
    media_ids: mediaIds,
    sort_by: sortBy,
    focus_labels: focusLabels ?? null,
    limit,
    method,
    mlp_layers: mlpLayers,
  });
  return data;
}

// ── Embeddings ──

export interface EmbeddingsResponse {
  media_ids: number[];
  embeddings: number[][];
  dimension: number;
}

export async function fetchEmbeddings(
  uuid: string,
  mediaIds: number[] = [],
): Promise<EmbeddingsResponse> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/embeddings`, {
    media_ids: mediaIds,
  });
  return data;
}

export async function fetchAllLabels(
  uuid: string,
): Promise<Record<string, string[]>> {
  const { data } = await axios.get(`${API_URL}/views/${uuid}/all-labels`);
  return data.labels;
}

// ── Downloads ──

export async function downloadGridCsv(uuid: string, mediaIds: number[]): Promise<Blob> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/download-grid`, {
    media_ids: mediaIds,
  });
  return new Blob([data], { type: "text/csv;charset=utf-8" });
}

// ── Dynamic Plot Builder ──

export interface PlotBuilderRequest {
  type: string;
  x?: string;
  y?: string;
  color?: string;
  color_is_categorical?: boolean;
  bins?: number;
  sample_size?: number;
  method?: string;
  n_neighbors?: number;
}

export async function fetchDynamicPlotData(
  uuid: string,
  req: PlotBuilderRequest,
  signal?: AbortSignal,
): Promise<{ config: PlotConfig; data: PlotTrace[] }> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/plot-data`, req, { signal });
  return { config: data.config as PlotConfig, data: data.data };
}

// ── Insights (Outliers / Duplicates / Centroid Distance) ──

export interface InsightsTaskResponse {
  task_id: string;
  status: string;
}

export interface InsightsStatusResponse {
  status: "running" | "done" | "error";
  progress: number;
  phase: string;
  results?: any;
  error?: string;
}

export interface CentroidDistanceResult {
  media_id: number;
  distance: number;
  group?: string | null;
  group_total?: number | null;
}

export async function fetchOutliers(
  uuid: string,
  mediaIds: number[] = [],
  k = 20,
  threshold = 1.5,
  groupBy?: string,
): Promise<OutlierResult[] | InsightsTaskResponse> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/outliers`, {
    media_ids: mediaIds,
    k,
    threshold,
    group_by: groupBy ?? null,
  });
  return data;
}

export async function fetchDuplicates(
  uuid: string,
  mediaIds: number[] = [],
  threshold = 0.95,
  limit = 100,
): Promise<DuplicateGroup[] | InsightsTaskResponse> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/duplicates`, {
    media_ids: mediaIds,
    threshold,
    limit,
  });
  return data;
}

export async function fetchCentroidDistance(
  uuid: string,
  mediaIds: number[] = [],
  limit = 200,
  groupBy?: string | null,
): Promise<CentroidDistanceResult[] | InsightsTaskResponse> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/centroid-distance`, {
    media_ids: mediaIds,
    limit,
    group_by: groupBy ?? null,
  });
  return data;
}

export async function fetchInsightsStatus(
  uuid: string,
  taskId: string,
): Promise<InsightsStatusResponse> {
  const { data } = await axios.get<InsightsStatusResponse>(
    `${API_URL}/views/${uuid}/insights/status/${taskId}`,
  );
  return data;
}

// ── Save View ──

export async function saveView(
  uuid: string,
  mediaIds: number[],
  title?: string,
): Promise<{ uuid: string }> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/save-view`, {
    media_ids: mediaIds,
    title: title || undefined,
  });
  return data;
}

// ── Projects ──

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const { data } = await axios.get<ProjectSummary[]>(`${API_URL}/projects`);
  return data;
}

export async function fetchProject(name: string): Promise<ProjectDetail> {
  const { data } = await axios.get<ProjectDetail>(`${API_URL}/projects/${encodeURIComponent(name)}`);
  return data;
}

export async function deleteProjectView(projectName: string, viewUuid: string): Promise<void> {
  await axios.delete(`${API_URL}/projects/${encodeURIComponent(projectName)}/views/${viewUuid}`);
}

export async function renameProjectView(projectName: string, viewUuid: string, title: string): Promise<void> {
  await axios.patch(`${API_URL}/projects/${encodeURIComponent(projectName)}/views/${viewUuid}`, { title });
}

// ── Image Statistics ──

export interface ImageStatsStatus {
  status: "idle" | "computing" | "done" | "already_computed";
  progress: number;
  total: number;
  done: number;
  columns: string[];
}

export async function computeImageStats(uuid: string): Promise<ImageStatsStatus> {
  const { data } = await axios.post<ImageStatsStatus>(`${API_URL}/views/${uuid}/image-stats/compute`);
  return data;
}

export async function fetchImageStatsStatus(uuid: string): Promise<ImageStatsStatus> {
  const { data } = await axios.get<ImageStatsStatus>(`${API_URL}/views/${uuid}/image-stats/status`);
  return data;
}

// ── Annotations ──

export async function fetchAnnotations(uuid: string, mediaId: number): Promise<Annotation[]> {
  const { data } = await axios.get<Annotation[]>(`${API_URL}/views/${uuid}/annotations/${mediaId}`);
  return data;
}

export async function saveAnnotations(uuid: string, mediaId: number, annotations: Annotation[]): Promise<void> {
  await axios.post(`${API_URL}/views/${uuid}/annotations`, {
    media_id: mediaId,
    annotations,
  });
}

export async function deleteAnnotation(uuid: string, mediaId: number, annotationId: string): Promise<void> {
  await axios.delete(`${API_URL}/views/${uuid}/annotations`, {
    data: { media_id: mediaId, annotation_id: annotationId },
  });
}

export async function exportAnnotations(uuid: string, mediaIds?: number[]): Promise<any[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/annotations/export`, {
    media_ids: mediaIds ?? null,
  });
  return data;
}

// ── ML Export ──

export type ExportFormat = "coco" | "yolo" | "classification";

export interface ExportRequest {
  format: ExportFormat;
  media_ids?: number[];
  label_filter?: string;
}

export async function exportData(uuid: string, req: ExportRequest): Promise<Blob> {
  const { data } = await axios.post(
    `${API_URL}/views/${uuid}/export`,
    req,
    { responseType: "blob" },
  );
  return data;
}

// ── Metadata Editing ──

export async function updateMetadata(
  uuid: string,
  mediaIds: number[],
  column: string,
  value: InformationValue,
): Promise<void> {
  await axios.patch(`${API_URL}/views/${uuid}/metadata`, {
    media_ids: mediaIds,
    column,
    value,
  });
}

export async function addColumn(uuid: string, column: string): Promise<void> {
  await axios.post(`${API_URL}/views/${uuid}/add-column`, { column });
}
