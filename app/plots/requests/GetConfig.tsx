import { Config } from "@/app/plots/models/Config";
import { API_URL } from "@/app/plots/models/Constants";
import axios from "axios";

export async function getConfig(uuid: string): Promise<Config> {
  return await axios.get(`${API_URL}/views/${uuid}/config`).then((r) => {
    return r.data;
  });
}
