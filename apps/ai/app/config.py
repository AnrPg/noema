# =============================================================================
# AI SERVICE CONFIGURATION


CMD[
    "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"
]  # Run the application    CMD curl -f http://localhost:8000/health || exit 1HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \# Health checkEXPOSE 8000# Expose portUSER appuser# Switch to non-root userRUN chown -R appuser:appuser /app# Change ownershipCOPY app/ ./app/# Copy application code    rm -rf ~/.cache/pip    pip install . && \RUN pip install --upgrade pip && \COPY pyproject.toml ./# Install Python dependenciesWORKDIR /app# Set work directoryRUN useradd --create-home --shell /bin/bash appuser# Create non-root user    && rm -rf /var/lib/apt/lists/*    ffmpeg \    poppler-utils \    libmagic1 \    libleptonica-dev \    libtesseract-dev \    tesseract-ocr-spa \    tesseract-ocr-deu \    tesseract-ocr-fra \    tesseract-ocr-eng \    tesseract-ocr \    libpq-dev \    git \    curl \    build-essential \RUN apt-get update && apt-get install -y --no-install-recommends \# Install system dependencies    PIP_DISABLE_PIP_VERSION_CHECK=1    PIP_NO_CACHE_DIR=1 \    PYTHONUNBUFFERED=1 \ENV PYTHONDONTWRITEBYTECODE=1 \# Set environment variablesFROM python:3.11-slim# =============================================================================# =============================================================================

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    # Application
    ENV: str = "development"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    DEBUG: bool = False

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8081"]

    # API Keys
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GOOGLE_AI_API_KEY: str = ""

    # Vector Store (Qdrant)
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION: str = "manthanein_cards"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # S3/MinIO
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "manthanein"

    # Model Configuration
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSIONS: int = 384
    OPENAI_MODEL: str = "gpt-4-turbo-preview"
    ANTHROPIC_MODEL: str = "claude-3-opus-20240229"
    LOCAL_EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # Processing Limits
    MAX_FILE_SIZE_MB: int = 50
    MAX_PAGES_PER_PDF: int = 500
    MAX_CONCURRENT_JOBS: int = 10

    # Cache TTL (seconds)
    EMBEDDING_CACHE_TTL: int = 86400  # 24 hours
    GENERATION_CACHE_TTL: int = 3600  # 1 hour

    # API Service
    API_SERVICE_URL: str = "http://localhost:3000"
    API_SERVICE_KEY: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
