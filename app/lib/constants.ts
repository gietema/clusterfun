export const API_URL = process.env.NODE_ENV === "development"
  ? "http://localhost:8000/api"
  : "/api";

// From Plotly.js default color scheme
export const COLORS = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b",
  "#e377c2", "#7f7f7f", "#bcbd22", "#17becf", "#0000FF", "#00FF00",
  "#FF0000", "#00FFFF", "#FF00FF", "#FFFF00", "#C0C0C0", "#800000",
];

export const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff",
]);

export const AUDIO_EXTENSIONS = new Set([
  "mp3", "wav", "aac", "ogg", "flac", "wma", "m4a",
  "aiff", "midi", "ape", "wavpack", "alac", "ac3", "opus",
]);

export const ITEMS_PER_PAGE = 50;
