# =============================================================================
# AI ROUTES MODULE
# =============================================================================

from app.routes import analyze, audio, embed, generate, health, ocr, parse, recommend

__all__ = [
    "health",
    "parse",
    "embed",
    "generate",
    "analyze",
    "recommend",
    "ocr",
    "audio",
]
