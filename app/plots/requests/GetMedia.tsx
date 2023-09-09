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
      return new Media(
        r.data.index,
        r.data.src,
        r.data.information,
        r.data.height,
        r.data.width,
      );
    });
}
