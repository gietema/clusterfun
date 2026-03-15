"""Annotation models for spatial annotations on media items."""

from typing import List, Optional, Union

from pydantic import BaseModel


class RectangleData(BaseModel):
    xmin: float
    ymin: float
    xmax: float
    ymax: float


class PolygonData(BaseModel):
    points: List[List[float]]


class Annotation(BaseModel):
    id: str
    type: str  # "rectangle" or "polygon"
    label: str
    color: Optional[str] = None
    data: Union[RectangleData, PolygonData]


class AnnotationPayload(BaseModel):
    media_id: int
    annotations: List[Annotation]
