# =============================================================================
# CONTENT ANALYSIS ROUTES
# =============================================================================

from typing import Dict, List, Optional

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.analyzer import ContentAnalyzer

logger = structlog.get_logger()
router = APIRouter()


class AnalyzeComplexityRequest(BaseModel):
    content: str
    context: Optional[str] = None


class ComplexityAnalysis(BaseModel):
    overall_score: float  # 0-1 scale
    vocabulary_level: str  # basic, intermediate, advanced, technical
    sentence_complexity: float
    concept_density: float
    prerequisite_concepts: List[str]
    key_terms: List[Dict[str, str]]  # term, definition
    estimated_study_time_minutes: int


class AnalyzePrerequisitesRequest(BaseModel):
    topic: str
    user_knowledge: List[str] = []


class PrerequisiteAnalysis(BaseModel):
    prerequisites: List[Dict[str, str]]  # concept, description, importance
    learning_path: List[str]
    estimated_hours: int


class AnalyzeKnowledgeGapRequest(BaseModel):
    user_id: str
    topic: str
    performance_data: List[Dict]  # card_id, accuracy, response_time


class KnowledgeGapAnalysis(BaseModel):
    gaps: List[Dict[str, str]]  # concept, severity, recommendation
    strengths: List[str]
    recommended_cards: List[str]
    study_suggestions: List[str]


class ExtractConceptsRequest(BaseModel):
    content: str
    max_concepts: int = 20


class ConceptExtraction(BaseModel):
    concepts: List[Dict[str, str]]  # name, definition, importance
    relationships: List[Dict[str, str]]  # from_concept, to_concept, relationship_type
    concept_map: Dict  # hierarchical structure


class DetectLanguageRequest(BaseModel):
    text: str


class LanguageDetectionResponse(BaseModel):
    language: str
    language_name: str
    confidence: float


@router.post("/complexity", response_model=ComplexityAnalysis)
async def analyze_complexity(request: AnalyzeComplexityRequest) -> ComplexityAnalysis:
    """
    Analyze the complexity of content for appropriate card generation.
    """
    logger.info("Analyzing complexity", content_length=len(request.content))

    try:
        analyzer = ContentAnalyzer()
        result = await analyzer.analyze_complexity(
            content=request.content,
            context=request.context,
        )
        return result
    except Exception as e:
        logger.error("Complexity analysis failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prerequisites", response_model=PrerequisiteAnalysis)
async def analyze_prerequisites(request: AnalyzePrerequisitesRequest) -> PrerequisiteAnalysis:
    """
    Identify prerequisite knowledge for a topic.
    """
    logger.info("Analyzing prerequisites", topic=request.topic)

    try:
        analyzer = ContentAnalyzer()
        result = await analyzer.analyze_prerequisites(
            topic=request.topic,
            user_knowledge=request.user_knowledge,
        )
        return result
    except Exception as e:
        logger.error("Prerequisite analysis failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/knowledge-gaps", response_model=KnowledgeGapAnalysis)
async def analyze_knowledge_gaps(request: AnalyzeKnowledgeGapRequest) -> KnowledgeGapAnalysis:
    """
    Identify knowledge gaps based on user performance.
    """
    logger.info(
        "Analyzing knowledge gaps",
        user_id=request.user_id,
        topic=request.topic,
    )

    try:
        analyzer = ContentAnalyzer()
        result = await analyzer.analyze_knowledge_gaps(
            user_id=request.user_id,
            topic=request.topic,
            performance_data=request.performance_data,
        )
        return result
    except Exception as e:
        logger.error("Knowledge gap analysis failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/concepts", response_model=ConceptExtraction)
async def extract_concepts(request: ExtractConceptsRequest) -> ConceptExtraction:
    """
    Extract concepts and relationships from content.
    """
    logger.info(
        "Extracting concepts",
        content_length=len(request.content),
        max_concepts=request.max_concepts,
    )

    try:
        analyzer = ContentAnalyzer()
        result = await analyzer.extract_concepts(
            content=request.content,
            max_concepts=request.max_concepts,
        )
        return result
    except Exception as e:
        logger.error("Concept extraction failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect-language", response_model=LanguageDetectionResponse)
async def detect_language(request: DetectLanguageRequest) -> LanguageDetectionResponse:
    """
    Detect the language of text content.
    """
    try:
        analyzer = ContentAnalyzer()
        result = await analyzer.detect_language(request.text)
        return result
    except Exception as e:
        logger.error("Language detection failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/difficulty-calibration")
async def calibrate_difficulty(
    user_id: str,
    card_ids: List[str],
    performance_history: List[Dict],
) -> Dict:
    """
    Calibrate card difficulties based on user performance.
    """
    logger.info(
        "Calibrating difficulty",
        user_id=user_id,
        card_count=len(card_ids),
    )

    try:
        analyzer = ContentAnalyzer()
        result = await analyzer.calibrate_difficulty(
            user_id=user_id,
            card_ids=card_ids,
            performance_history=performance_history,
        )
        return result
    except Exception as e:
        logger.error("Difficulty calibration failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suggest-tags")
async def suggest_tags(
    content: str,
    existing_tags: List[str] = [],
    max_suggestions: int = 5,
) -> Dict:
    """
    Suggest tags for content based on analysis.
    """
    try:
        analyzer = ContentAnalyzer()
        suggestions = await analyzer.suggest_tags(
            content=content,
            existing_tags=existing_tags,
            max_suggestions=max_suggestions,
        )
        return {"suggestions": suggestions}
    except Exception as e:
        logger.error("Tag suggestion failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
