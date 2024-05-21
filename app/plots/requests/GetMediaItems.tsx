import { API_URL } from "@/app/plots/models/Constants";
import { Media } from "@/app/plots/models/Media";
import axios from "axios";
import { FilterInterface } from "../models/FilterInterface";

export async function getMediaItems(
  uuid: string,
  mediaIds: number[],
  page?: number,
  sortColumn?: string,
  ascending?: boolean,
  filters?: FilterInterface[],
): Promise<Media[]> {
  return await axios
    .post(`${API_URL}/views/${uuid}/media`, {
      media_ids: mediaIds,
      page: page !== null ? page : 0,
      sort_column: sortColumn !== undefined ? sortColumn : null,
      ascending: ascending !== undefined ? ascending : null,
      filters: filters !== undefined ? filters : null,
    })
    .then((r) => {
      return r.data.map((media: any) => {
        return new Media({
          index: media.index,
          src: media.src,
          information: media.information,
          height: media.height,
          width: media.width,
          labels: media.labels,
        });
      });
    });
}
