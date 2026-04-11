"""Annotation manager for CRUD annotation management on media items."""

from typing import Any, Dict, List, Optional

from clusterfun.storage.backends.base import StorageBackend

ANNOTATIONS_FILE = "annotations.json"


class AnnotationManager:
    """CRUD for spatial annotations (rectangles, polygons) on media items."""

    def __init__(self, uuid: str, backend: StorageBackend):
        self.uuid = uuid
        self.backend = backend

    def _read_all(self) -> Dict[str, List[Dict[str, Any]]]:
        """Read all annotations from storage. Returns {media_id: [annotation, ...]}."""
        if not self.backend.json_exists(self.uuid, ANNOTATIONS_FILE):
            return {}
        return self.backend.load_json(self.uuid, ANNOTATIONS_FILE)

    def _write_all(self, data: Dict[str, List[Dict[str, Any]]]):
        """Write all annotations to storage."""
        self.backend.save_json(self.uuid, ANNOTATIONS_FILE, data)

    def get_annotations(self, media_id: int) -> List[Dict[str, Any]]:
        """Get annotations for a single media item."""
        data = self._read_all()
        return data.get(str(media_id), [])

    def save_annotations(self, media_id: int, annotations: List[Dict[str, Any]]):
        """Save (replace) all annotations for a single media item."""
        data = self._read_all()
        if annotations:
            data[str(media_id)] = annotations
        else:
            data.pop(str(media_id), None)
        self._write_all(data)

    def delete_annotation(self, media_id: int, annotation_id: str):
        """Delete a single annotation by ID."""
        data = self._read_all()
        key = str(media_id)
        if key in data:
            data[key] = [a for a in data[key] if a.get("id") != annotation_id]
            if not data[key]:
                del data[key]
            self._write_all(data)

    def get_all_annotations(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get all annotations for all media items."""
        return self._read_all()

    def get_annotation_counts(self) -> Dict[str, int]:
        """Get count of annotations per media item."""
        data = self._read_all()
        return {k: len(v) for k, v in data.items()}

    def export(
        self, media_ids: Optional[List[int]] = None
    ) -> List[Dict[str, Any]]:
        """Export annotations as a flat list with media_id included.

        Returns a list of dicts, each with media_id plus the annotation fields.
        """
        data = self._read_all()
        result = []
        for mid_str, annotations in data.items():
            mid = int(mid_str)
            if media_ids and mid not in media_ids:
                continue
            for ann in annotations:
                result.append({"media_id": mid, **ann})
        return result
