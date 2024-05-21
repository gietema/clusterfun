import { API_URL } from "@/app/plots/models/Constants";
import { Media } from "@/app/plots/models/Media";
import axios from "axios";

export async function getMedia(
  uuid: string,
  index: number,
  asBase64: boolean = false,
): Promise<Media> {
  return await axios
    .get(
      `${API_URL}/views/${uuid}/media/${index}?&as_base64=${asBase64.toString()}`,
    )
    .then((r) => {
      return new Media({
        index: r.data.index,
        src: r.data.src,
        information: r.data.information,
        height: r.data.height,
        width: r.data.width,
        labels: r.data.labels
    });
    });
}
