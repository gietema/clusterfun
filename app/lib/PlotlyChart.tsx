/**
 * Custom Plot component using our minimal Plotly bundle.
 * Used via dynamic import to avoid SSR issues.
 */
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "./plotly-bundle";

const Plot = createPlotlyComponent(Plotly);
export default Plot;
