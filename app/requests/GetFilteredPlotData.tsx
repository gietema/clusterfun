import axios from 'axios'
import { FilterInterface } from '@/models/FilterInterface'
import { Data } from 'plotly.js'
import { API_URL } from '@/models/Constants'

export async function getFilteredPlotData (
  uuid: string,
  filters: FilterInterface[]
): Promise<Data | undefined> {
  return await axios
    .post(`${API_URL}/views/${uuid}/filter`, filters)
    .then((r) => {
      return r.data
    })
}
