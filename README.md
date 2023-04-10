# Clusterfun

Clusterfun is a tool for visualizing data and media in a browser. It's built on top of [Plotly](https://plotly.com).
The goal is to make it easy to visualize data and media in a browser, without having to write much code.

## Usage

### Plot types

The following plot types are available:

- [Scatter](#scatter)
- [Histogram](#histogram)
- [Grid](#grid)
- [Violin](#violin)
- [Pie chart](#pie)

```python
import clusterfun as clt
```

#### Scatter

```python
clt.scatter(df, x="x", y="y", media="img_path")
```

Example

#### Histogram

```python
clt.histogram(df, x="x", media="img_path", bins=50)
```

Example

#### Grid

A simple grid of media, no plot. Useful for inspecting data when no underlying numbers are available yet.

```python
clt.grid(df, media="img_path")
```

Example

#### Violin

```python
clt.violin(df, y="y", media="img_path")
```

Example

#### Pie chart

```python
clt.pie(df, x="x", y="y", media="img_path")
```

Example

### Parameters

#### Media

The media column in the dataframe will be used to load the media.

#### Color

You can color different categories with the `color` parameter.

- The `color` can be either a color name or hex value

#### Bounding box

Bounding boxes can be added with the `bounding_box` parameter.
A bounding box cell in a dataframe needs to contain a dictionary or a list of dictionaries with bounding box values: `xmin, ymin, xmax, ymax, label (optional), color (optional)`. <br />
Example of a bounding box:

```python
bounding_box = {
    "xmin": 12,
    "ymin": 10,
    "xmax": 100,
    "ymax": 110,
    "color": "green",
    "label": "ground truth"
}
```

- The bounding box coordinates can be either floats or integers.

## Filtering

Data in plots can be filtered to quickly find subsets of the data you're interested in.

## Installation

### Python library

You can create plots that open in your browser by installing the Python library:

```bash
pip install clusterfun
```

### Data loading

Clusterfun supports S3 and local data storage and loading. The media column in the dataframe will be used to determine where to load the media from.
