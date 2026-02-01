# =============================================================================
# MANTHANEIN AI SERVICE - MAIN APPLICATION
# =============================================================================

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import (
    analyze,
    audio,
    embed,
    generate,
    health,
    ocr,
    parse,
)
from app.services.redis_client import redis_client
from app.services.vector_store import vector_store

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
        if settings.ENV == "production"
        else structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan events."""
    # Startup
    logger.info("Starting Manthanein AI Service", version="1.0.0")

    # Initialize vector store
    await vector_store.initialize()
    logger.info("Vector store initialized")

    # Initialize Redis
    await redis_client.initialize()
    logger.info("Redis client initialized")

    yield

    # Shutdown
    logger.info("Shutting down Manthanein AI Service")
    await redis_client.close()
    await vector_store.close()


# Create FastAPI application
app = FastAPI(
    title="Manthanein AI Service",
    description="AI-powered document parsing, embeddings, and intelligent learning features",
    version="1.0.0",
    docs_url="/docs" if settings.ENV != "production" else None,
    redoc_url="/redoc" if settings.ENV != "production" else None,
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router, tags=["Health"])
app.include_router(parse.router, prefix="/api/v1/parse", tags=["Document Parsing"])
app.include_router(embed.router, prefix="/api/v1/embed", tags=["Embeddings"])
app.include_router(generate.router, prefix="/api/v1/generate", tags=["Generation"])
app.include_router(analyze.router, prefix="/api/v1/analyze", tags=["Analysis"])
app.include_router(recommend.router, prefix="/api/v1/recommend", tags=["Recommendations"])
app.include_router(ocr.router, prefix="/api/v1/ocr", tags=["OCR"])
app.include_router(audio.router, prefix="/api/v1/audio", tags=["Audio"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENV == "development",
        workers=settings.WORKERS if settings.ENV == "production" else 1,
    )
