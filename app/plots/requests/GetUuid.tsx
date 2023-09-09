import { API_URL } from "@/app/plots/models/Constants";
import axios from "axios";

export async function getUuid(): Promise<string> {
  return await axios.get(`${API_URL}/uuid`).then((r) => {
    return r.data;
  });
}
