"""Drill discovery endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends

from learner.api.v1.dependencies import drill_registry
from learner.drills.registry import DrillRegistry

router = APIRouter()
Registry = Annotated[DrillRegistry, Depends(drill_registry)]


@router.get("/drills")
def list_drills(registry: Registry) -> dict:
    return {
        "drills": [
            {
                "id": drill.id,
                "name": drill.name,
                "description": drill.description,
                "version": drill.version,
                "config_schema": drill.config_schema().model_dump(exclude_none=True),
            }
            for drill in registry.list()
        ]
    }
