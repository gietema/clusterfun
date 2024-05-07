"""Base class for storage clients."""
from abc import ABC, abstractmethod
from io import BytesIO
from typing import Optional, Union


class BaseStorageClient(ABC):
    """
    Base class for storage clients.
    """

    def __init__(self, common_media_path: Optional[str]) -> None:
        """
        Initialize the storage client.

        Parameters:
        - common_media_path: The common media path.
            This is the path where all media files are stored.
        """
        self.common_media_path = common_media_path

    @abstractmethod
    def get_media(self, uri: str) -> str:
        """
        Get media from storage.

        Parameters:
        - uri: The URI of the media file.

        Returns:
        - The URL of the media file.
            For example, for AWS S3, this could be a signed URL based on the URI.
        """

    @abstractmethod
    def get_media_to_local(self, url: str) -> Union[BytesIO, str]:
        """
        Get media from storage to local.

        Parameters:
        - url: The URL of the media file.

        Returns:
        - The media file as a BytesIO object, if the media file is downloaded.
        - Or simply the URL of the media file, if the media file is not downloaded.
        """
