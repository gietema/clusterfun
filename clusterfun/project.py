"""
project.py
==========

Public API for working with project-level labels.
"""

from typing import Dict, List, Optional

import pandas as pd

from clusterfun.storage.backends import get_backend


def list_projects() -> List[str]:
    """List all project names."""
    return get_backend().list_projects()


def get_labels(project: str) -> Dict[str, List[str]]:
    """Get all labels for a project, keyed by original media path.

    Parameters
    ----------
    project : str
        The project name.

    Returns
    -------
    Dict[str, List[str]]
        A mapping from media path to list of label strings.
    """
    backend = get_backend()
    if not backend.project_json_exists(project, "labels.json"):
        return {}
    return backend.load_project_json(project, "labels.json")


def get_labels_df(project: str, label: Optional[str] = None) -> pd.DataFrame:
    """Get project labels as a DataFrame with media_path and per-label columns.

    Parameters
    ----------
    project : str
        The project name.
    label : str, optional
        If provided, filter to only items with this label.

    Returns
    -------
    pd.DataFrame
        DataFrame with 'media_path' column and one boolean column per label.
    """
    labels = get_labels(project)
    if not labels:
        return pd.DataFrame(columns=["media_path"])
    df = pd.DataFrame(
        [(path, "|".join(label_list)) for path, label_list in labels.items()],
        columns=["media_path", "_labels"],
    )
    df = df.join(df["_labels"].str.get_dummies(sep="|"))
    df = df.drop("_labels", axis=1)
    if label:
        df = df[df[label] == 1]
    return df
