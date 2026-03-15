"""Project routes for listing and browsing projects."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from clusterfun.storage.backends import get_backend

router = APIRouter()


class RenameViewRequest(BaseModel):
    title: str


@router.get("/api/projects")
def list_projects() -> List[Dict[str, Any]]:
    """List all projects with summary stats."""
    backend = get_backend()
    try:
        names = backend.list_projects()
    except NotImplementedError:
        return []

    results = []
    for name in names:
        manifest = backend.load_project_json(name, "project.json")
        label_count = 0
        if backend.project_json_exists(name, "labels.json"):
            labels = backend.load_project_json(name, "labels.json")
            label_count = len(labels)
        results.append({
            "name": manifest["name"],
            "created_at": manifest.get("created_at", ""),
            "view_count": len(manifest.get("views", [])),
            "label_count": label_count,
        })

    results.sort(key=lambda p: p["created_at"], reverse=True)
    return results


@router.get("/api/projects/{name}")
def get_project(name: str) -> Dict[str, Any]:
    """Get project details with all its views."""
    backend = get_backend()
    if not backend.project_json_exists(name, "project.json"):
        raise HTTPException(status_code=404, detail=f"Project '{name}' not found")

    manifest = backend.load_project_json(name, "project.json")

    label_count = 0
    label_names: List[str] = []
    if backend.project_json_exists(name, "labels.json"):
        labels = backend.load_project_json(name, "labels.json")
        label_count = len(labels)
        all_labels = set()
        for label_list in labels.values():
            all_labels.update(label_list)
        label_names = sorted(all_labels)

    views = []
    for view in manifest.get("views", []):
        view_info: Dict[str, Any] = {
            "uuid": view["uuid"],
            "type": view.get("type", "unknown"),
            "created_at": view.get("created_at", ""),
        }
        # Try to get title from the view's config
        try:
            config = backend.load_json(view["uuid"], "config.json")
            if config.get("title"):
                view_info["title"] = config["title"]
        except (FileNotFoundError, OSError):
            pass
        views.append(view_info)

    return {
        "name": manifest["name"],
        "created_at": manifest.get("created_at", ""),
        "label_count": label_count,
        "label_names": label_names,
        "views": views,
    }


@router.delete("/api/projects/{name}/views/{view_uuid}")
def delete_view(name: str, view_uuid: str) -> str:
    """Remove a view from a project."""
    backend = get_backend()
    if not backend.project_json_exists(name, "project.json"):
        raise HTTPException(status_code=404, detail=f"Project '{name}' not found")

    manifest = backend.load_project_json(name, "project.json")
    original_len = len(manifest.get("views", []))
    manifest["views"] = [v for v in manifest.get("views", []) if v["uuid"] != view_uuid]
    if len(manifest["views"]) == original_len:
        raise HTTPException(status_code=404, detail="View not found in project")

    backend.save_project_json(name, "project.json", manifest)
    return "OK"


@router.patch("/api/projects/{name}/views/{view_uuid}")
def rename_view(name: str, view_uuid: str, req: RenameViewRequest) -> str:
    """Rename a view (update its title in config.json)."""
    backend = get_backend()
    if not backend.json_exists(view_uuid, "config.json"):
        raise HTTPException(status_code=404, detail="View not found")

    config = backend.load_json(view_uuid, "config.json")
    config["title"] = req.title
    backend.save_json(view_uuid, "config.json", config)
    return "OK"
