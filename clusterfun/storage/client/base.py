from abc import ABC, abstractmethod
from io import BytesIO
from typing import Optional, Union


class BaseStorageClient(ABC):
    def __init__(self, common_media_path: Optional[str]) -> None:
        self.common_media_path = common_media_path

    @abstractmethod
    def get_media(self, uri: str) -> str: ...

    @abstractmethod
    def get_media_to_local(self, url: str) -> Union[BytesIO, str]: ...
