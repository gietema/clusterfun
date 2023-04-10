import axios from 'axios'
import { Config } from '@/models/Config'
import { API_URL } from '@/models/Constants'

export async function getConfig (uuid: string): Promise<Config> {
  return await axios.get(`${API_URL}/views/${uuid}/config`).then((r) => {
    return r.data
  })
}
