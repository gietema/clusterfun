"""Column info model for describing DataFrame column metadata."""

from pydantic import BaseModel


class ColumnInfo(BaseModel):
    """A class representing a column with name and dtype attributes."""

    name: str
    dtype: str
    n_unique: int = 0
