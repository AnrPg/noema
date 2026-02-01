# =============================================================================
# AI GENERATION ROUTES
# =============================================================================

from enum import Enum
from typing import List, Optional

import structlog
from app.services.llm import LLMService
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = structlog.get_logger()
router = APIRouter()


class ModelProvider(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"


class GenerateExplanationRequest(BaseModel):
    content: str
    context: Optional[str] = None
    level: str = "intermediate"  # beginner, intermediate, advanced
    style: str = "concise"  # concise, detailed, socratic


class GenerateExplanationResponse(BaseModel):
    explanation: str
    key_points: List[str]
    related_concepts: List[str]


class GenerateHintsRequest(BaseModel):
    question: str
    answer: str
    num_hints: int = 3


class GenerateHintsResponse(BaseModel):
    hints: List[str]


class GenerateMnemonicRequest(BaseModel):
    content: str
    mnemonic_type: str = "acronym"  # acronym, story, rhyme, visual, method_of_loci


class GenerateMnemonicResponse(BaseModel):
    mnemonic: str
    explanation: str


class SummarizeRequest(BaseModel):
    content: str
    max_length: int = 200
    style: str = "bullet_points"  # bullet_points, paragraph, outline


class SummarizeResponse(BaseModel):
    summary: str
    word_count: int


class ImproveCardRequest(BaseModel):
    front: str
    back: str
    card_type: str
    suggestions: List[str] = []


class ImproveCardResponse(BaseModel):
    improved_front: str
    improved_back: str
    changes: List[str]
    quality_score: float


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[str] = None
    card_id: Optional[str] = None
    provider: ModelProvider = ModelProvider.OPENAI


class ChatResponse(BaseModel):
    response: str
    suggestions: List[str] = []


@router.post("/explain", response_model=GenerateExplanationResponse)
async def generate_explanation(request: GenerateExplanationRequest) -> GenerateExplanationResponse:
    """
    Generate an explanation for complex content.
    """
    logger.info("Generating explanation", level=request.level, style=request.style)

    try:
        llm = LLMService()
        result = await llm.generate_explanation(
            content=request.content,
            context=request.context,
            level=request.level,
            style=request.style,
        )
        return result
    except Exception as e:
        logger.error("Failed to generate explanation", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hints", response_model=GenerateHintsResponse)
async def generate_hints(request: GenerateHintsRequest) -> GenerateHintsResponse:
    """
    Generate progressive hints for a flashcard.
    """
    logger.info("Generating hints", num_hints=request.num_hints)

    try:
        llm = LLMService()
        hints = await llm.generate_hints(
            question=request.question,
            answer=request.answer,
            num_hints=request.num_hints,
        )
        return GenerateHintsResponse(hints=hints)
    except Exception as e:
        logger.error("Failed to generate hints", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mnemonic", response_model=GenerateMnemonicResponse)
async def generate_mnemonic(request: GenerateMnemonicRequest) -> GenerateMnemonicResponse:
    """
    Generate a mnemonic device for memorization.
    """
    logger.info("Generating mnemonic", type=request.mnemonic_type)

    try:
        llm = LLMService()
        result = await llm.generate_mnemonic(
            content=request.content,
            mnemonic_type=request.mnemonic_type,
        )
        return result
    except Exception as e:
        logger.error("Failed to generate mnemonic", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_content(request: SummarizeRequest) -> SummarizeResponse:
    """
    Summarize content for quick review.
    """
    logger.info("Summarizing content", max_length=request.max_length, style=request.style)

    try:
        llm = LLMService()
        summary = await llm.summarize(
            content=request.content,
            max_length=request.max_length,
            style=request.style,
        )
        return SummarizeResponse(
            summary=summary,
            word_count=len(summary.split()),
        )
    except Exception as e:
        logger.error("Failed to summarize content", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/improve-card", response_model=ImproveCardResponse)
async def improve_card(request: ImproveCardRequest) -> ImproveCardResponse:
    """
    Improve a flashcard's quality using AI.
    """
    logger.info("Improving card", card_type=request.card_type)

    try:
        llm = LLMService()
        result = await llm.improve_card(
            front=request.front,
            back=request.back,
            card_type=request.card_type,
            suggestions=request.suggestions,
        )
        return result
    except Exception as e:
        logger.error("Failed to improve card", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat", response_model=ChatResponse)
async def chat_with_tutor(request: ChatRequest) -> ChatResponse:
    """
    Chat with AI tutor for learning assistance.
    """
    logger.info(
        "Chat request",
        message_count=len(request.messages),
        provider=request.provider,
    )

    try:
        llm = LLMService(provider=request.provider.value)
        result = await llm.chat(
            messages=request.messages,
            context=request.context,
            card_id=request.card_id,
        )
        return result
    except Exception as e:
        logger.error("Chat failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/question-variations")
async def generate_question_variations(
    question: str,
    num_variations: int = 3,
) -> dict:
    """
    Generate variations of a question for diverse practice.
    """
    logger.info("Generating question variations", num_variations=num_variations)

    try:
        llm = LLMService()
        variations = await llm.generate_question_variations(
            question=question,
            num_variations=num_variations,
        )
        return {"original": question, "variations": variations}
    except Exception as e:
        logger.error("Failed to generate variations", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
