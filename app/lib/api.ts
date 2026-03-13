import axios from "axios";
import type { Media, PlotConfig, Filter, ColumnInfo, LabelCount, PlotTrace, ColumnStats, MediaMetadata, SimilarityResult } from "@/app/types";
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
    media_ids: mediaIds,
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

// ── Column Stats ──

export async function fetchColumnStats(
  uuid: string,
  mediaIds: number[],
  column: string,
): Promise<ColumnStats> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/column-stats`, {
    media_ids: mediaIds,
    column,
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

export async function fetchSimilar(
  uuid: string,
  mediaId: number,
  n: number = 100,
): Promise<SimilarityResult[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/similar`, {
    media_id: mediaId,
    n,
  });
  return data;
}

export async function fetchSimilarVector(
  uuid: string,
  embedding: number[],
  n: number = 100,
): Promise<SimilarityResult[]> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/similar-vector`, {
    embedding,
    n,
  });
  return data;
}

// ── Downloads ──

export async function downloadGridCsv(uuid: string, mediaIds: number[]): Promise<Blob> {
  const { data } = await axios.post(`${API_URL}/views/${uuid}/download-grid`, {
    media_ids: mediaIds,
  });
  return new Blob([data], { type: "text/csv;charset=utf-8" });
}
