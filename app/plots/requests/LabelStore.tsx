import axios from "axios";
import { API_URL } from "../models/Constants";

// Replace with your API's base URL
interface SaveLabelResponse {
  // Define the response structure if needed
}

export async function saveLabel(
  viewUuid: string,
  mediaId: number[],
  label: string,
): Promise<SaveLabelResponse> {
  try {
    const response = await axios.post(`${API_URL}/views/${viewUuid}/label`, {
      label: {
        title: label,
      },
      media_indices: {
        media_ids: mediaId,
      },
    });

    // Assuming the response is a simple string as per your endpoint
    return response.data;
  } catch (error) {
    // Handle error
    console.error("Error saving label:", error);
    throw error;
  }
}

export async function deleteLabel(
  viewUuid: string,
  mediaId: number[],
  label: string,
): Promise<SaveLabelResponse> {
  try {
    const response = await axios.delete(`${API_URL}/views/${viewUuid}/label`, {
      data: {
        label: {
          title: label,
        },
        media_indices: {
          media_ids: mediaId,
        },
      },
    });
    // Assuming the response is a simple string as per your endpoint
    return response.data;
  } catch (error) {
    // Handle error
    console.error("Error deleting label:", error);
    throw error;
  }
}
