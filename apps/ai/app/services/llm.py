# =============================================================================
# LLM SERVICE
# =============================================================================

from typing import TYPE_CHECKING, Any, Dict, List, Optional

import structlog

from app.config import settings

if TYPE_CHECKING:
    from anthropic import AsyncAnthropic
    from openai import AsyncOpenAI

logger = structlog.get_logger()


class LLMService:
    """
    Service for LLM-powered generation tasks.
    Supports OpenAI, Anthropic, and Google providers.
    """

    def __init__(self, provider: str = "openai"):
        self.provider = provider
        self._openai_client: Optional["AsyncOpenAI"] = None
        self._anthropic_client: Optional["AsyncAnthropic"] = None
        self._google_client: Any = None
        self._initialize_clients()

    def _initialize_clients(self):
        """Initialize AI clients based on configuration."""
        if settings.OPENAI_API_KEY:
            from openai import AsyncOpenAI

            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        if settings.ANTHROPIC_API_KEY:
            from anthropic import AsyncAnthropic

            self._anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        if settings.GOOGLE_API_KEY:
            import google.generativeai as genai

            genai.configure(api_key=settings.GOOGLE_API_KEY)  # type: ignore[attr-defined]
            self._google_client = genai

    async def _generate(self, prompt: str, system_prompt: str = "") -> str:
        """Generate text using the configured provider."""
        if self.provider == "openai" and self._openai_client:
            return await self._generate_openai(prompt, system_prompt)
        elif self.provider == "anthropic" and self._anthropic_client:
            return await self._generate_anthropic(prompt, system_prompt)
        elif self.provider == "google" and self._google_client:
            return await self._generate_google(prompt, system_prompt)
        else:
            # Fallback to any available provider
            if self._openai_client:
                return await self._generate_openai(prompt, system_prompt)
            elif self._anthropic_client:
                return await self._generate_anthropic(prompt, system_prompt)
            elif self._google_client:
                return await self._generate_google(prompt, system_prompt)
            else:
                raise ValueError("No AI provider configured")

    async def _generate_openai(self, prompt: str, system_prompt: str = "") -> str:
        """Generate using OpenAI."""
        assert self._openai_client is not None, "OpenAI client not initialized"
        messages: List[Dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await self._openai_client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,  # type: ignore
            temperature=0.7,
            max_tokens=2000,
        )
        return response.choices[0].message.content or ""

    async def _generate_anthropic(self, prompt: str, system_prompt: str = "") -> str:
        """Generate using Anthropic."""
        assert self._anthropic_client is not None, "Anthropic client not initialized"
        response = await self._anthropic_client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=2000,
            system=system_prompt if system_prompt else "You are a helpful AI assistant.",
            messages=[{"role": "user", "content": prompt}],
        )
        content_block = response.content[0]
        return getattr(content_block, "text", str(content_block))

    async def _generate_google(self, prompt: str, system_prompt: str = "") -> str:
        """Generate using Google."""
        assert self._google_client is not None, "Google client not initialized"
        model = self._google_client.GenerativeModel(settings.GOOGLE_MODEL)
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        response = await model.generate_content_async(full_prompt)
        return response.text

    async def generate_explanation(
        self,
        content: str,
        context: Optional[str] = None,
        level: str = "intermediate",
        style: str = "concise",
    ) -> Dict[str, Any]:
        """Generate an explanation for content."""
        system_prompt = f"""You are an expert tutor. Explain concepts clearly at a {level} level.
Style: {style}. Be accurate and helpful."""

        prompt = f"""Explain the following content:

{content}

{f"Context: {context}" if context else ""}

Provide:
1. A clear explanation
2. Key points (as a list)
3. Related concepts to explore

Format your response as:
EXPLANATION:
[Your explanation]

KEY POINTS:
- Point 1
- Point 2
...

RELATED CONCEPTS:
- Concept 1
- Concept 2
..."""

        response = await self._generate(prompt, system_prompt)

        # Parse the response
        explanation = ""
        key_points = []
        related_concepts = []

        current_section = None

        for line in response.split("\n"):
            line = line.strip()
            if line.startswith("EXPLANATION:"):
                current_section = "explanation"
                continue
            elif line.startswith("KEY POINTS:"):
                current_section = "key_points"
                continue
            elif line.startswith("RELATED CONCEPTS:"):
                current_section = "related_concepts"
                continue

            if current_section == "explanation" and line:
                explanation += line + " "
            elif current_section == "key_points" and line.startswith("-"):
                key_points.append(line[1:].strip())
            elif current_section == "related_concepts" and line.startswith("-"):
                related_concepts.append(line[1:].strip())

        return {
            "explanation": explanation.strip() or response,
            "key_points": key_points or ["See explanation above"],
            "related_concepts": related_concepts or [],
        }

    async def generate_hints(
        self,
        question: str,
        answer: str,
        num_hints: int = 3,
    ) -> List[str]:
        """Generate progressive hints for a flashcard."""
        system_prompt = "You are a helpful tutor creating hints for students."

        prompt = f"""Create {num_hints} progressive hints for this flashcard.
Each hint should be more revealing than the last, but none should give away the answer directly.

Question: {question}
Answer: {answer}

Provide hints as a numbered list (1, 2, 3, etc.)"""

        response = await self._generate(prompt, system_prompt)

        hints = []
        for line in response.split("\n"):
            line = line.strip()
            if line and (line[0].isdigit() or line.startswith("-")):
                # Remove numbering or bullet
                hint = line.lstrip("0123456789.-) ").strip()
                if hint:
                    hints.append(hint)

        return (
            hints[:num_hints]
            if hints
            else ["Think about the key concepts", "Review related material", "Consider the context"]
        )

    async def generate_mnemonic(
        self,
        content: str,
        mnemonic_type: str = "acronym",
    ) -> Dict[str, str]:
        """Generate a mnemonic device for memorization."""
        system_prompt = "You are an expert at creating memorable mnemonic devices."

        type_instructions = {
            "acronym": "Create an acronym where each letter stands for a key term.",
            "story": "Create a short memorable story that incorporates all key elements.",
            "rhyme": "Create a rhyme or song that helps remember the content.",
            "visual": "Describe a vivid visual scene that represents the content.",
            "method_of_loci": "Create a memory palace journey through familiar locations.",
        }

        prompt = f"""Create a {mnemonic_type} mnemonic for:

{content}

{type_instructions.get(mnemonic_type, type_instructions["acronym"])}

Provide:
1. The mnemonic itself
2. An explanation of how to use it

Format:
MNEMONIC:
[Your mnemonic]

EXPLANATION:
[How to use it]"""

        response = await self._generate(prompt, system_prompt)

        mnemonic = ""
        explanation = ""
        current_section = None

        for line in response.split("\n"):
            line = line.strip()
            if "MNEMONIC:" in line:
                current_section = "mnemonic"
                continue
            elif "EXPLANATION:" in line:
                current_section = "explanation"
                continue

            if current_section == "mnemonic" and line:
                mnemonic += line + " "
            elif current_section == "explanation" and line:
                explanation += line + " "

        return {
            "mnemonic": mnemonic.strip() or response.split("\n")[0],
            "explanation": explanation.strip() or "Use this mnemonic to remember the key concepts.",
        }

    async def summarize(
        self,
        content: str,
        max_length: int = 200,
        style: str = "bullet_points",
    ) -> str:
        """Summarize content."""
        system_prompt = "You are an expert at creating concise, accurate summaries."

        style_instructions = {
            "bullet_points": "Use bullet points for key ideas.",
            "paragraph": "Write a flowing paragraph.",
            "outline": "Create a hierarchical outline.",
        }

        prompt = f"""Summarize the following content in approximately {max_length} words.
{style_instructions.get(style, style_instructions["bullet_points"])}

Content:
{content}"""

        return await self._generate(prompt, system_prompt)

    async def improve_card(
        self,
        front: str,
        back: str,
        card_type: str,
        suggestions: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Improve a flashcard's quality."""
        system_prompt = "You are an expert at creating effective flashcards following evidence-based learning principles."

        suggestions_text = f"User suggestions: {', '.join(suggestions)}" if suggestions else ""

        prompt = f"""Improve this flashcard:

Type: {card_type}
Front: {front}
Back: {back}

{suggestions_text}

Follow these principles:
- Make questions specific and unambiguous
- Keep answers concise
- Focus on one concept per card
- Use active recall principles

Provide:
IMPROVED_FRONT:
[Improved question]

IMPROVED_BACK:
[Improved answer]

CHANGES:
- Change 1
- Change 2

QUALITY_SCORE:
[0.0 to 1.0]"""

        response = await self._generate(prompt, system_prompt)

        improved_front = front
        improved_back = back
        changes = []
        quality_score = 0.8

        current_section = None
        for line in response.split("\n"):
            line = line.strip()
            if "IMPROVED_FRONT:" in line:
                current_section = "front"
                continue
            elif "IMPROVED_BACK:" in line:
                current_section = "back"
                continue
            elif "CHANGES:" in line:
                current_section = "changes"
                continue
            elif "QUALITY_SCORE:" in line:
                current_section = "score"
                continue

            if current_section == "front" and line:
                improved_front = line
            elif current_section == "back" and line:
                improved_back = line
            elif current_section == "changes" and line.startswith("-"):
                changes.append(line[1:].strip())
            elif current_section == "score" and line:
                try:
                    quality_score = float(line)
                except ValueError:
                    pass

        return {
            "improved_front": improved_front,
            "improved_back": improved_back,
            "changes": changes or ["Reviewed for clarity"],
            "quality_score": min(1.0, max(0.0, quality_score)),
        }

    async def chat(
        self,
        messages: List[Any],
        context: Optional[str] = None,
        card_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Chat with AI tutor."""
        system_prompt = """You are a helpful AI tutor. Your goal is to help students learn effectively.
- Ask clarifying questions when needed
- Provide examples and explanations
- Encourage active learning
- Be patient and supportive"""

        if context:
            system_prompt += f"\n\nContext: {context}"

        # Build conversation
        conversation = ""
        for msg in messages:
            role = msg.role if hasattr(msg, "role") else msg.get("role", "user")
            content = msg.content if hasattr(msg, "content") else msg.get("content", "")
            conversation += f"{role.upper()}: {content}\n"

        prompt = f"{conversation}\n\nProvide a helpful response and optionally suggest related topics to explore."

        response = await self._generate(prompt, system_prompt)

        # Extract suggestions if mentioned
        suggestions = []
        if "suggest" in response.lower() or "explore" in response.lower():
            for line in response.split("\n"):
                if line.strip().startswith("-"):
                    suggestions.append(line.strip()[1:].strip())

        return {
            "response": response,
            "suggestions": suggestions[:3],
        }

    async def generate_question_variations(
        self,
        question: str,
        num_variations: int = 3,
    ) -> List[str]:
        """Generate variations of a question."""
        system_prompt = "You are an expert at creating varied practice questions."

        prompt = f"""Create {num_variations} variations of this question.
Each variation should test the same concept but phrase it differently.

Original question: {question}

Provide variations as a numbered list."""

        response = await self._generate(prompt, system_prompt)

        variations = []
        for line in response.split("\n"):
            line = line.strip()
            if line and (line[0].isdigit() or line.startswith("-")):
                variation = line.lstrip("0123456789.-) ").strip()
                if variation and variation != question:
                    variations.append(variation)

        return variations[:num_variations] if variations else [question]
