# =============================================================================
# AI SERVICE CONFIGURATION
# =============================================================================

from functools import lru_cache
from typing import List, Union

from pydantic import field_validator
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
    CORS_ORIGINS: Union[str, List[str]] = ["http://localhost:3000", "http://localhost:8081"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # API Keys
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""

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
    GOOGLE_MODEL: str = "gemini-pro"
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
