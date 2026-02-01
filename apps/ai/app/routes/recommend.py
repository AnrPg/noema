# =============================================================================
# STUDY RECOMMENDATION ROUTES
# =============================================================================

from datetime import datetime
from typing import Dict, List, Optional

import structlog
from app.services.recommender import StudyRecommender
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = structlog.get_logger()
router = APIRouter()


class UserStudyProfile(BaseModel):
    user_id: str
    learning_style: Optional[str] = None  # visual, auditory, reading, kinesthetic
    preferred_session_length: int = 20  # minutes
    difficulty_preference: float = 0.5  # 0-1 scale
    topics_of_interest: List[str] = []
    available_time_weekly: int = 300  # minutes


class StudyRecommendationRequest(BaseModel):
    user_id: str
    available_time: int  # minutes
    focus_topics: List[str] = []
    exclude_decks: List[str] = []


class CardRecommendation(BaseModel):
    card_id: str
    priority: float
    reason: str
    estimated_time_seconds: int


class DeckRecommendation(BaseModel):
    deck_id: str
    priority: float
    reason: str
    cards_due: int
    estimated_time_minutes: int


class StudyRecommendation(BaseModel):
    recommended_cards: List[CardRecommendation]
    recommended_decks: List[DeckRecommendation]
    suggested_break_time: int  # minutes until break
    optimal_session_length: int  # minutes
    focus_areas: List[str]
    motivation_message: str


class StudyPlanRequest(BaseModel):
    user_id: str
    goal: str  # e.g., "Learn Python basics", "Prepare for exam"
    deadline: Optional[datetime] = None
    available_hours_per_week: int = 10


class StudyPlanDay(BaseModel):
    date: str
    topics: List[str]
    cards_to_review: int
    new_cards: int
    estimated_time_minutes: int


class StudyPlan(BaseModel):
    user_id: str
    goal: str
    days: List[StudyPlanDay]
    milestones: List[Dict]
    total_estimated_hours: int
    confidence_score: float


class OptimalTimeRequest(BaseModel):
    user_id: str
    timezone: str


class OptimalTimeResponse(BaseModel):
    best_hours: List[int]  # 0-23
    best_days: List[str]  # Monday, Tuesday, etc.
    session_recommendations: Dict


class RetentionPredictionRequest(BaseModel):
    user_id: str
    card_ids: List[str]
    prediction_date: datetime


class RetentionPrediction(BaseModel):
    card_id: str
    predicted_retention: float
    confidence: float
    factors: Dict


@router.post("/recommendations", response_model=StudyRecommendation)
async def get_recommendations(request: StudyRecommendationRequest) -> StudyRecommendation:
    """
    Get personalized study recommendations.
    """
    logger.info(
        "Getting study recommendations",
        user_id=request.user_id,
        available_time=request.available_time,
    )

    try:
        recommender = StudyRecommender()
        result = await recommender.get_recommendations(
            user_id=request.user_id,
            available_time=request.available_time,
            focus_topics=request.focus_topics,
            exclude_decks=request.exclude_decks,
        )
        return result
    except Exception as e:
        logger.error("Recommendation failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/study-plan", response_model=StudyPlan)
async def create_study_plan(request: StudyPlanRequest) -> StudyPlan:
    """
    Create a personalized study plan for a goal.
    """
    logger.info(
        "Creating study plan",
        user_id=request.user_id,
        goal=request.goal,
    )

    try:
        recommender = StudyRecommender()
        result = await recommender.create_study_plan(
            user_id=request.user_id,
            goal=request.goal,
            deadline=request.deadline,
            available_hours_per_week=request.available_hours_per_week,
        )
        return result
    except Exception as e:
        logger.error("Study plan creation failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/optimal-time/{user_id}", response_model=OptimalTimeResponse)
async def get_optimal_study_time(
    user_id: str,
    timezone: str = Query(default="UTC"),
) -> OptimalTimeResponse:
    """
    Determine optimal study times based on user patterns.
    """
    logger.info("Getting optimal time", user_id=user_id)

    try:
        recommender = StudyRecommender()
        result = await recommender.get_optimal_time(
            user_id=user_id,
            timezone=timezone,
        )
        return result
    except Exception as e:
        logger.error("Optimal time calculation failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict-retention")
async def predict_retention(request: RetentionPredictionRequest) -> List[RetentionPrediction]:
    """
    Predict retention for cards at a future date.
    """
    logger.info(
        "Predicting retention",
        user_id=request.user_id,
        card_count=len(request.card_ids),
    )

    try:
        recommender = StudyRecommender()
        result = await recommender.predict_retention(
            user_id=request.user_id,
            card_ids=request.card_ids,
            prediction_date=request.prediction_date,
        )
        return result
    except Exception as e:
        logger.error("Retention prediction failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/learning-curve/{user_id}")
async def get_learning_curve(
    user_id: str,
    topic: Optional[str] = None,
    days: int = Query(default=30, ge=1, le=365),
) -> Dict:
    """
    Get learning curve data for visualization.
    """
    logger.info(
        "Getting learning curve",
        user_id=user_id,
        topic=topic,
        days=days,
    )

    try:
        recommender = StudyRecommender()
        result = await recommender.get_learning_curve(
            user_id=user_id,
            topic=topic,
            days=days,
        )
        return result
    except Exception as e:
        logger.error("Learning curve calculation failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/burnout-risk/{user_id}")
async def assess_burnout_risk(user_id: str) -> Dict:
    """
    Assess risk of study burnout.
    """
    logger.info("Assessing burnout risk", user_id=user_id)

    try:
        recommender = StudyRecommender()
        result = await recommender.assess_burnout_risk(user_id)
        return result
    except Exception as e:
        logger.error("Burnout assessment failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/adaptive-difficulty/{user_id}")
async def adjust_difficulty(
    user_id: str,
    recent_performance: List[Dict],
) -> Dict:
    """
    Suggest difficulty adjustments based on recent performance.
    """
    logger.info("Adjusting difficulty", user_id=user_id)

    try:
        recommender = StudyRecommender()
        result = await recommender.adjust_difficulty(
            user_id=user_id,
            recent_performance=recent_performance,
        )
        return result
    except Exception as e:
        logger.error("Difficulty adjustment failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/topic-suggestions/{user_id}")
async def get_topic_suggestions(
    user_id: str,
    current_topics: List[str] = Query(default=[]),
    max_suggestions: int = Query(default=5, ge=1, le=20),
) -> Dict:
    """
    Suggest new topics based on current learning.
    """
    logger.info(
        "Getting topic suggestions",
        user_id=user_id,
        current_topics=current_topics,
    )

    try:
        recommender = StudyRecommender()
        result = await recommender.suggest_topics(
            user_id=user_id,
            current_topics=current_topics,
            max_suggestions=max_suggestions,
        )
        return result
    except Exception as e:
        logger.error("Topic suggestion failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
