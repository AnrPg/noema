# =============================================================================
# VECTOR STORE SERVICE (Qdrant Wrapper)
# =============================================================================

from typing import Dict, List, Optional

import structlog

from app.config import settings

logger = structlog.get_logger()


class VectorStore:
    """
    Vector store service wrapping Qdrant for semantic search.
    """

    _instance = None
    _client = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self):
        """Initialize connection to Qdrant."""
        if self._initialized:
            return

        try:
            from qdrant_client import QdrantClient

            self._client = QdrantClient(
                host=settings.QDRANT_HOST,
                port=settings.QDRANT_PORT,
            )

            # Create default collections
            await self._ensure_collections()

            self._initialized = True
            logger.info("Vector store initialized", host=settings.QDRANT_HOST)
        except Exception as e:
            logger.error("Failed to initialize vector store", error=str(e))
            # Don't fail startup if Qdrant isn't available
            self._initialized = False

    async def _ensure_collections(self):
        """Ensure required collections exist."""
        from qdrant_client.http.models import Distance, VectorParams

        collections_config = {
            "documents": 384,  # sentence-transformers dimension
            "cards": 384,
            "users": 384,
        }

        existing = {c.name for c in self._client.get_collections().collections}

        for name, dim in collections_config.items():
            if name not in existing:
                self._client.create_collection(
                    collection_name=name,
                    vectors_config=VectorParams(
                        size=dim,
                        distance=Distance.COSINE,
                    ),
                )
                logger.info("Created collection", name=name)

    async def close(self):
        """Close vector store connection."""
        if self._client:
            self._client.close()
            self._initialized = False
            logger.info("Vector store connection closed")

    @property
    def client(self):
        """Get the Qdrant client."""
        return self._client

    @property
    def is_available(self) -> bool:
        """Check if vector store is available."""
        return self._initialized and self._client is not None

    async def upsert(
        self,
        collection: str,
        ids: List[str],
        vectors: List[List[float]],
        payloads: Optional[List[Dict]] = None,
    ) -> bool:
        """Upsert vectors into collection."""
        if not self.is_available:
            logger.warning("Vector store not available")
            return False

        from qdrant_client.http.models import PointStruct

        points = []
        for i, (id_, vector) in enumerate(zip(ids, vectors)):
            payload = payloads[i] if payloads and i < len(payloads) else {}
            payload["id"] = id_

            points.append(
                PointStruct(
                    id=hash(id_) % (2**63),
                    vector=vector,
                    payload=payload,
                )
            )

        self._client.upsert(
            collection_name=collection,
            points=points,
        )

        return True

    async def search(
        self,
        collection: str,
        vector: List[float],
        limit: int = 10,
        filters: Optional[Dict] = None,
    ) -> List[Dict]:
        """Search for similar vectors."""
        if not self.is_available:
            return []

        from qdrant_client.http.models import FieldCondition, Filter, MatchValue

        query_filter = None
        if filters:
            conditions = [
                FieldCondition(key=k, match=MatchValue(value=v)) for k, v in filters.items()
            ]
            query_filter = Filter(must=conditions)

        results = self._client.search(
            collection_name=collection,
            query_vector=vector,
            limit=limit,
            query_filter=query_filter,
        )

        return [
            {
                "id": r.payload.get("id"),
                "score": r.score,
                "payload": r.payload,
            }
            for r in results
        ]

    async def delete(
        self,
        collection: str,
        ids: List[str],
    ) -> bool:
        """Delete vectors by ID."""
        if not self.is_available:
            return False

        from qdrant_client.http.models import FieldCondition, Filter, MatchValue

        for id_ in ids:
            self._client.delete(
                collection_name=collection,
                points_selector=Filter(
                    must=[FieldCondition(key="id", match=MatchValue(value=id_))]
                ),
            )

        return True


# Singleton instance
vector_store = VectorStore()
