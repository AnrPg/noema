# =============================================================================
# HEALTH CHECK ROUTES
# =============================================================================

from datetime import datetime

from app.services.redis_client import redis_client
from app.services.vector_store import vector_store
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    services: dict


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Check service health and dependencies."""
    services = {
        "vector_store": await vector_store.health_check(),
        "redis": await redis_client.health_check(),
    }

    all_healthy = all(s.get("status") == "healthy" for s in services.values())

    return HealthResponse(
        status="healthy" if all_healthy else "degraded",
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0",
        services=services,
    )


@router.get("/ready")
async def readiness_check() -> dict:
    """Kubernetes readiness probe."""
    return {"ready": True}


@router.get("/live")
async def liveness_check() -> dict:
    """Kubernetes liveness probe."""
    return {"live": True}
