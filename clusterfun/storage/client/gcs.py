"""GCS media storage client for serving signed URLs."""

from datetime import timedelta
from typing import Optional

from clusterfun.storage.client.http import HttpStorageClient


class GCSStorageClient(HttpStorageClient):
    """GCS storage client that generates signed URLs for media access."""

    def __init__(self, common_media_path: Optional[str]):
        super().__init__(common_media_path)
        from google.cloud import storage

        self.client = storage.Client()

    def get_media(self, uri: str) -> str:
        """Generate a signed URL for a GCS object."""
        bucket_name, blob_name = self._parse(uri)
        blob = self.client.bucket(bucket_name).blob(blob_name)
        return blob.generate_signed_url(expiration=timedelta(hours=1))

    @staticmethod
    def _parse(uri: str):
        """Parse gs://bucket/key into (bucket, key)."""
        path = uri.replace("gs://", "")
        parts = path.split("/", 1)
        return parts[0], parts[1]
