/**
 * Custom Plotly.js bundle that only includes the trace types used in the app.
 * This reduces the bundle size by ~60% compared to the full plotly.js import.
 */
// @ts-nocheck
import Plotly from "plotly.js/lib/core";
import ScatterGl from "plotly.js/lib/scattergl";
import Bar from "plotly.js/lib/bar";
import Heatmap from "plotly.js/lib/heatmap";
import Pie from "plotly.js/lib/pie";
import Violin from "plotly.js/lib/violin";
import Histogram from "plotly.js/lib/histogram";

Plotly.register([ScatterGl, Bar, Heatmap, Pie, Violin, Histogram]);

export default Plotly;
