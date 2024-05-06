"""Utilities for working with S3."""

import os
from functools import lru_cache
from io import BytesIO
from typing import Optional, Tuple, Union

import boto3
from botocore.client import Config as BotoConfig

from clusterfun.storage.client.base import BaseStorageClient
from clusterfun.storage.client.http import HttpStorageClient


@lru_cache()
def get_client() -> boto3.client:
    """Get an S3 client."""
    client = boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION"),
        config=BotoConfig(region_name=os.environ.get("AWS_REGION"), signature_version="s3v4"),
    )
    return client


class S3StorageClient(HttpStorageClient):
    def __init__(self, common_media_path: Optional[str]):
        super().__init__(common_media_path)
        self.client = get_client()

    def get_media(self, uri: str) -> str:
        """Get media url.
        Generate a pre-signed URL for an S3 object. Defaults to 1 hour expiry.

        Args:
            uri (str): media uri.

        Returns:
            str: media URL.
        """
        # Extract the bucket name and key from the full S3 URL
        bucket_name, key = self.get_bucket_and_key(uri)
        # Generate and return the pre-signed URL
        return self.client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": bucket_name,
                "Key": key,
            },
            ExpiresIn=3600,
        )

    def get_media_to_local(self, url: str) -> Union[BytesIO, str]:
        return super().get_media_to_local(url)

    def get_bucket_and_key(self, s3_path: str) -> Tuple[str, str]:
        """Extract the bucket name and key from an S3 URL."""
        path_parts = s3_path.replace("s3://", "").split("/")
        bucket = path_parts.pop(0)
        key = "/".join(path_parts)
        return bucket, key
