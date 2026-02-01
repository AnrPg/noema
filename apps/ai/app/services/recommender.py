# =============================================================================
# STUDY RECOMMENDER SERVICE
# =============================================================================

import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import structlog

from app.config import settings

logger = structlog.get_logger()


class StudyRecommender:
    """
    Service for generating personalized study recommendations
    using learning analytics and AI.
    """

    def __init__(self):
        self._openai_client = None
        self._initialize_clients()

    def _initialize_clients(self):
        """Initialize AI clients."""
        if settings.OPENAI_API_KEY:
            from openai import AsyncOpenAI

            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def get_recommendations(
        self,
        user_id: str,
        available_time: int,
        focus_topics: List[str] = [],
        exclude_decks: List[str] = [],
    ) -> Dict:
        """
        Get personalized study recommendations.

        Args:
            user_id: User identifier
            available_time: Available study time in minutes
            focus_topics: Topics to prioritize
            exclude_decks: Decks to exclude

        Returns:
            Study recommendations
        """
        # In production, this would fetch from database
        # For now, return structured recommendations

        # Calculate optimal session parameters
        if available_time < 15:
            cards_to_review = min(available_time * 2, 20)
            session_type = "quick_review"
        elif available_time < 30:
            cards_to_review = min(available_time * 1.5, 40)
            session_type = "standard"
        else:
            cards_to_review = min(available_time, 60)
            session_type = "deep_study"

        recommended_cards = []
        recommended_decks = []

        # Motivation messages based on time and context
        messages = [
            "Small steps lead to big achievements. Let's make today count!",
            "Consistency beats intensity. You're building lasting knowledge!",
            "Every review strengthens your memory. Keep going!",
            "You're investing in your future self. Great choice!",
        ]

        return {
            "recommended_cards": recommended_cards,
            "recommended_decks": recommended_decks,
            "suggested_break_time": self._calculate_break_time(available_time),
            "optimal_session_length": min(available_time, 25),  # Pomodoro-style
            "focus_areas": focus_topics or ["Review due cards", "Learn new material"],
            "motivation_message": random.choice(messages),
        }

    def _calculate_break_time(self, session_length: int) -> int:
        """Calculate recommended break time."""
        if session_length <= 15:
            return 0
        elif session_length <= 30:
            return 5
        elif session_length <= 60:
            return 10
        else:
            return 15

    async def create_study_plan(
        self,
        user_id: str,
        goal: str,
        deadline: Optional[datetime] = None,
        available_hours_per_week: int = 10,
    ) -> Dict:
        """
        Create a personalized study plan.

        Args:
            user_id: User identifier
            goal: Learning goal
            deadline: Target completion date
            available_hours_per_week: Weekly study time

        Returns:
            Structured study plan
        """
        # Calculate timeline
        if deadline:
            days_until_deadline = (deadline - datetime.now()).days
        else:
            days_until_deadline = 30  # Default 30 days

        weeks = max(1, days_until_deadline // 7)
        total_hours = weeks * available_hours_per_week

        # Use AI to generate plan
        prompt = f"""Create a study plan:

Goal: {goal}
Timeline: {days_until_deadline} days ({weeks} weeks)
Available time: {available_hours_per_week} hours per week
Total hours: {total_hours}

Create a detailed study plan with:
1. Weekly milestones
2. Daily topics
3. Estimated card counts
4. Progress checkpoints

Return as JSON:
{{
    "weeks": [
        {{
            "week": 1,
            "focus": "topic",
            "goals": ["goal1", "goal2"],
            "hours": N,
            "new_cards": N,
            "review_cards": N
        }}
    ],
    "milestones": [
        {{"week": N, "milestone": "description", "criteria": "how to verify"}}
    ],
    "daily_plan": [
        {{"day": 1, "topics": ["topic1"], "duration_minutes": N}}
    ],
    "confidence_score": 0.0-1.0
}}"""

        try:
            if self._openai_client:
                response = await self._openai_client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "Educational planning expert. Respond with JSON only.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.5,
                    max_tokens=2000,
                    response_format={"type": "json_object"},
                )
                import json

                plan_data = json.loads(response.choices[0].message.content)

                # Build days array from plan
                days = []
                daily_plan = plan_data.get("daily_plan", [])
                for day_info in daily_plan[:days_until_deadline]:
                    days.append(
                        {
                            "date": (
                                datetime.now() + timedelta(days=day_info.get("day", 1) - 1)
                            ).strftime("%Y-%m-%d"),
                            "topics": day_info.get("topics", []),
                            "cards_to_review": 20,  # Default estimate
                            "new_cards": 5,
                            "estimated_time_minutes": day_info.get("duration_minutes", 30),
                        }
                    )

                return {
                    "user_id": user_id,
                    "goal": goal,
                    "days": days,
                    "milestones": plan_data.get("milestones", []),
                    "total_estimated_hours": total_hours,
                    "confidence_score": plan_data.get("confidence_score", 0.7),
                }
        except Exception as e:
            logger.error("Study plan creation failed", error=str(e))

        # Fallback plan
        days = []
        for i in range(min(days_until_deadline, 30)):
            days.append(
                {
                    "date": (datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d"),
                    "topics": [goal],
                    "cards_to_review": 20,
                    "new_cards": 5,
                    "estimated_time_minutes": 30,
                }
            )

        return {
            "user_id": user_id,
            "goal": goal,
            "days": days,
            "milestones": [{"week": 1, "milestone": "Complete first review cycle"}],
            "total_estimated_hours": total_hours,
            "confidence_score": 0.5,
        }

    async def get_optimal_time(
        self,
        user_id: str,
        timezone: str,
    ) -> Dict:
        """
        Determine optimal study times based on patterns.

        Args:
            user_id: User identifier
            timezone: User's timezone

        Returns:
            Optimal time recommendations
        """
        # In production, analyze user's historical study patterns
        # For now, return research-based defaults

        # Research suggests morning and early evening are best
        best_hours = [8, 9, 10, 17, 18, 19]  # 8-10 AM, 5-7 PM
        best_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Sunday"]

        return {
            "best_hours": best_hours,
            "best_days": best_days,
            "session_recommendations": {
                "morning": {
                    "hours": [8, 9, 10],
                    "focus": "New material, complex concepts",
                    "reason": "Peak cognitive performance",
                },
                "afternoon": {
                    "hours": [14, 15, 16],
                    "focus": "Review, practice problems",
                    "reason": "Good for reinforcement",
                },
                "evening": {
                    "hours": [17, 18, 19],
                    "focus": "Review before sleep enhances memory",
                    "reason": "Sleep consolidation benefits",
                },
            },
        }

    async def predict_retention(
        self,
        user_id: str,
        card_ids: List[str],
        prediction_date: datetime,
    ) -> List[Dict]:
        """
        Predict retention probability for cards.

        Args:
            user_id: User identifier
            card_ids: Cards to predict
            prediction_date: Date to predict for

        Returns:
            Retention predictions
        """
        predictions = []

        for card_id in card_ids:
            # In production, use FSRS model with actual card data
            # For now, return simulated predictions

            days_until = (prediction_date - datetime.now()).days

            # Decay factor (simplified forgetting curve)
            base_retention = 0.9
            decay_rate = 0.1
            retention = base_retention * (1 - decay_rate) ** days_until
            retention = max(0.1, min(0.99, retention))

            predictions.append(
                {
                    "card_id": card_id,
                    "predicted_retention": round(retention, 3),
                    "confidence": 0.7,
                    "factors": {
                        "days_until_review": days_until,
                        "decay_rate": decay_rate,
                        "model": "simplified_forgetting_curve",
                    },
                }
            )

        return predictions

    async def get_learning_curve(
        self,
        user_id: str,
        topic: Optional[str] = None,
        days: int = 30,
    ) -> Dict:
        """
        Get learning curve data for visualization.

        Args:
            user_id: User identifier
            topic: Specific topic (optional)
            days: Number of days to include

        Returns:
            Learning curve data
        """
        # Generate sample learning curve data
        # In production, aggregate from actual review data

        data_points = []
        cumulative_cards = 0
        retention_trend = 0.5

        for i in range(days):
            date = (datetime.now() - timedelta(days=days - i - 1)).strftime("%Y-%m-%d")

            # Simulate learning progress
            new_cards = random.randint(3, 10)
            reviews = random.randint(10, 30)
            cumulative_cards += new_cards

            # Retention improves with practice
            retention_trend = min(0.95, retention_trend + 0.01)
            daily_retention = retention_trend + random.uniform(-0.05, 0.05)

            data_points.append(
                {
                    "date": date,
                    "new_cards": new_cards,
                    "reviews": reviews,
                    "retention": round(daily_retention, 3),
                    "cumulative_cards": cumulative_cards,
                }
            )

        return {
            "user_id": user_id,
            "topic": topic,
            "days": days,
            "data": data_points,
            "summary": {
                "total_cards_learned": cumulative_cards,
                "average_retention": round(sum(d["retention"] for d in data_points) / days, 3),
                "trend": "improving",
            },
        }

    async def assess_burnout_risk(self, user_id: str) -> Dict:
        """
        Assess risk of study burnout.

        Args:
            user_id: User identifier

        Returns:
            Burnout risk assessment
        """
        # In production, analyze recent study patterns
        # Check for: excessive hours, declining accuracy, missed days

        # Sample assessment
        return {
            "user_id": user_id,
            "risk_level": "low",  # low, moderate, high
            "risk_score": 0.2,  # 0-1
            "indicators": {
                "study_hours_trend": "stable",
                "accuracy_trend": "stable",
                "consistency": "good",
                "session_length": "appropriate",
            },
            "recommendations": [
                "Maintain current pace - you're doing well!",
                "Consider taking weekends lighter",
                "Mix in some fun review games",
            ],
            "warning_signs": [],
        }

    async def adjust_difficulty(
        self,
        user_id: str,
        recent_performance: List[Dict],
    ) -> Dict:
        """
        Suggest difficulty adjustments.

        Args:
            user_id: User identifier
            recent_performance: Recent review performance

        Returns:
            Difficulty adjustment suggestions
        """
        if not recent_performance:
            return {
                "adjustment": 0,
                "reason": "Insufficient data",
                "recommendations": ["Complete more reviews for personalization"],
            }

        # Calculate performance metrics
        total = len(recent_performance)
        correct = sum(1 for p in recent_performance if p.get("correct", False))
        accuracy = correct / total

        avg_time = sum(p.get("response_time", 5000) for p in recent_performance) / total

        # Determine adjustment
        if accuracy > 0.9 and avg_time < 3000:
            adjustment = 0.1
            reason = "High accuracy with fast responses - increase challenge"
            recommendations = [
                "Add more advanced cards",
                "Reduce hints",
                "Increase new cards per day",
            ]
        elif accuracy < 0.6:
            adjustment = -0.15
            reason = "Low accuracy - reduce difficulty"
            recommendations = [
                "Review fundamentals",
                "Reduce new cards per day",
                "Use more hints",
            ]
        elif accuracy < 0.75:
            adjustment = -0.05
            reason = "Below target accuracy - slight reduction"
            recommendations = [
                "Take more time on difficult cards",
                "Review related concepts",
            ]
        else:
            adjustment = 0
            reason = "Performance is on target"
            recommendations = ["Continue current approach"]

        return {
            "user_id": user_id,
            "current_accuracy": round(accuracy, 3),
            "avg_response_time_ms": int(avg_time),
            "suggested_adjustment": adjustment,
            "reason": reason,
            "recommendations": recommendations,
        }

    async def suggest_topics(
        self,
        user_id: str,
        current_topics: List[str],
        max_suggestions: int = 5,
    ) -> Dict:
        """
        Suggest new related topics.

        Args:
            user_id: User identifier
            current_topics: Currently studied topics
            max_suggestions: Maximum suggestions

        Returns:
            Topic suggestions
        """
        if not current_topics:
            # General suggestions
            return {
                "suggestions": [
                    {"topic": "Fundamentals", "reason": "Start with basics"},
                ],
                "based_on": "general_recommendations",
            }

        prompt = f"""Based on these topics: {", ".join(current_topics)}

Suggest {max_suggestions} related topics to expand learning.

Return as JSON:
{{
    "suggestions": [
        {{"topic": "...", "reason": "why this follows", "overlap": "high|medium|low"}}
    ]
}}"""

        try:
            if self._openai_client:
                response = await self._openai_client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "Curriculum design expert. Respond with JSON only.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.7,
                    max_tokens=500,
                    response_format={"type": "json_object"},
                )
                import json

                data = json.loads(response.choices[0].message.content)
                data["based_on"] = current_topics
                return data
        except Exception as e:
            logger.error("Topic suggestion failed", error=str(e))

        return {
            "suggestions": [],
            "based_on": current_topics,
        }
