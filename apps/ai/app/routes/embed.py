# =============================================================================
# EMBEDDING ROUTES
# =============================================================================

from typing import List, Optional

import structlog
from app.services.embeddings import EmbeddingService
from app.services.vector_store import vector_store
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = structlog.get_logger()
router = APIRouter()


class EmbedRequest(BaseModel):
    texts: List[str]
    model: Optional[str] = None


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    model: str
    dimensions: int
    usage: dict


class SearchRequest(BaseModel):
    query: str
    user_id: str
    deck_id: Optional[str] = None
    limit: int = 10
    threshold: float = 0.7


class SearchResult(BaseModel):
    card_id: str
    score: float
    content: str
    metadata: dict


class SearchResponse(BaseModel):
    results: List[SearchResult]
    query: str
    total: int


class IndexCardRequest(BaseModel):
    card_id: str
    user_id: str
    deck_id: str
    content: str
    card_type: str
    tags: List[str] = []
    metadata: dict = {}


@router.post("/text", response_model=EmbedResponse)
async def embed_text(request: EmbedRequest) -> EmbedResponse:
    """
    Generate embeddings for text content.
    """
    if len(request.texts) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 texts per request")

    if any(len(t) > 8000 for t in request.texts):
        raise HTTPException(
            status_code=400, detail="Text exceeds maximum length of 8000 characters"
        )

    logger.info("Generating embeddings", count=len(request.texts))

    try:
        embedding_service = EmbeddingService()
        result = await embedding_service.embed(request.texts, model=request.model)

        logger.info(
            "Embeddings generated",
            count=len(result.embeddings),
            dimensions=result.dimensions,
        )

        return result

    except Exception as e:
        logger.error("Failed to generate embeddings", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to generate embeddings: {str(e)}")


@router.post("/search", response_model=SearchResponse)
async def semantic_search(request: SearchRequest) -> SearchResponse:
    """
    Perform semantic search across user's cards.
    """
    logger.info(
        "Semantic search",
        user_id=request.user_id,
        deck_id=request.deck_id,
        query_length=len(request.query),
    )

    try:
        # Generate query embedding
        embedding_service = EmbeddingService()
        query_embedding = await embedding_service.embed_single(request.query)

        # Search vector store
        results = await vector_store.search(
            vector=query_embedding,
            user_id=request.user_id,
            deck_id=request.deck_id,
            limit=request.limit,
            threshold=request.threshold,
        )

        logger.info("Search completed", results=len(results))

        return SearchResponse(
            results=results,
            query=request.query,
            total=len(results),
        )

    except Exception as e:
        logger.error("Semantic search failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/index")
async def index_card(request: IndexCardRequest) -> dict:
    """
    Index a card for semantic search.
    """
    logger.info("Indexing card", card_id=request.card_id, user_id=request.user_id)

    try:
        # Generate embedding
        embedding_service = EmbeddingService()
        embedding = await embedding_service.embed_single(request.content)

        # Store in vector database
        await vector_store.upsert(
            id=request.card_id,
            vector=embedding,
            payload={
                "user_id": request.user_id,
                "deck_id": request.deck_id,
                "card_type": request.card_type,
                "content": request.content[:500],  # Store truncated content
                "tags": request.tags,
                **request.metadata,
            },
        )

        logger.info("Card indexed", card_id=request.card_id)

        return {"status": "indexed", "card_id": request.card_id}

    except Exception as e:
        logger.error("Failed to index card", card_id=request.card_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to index card: {str(e)}")


@router.delete("/index/{card_id}")
async def remove_card_from_index(card_id: str) -> dict:
    """
    Remove a card from the search index.
    """
    logger.info("Removing card from index", card_id=card_id)

    try:
        await vector_store.delete(card_id)
        return {"status": "deleted", "card_id": card_id}
    except Exception as e:
        logger.error("Failed to remove card from index", card_id=card_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to remove card: {str(e)}")


@router.post("/similar/{card_id}")
async def find_similar_cards(
    card_id: str,
    user_id: str,
    limit: int = 5,
) -> SearchResponse:
    """
    Find cards similar to a given card.
    """
    logger.info("Finding similar cards", card_id=card_id, user_id=user_id)

    try:
        # Get the card's vector
        card_vector = await vector_store.get_vector(card_id)

        if not card_vector:
            raise HTTPException(status_code=404, detail="Card not found in index")

        # Search for similar cards (excluding the source card)
        results = await vector_store.search(
            vector=card_vector,
            user_id=user_id,
            limit=limit + 1,  # Get one extra to filter out source
            threshold=0.5,
        )

        # Filter out the source card
        results = [r for r in results if r.card_id != card_id][:limit]

        return SearchResponse(
            results=results,
            query=f"similar_to:{card_id}",
            total=len(results),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to find similar cards", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to find similar cards: {str(e)}")
