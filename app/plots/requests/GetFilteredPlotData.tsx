import { API_URL } from "@/app/plots/models/Constants";
import { FilterInterface } from "@/app/plots/models/FilterInterface";
import axios from "axios";
import { Data } from "plotly.js";

export async function getFilteredPlotData(
  uuid: string,
  filters: FilterInterface[],
): Promise<Data[] | undefined> {
  return await axios
    .post(`${API_URL}/views/${uuid}/filter`, filters)
    .then((r) => {
      return r.data;
    });
}
