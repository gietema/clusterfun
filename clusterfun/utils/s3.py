"""Utilities for working with S3."""
import os
from functools import lru_cache
from typing import Tuple

import boto3
from botocore.client import Config as BotoConfig


@lru_cache()
def get_client() -> boto3.client:
    """Get an S3 client."""
    s3 = boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION"),
        config=BotoConfig(region_name=os.environ.get("AWS_REGION"), signature_version="s3v4"),
    )
    return s3


def get_presigned_url(s3_url: str) -> str:
    """Generate a pre-signed URL for an S3 object. Defaults to 1 hour expiry."""
    # Extract the bucket name and key from the full S3 URL
    bucket_name, key = get_bucket_and_key(s3_url)
    # Generate and return the pre-signed URL
    return get_client().generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": bucket_name,
            "Key": key,
        },
        ExpiresIn=3600,
    )


def get_bucket_and_key(s3_path: str) -> Tuple[str, str]:
    """Extract the bucket name and key from an S3 URL."""
    path_parts = s3_path.replace("s3://", "").split("/")
    bucket = path_parts.pop(0)
    key = "/".join(path_parts)
    return bucket, key
