# =============================================================================
# CONTENT ANALYZER SERVICE
# =============================================================================

import re
from typing import Dict, List, Optional

import structlog

from app.config import settings

logger = structlog.get_logger()


class ContentAnalyzer:
    """
    Service for analyzing content complexity, extracting concepts,
    and identifying learning requirements.
    """

    def __init__(self):
        self._openai_client = None
        self._anthropic_client = None
        self._initialize_clients()

    def _initialize_clients(self):
        """Initialize AI clients."""
        if settings.OPENAI_API_KEY:
            from openai import AsyncOpenAI

            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        if settings.ANTHROPIC_API_KEY:
            from anthropic import AsyncAnthropic

            self._anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def analyze_complexity(
        self,
        content: str,
        context: Optional[str] = None,
    ) -> Dict:
        """
        Analyze content complexity for flashcard generation.

        Args:
            content: Text content to analyze
            context: Additional context

        Returns:
            Complexity analysis results
        """
        # Basic text metrics
        words = content.split()
        sentences = re.split(r"[.!?]+", content)

        word_count = len(words)
        sentence_count = len([s for s in sentences if s.strip()])
        avg_word_length = sum(len(w) for w in words) / max(word_count, 1)
        avg_sentence_length = word_count / max(sentence_count, 1)

        # Vocabulary analysis
        unique_words = set(w.lower() for w in words if w.isalpha())
        vocabulary_richness = len(unique_words) / max(word_count, 1)

        # AI-powered analysis
        ai_analysis = await self._ai_complexity_analysis(content, context)

        # Combine metrics
        sentence_complexity = min(avg_sentence_length / 25, 1.0)  # Normalize
        vocabulary_score = self._calculate_vocabulary_level(words)

        overall_score = (
            sentence_complexity * 0.3
            + vocabulary_score * 0.3
            + ai_analysis.get("concept_density", 0.5) * 0.4
        )

        return {
            "overall_score": round(overall_score, 2),
            "vocabulary_level": ai_analysis.get("vocabulary_level", "intermediate"),
            "sentence_complexity": round(sentence_complexity, 2),
            "concept_density": ai_analysis.get("concept_density", 0.5),
            "prerequisite_concepts": ai_analysis.get("prerequisites", []),
            "key_terms": ai_analysis.get("key_terms", []),
            "estimated_study_time_minutes": self._estimate_study_time(word_count, overall_score),
        }

    async def _ai_complexity_analysis(
        self,
        content: str,
        context: Optional[str] = None,
    ) -> Dict:
        """Use AI to analyze complexity."""
        prompt = f"""Analyze this content for educational complexity:

CONTENT:
{content[:3000]}  # Truncate for API limits

{f"CONTEXT: {context}" if context else ""}

Provide analysis as JSON:
{{
    "vocabulary_level": "basic|intermediate|advanced|technical",
    "concept_density": 0.0-1.0,
    "prerequisites": ["concept1", "concept2"],
    "key_terms": [{{"term": "...", "definition": "..."}}],
    "domain": "subject area",
    "abstraction_level": "concrete|abstract|mixed"
}}"""

        try:
            if self._openai_client:
                response = await self._openai_client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "Analyze educational content. Respond with JSON only.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=1000,
                    response_format={"type": "json_object"},
                )
                import json

                return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error("AI complexity analysis failed", error=str(e))

        return {
            "vocabulary_level": "intermediate",
            "concept_density": 0.5,
            "prerequisites": [],
            "key_terms": [],
        }

    def _calculate_vocabulary_level(self, words: List[str]) -> float:
        """Calculate vocabulary complexity score."""
        # Simple heuristic based on word length and common word frequency
        long_words = [w for w in words if len(w) > 8]
        complex_ratio = len(long_words) / max(len(words), 1)

        return min(complex_ratio * 3, 1.0)  # Normalize to 0-1

    def _estimate_study_time(self, word_count: int, complexity: float) -> int:
        """Estimate study time in minutes."""
        # Base: 200 words per minute for easy content
        base_wpm = 200 - (complexity * 100)  # Slower for complex content
        reading_time = word_count / max(base_wpm, 50)

        # Add time for flashcard creation and review
        study_multiplier = 2 + complexity

        return max(5, int(reading_time * study_multiplier))

    async def analyze_prerequisites(
        self,
        topic: str,
        user_knowledge: List[str] = [],
    ) -> Dict:
        """
        Identify prerequisites for learning a topic.

        Args:
            topic: Topic to analyze
            user_knowledge: Concepts user already knows

        Returns:
            Prerequisite analysis
        """
        prompt = f"""Identify prerequisites for learning: {topic}

User already knows: {", ".join(user_knowledge) if user_knowledge else "Not specified"}

Provide as JSON:
{{
    "prerequisites": [
        {{"concept": "...", "description": "...", "importance": "essential|helpful|optional"}}
    ],
    "learning_path": ["step1", "step2", "..."],
    "estimated_hours": N
}}"""

        try:
            if self._openai_client:
                response = await self._openai_client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "Educational curriculum expert. Respond with JSON only.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=1500,
                    response_format={"type": "json_object"},
                )
                import json

                return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error("Prerequisite analysis failed", error=str(e))

        return {
            "prerequisites": [],
            "learning_path": [topic],
            "estimated_hours": 10,
        }

    async def analyze_knowledge_gaps(
        self,
        user_id: str,
        topic: str,
        performance_data: List[Dict],
    ) -> Dict:
        """
        Identify knowledge gaps from performance data.

        Args:
            user_id: User identifier
            topic: Topic area
            performance_data: Review performance data

        Returns:
            Knowledge gap analysis
        """
        # Analyze performance patterns
        weak_areas = []
        strengths = []

        for item in performance_data:
            accuracy = item.get("accuracy", 0)
            card_id = item.get("card_id", "")
            tags = item.get("tags", [])

            if accuracy < 0.6:
                weak_areas.append(
                    {
                        "card_id": card_id,
                        "accuracy": accuracy,
                        "tags": tags,
                    }
                )
            elif accuracy > 0.85:
                strengths.extend(tags)

        # Use AI for deeper analysis
        prompt = f"""Analyze learning gaps for topic: {topic}

Performance summary:
- Weak areas (accuracy < 60%): {len(weak_areas)} cards
- Strong areas: {list(set(strengths))[:10]}
- Total reviews analyzed: {len(performance_data)}

Weak card details: {weak_areas[:5]}

Provide analysis as JSON:
{{
    "gaps": [{{"concept": "...", "severity": "high|medium|low", "recommendation": "..."}}],
    "strengths": ["concept1", "concept2"],
    "recommended_cards": ["topic suggestion 1", "topic suggestion 2"],
    "study_suggestions": ["suggestion1", "suggestion2"]
}}"""

        try:
            if self._openai_client:
                response = await self._openai_client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "Learning analytics expert. Respond with JSON only.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=1500,
                    response_format={"type": "json_object"},
                )
                import json

                return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error("Knowledge gap analysis failed", error=str(e))

        return {
            "gaps": [],
            "strengths": list(set(strengths))[:10],
            "recommended_cards": [],
            "study_suggestions": [],
        }

    async def extract_concepts(
        self,
        content: str,
        max_concepts: int = 20,
    ) -> Dict:
        """
        Extract key concepts and relationships from content.

        Args:
            content: Source content
            max_concepts: Maximum concepts to extract

        Returns:
            Extracted concepts and relationships
        """
        prompt = f"""Extract key concepts from this educational content:

CONTENT:
{content[:4000]}

Extract up to {max_concepts} concepts with their relationships.

Provide as JSON:
{{
    "concepts": [
        {{"name": "...", "definition": "...", "importance": "high|medium|low"}}
    ],
    "relationships": [
        {{"from_concept": "...", "to_concept": "...", "relationship_type": "is_a|part_of|requires|relates_to"}}
    ],
    "concept_map": {{
        "root": "main topic",
        "children": [
            {{"name": "subtopic", "children": [...]}}
        ]
    }}
}}"""

        try:
            if self._openai_client:
                response = await self._openai_client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "Concept extraction expert. Respond with JSON only.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=2000,
                    response_format={"type": "json_object"},
                )
                import json

                return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error("Concept extraction failed", error=str(e))

        return {
            "concepts": [],
            "relationships": [],
            "concept_map": {},
        }

    async def detect_language(self, text: str) -> Dict:
        """
        Detect language of text content.

        Args:
            text: Text to analyze

        Returns:
            Language detection result
        """
        try:
            from langdetect import detect, detect_langs

            lang_code = detect(text)
            lang_probs = detect_langs(text)

            # Language code to name mapping
            lang_names = {
                "en": "English",
                "es": "Spanish",
                "fr": "French",
                "de": "German",
                "it": "Italian",
                "pt": "Portuguese",
                "ru": "Russian",
                "ja": "Japanese",
                "ko": "Korean",
                "zh-cn": "Chinese (Simplified)",
                "zh-tw": "Chinese (Traditional)",
                "ar": "Arabic",
                "hi": "Hindi",
                "nl": "Dutch",
            }

            return {
                "language": lang_code,
                "language_name": lang_names.get(lang_code, lang_code),
                "confidence": float(lang_probs[0].prob) if lang_probs else 0.0,
            }
        except Exception as e:
            logger.error("Language detection failed", error=str(e))
            return {
                "language": "unknown",
                "language_name": "Unknown",
                "confidence": 0.0,
            }

    async def calibrate_difficulty(
        self,
        user_id: str,
        card_ids: List[str],
        performance_history: List[Dict],
    ) -> Dict:
        """
        Calibrate card difficulties based on performance.

        Args:
            user_id: User identifier
            card_ids: Cards to calibrate
            performance_history: Historical performance data

        Returns:
            Difficulty calibration results
        """
        adjustments = {}

        for card_id in card_ids:
            # Find performance for this card
            card_perf = [p for p in performance_history if p.get("card_id") == card_id]

            if not card_perf:
                continue

            # Calculate performance metrics
            correct_count = sum(1 for p in card_perf if p.get("correct", False))
            total_count = len(card_perf)
            accuracy = correct_count / total_count if total_count > 0 else 0.5

            avg_response_time = sum(p.get("response_time", 5000) for p in card_perf) / total_count

            # Current difficulty (from most recent review)
            current_diff = card_perf[-1].get("difficulty", 0.5)

            # Adjust difficulty based on performance
            if accuracy > 0.9 and avg_response_time < 3000:
                # Too easy
                new_diff = min(current_diff + 0.1, 1.0)
                reason = "High accuracy with fast response"
            elif accuracy < 0.5:
                # Too hard
                new_diff = max(current_diff - 0.15, 0.0)
                reason = "Low accuracy"
            elif accuracy < 0.7:
                # Slightly hard
                new_diff = max(current_diff - 0.05, 0.0)
                reason = "Below target accuracy"
            else:
                new_diff = current_diff
                reason = "Appropriate difficulty"

            adjustments[card_id] = {
                "current_difficulty": current_diff,
                "new_difficulty": round(new_diff, 2),
                "accuracy": round(accuracy, 2),
                "avg_response_time_ms": int(avg_response_time),
                "reason": reason,
            }

        return {
            "user_id": user_id,
            "calibrations": adjustments,
            "cards_processed": len(adjustments),
        }

    async def suggest_tags(
        self,
        content: str,
        existing_tags: List[str] = [],
        max_suggestions: int = 5,
    ) -> List[str]:
        """
        Suggest tags for content.

        Args:
            content: Content to tag
            existing_tags: Already assigned tags
            max_suggestions: Maximum suggestions

        Returns:
            List of suggested tags
        """
        prompt = f"""Suggest {max_suggestions} tags for this educational content:

CONTENT:
{content[:2000]}

Existing tags: {", ".join(existing_tags) if existing_tags else "None"}

Suggest relevant, specific tags. Return as JSON array:
["tag1", "tag2", "tag3"]"""

        try:
            if self._openai_client:
                response = await self._openai_client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "Tag suggestion expert. Respond with JSON array only.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.5,
                    max_tokens=200,
                )
                import json
                import re

                json_match = re.search(r"\[[\s\S]*\]", response.choices[0].message.content)
                if json_match:
                    suggestions = json.loads(json_match.group())
                    # Filter out existing tags
                    return [
                        t
                        for t in suggestions
                        if t.lower() not in [e.lower() for e in existing_tags]
                    ][:max_suggestions]
        except Exception as e:
            logger.error("Tag suggestion failed", error=str(e))

        return []
