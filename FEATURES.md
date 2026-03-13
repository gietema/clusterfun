# Clusterfun - Complete Feature Documentation

> This document exhaustively catalogs every feature, endpoint, component, and behavior of the Clusterfun application as of the `v2` branch. It is intended as a reference for a full rewrite.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Python Public API](#3-python-public-api)
4. [Plot Types](#4-plot-types)
5. [Configuration Model](#5-configuration-model)
6. [Data Models](#6-data-models)
7. [Backend REST API](#7-backend-rest-api)
8. [Storage System](#8-storage-system)
9. [Label System](#9-label-system)
10. [Filtering System](#10-filtering-system)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Frontend State Management](#12-frontend-state-management)
13. [Frontend Views](#13-frontend-views)
14. [Frontend Components](#14-frontend-components)
15. [User Interactions](#15-user-interactions)
16. [Keyboard Shortcuts](#16-keyboard-shortcuts)
17. [Media Support](#17-media-support)
18. [Bounding Box System](#18-bounding-box-system)
19. [Environment Variables](#19-environment-variables)
20. [CLI Interface](#20-cli-interface)
21. [Validation & Error Handling](#21-validation--error-handling)
22. [Caching & Persistence](#22-caching--persistence)
23. [Dependencies](#23-dependencies)
24. [File Structure Reference](#24-file-structure-reference)

---

## 1. Project Overview

**Clusterfun** is a Python plotting library for interactively exploring image, audio, and video data. Users call a single Python function (e.g. `clt.scatter(df, ...)`) which:

1. Validates the input DataFrame
2. Computes plot-specific coordinates (KDE for violin, bins for histogram, etc.)
3. Stores the data in SQLite + JSON files in a local cache directory
4. Starts a local FastAPI/Uvicorn server
5. Opens a React-based web UI in the browser

The web UI allows hover-to-preview, click-to-inspect, drag-to-select, filtering, sorting, labeling, and CSV export. Media can come from local files, HTTP URLs, or AWS S3.

**Key properties:**
- No account, payment, or internet connection required
- All data stays local (served via localhost)
- Input is always a Pandas DataFrame
- Column names are passed as strings (seaborn/plotly-like API)

---

## 2. Architecture

```
User Python Code
    │
    ▼
clusterfun.scatter(df, x="x", y="y", media="img")   ← Python API
    │
    ├─ Validate DataFrame (validation.py)
    ├─ Compute coordinates (plot_types/*.py)
    ├─ Save to SQLite + JSON (storage/local/storer.py)
    │   └─ ~/.cache/clusterfun/{uuid}/
    │       ├─ database.db   (SQLite: full DataFrame for queries)
    │       ├─ data.json     (Plotly-formatted traces for display)
    │       ├─ config.json   (plot configuration)
    │       └─ labels.json   (user labels, created at runtime)
    │
    ├─ Mount media directory as /media static files
    ├─ Start Uvicorn server (plot.py)
    └─ Open browser
         │
         ▼
    React/Next.js Frontend (static export, served by FastAPI)
         │
         ├─ GET /api/views/{uuid}         → plot data + config
         ├─ POST /api/views/{uuid}/media  → paginated media items
         ├─ POST /api/views/{uuid}/filter → filtered plot data
         ├─ POST /api/views/{uuid}/label  → save labels
         └─ ... (14+ endpoints)
```

**Tech Stack:**
- Backend: Python 3.9+, FastAPI, Uvicorn, Pandas, SQLite, orjson, Pillow, boto3
- Frontend: Next.js 14, React 18, TypeScript, Plotly.js, Jotai, Tailwind CSS, Axios
- The frontend is compiled to static files and bundled with the Python package

---

## 3. Python Public API

All functions are exported from `clusterfun/__init__.py` and follow the pattern:
```python
import clusterfun as clt
result_path = clt.scatter(df, x="col_x", y="col_y", media="img_col", ...)
```

### Exported Functions

| Function | Required Params | Description |
|----------|----------------|-------------|
| `scatter(df, x, y, media, ...)` | x, y, media | XY scatter plot |
| `histogram(df, x, media, ...)` | x, media | Histogram with configurable bins |
| `violin(df, y, media, ...)` | y, media | Violin plot with KDE |
| `grid(df, media, ...)` | media | Grid of media items (no axes) |
| `bar_chart(df, x, media, ...)` | x, media | Bar chart (stacked with color) |
| `pie_chart(df, color, media, ...)` | color, media | Pie chart |
| `confusion_matrix(df, y_true, y_pred, media, ...)` | y_true, y_pred, media | Confusion matrix |

### Common Optional Parameters (all functions)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `color` | `Optional[str]` | `None` | Column for categorical coloring |
| `bounding_box` | `Optional[str]` | `None` | Column with bounding box dicts |
| `title` | `Optional[str]` | `None` | Plot title |
| `show` | `bool` | `True` | Start server and open browser |
| `display` | `Optional[Union[str, List[str]]]` | `None` | Extra columns to show under media in sidebar/grid |

### Function-Specific Parameters

- **scatter**: `color_is_categorical: bool = True`, `hline: Optional[float]`, `vline: Optional[float]`
- **histogram**: `bins: int = 20`, `color_is_categorical: bool = True`, `hline`, `vline`
- **violin**: `hline`, `vline` (no `x` parameter — x is computed via KDE)
- **bar_chart**: `color_is_categorical: bool = True`
- **pie_chart**: (no `x`, `y`, or `hline`/`vline`)
- **confusion_matrix**: (no `color`, no `hline`/`vline`)
- **grid**: (no `x`, `y`, `color`, `hline`/`vline`)

### Return Value

All functions return `Path` — the cache directory where the plot data is stored (e.g. `~/.cache/clusterfun/{uuid}`).

---

## 4. Plot Types

### 4.1 Scatter Plot (`scatter.py`)
- Direct mapping of DataFrame columns to x/y coordinates
- Uses Plotly `scattergl` type for performance
- Supports categorical and continuous color scales
- Optional horizontal and vertical reference lines

### 4.2 Histogram (`histogram.py`)
- Bins numeric data into `bins` groups (default 20)
- Represents each data point as a dot within its bin
- `get_x_and_y(data, bins)`: computes (x_value, y_position) for dot-histogram
- When `color` is specified: creates separate histograms per color category
- Y-axis represents count within bins

### 4.3 Violin Plot (`violin.py`)
- Uses custom Gaussian KDE implementation (no scipy dependency)
- `simple_gaussian_kde(y, bandwidth)`: KDE with Silverman's bandwidth rule
- `gaussian_kernel(x, y, bandwidth)`: Gaussian kernel function
- `get_violin_x_single(y)`: generates x-offsets based on density
- When `color` is specified: creates side-by-side violins, one per color category
- X-axis is computed (density-based width), Y-axis is the data column

### 4.4 Grid (`grid.py`)
- No plot visualization — just displays media in a paginated grid
- Only requires `media` column
- Config type = "grid", no x/y columns stored
- Data stored as just `{id: [list of ids]}`

### 4.5 Bar Chart (`bar_chart.py`)
- One bar per unique value in `x` column
- `add_x_count_column(data, x)`: computes bar heights
- Random jitter applied to x/y coordinates for point distribution within bars
- When `color` is specified: creates stacked bars per color within each x-value
- `x_names` stored in config for x-axis tick labels

### 4.6 Pie Chart (`pie_chart.py`)
- Converts categorical `color` column into pie segments
- `generate_polar_coordinates(count, start, ratio)`: random points in polar coords within a pie segment
- `compute_pie_chart_coordinates(df, color, counts)`: polar to Cartesian for all segments
- `format_color(df, color, counts)`: formats legend labels as `"1 - category (50.0%)"`
- Stores computed coordinates in `pie_chart_x` and `pie_chart_y` columns

### 4.7 Confusion Matrix (`confusion_matrix.py`)
- Takes `y_true` and `y_pred` columns
- Creates synthetic `_label` (x-axis) and `_prediction` (y-axis) columns
- Distributes points randomly within each cell using polar-to-Cartesian conversion
- Uses `np.random.uniform` for angles and `np.sqrt(np.random.uniform)` for radii
- Cell positions use integer offsets for each label/prediction pair

---

## 5. Configuration Model

The `Config` dataclass (`config.py`) is the central configuration object, serialized to `config.json`.

```python
@dataclasses.dataclass
class Config:
    type: str                                    # "scatter", "histogram", "violin", "grid",
                                                 # "bar_chart", "pie_chart", "confusion_matrix"
    media: str                                   # Column name with media paths
    columns: List[str]                           # All columns stored in the database

    x: Optional[str] = None                      # X-axis column name
    y: Optional[str] = None                      # Y-axis column name
    color: Optional[str] = None                  # Color column name
    color_is_categorical: bool = True            # Continuous vs categorical color scale
    colors: Optional[List[str]] = None           # Auto-generated color palette names

    title: Optional[str] = None                  # Plot title
    bounding_box: Optional[str] = None           # Bounding box column name
    display: Union[str, List[str]] = None        # Columns to display under media
    labels: Optional[List[str]] = None           # Available label names (populated at load time)

    x_names: Optional[List[str]] = None          # Bar chart x-axis tick labels
    vline: Optional[float] = None                # Vertical reference line position
    hline: Optional[float] = None                # Horizontal reference line position

    save_method: str = "local"                   # "local" or "s3" (from `saver` env var)
    common_media_path: Optional[str] = None      # Local media directory prefix
```

---

## 6. Data Models

### MediaItem (dataclass, returned by API)
```python
@dataclasses.dataclass
class MediaItem:
    index: int                                   # Row ID in database
    src: str                                     # URL or base64 data URI
    information: Optional[List[Any]] = None      # Column values for sidebar
    width: Optional[int] = None                  # Image width (for Plotly rendering)
    height: Optional[int] = None                 # Image height
    labels: Optional[List[str]] = None           # User-applied labels
```

### Label (Pydantic, request body)
```python
class Label(BaseModel):
    title: str                                   # Label name
```

### MediaIndices (Pydantic, request body)
```python
class MediaIndices(BaseModel):
    media_ids: List[int]                         # Row IDs to retrieve
    page: int = 0                                # Pagination page (50 items/page)
    sort_column: Optional[str] = None            # Sort by this column
    ascending: Optional[bool] = None             # Sort direction
    filters: Optional[List[Filter]] = None       # Active filters
```

### Filter (Pydantic, request body)
```python
class Filter(BaseModel):
    column: str                                  # Column to filter on
    comparison: str                              # >, <, =, !=, >=, <=, IN, NOT IN
    values: List[Union[str, float, int]]         # Filter values
```

### ColumnInfo (Pydantic, response)
```python
class ColumnInfo(BaseModel):
    name: str                                    # Column name
    dtype: str                                   # Data type string (int64, float64, object, etc.)
```

### Frontend TypeScript Models

**Media class** (`Media.tsx`):
- Auto-detects `type` from file extension: `"image"` | `"video"` | `"audio"`
- Image extensions: jpg, jpeg, png, gif, bmp, tif, tiff
- Audio extensions: mp3, wav, aac, ogg, flac, wma, m4a, aiff, midi, ape, wavpack, alac, ac3, opus

**BoundingBox class** (`BoundingBox.tsx`):
```typescript
class BoundingBox {
    xmin: number; ymin: number; xmax: number; ymax: number;
    color?: string; label?: string;
    width(): number;   // xmax - xmin
    height(): number;  // ymax - ymin
}
```

**Config class** (`Config.tsx`):
- Mirrors the Python Config but adds: `size?: string`, `symbol?: string`

**Dimension interface** (`Dimension.tsx`):
- `width, height, naturalWidth, naturalHeight`
- `getContainedSize(img)`: calculates CSS `object-fit: contain` dimensions

---

## 7. Backend REST API

Base URL: `http://localhost:{port}/api/`

### 7.1 Plot Data Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| GET | `/api/views/{uuid}` | — | `{uuid, data, config}` | Full plot data + config |
| GET | `/api/uuid` | — | `str` (UUID) | Most recently created plot UUID |
| GET | `/api/views/{uuid}/config` | — | `Config` dict | Configuration only |

### 7.2 Media Endpoints

| Method | Path | Body/Query | Response | Description |
|--------|------|------------|----------|-------------|
| GET | `/api/views/{uuid}/media/{media_id}` | `?as_base64=bool` | `MediaItem` | Single media item |
| POST | `/api/views/{uuid}/media` | `MediaIndices` | `List[MediaItem]` | Paginated batch media (50/page) |
| POST | `/api/views/{uuid}/media-metadata` | `MediaIndices` | `List[{index, information}]` | Metadata without media content |

### 7.3 Filter Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| POST | `/api/views/{uuid}/filter` | `List[Filter]` | `List[Dict]` | Filtered Plotly data traces |

### 7.4 Label Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| POST | `/api/views/{uuid}/label` | `{Label, MediaIndices}` | `"OK"` | Save label to items |
| DELETE | `/api/views/{uuid}/label` | `{Label, MediaIndices}` | `"OK"` | Remove label from items |
| POST | `/api/views/{uuid}/label-download` | `{Label, MediaIndices}` | CSV StreamingResponse | Download labels as CSV |
| POST | `/api/views/{uuid}/labels-count` | `MediaIndices` | `List[{label, inCurrentSelection, inEntireDataset}]` | Label statistics |
| POST | `/api/views/{uuid}/label-to-grid` | `{Label, MediaIndices}` | `str` (URL) | Create new grid from labeled items |

### 7.5 Column Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| GET | `/api/views/{uuid}/columns` | — | `List[ColumnInfo]` | All columns with dtypes |
| POST | `/api/views/{uuid}/columns/{column}/values` | `MediaIndices` | `List[{label, count}]` | Unique values with counts |

### 7.6 Download Endpoints

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| POST | `/api/views/{uuid}/download-grid` | `MediaIndices` | CSV StreamingResponse | Download selection as CSV |

### 7.7 Frontend Serving

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| GET | `/{path:path}` | HTMLResponse | Catch-all serves index.html for SPA routing |

---

## 8. Storage System

### 8.1 Cache Directory Structure

```
~/.cache/clusterfun/              (CLUSTERFUN_CACHE_DIR)
├── {uuid1}/
│   ├── database.db               SQLite database (all DataFrame columns)
│   ├── config.json               Serialized Config dataclass
│   ├── data.json                 Plotly-formatted traces (JSONL via orjson)
│   └── labels.json               User labels (created at runtime)
├── {uuid2}/
│   └── ...
└── (most recent dir used when "recent" is requested)
```

### 8.2 SQLite Database Schema

Table name: `database`

| Column | Source |
|--------|--------|
| `id` | Auto-incrementing integer (1-based) |
| `{media}` | Media column from DataFrame |
| `{x}` | X-axis column (if applicable) |
| `{y}` | Y-axis column (if applicable) |
| `{color}` | Color column (if applicable) |
| `{other_columns}` | All remaining DataFrame columns |

Bounding box columns are JSON-encoded as strings.

### 8.3 data.json Format (Plotly Traces)

**Standard plot (no categorical color):**
```json
[{"id": [1,2,3], "x": [0.1,0.2,0.3], "y": [0.4,0.5,0.6], "mode": "markers", "type": "scattergl"}]
```

**With continuous color:**
```json
[{"id": [...], "x": [...], "y": [...], "mode": "markers", "type": "scattergl",
  "marker": {"color": [1.0,2.0,3.0], "colorscale": "Viridis", "showscale": true, "opacity": 1.0}}]
```

**With categorical color (one trace per color):**
```json
[
  {"id": [...], "x": [...], "y": [...], "mode": "markers", "type": "scattergl",
   "name": "Category A", "marker": {"color": "#1f77b4", "opacity": 1.0}},
  {"id": [...], "x": [...], "y": [...], "mode": "markers", "type": "scattergl",
   "name": "Category B", "marker": {"color": "#ff7f0e", "opacity": 1.0}}
]
```

**Grid (no axes):**
```json
[{"id": [1,2,3,...]}]
```

### 8.4 LocalStorer Flow

1. Generate UUID via `uuid4()`
2. Create directory `{cache_dir}/{uuid}/`
3. Detect media source type (local/S3/HTTP) from first media path
4. If local: extract common path prefix, replace with `/media` in DataFrame, mount static dir
5. `save_db()`: write DataFrame to SQLite via `df.to_sql()`
6. `get_data_dict()`: query SQLite, format into Plotly trace format
7. `save_config()`: serialize Config to JSON
8. `save_data()`: write Plotly traces to JSONL via orjson

### 8.5 LocalLoader Flow

1. Resolve UUID (or "recent" → most recent directory by ctime)
2. `load()`: read data.json + config.json
3. `load_config()`: deserialize Config, populate `labels` from LabelManager
4. `get_row()`: query SQLite for single row, call `load_media()` for URL/base64
5. `get_rows()`: build query with pagination (LIMIT 50 OFFSET page*50), sorting, filtering
6. `filter()`: build SQL WHERE clause, re-generate data dict

### 8.6 Storage Clients

The system supports three media backends via a client abstraction:

| URI Scheme | Client | `get_media()` | `get_media_to_local()` |
|------------|--------|---------------|----------------------|
| Local paths | `LocalStorageClient` | Returns URI as-is | Replaces `/media` with `common_media_path` |
| `http://`, `https://` | `HttpStorageClient` | Returns URI as-is | Downloads via `requests.get()` → BytesIO |
| `s3://` | `S3StorageClient` | Generates pre-signed URL (1hr) | Downloads via HTTP → BytesIO |

Client selection in `get_storage_client(uri, common_media_path)` routes by URI prefix.

---

## 9. Label System

### Backend (`LabelManager`)

- Labels stored in `{cache_dir}/{uuid}/labels.json`
- Format: `{"media_id_str": ["label1", "label2"], ...}`
- Operations:
  - **Save label**: Append label to media_id's list (no duplicates)
  - **Delete label**: Remove label from media_id's list (remove key if empty)
  - **Read labels**: Return full dict
  - **Get DataFrame**: Returns `media_id + one boolean column per label`
  - **Count labels**: Returns `{label, inCurrentSelection, inEntireDataset}` per label

### Frontend (`LabelPanel`)

- Collapsible panel below the grid
- Shows table: label name | count in selection | count in dataset
- Per-label actions:
  - **Select/Deselect all**: Apply or remove label from all visible items
  - **Download**: CSV export of labeled items
  - **Save as grid**: Creates new plot with only labeled items
- **Add new label**: Text input at bottom of panel
- **Delete label**: Remove from config

### Labeling Workflow

1. User browses grid
2. Hovers/focuses on an item
3. Presses number key (1-9) or clicks label checkbox
4. Frontend sends `POST /api/views/{uuid}/label` with label title + media_ids
5. Backend updates `labels.json`
6. Frontend optimistically updates UI
7. Label counts refresh

---

## 10. Filtering System

### Backend Filter Processing

1. Frontend sends `List[Filter]` via POST
2. Each filter validated: column exists, operator valid, value type matches column dtype
3. SQL WHERE clause built:
   - Numeric: `column > value`, `column <= value`, etc.
   - String: `column = 'value'`, `column != 'value'`
   - IN/NOT IN: `column IN ('val1', 'val2')`
4. Filtered data re-queried from SQLite
5. New Plotly traces generated and returned
6. Grid media re-fetched with filters applied

### Frontend Filter UI

- Toggle button shows/hides filter panel
- Each filter row has 3 controls:
  1. **Column dropdown**: Shows all columns with dtype icons (hashtag=int, water=float, etc.)
  2. **Operator dropdown**: `=`, `!=`, `>=`, `<=`, `IN`, `NOT IN`
  3. **Value input**: Text field with autocomplete dropdown showing unique values + counts
- For `IN`/`NOT IN`: multi-select with blue pill badges
- Filters auto-apply when changed (triggers data refresh)
- Multiple filters combined with AND logic
- Remove button (X) per filter row
- Add button (+) to add new filter

### MediaStats (Interactive Statistics)

- Accessible via bar-chart icon in grid toolbar
- Dropdown to select column to visualize
- **Categorical columns**: Bar chart of top 50 values → click bar to add `=` filter
- **Numerical columns**: Histogram → click bin to add min/max range filter
- Built with Plotly.js, interactive click handlers

---

## 11. Frontend Architecture

### Framework
- Next.js 14 with App Router (static export mode)
- Single page application — one route (`/`), all navigation is client-side
- `"use client"` directive — entirely client-rendered

### Entry Point
- `app/page.tsx`: wraps `Previewer` in Jotai `Provider` + `Toaster`
- Production UUID hardcoded for clusterfun.app demo; otherwise "recent"

### API Communication
- All requests via Axios to `http://localhost:{port}/api/` (dev) or `/api/` (prod)
- `API_URL` constant in `Constants.tsx`

### Color Palette (frontend)
18 colors from Plotly default scheme, used for bounding boxes:
```
#1f77b4, #ff7f0e, #2ca02c, #d62728, #9467bd, #8c564b,
#e377c2, #7f7f7f, #bcbd22, #17becf, #aec7e8, #ffbb78,
#98df8a, #ff9896, #c5b0d5, #c49c94, #f7b6d2, #c7c7c7
```

---

## 12. Frontend State Management

All state is managed via **Jotai atoms**, defined in `Previewer.tsx`:

| Atom | Type | Purpose |
|------|------|---------|
| `dataAtom` | `Data[] \| undefined` | Plotly trace data for the current plot |
| `configAtom` | `Config \| undefined` | Plot configuration |
| `uuidAtom` | `string` | Current view UUID (default: "recent") |
| `mediaIndicesAtom` | `Array<number[]>` | **Stack** of selected media index arrays (for nested selections) |
| `filtersAtom` | `FilterInterface[]` | Active filters |
| `gridValuesAtom` | `GridValues` | Grid display state (sort column, direction, page, columns, etc.) |
| `mediaIndexAtom` | `number \| undefined` | Currently hovered/selected media item index |
| `showPageAtom` | `string` | Current view: `"plot"`, `"grid"`, or `"media"` |
| `mediaAtom` | `Media \| undefined` | Currently displayed media in sidebar/detail |
| `mediaItemsAtom` | `Media[]` | Paginated media items in grid view |

### Navigation State Machine

```
PLOT ──(drag-select)──→ GRID ──(click item)──→ MEDIA
 │                        │                       │
 │←──────(back)───────────│←──────(back)──────────│
 │                        │
 └──(click point)──→ MEDIA ←──(arrow keys)──→ MEDIA
```

- `mediaIndicesAtom` is an **array of arrays** — each drag-select pushes a new subset
- "Back" from grid pops the stack and returns to plot (or previous grid level)

---

## 13. Frontend Views

### 13.1 Plot View (`PlotPage.tsx`)

**Layout**: 75% plot area (left) + 25% sidebar (right)

**Plot area**:
- Plotly scatter/violin/bar chart rendered via `react-plotly.js`
- Dynamic import with `ssr: false` for client-only rendering
- Config: `scrollZoom: true`, mode bar hidden
- Layout auto-updates on window resize

**Sidebar**:
- Preview image (max-height 300px) with bounding boxes
- Information items (all columns except bounding box)
- Scrollable

**Interactions**:
- **Hover**: Loads non-base64 preview in sidebar
- **Click**: Fetches base64 media, opens MediaPage
- **Drag-select**: Collects all selected point IDs, opens Grid with those items
- **Zoom/Pan**: Plotly native, tracked via `onRelayout`

**Reference lines**:
- `hline`: horizontal dashed gray line at specified y-value
- `vline`: vertical dashed gray line at specified x-value

### 13.2 Grid View (`Grid.tsx`)

**Layout**: 75% grid area (left) + 25% sidebar (right)

**Toolbar** (top bar):
- Back button → returns to plot
- Sort dropdown (column selector + asc/desc toggle)
- Bounding box label checkbox
- Column value display dropdown
- Grid columns slider (range: 1-10)
- Pagination (prev/next, shows page X of Y)
- Stats toggle button (bar chart icon)
- Download CSV button

**Grid area**:
- CSS grid with configurable 1-10 columns
- Each item is a `MediaGridItem` with:
  - Image or audio preview with optional bounding box overlay
  - Optional column value text below media
  - Label checkboxes (1-9 with keyboard shortcuts)
- Pagination: 50 items per page

**Below grid**:
- Filter panel (collapsible)
- Label panel (collapsible)
- Media statistics panel (togglable)

### 13.3 Media Page (`MediaPage.tsx`)

**Layout**: 75% media display (left) + 25% sidebar (right)

**Header controls**:
- Back button
- Rotate clockwise / counterclockwise buttons
- Previous / Next navigation buttons

**Media display**:
- Image rendered as Plotly background image with invisible marker trace
- Bounding boxes rendered as Plotly shapes (rectangles)
- Bounding box labels as Plotly annotations
- Pan/zoom mode (dragmode: "pan")
- Rotation via canvas transformation (cached as `rotatedSrc`)

**Sidebar**:
- Full media preview
- All metadata columns as key-value pairs
- Labels

---

## 14. Frontend Components

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| `Previewer` | `components/Previewer.tsx` | Root orchestrator — resolves UUID, loads data, routes between views |
| `PlotPage` | `plots/components/PlotPage.tsx` | Plot view with sidebar |
| `Grid` | `components/Grid.tsx` | Grid view with toolbar, filters, labels |
| `MediaPage` | `components/MediaPage/MediaPage.tsx` | Full media inspection view |

### Plot Components

| Component | File | Purpose |
|-----------|------|---------|
| `PlotlyPlot` | `plots/components/PlotlyPlot.tsx` | Main interactive Plotly chart |
| `PlotlyImagePlot` | `plots/components/PlotlyImagePlot.tsx` | Image display with Plotly for zoom/pan/bbox |
| `Plot` | `plots/components/Plot.tsx` | Simple wrapper around PlotlyPlot |
| `SideBar` | `plots/components/SideBar.tsx` | Right sidebar with preview + metadata |
| `BackButton` | `plots/components/BackButton.tsx` | Back navigation button |
| `InformationItem` | `plots/components/InformationItem.tsx` | Single key-value metadata row |
| `PreviewMedia` | `plots/components/PreviewMedia.tsx` | Image/audio preview with SVG bounding box overlay |

### Grid Components

| Component | File | Purpose |
|-----------|------|---------|
| `MediaGridItem` | `components/grid/MediaGridItem.tsx` | Single grid cell (media + labels + value) |
| `MediaLabels` | `components/grid/MediaLabels.tsx` | Label checkboxes with keyboard shortcuts |
| `Pagination` | `components/grid/Pagination.tsx` | Prev/next page controls |
| `SortDropDown` | `components/grid/SortDropDown.tsx` | Column sort selector |
| `ShowValueDropdown` | `components/grid/ShowValueDropdown.tsx` | Column value display selector |
| `BoundingBoxCheck` | `components/grid/BoundingBoxCheck.tsx` | Toggle bbox label display |

### Filter Components

| Component | File | Purpose |
|-----------|------|---------|
| `FilterContext` | `plots/components/FilterContext.tsx` | Wraps FiltersManager, handles filter application |
| `FiltersManager` | `plots/components/FiltersManager.tsx` | Manages filter list (add/update/remove) |
| `Filter` | `plots/components/Filter.tsx` | Single filter row (column + operator + value) |
| `CustomDropdown` | `components/CustomDropdown.tsx` | Dtype-aware dropdown with icons |
| `CustomTextFieldWithDropdown` | `components/CustomTextFieldWithDropdown.tsx` | Text input with autocomplete |

### Label Components

| Component | File | Purpose |
|-----------|------|---------|
| `LabelPanel` | `components/label/Panel.tsx` | Label management panel with stats, actions |

### Media Page Components

| Component | File | Purpose |
|-----------|------|---------|
| `HeaderControls` | `components/MediaPage/HeaderControls.tsx` | Back, rotate, prev/next buttons |
| `ButtonWithIcon` | `components/MediaPage/ButtonWithIcon.tsx` | Button with FontAwesome icon |

### Statistics Components

| Component | File | Purpose |
|-----------|------|---------|
| `MediaVisualization` | `components/MediaStats.tsx` | Column statistics (bar chart / histogram) |

### Utility Components

| Component | File | Purpose |
|-----------|------|---------|
| `Code` / `CodeBlock` | `components/Code.tsx`, `plots/components/Code.tsx` | Syntax-highlighted code with copy button |
| `DynamicCodeBlock` | `components/DynamicCodeBlock.tsx` | Dynamic import wrapper (no SSR) |
| `ErrorBoundary` | `plots/components/Error.tsx` | React error boundary |
| `Navbar` | `components/Navbar.tsx` | Navigation bar (Clusterfun branding) |
| `Footer` | `components/Footer.tsx` | Footer |
| `Browser` | `components/Browser.tsx` | Browser-chrome frame for demos |
| `DocumentationSidebar` | `components/DocumentationSidebar.tsx` | Docs navigation sidebar |
| `StandardDoc` | `components/StandardDoc.tsx` | Standard parameter documentation template |

---

## 15. User Interactions

### Plot View Interactions

| Action | Trigger | Result |
|--------|---------|--------|
| Hover over point | Mouse hover | Sidebar shows preview image + metadata |
| Click point | Mouse click | Opens MediaPage for that item |
| Drag-select points | Click + drag rectangle | Opens Grid with selected items |
| Zoom | Scroll wheel | Plotly zoom |
| Pan | Drag (when zoomed) | Plotly pan |
| Reset zoom | Double-click | Plotly auto-range |

### Grid View Interactions

| Action | Trigger | Result |
|--------|---------|--------|
| Click item | Mouse click | Opens MediaPage |
| Hover item | Mouse hover | Shows preview in sidebar, focuses element |
| Sort by column | Sort dropdown | Re-fetches items with ORDER BY |
| Toggle sort direction | Asc/desc button | Toggles ascending/descending |
| Change columns | Slider (1-10) | Updates CSS grid-template-columns |
| Next/prev page | Pagination buttons | Loads next/previous 50 items |
| Toggle bbox labels | Checkbox | Shows/hides bbox label text on thumbnails |
| Show column value | Dropdown | Shows column value below each item |
| Toggle stats | Bar chart icon | Shows/hides MediaVisualization |
| Download CSV | Download button | Downloads selected data as CSV |
| Filter | Filter panel | Applies filters, refreshes data |

### Label Interactions

| Action | Trigger | Result |
|--------|---------|--------|
| Toggle label on item | Number key 1-9 (focused item) | Saves/removes label via API |
| Toggle label on item | Click label checkbox | Saves/removes label via API |
| Select all for label | Click checkbox in panel | Labels all visible items |
| Deselect all for label | Click checkbox in panel (if all selected) | Removes label from all visible items |
| Download label CSV | Download button in panel | CSV with label assignments |
| Save as new grid | Grid button in panel | Creates new plot from labeled subset |
| Add new label | Type + Enter in panel | Adds label to config |

### Media Page Interactions

| Action | Trigger | Result |
|--------|---------|--------|
| Navigate to previous | Left arrow key or Prev button | Shows previous item |
| Navigate to next | Right arrow key or Next button | Shows next item |
| Rotate clockwise | Rotate CW button | Rotates image 90 degrees |
| Rotate counter-clockwise | Rotate CCW button | Rotates image -90 degrees |
| Go back | Back button | Returns to Grid or Plot |
| Zoom/Pan image | Plotly drag/scroll | Interactive image inspection |

### Filter Interactions

| Action | Trigger | Result |
|--------|---------|--------|
| Add filter | + button | New empty filter row |
| Remove filter | X button | Removes filter, refreshes |
| Change column | Column dropdown | Updates operator options |
| Change operator | Operator dropdown | Updates value input |
| Set value | Type in text field | Shows autocomplete with counts |
| Select value | Click autocomplete option | Applies filter |
| Multi-select (IN/NOT IN) | Click multiple options | Blue pill badges, filter applied |
| Remove selected value | Click X on pill | Removes value from filter |
| Click stats bar/bin | Click on MediaVisualization | Auto-creates filter |

---

## 16. Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `1` - `9` | Grid item focused | Toggle corresponding label |
| `Arrow Left` | Media page | Navigate to previous item |
| `Arrow Right` | Media page | Navigate to next item |

---

## 17. Media Support

### Supported Image Formats
jpg, jpeg, png, gif, bmp, tif, tiff

### Supported Audio Formats
mp3, wav, aac, ogg, flac, wma, m4a, aiff, midi, ape, wavpack, alac, ac3, opus

### Supported Video Formats
Detected by exclusion (if not image or audio, treated as video)

### Media Loading Modes
1. **Preview** (hover): Loads URL only, no base64 conversion
2. **Full** (click/media page): Loads as base64 with dimensions for Plotly rendering
3. **Grid thumbnails**: Loaded via batch API with pagination

### Media Sources
- **Local files**: Common path extracted, served via FastAPI `StaticFiles` mount at `/media`
- **HTTP/HTTPS URLs**: Passed through directly
- **S3 URIs** (`s3://bucket/key`): Converted to pre-signed URLs (1-hour expiry) via boto3

### Base64 Conversion
- `load_media(url, as_base64=True)` → downloads, opens with PIL, converts to PNG base64 data URI
- Returns `(data:image/png;base64,..., height, width)`
- Non-RGB images converted to RGB before encoding

---

## 18. Bounding Box System

### Data Format (in DataFrame)
Each cell can contain a single dict or a list of dicts:
```python
{
    "xmin": int | float,    # Left edge
    "ymin": int | float,    # Top edge
    "xmax": int | float,    # Right edge
    "ymax": int | float,    # Bottom edge
    "color": str | None,    # Optional: color name or hex
    "label": str | None     # Optional: text label
}
```

### Storage
- Bounding box column is JSON-encoded in SQLite (via orjson)
- Non-list values are wrapped in a list before encoding

### Frontend Rendering

**In Grid (PreviewMedia.tsx)**:
- SVG overlay on top of image
- Rectangles scaled to displayed image dimensions
- Optional text labels with background rectangles
- Uses `getContainedSize()` to compute actual displayed image dimensions
- Debounced window resize listener for recalculation

**In Media Page (PlotlyImagePlot.tsx)**:
- Rendered as Plotly shapes (rectangles) overlaid on the image
- Labels rendered as Plotly annotations
- Supports pan/zoom interaction with bounding boxes

### Color Cycling
When no color specified, defaults cycle through the 18-color palette from `Colors.tsx`.

---

## 19. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLUSTERFUN_CACHE_DIR` | `~/.cache/clusterfun` | Root directory for all plot data |
| `CLUSTERFUN_HOST` | `localhost` | Server bind host |
| `CLUSTERFUN_PORT` | Auto-detect (random free port) | Server bind port |
| `CLUSTERFUN_BASE_URL` | None | External URL (overrides localhost) |
| `CLUSTERFUN_PROD_URL` | None | If set, disables static file mounting |
| `AWS_REGION` | None | AWS region for S3 pre-signed URLs |
| `saver` | `local` | Storage method: `"local"` or `"s3"` |

---

## 20. CLI Interface

### Entry Point
```
clusterfun [location]
```

Registered as console script via `pyproject.toml`:
```toml
[tool.poetry.scripts]
clusterfun = "clusterfun.serve_cli:main"
```

### Arguments
- `location` (optional, default: `"recent"`):
  - `"recent"` → loads the most recently created plot
  - UUID string → loads plot by UUID
  - File path → loads plot from specified directory

### Behavior
1. Resolves location to UUID and cache directory
2. Loads `Plot` from cache
3. Mounts media directory (if `common_media_path` set in config)
4. Starts Uvicorn server with auto-reload
5. Opens browser to plot URL

---

## 21. Validation & Error Handling

### Python Validation (`validation.py`)

| Check | Exception | Message |
|-------|-----------|---------|
| DataFrame is empty | `EmptyDataFrameException` | — |
| Media column missing | `ColumnNotFoundException` | Column name |
| X column missing (non-violin) | `ColumnNotFoundException` | Column name |
| Y column missing | `ColumnNotFoundException` | Column name |

### Filter Validation (`filter.py`)

- Column must exist in database
- Comparison operator must be valid (>, <, =, !=, >=, <=, IN, NOT IN)
- Numeric operators (>, <, >=, <=) only for numeric columns
- Values validated against column contents (prevents SQL injection)
- `is_float()` utility for type detection

### Frontend Error Handling

- `ErrorBoundary` class component catches React rendering errors
- Shows Next.js error page on failure
- API calls wrapped in try-catch
- Toast notifications for label save confirmations

### Storage Errors

- `FileExistsError`: Plot directory not found
- `ValueError`: Database query returned no results
- `ValueError`: Local storage without common_media_path

---

## 22. Caching & Persistence

### Data Persistence

| File | Purpose | Written At | Read At |
|------|---------|-----------|---------|
| `database.db` | Full DataFrame for queries | Plot creation | Every media/filter request |
| `data.json` | Pre-computed Plotly traces | Plot creation | Initial load + filter refresh |
| `config.json` | Plot configuration | Plot creation | Every request |
| `labels.json` | User label assignments | First label save | Every label operation |

### Media Caching

- S3 pre-signed URLs expire after 1 hour
- Local files served directly via static mount (no caching layer)
- HTTP media downloaded on-demand (no caching)
- S3 client instance is `@lru_cache()` cached

### Frontend Performance

- Plotly components loaded via `dynamic()` with `ssr: false`
- PreviewMedia uses 300ms debounced resize handler
- Grid pagination limits DOM to 50 items
- Preview mode loads URL only; full mode loads base64 on demand
- Window resize listener for responsive legend positioning

---

## 23. Dependencies

### Python (Core)

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | latest | Web framework |
| uvicorn | latest | ASGI server |
| pandas | ^2.0.0 | Data manipulation |
| pyarrow | >=13,<17 | Parquet support |
| boto3 | ^1.26.0 | AWS S3 access |
| orjson | latest | Fast JSON serialization |
| pillow | latest | Image processing |
| requests | latest | HTTP client |
| urllib3 | <2 | HTTP library |

### JavaScript (Frontend)

| Package | Version | Purpose |
|---------|---------|---------|
| next | 14.2.13 | React framework |
| react | 18.3.1 | UI library |
| plotly.js | 2.35.2 | Charting |
| react-plotly.js | 2.6.0 | React Plotly wrapper |
| jotai | 2.10.0 | Atomic state management |
| axios | 1.7.7 | HTTP client |
| tailwindcss | 3.4.15 | CSS framework |
| @fortawesome/react-fontawesome | 0.2.2 | Icons |
| file-saver | 2.0.5 | File download |
| react-hot-toast | 2.4.1 | Toast notifications |
| react-highlight | 0.15.0 | Code syntax highlighting |
| typescript | 5.6.3 | Type safety |

---

## 24. File Structure Reference

```
clusterfun/
├── __init__.py                          # Exports: scatter, histogram, violin, grid,
│                                        #   bar_chart, pie_chart, confusion_matrix
├── app.py                               # ClusterfunApp(FastAPI), CORS, static files
├── main.py                              # All API routes (16 endpoints)
├── plot.py                              # Plot class (save, load, show, run_server)
├── config.py                            # Config dataclass
├── constants.py                         # COLORS palette (24 colors)
├── validation.py                        # validate(), exceptions
├── serve_cli.py                         # CLI entry point (main)
│
├── models/
│   ├── __init__.py
│   ├── media_item.py                    # MediaItem, Label
│   ├── media_indices.py                 # MediaIndices
│   └── filter.py                        # Filter, is_float, filter_value_in_column
│
├── plot_types/
│   ├── __init__.py
│   ├── scatter.py                       # scatter()
│   ├── histogram.py                     # histogram(), get_x_and_y()
│   ├── violin.py                        # violin(), KDE functions
│   ├── grid.py                          # grid()
│   ├── bar_chart.py                     # bar_chart(), add_x_count_column()
│   ├── pie_chart.py                     # pie_chart(), polar coordinate functions
│   └── confusion_matrix.py              # confusion_matrix()
│
├── storage/
│   ├── __init__.py
│   ├── storer.py                        # Storer ABC, load_media(), image_to_base64()
│   ├── loader.py                        # Loader ABC
│   ├── local/
│   │   ├── __init__.py
│   │   ├── storer.py                    # LocalStorer (save, save_db, save_config, save_data)
│   │   ├── loader.py                    # LocalLoader (load, get_row, get_rows, filter, etc.)
│   │   ├── data.py                      # get_data_dict, get_data_standard, get_data_per_color, get_grid_data
│   │   ├── helpers.py                   # format_df_for_db, get_columns_for_db, get_filter_query,
│   │   │                                #   get_media_query, get_recent_dir, run_query
│   │   └── label_manager.py             # LabelManager, count_labels
│   └── client/
│       ├── __init__.py                  # get_storage_client, CLIENT_REGISTRY
│       ├── base.py                      # BaseStorageClient ABC
│       ├── local.py                     # LocalStorageClient
│       ├── http.py                      # HttpStorageClient
│       └── s3.py                        # S3StorageClient, get_client (cached)
│
└── frontend/                            # Compiled Next.js static export

app/                                     # Next.js source
├── layout.tsx                           # Root layout (metadata, fonts, FA)
├── page.tsx                             # Home page (Jotai Provider + Previewer)
├── globals.css                          # Tailwind + custom CSS + animations
│
├── components/
│   ├── Previewer.tsx                    # Root: atoms, UUID resolution, view routing
│   ├── Grid.tsx                         # Grid view with toolbar
│   ├── MediaStats.tsx                   # Column statistics visualization
│   ├── Navbar.tsx                       # Navigation bar
│   ├── Footer.tsx                       # Footer
│   ├── Browser.tsx                      # Browser chrome frame
│   ├── Button.tsx                       # Static button
│   ├── Code.tsx                         # Syntax highlighting + copy
│   ├── DynamicCodeBlock.tsx             # Dynamic import wrapper
│   ├── CustomDropdown.tsx               # Dtype-aware dropdown
│   ├── CustomTextFieldWithDropdown.tsx  # Autocomplete input
│   ├── DocumentationSidebar.tsx         # Docs navigation
│   ├── StandardDoc.tsx                  # Standard param docs
│   │
│   ├── grid/
│   │   ├── MediaGridItem.tsx            # Single grid cell
│   │   ├── MediaLabels.tsx              # Label checkboxes
│   │   ├── Pagination.tsx               # Page nav
│   │   ├── SortDropDown.tsx             # Sort controls
│   │   ├── ShowValueDropdown.tsx        # Column value display
│   │   └── BoundingBoxCheck.tsx         # Bbox toggle
│   │
│   ├── label/
│   │   └── Panel.tsx                    # Label management panel
│   │
│   └── MediaPage/
│       ├── MediaPage.tsx                # Full media view
│       ├── HeaderControls.tsx           # Back/rotate/nav buttons
│       ├── ButtonWithIcon.tsx           # Icon button
│       └── utils.ts                     # getNextMedia, getPreviousMedia, rotateImage
│
├── plots/
│   ├── components/
│   │   ├── PlotPage.tsx                 # Plot view
│   │   ├── PlotlyPlot.tsx              # Main Plotly chart
│   │   ├── PlotlyImagePlot.tsx         # Image + bboxes via Plotly
│   │   ├── Plot.tsx                     # PlotlyPlot wrapper
│   │   ├── SideBar.tsx                  # Right sidebar
│   │   ├── Filter.tsx                   # Single filter row
│   │   ├── FilterContext.tsx            # Filter application logic
│   │   ├── FiltersManager.tsx           # Filter list management
│   │   ├── BackButton.tsx               # Back button
│   │   ├── InformationItem.tsx          # Key-value metadata
│   │   ├── PreviewMedia.tsx             # Image/audio + SVG bboxes
│   │   ├── Code.tsx                     # Code block
│   │   ├── Error.tsx                    # Error boundary
│   │   └── layout.tsx                   # Layout wrapper
│   │
│   ├── models/
│   │   ├── Media.tsx                    # Media class + type detection
│   │   ├── Config.tsx                   # Config class
│   │   ├── FilterInterface.tsx          # Filter interface
│   │   ├── BoundingBox.tsx              # BoundingBox class
│   │   ├── Dimension.tsx                # Dimension + getContainedSize
│   │   ├── Colors.tsx                   # 18-color palette
│   │   └── Constants.tsx                # API_URL
│   │
│   └── requests/
│       ├── GetPlotData.tsx              # GET /api/views/{uuid}
│       ├── GetFilteredPlotData.tsx      # POST /api/views/{uuid}/filter
│       ├── GetMedia.tsx                 # GET /api/views/{uuid}/media/{id}
│       ├── GetMediaItems.tsx            # POST /api/views/{uuid}/media
│       ├── GetUuid.tsx                  # GET /api/uuid
│       ├── GetConfig.tsx                # GET /api/views/{uuid}/config
│       └── LabelStore.tsx               # POST/DELETE /api/views/{uuid}/label
│
└── utils/
    └── dtypeIconMap.ts                  # Dtype to FontAwesome icon mapping

tests/
├── conftest.py                          # cache_dir fixture (tmp_path + monkeypatch)
├── test_plot.py                         # scatter, histogram, violin, grid + validation
├── test_confusion_matrix.py             # confusion_matrix test
├── test_pie.py                          # pie_chart coordinate + color tests
├── test_bounding_box.py                 # bounding box rendering test
├── test_storer.py                       # LocalStorer save test
├── test_storage_client.py               # Client factory + local/http/s3 tests
└── samples/
    ├── cifar10_embedding.csv            # Test data
    └── wiki-art.csv                     # Test data

scripts/
├── scatter.py                           # Example: scatter plot
├── histogram.py                         # Example: histogram
├── violin.py                            # Example: violin (filtered artists)
├── grid.py                              # Example: grid
├── bar_chart.py                         # Example: bar chart
├── pie.py                               # Example: pie chart
└── audio.py                             # Example: audio grid with display
```
