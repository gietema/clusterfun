import axios from 'axios'
import { API_URL } from '@/models/Constants'

export async function getUuid (): Promise<string> {
  return await axios.get(`${API_URL}/uuid`).then((r) => {
    return r.data
  })
}
