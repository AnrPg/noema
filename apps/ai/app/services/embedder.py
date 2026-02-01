# =============================================================================
# EMBEDDING SERVICE
# =============================================================================

from typing import Dict, List, Optional

import numpy as np
import structlog

from app.config import settings

logger = structlog.get_logger()


class EmbeddingService:
    """
    Service for generating and managing text embeddings.
    Uses sentence-transformers for local embedding generation.
    """

    _instance = None
    _model = None
    _qdrant_client = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._model is None:
            self._initialize()

    def _initialize(self):
        """Initialize embedding model and Qdrant client."""
        from qdrant_client import QdrantClient
        from sentence_transformers import SentenceTransformer

        logger.info("Initializing embedding service", model=settings.EMBEDDING_MODEL)

        # Load embedding model
        self._model = SentenceTransformer(settings.EMBEDDING_MODEL)
        self._embedding_dim = self._model.get_sentence_embedding_dimension()

        # Initialize Qdrant client
        self._qdrant_client = QdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )

        # Ensure default collection exists
        self._ensure_collection("documents")
        self._ensure_collection("cards")

        logger.info(
            "Embedding service initialized",
            embedding_dim=self._embedding_dim,
        )

    def _ensure_collection(self, collection_name: str):
        """Ensure a Qdrant collection exists."""
        from qdrant_client.http.models import Distance, VectorParams

        collections = self._qdrant_client.get_collections().collections
        exists = any(c.name == collection_name for c in collections)

        if not exists:
            self._qdrant_client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=self._embedding_dim,
                    distance=Distance.COSINE,
                ),
            )
            logger.info("Created collection", collection=collection_name)

    async def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Input text

        Returns:
            Embedding vector as list of floats
        """
        embedding = self._model.encode(text, convert_to_numpy=True)
        return embedding.tolist()

    async def embed_batch(
        self,
        texts: List[str],
        batch_size: int = 32,
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.

        Args:
            texts: List of input texts
            batch_size: Batch size for processing

        Returns:
            List of embedding vectors
        """
        embeddings = self._model.encode(
            texts,
            batch_size=batch_size,
            convert_to_numpy=True,
            show_progress_bar=len(texts) > 100,
        )
        return embeddings.tolist()

    async def store_embeddings(
        self,
        collection: str,
        ids: List[str],
        texts: List[str],
        metadata: Optional[List[Dict]] = None,
    ) -> Dict:
        """
        Store embeddings in Qdrant.

        Args:
            collection: Collection name
            ids: Unique IDs for each text
            texts: Texts to embed and store
            metadata: Optional metadata for each text

        Returns:
            Storage result
        """
        from qdrant_client.http.models import PointStruct

        self._ensure_collection(collection)

        # Generate embeddings
        embeddings = await self.embed_batch(texts)

        # Prepare points
        points = []
        for i, (id_, text, embedding) in enumerate(zip(ids, texts, embeddings)):
            payload = {
                "text": text,
                "id": id_,
            }
            if metadata and i < len(metadata):
                payload.update(metadata[i])

            points.append(
                PointStruct(
                    id=hash(id_) % (2**63),  # Convert string ID to int
                    vector=embedding,
                    payload=payload,
                )
            )

        # Upsert points
        self._qdrant_client.upsert(
            collection_name=collection,
            points=points,
        )

        logger.info(
            "Stored embeddings",
            collection=collection,
            count=len(points),
        )

        return {
            "stored": len(points),
            "collection": collection,
        }

    async def search_similar(
        self,
        collection: str,
        query: str,
        limit: int = 10,
        score_threshold: float = 0.0,
        filters: Optional[Dict] = None,
    ) -> List[Dict]:
        """
        Search for similar texts.

        Args:
            collection: Collection to search
            query: Query text
            limit: Maximum results
            score_threshold: Minimum similarity score
            filters: Optional filters

        Returns:
            List of similar texts with scores
        """
        from qdrant_client.http.models import FieldCondition, Filter, MatchValue

        # Generate query embedding
        query_embedding = await self.embed_text(query)

        # Build filter if provided
        qdrant_filter = None
        if filters:
            conditions = []
            for key, value in filters.items():
                conditions.append(
                    FieldCondition(
                        key=key,
                        match=MatchValue(value=value),
                    )
                )
            qdrant_filter = Filter(must=conditions)

        # Search
        results = self._qdrant_client.search(
            collection_name=collection,
            query_vector=query_embedding,
            limit=limit,
            score_threshold=score_threshold,
            query_filter=qdrant_filter,
        )

        return [
            {
                "id": r.payload.get("id"),
                "text": r.payload.get("text"),
                "score": r.score,
                "metadata": {k: v for k, v in r.payload.items() if k not in ["id", "text"]},
            }
            for r in results
        ]

    async def search_by_vector(
        self,
        collection: str,
        vector: List[float],
        limit: int = 10,
        score_threshold: float = 0.0,
    ) -> List[Dict]:
        """
        Search by vector directly.

        Args:
            collection: Collection to search
            vector: Query vector
            limit: Maximum results
            score_threshold: Minimum similarity score

        Returns:
            List of similar texts with scores
        """
        results = self._qdrant_client.search(
            collection_name=collection,
            query_vector=vector,
            limit=limit,
            score_threshold=score_threshold,
        )

        return [
            {
                "id": r.payload.get("id"),
                "text": r.payload.get("text"),
                "score": r.score,
                "metadata": {k: v for k, v in r.payload.items() if k not in ["id", "text"]},
            }
            for r in results
        ]

    async def delete_embeddings(
        self,
        collection: str,
        ids: List[str],
    ) -> Dict:
        """
        Delete embeddings by ID.

        Args:
            collection: Collection name
            ids: IDs to delete

        Returns:
            Deletion result
        """
        from qdrant_client.http.models import FieldCondition, Filter, MatchValue

        # Delete by payload ID
        for id_ in ids:
            self._qdrant_client.delete(
                collection_name=collection,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="id",
                            match=MatchValue(value=id_),
                        )
                    ]
                ),
            )

        logger.info("Deleted embeddings", collection=collection, count=len(ids))

        return {"deleted": len(ids)}

    async def get_collection_stats(self, collection: str) -> Dict:
        """
        Get collection statistics.

        Args:
            collection: Collection name

        Returns:
            Collection stats
        """
        info = self._qdrant_client.get_collection(collection)

        return {
            "collection": collection,
            "vectors_count": info.vectors_count,
            "points_count": info.points_count,
            "status": info.status.value,
            "config": {
                "vector_size": info.config.params.vectors.size,
                "distance": info.config.params.vectors.distance.value,
            },
        }

    def cosine_similarity(
        self,
        vec1: List[float],
        vec2: List[float],
    ) -> float:
        """
        Calculate cosine similarity between two vectors.

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Cosine similarity score
        """
        a = np.array(vec1)
        b = np.array(vec2)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    async def find_clusters(
        self,
        collection: str,
        n_clusters: int = 5,
        sample_size: int = 1000,
    ) -> List[Dict]:
        """
        Find clusters in embeddings using K-means.

        Args:
            collection: Collection to analyze
            n_clusters: Number of clusters
            sample_size: Number of points to sample

        Returns:
            Cluster information
        """
        from sklearn.cluster import KMeans

        # Get sample of points
        points, _ = self._qdrant_client.scroll(
            collection_name=collection,
            limit=sample_size,
            with_vectors=True,
        )

        if not points:
            return []

        vectors = np.array([p.vector for p in points])

        # Cluster
        kmeans = KMeans(n_clusters=min(n_clusters, len(points)), random_state=42)
        labels = kmeans.fit_predict(vectors)

        # Build cluster info
        clusters = []
        for i in range(n_clusters):
            cluster_points = [p for p, l in zip(points, labels) if l == i]
            clusters.append(
                {
                    "cluster_id": i,
                    "size": len(cluster_points),
                    "sample_texts": [p.payload.get("text", "")[:100] for p in cluster_points[:5]],
                }
            )

        return clusters
