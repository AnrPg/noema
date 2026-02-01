# =============================================================================
# AUDIO PROCESSING ROUTES
# =============================================================================

import io
import os
import tempfile
from typing import List, Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.config import settings

logger = structlog.get_logger()
router = APIRouter()


class TranscriptionResult(BaseModel):
    text: str
    language: Optional[str] = None
    duration_seconds: Optional[float] = None
    segments: List[dict] = []
    confidence: Optional[float] = None


class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"
    model: str = "tts-1"
    speed: float = 1.0


class AudioGenerationResult(BaseModel):
    audio_url: str
    duration_seconds: float
    format: str


@router.post("/transcribe", response_model=TranscriptionResult)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Query(default=None, description="Language code (e.g., en, es, fr)"),
    model: str = Query(default="whisper-1", description="Transcription model"),
) -> TranscriptionResult:
    """
    Transcribe audio file to text using OpenAI Whisper.

    Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm
    """
    logger.info(
        "Transcription request",
        filename=file.filename,
        content_type=file.content_type,
        language=language,
    )

    # Validate file type
    allowed_types = [
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/m4a",
        "audio/wav",
        "audio/webm",
        "audio/x-wav",
        "video/mp4",
        "video/webm",
        "audio/ogg",
    ]

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {file.content_type}",
        )

    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured",
        )

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        # Read file content
        content = await file.read()

        # Create temporary file for OpenAI API
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=os.path.splitext(file.filename)[1] if file.filename else ".mp3",
        ) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Transcribe with Whisper
            with open(tmp_path, "rb") as audio_file:
                kwargs = {
                    "model": model,
                    "file": audio_file,
                    "response_format": "verbose_json",
                }

                if language:
                    kwargs["language"] = language

                response = await client.audio.transcriptions.create(**kwargs)

            # Extract segments if available
            segments = []
            if hasattr(response, "segments") and response.segments:
                segments = [
                    {
                        "start": seg.start,
                        "end": seg.end,
                        "text": seg.text,
                    }
                    for seg in response.segments
                ]

            logger.info(
                "Transcription completed",
                text_length=len(response.text),
                duration=getattr(response, "duration", None),
            )

            return TranscriptionResult(
                text=response.text,
                language=getattr(response, "language", language),
                duration_seconds=getattr(response, "duration", None),
                segments=segments,
                confidence=None,  # Whisper doesn't provide confidence scores
            )

        finally:
            # Clean up temp file
            os.unlink(tmp_path)

    except Exception as e:
        logger.error("Transcription failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def generate_speech(
    request: TTSRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Generate speech from text using OpenAI TTS.

    Available voices: alloy, echo, fable, onyx, nova, shimmer
    """
    logger.info(
        "TTS request",
        text_length=len(request.text),
        voice=request.voice,
    )

    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured",
        )

    # Validate voice
    valid_voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    if request.voice not in valid_voices:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid voice. Choose from: {', '.join(valid_voices)}",
        )

    # Validate text length
    if len(request.text) > 4096:
        raise HTTPException(
            status_code=400,
            detail="Text too long. Maximum 4096 characters.",
        )

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        response = await client.audio.speech.create(
            model=request.model,
            voice=request.voice,
            input=request.text,
            speed=request.speed,
        )

        # Get audio content
        audio_content = response.content

        # In production, upload to storage and return URL
        # For now, return base64 encoded audio
        import base64

        audio_base64 = base64.b64encode(audio_content).decode()

        # Estimate duration (rough estimate: ~150 words per minute)
        words = len(request.text.split())
        estimated_duration = (words / 150) * 60 / request.speed

        logger.info(
            "TTS completed",
            audio_size=len(audio_content),
            estimated_duration=estimated_duration,
        )

        return {
            "audio_base64": audio_base64,
            "format": "mp3",
            "estimated_duration_seconds": estimated_duration,
            "voice": request.voice,
        }

    except Exception as e:
        logger.error("TTS failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pronunciation")
async def generate_pronunciation(
    word: str = Query(..., description="Word to pronounce"),
    language: str = Query(default="en", description="Language code"),
    voice: str = Query(default="nova", description="TTS voice"),
) -> dict:
    """
    Generate pronunciation audio for a word or phrase.
    Useful for vocabulary flashcards.
    """
    logger.info("Pronunciation request", word=word, language=language)

    # Generate slow pronunciation
    request = TTSRequest(
        text=word,
        voice=voice,
        speed=0.8,  # Slower for clarity
    )

    from fastapi import BackgroundTasks

    result = await generate_speech(request, BackgroundTasks())
    result["word"] = word
    result["language"] = language

    return result


@router.get("/voices")
async def get_available_voices() -> dict:
    """
    Get list of available TTS voices.
    """
    return {
        "voices": [
            {"id": "alloy", "name": "Alloy", "description": "Neutral and balanced"},
            {"id": "echo", "name": "Echo", "description": "Warm and conversational"},
            {"id": "fable", "name": "Fable", "description": "Expressive and dynamic"},
            {"id": "onyx", "name": "Onyx", "description": "Deep and authoritative"},
            {"id": "nova", "name": "Nova", "description": "Friendly and upbeat"},
            {"id": "shimmer", "name": "Shimmer", "description": "Clear and professional"},
        ],
        "models": [
            {"id": "tts-1", "name": "Standard", "description": "Fast, good quality"},
            {"id": "tts-1-hd", "name": "HD", "description": "Higher quality, slower"},
        ],
    }


@router.post("/analyze")
async def analyze_audio(
    file: UploadFile = File(...),
) -> dict:
    """
    Analyze audio file properties.
    """
    try:
        from pydub import AudioSegment

        content = await file.read()

        # Detect format from content type
        format_map = {
            "audio/mpeg": "mp3",
            "audio/mp3": "mp3",
            "audio/wav": "wav",
            "audio/x-wav": "wav",
            "audio/ogg": "ogg",
            "audio/m4a": "m4a",
            "audio/mp4": "mp4",
        }

        audio_format = format_map.get(file.content_type, "mp3")

        # Load audio
        audio = AudioSegment.from_file(
            io.BytesIO(content),
            format=audio_format,
        )

        return {
            "duration_seconds": len(audio) / 1000,
            "channels": audio.channels,
            "sample_rate": audio.frame_rate,
            "bit_depth": audio.sample_width * 8,
            "format": audio_format,
            "size_bytes": len(content),
        }

    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Audio analysis not available (pydub not installed)",
        )
    except Exception as e:
        logger.error("Audio analysis failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
