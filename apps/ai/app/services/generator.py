# =============================================================================
# CARD GENERATOR SERVICE
# =============================================================================

import json
import re
from enum import Enum
from typing import Dict, List, Optional

import structlog

from app.config import settings

logger = structlog.get_logger()


class CardType(str, Enum):
    BASIC = "basic"
    BASIC_REVERSED = "basic_reversed"
    CLOZE = "cloze"
    MULTIPLE_CHOICE = "multiple_choice"
    TRUE_FALSE = "true_false"
    MATCHING = "matching"
    ORDERING = "ordering"
    IMAGE_OCCLUSION = "image_occlusion"
    AUDIO = "audio"
    DEFINITION = "definition"
    EXAMPLE = "example"
    COMPARISON = "comparison"
    CAUSE_EFFECT = "cause_effect"
    TIMELINE = "timeline"
    DIAGRAM = "diagram"


class CardGenerator:
    """
    Service for generating flashcards from content using AI.
    Supports multiple card types and AI providers.
    """

    def __init__(self):
        self._openai_client = None
        self._anthropic_client = None
        self._initialize_clients()

    def _initialize_clients(self):
        """Initialize AI clients based on configuration."""
        if settings.OPENAI_API_KEY:
            from openai import AsyncOpenAI

            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            logger.info("OpenAI client initialized")

        if settings.ANTHROPIC_API_KEY:
            from anthropic import AsyncAnthropic

            self._anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            logger.info("Anthropic client initialized")

    async def generate_cards(
        self,
        content: str,
        card_types: List[str],
        count: int = 10,
        difficulty: float = 0.5,
        context: Optional[str] = None,
        provider: str = "openai",
    ) -> List[Dict]:
        """
        Generate flashcards from content.

        Args:
            content: Source content
            card_types: Types of cards to generate
            count: Number of cards to generate
            difficulty: Target difficulty (0-1)
            context: Additional context
            provider: AI provider to use

        Returns:
            List of generated cards
        """
        prompt = self._build_generation_prompt(
            content=content,
            card_types=card_types,
            count=count,
            difficulty=difficulty,
            context=context,
        )

        if provider == "anthropic" and self._anthropic_client:
            response = await self._generate_with_anthropic(prompt)
        elif self._openai_client:
            response = await self._generate_with_openai(prompt)
        else:
            raise ValueError("No AI provider available")

        cards = self._parse_cards_response(response, card_types)

        logger.info(
            "Generated cards",
            count=len(cards),
            card_types=card_types,
        )

        return cards

    def _build_generation_prompt(
        self,
        content: str,
        card_types: List[str],
        count: int,
        difficulty: float,
        context: Optional[str] = None,
    ) -> str:
        """Build prompt for card generation."""
        difficulty_desc = (
            "beginner-friendly"
            if difficulty < 0.3
            else "intermediate"
            if difficulty < 0.7
            else "advanced/challenging"
        )

        card_type_instructions = self._get_card_type_instructions(card_types)

        prompt = f"""You are an expert flashcard creator for spaced repetition learning systems.
Your task is to generate high-quality flashcards from the provided content.

CONTENT:
{content}

{f"CONTEXT: {context}" if context else ""}

REQUIREMENTS:
1. Generate exactly {count} flashcards
2. Difficulty level: {difficulty_desc} (0-1 scale: {difficulty})
3. Card types to generate: {", ".join(card_types)}
4. Each card should test a single, atomic concept
5. Questions should be clear and unambiguous
6. Answers should be concise but complete
7. Include explanations where helpful

CARD TYPE SPECIFICATIONS:
{card_type_instructions}

OUTPUT FORMAT:
Return a JSON array of cards. Each card should have:
- "type": The card type
- "front": Front content (question/prompt)
- "back": Back content (answer)
- "explanation": Optional explanation
- "tags": Relevant tags (array)
- "difficulty": Estimated difficulty (0-1)
- Additional fields based on card type

Example output:
```json
[
  {{
    "type": "basic",
    "front": "What is photosynthesis?",
    "back": "The process by which plants convert sunlight into energy",
    "explanation": "Plants use chlorophyll to capture light energy...",
    "tags": ["biology", "plants", "energy"],
    "difficulty": 0.3
  }}
]
```

Generate the flashcards now:"""

        return prompt

    def _get_card_type_instructions(self, card_types: List[str]) -> str:
        """Get instructions for specific card types."""
        instructions = {
            "basic": """
BASIC: Simple question-answer format
- front: The question
- back: The answer""",
            "basic_reversed": """
BASIC_REVERSED: Can be tested in both directions
- front: Term or concept
- back: Definition or explanation
- reversible: true""",
            "cloze": """
CLOZE: Fill-in-the-blank
- front: Sentence with {{c1::hidden text}} markers
- back: The complete sentence
- clozes: Array of cloze items""",
            "multiple_choice": """
MULTIPLE_CHOICE: Question with options
- front: The question
- back: Correct answer
- choices: Array of 4 options
- correct_index: Index of correct answer (0-3)""",
            "true_false": """
TRUE_FALSE: Statement to evaluate
- front: The statement
- back: "True" or "False"
- explanation: Why it's true or false""",
            "matching": """
MATCHING: Match pairs
- front: Instructions
- pairs: Array of {left, right} objects to match""",
            "ordering": """
ORDERING: Arrange in sequence
- front: Items to order
- items: Array of items
- correct_order: Array of indices in correct order""",
            "definition": """
DEFINITION: Term and definition
- front: The term
- back: The definition
- examples: Array of usage examples""",
            "example": """
EXAMPLE: Concept with examples
- front: The concept
- back: Primary example
- additional_examples: More examples""",
            "comparison": """
COMPARISON: Compare two concepts
- front: "Compare X and Y"
- item_a: First item with properties
- item_b: Second item with properties
- similarities: Common traits
- differences: Distinguishing traits""",
            "cause_effect": """
CAUSE_EFFECT: Causal relationship
- front: The cause
- back: The effect
- mechanism: How it happens""",
            "timeline": """
TIMELINE: Chronological sequence
- front: Event description
- date: When it occurred
- events: Related events in sequence""",
        }

        return "\n".join(
            instructions.get(ct, f"{ct.upper()}: Standard format") for ct in card_types
        )

    async def _generate_with_openai(self, prompt: str) -> str:
        """Generate cards using OpenAI."""
        response = await self._openai_client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert educational content creator specializing in spaced repetition flashcards. Always respond with valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=4000,
            response_format={"type": "json_object"},
        )

        return response.choices[0].message.content

    async def _generate_with_anthropic(self, prompt: str) -> str:
        """Generate cards using Anthropic."""
        response = await self._anthropic_client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=4000,
            messages=[
                {"role": "user", "content": prompt},
            ],
        )

        return response.content[0].text

    def _parse_cards_response(
        self,
        response: str,
        card_types: List[str],
    ) -> List[Dict]:
        """Parse AI response into card objects."""
        # Extract JSON from response
        json_match = re.search(r"\[[\s\S]*\]", response)
        if not json_match:
            # Try to find JSON object with cards array
            obj_match = re.search(r"\{[\s\S]*\"cards\"[\s\S]*\}", response)
            if obj_match:
                data = json.loads(obj_match.group())
                cards = data.get("cards", [])
            else:
                logger.error("No valid JSON found in response")
                return []
        else:
            cards = json.loads(json_match.group())

        # Validate and normalize cards
        valid_cards = []
        for card in cards:
            normalized = self._normalize_card(card)
            if normalized:
                valid_cards.append(normalized)

        return valid_cards

    def _normalize_card(self, card: Dict) -> Optional[Dict]:
        """Normalize card structure."""
        if not card.get("type") or not card.get("front"):
            return None

        normalized = {
            "type": card["type"],
            "front": card["front"],
            "back": card.get("back", ""),
            "explanation": card.get("explanation", ""),
            "tags": card.get("tags", []),
            "difficulty": card.get("difficulty", 0.5),
        }

        # Add type-specific fields
        if card["type"] == "multiple_choice":
            normalized["choices"] = card.get("choices", [])
            normalized["correct_index"] = card.get("correct_index", 0)
        elif card["type"] == "cloze":
            normalized["clozes"] = card.get("clozes", [])
        elif card["type"] == "matching":
            normalized["pairs"] = card.get("pairs", [])
        elif card["type"] == "ordering":
            normalized["items"] = card.get("items", [])
            normalized["correct_order"] = card.get("correct_order", [])
        elif card["type"] == "comparison":
            normalized["item_a"] = card.get("item_a", {})
            normalized["item_b"] = card.get("item_b", {})
            normalized["similarities"] = card.get("similarities", [])
            normalized["differences"] = card.get("differences", [])
        elif card["type"] == "cause_effect":
            normalized["mechanism"] = card.get("mechanism", "")
        elif card["type"] == "timeline":
            normalized["date"] = card.get("date", "")
            normalized["events"] = card.get("events", [])

        return normalized

    async def generate_from_topic(
        self,
        topic: str,
        subtopics: List[str] = [],
        depth: str = "intermediate",
        card_types: List[str] = ["basic", "cloze"],
        count: int = 10,
    ) -> List[Dict]:
        """
        Generate cards from a topic without source content.

        Args:
            topic: Main topic
            subtopics: Specific subtopics to cover
            depth: Coverage depth
            card_types: Card types to generate
            count: Number of cards

        Returns:
            Generated cards
        """
        prompt = f"""Generate {count} educational flashcards about: {topic}

{f"Subtopics to cover: {', '.join(subtopics)}" if subtopics else ""}

Depth: {depth}
Card types: {", ".join(card_types)}

Create diverse, high-quality flashcards that:
1. Cover key concepts comprehensively
2. Progress from foundational to advanced
3. Include practical examples
4. Test different aspects of understanding

Return as JSON array with the same format as before."""

        if self._openai_client:
            response = await self._generate_with_openai(prompt)
        elif self._anthropic_client:
            response = await self._generate_with_anthropic(prompt)
        else:
            raise ValueError("No AI provider available")

        return self._parse_cards_response(response, card_types)

    async def improve_card(
        self,
        card: Dict,
        feedback: str = "",
    ) -> Dict:
        """
        Improve an existing card based on feedback.

        Args:
            card: Original card
            feedback: Improvement feedback

        Returns:
            Improved card
        """
        prompt = f"""Improve this flashcard:

Original card:
{json.dumps(card, indent=2)}

{f"Feedback: {feedback}" if feedback else "General improvement requested"}

Improve the card by:
1. Making the question clearer
2. Making the answer more precise
3. Adding helpful explanation
4. Adjusting difficulty if needed

Return the improved card as JSON."""

        if self._openai_client:
            response = await self._generate_with_openai(prompt)
        elif self._anthropic_client:
            response = await self._generate_with_anthropic(prompt)
        else:
            raise ValueError("No AI provider available")

        # Parse single card
        json_match = re.search(r"\{[\s\S]*\}", response)
        if json_match:
            return json.loads(json_match.group())

        return card

    async def generate_hints(
        self,
        card: Dict,
        num_hints: int = 3,
    ) -> List[str]:
        """
        Generate progressive hints for a card.

        Args:
            card: The flashcard
            num_hints: Number of hints to generate

        Returns:
            List of hints from vague to specific
        """
        prompt = f"""Generate {num_hints} progressive hints for this flashcard.
Hints should progress from vague to more specific, without giving away the answer.

Card:
Question: {card.get("front", "")}
Answer: {card.get("back", "")}

Return as JSON array of strings:
["hint1 (vague)", "hint2 (medium)", "hint3 (specific)"]"""

        if self._openai_client:
            response = await self._generate_with_openai(prompt)
        elif self._anthropic_client:
            response = await self._generate_with_anthropic(prompt)
        else:
            return []

        json_match = re.search(r"\[[\s\S]*\]", response)
        if json_match:
            return json.loads(json_match.group())

        return []

    async def generate_distractors(
        self,
        card: Dict,
        num_distractors: int = 3,
    ) -> List[str]:
        """
        Generate plausible wrong answers for multiple choice.

        Args:
            card: The flashcard with correct answer
            num_distractors: Number of wrong answers

        Returns:
            List of distractor answers
        """
        prompt = f"""Generate {num_distractors} plausible but incorrect answers for this question.
Distractors should be believable but clearly wrong upon reflection.

Question: {card.get("front", "")}
Correct Answer: {card.get("back", "")}

Return as JSON array of strings:
["wrong1", "wrong2", "wrong3"]"""

        if self._openai_client:
            response = await self._generate_with_openai(prompt)
        elif self._anthropic_client:
            response = await self._generate_with_anthropic(prompt)
        else:
            return []

        json_match = re.search(r"\[[\s\S]*\]", response)
        if json_match:
            return json.loads(json_match.group())

        return []
