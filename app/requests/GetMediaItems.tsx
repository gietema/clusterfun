import axios from 'axios'
import { Media } from '@/models/Media'
import { API_URL } from '@/models/Constants'

export async function getMediaItems (
  uuid: string,
  mediaIds: number[],
  page?: number,
  sortColumn?: string,
  ascending?: boolean
): Promise<Media[]> {
  return await axios
    .post(`${API_URL}/views/${uuid}/media`, {
      media_ids: mediaIds,
      page: (page !== null) ? page : 0,
      sort_column: sortColumn !== undefined ? sortColumn : null,
      ascending: ascending !== undefined ? ascending : null
    })
    .then((r) => r.data)
}
