# =============================================================================
# DOCUMENT PARSING ROUTES
# =============================================================================

from enum import Enum
from typing import List, Optional

import structlog
from app.services.card_generator import CardGenerator
from app.services.parsers import (
    DocxParser,
    ExcelParser,
    HTMLParser,
    MarkdownParser,
    PDFParser,
    PowerPointParser,
    TextParser,
)
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel

logger = structlog.get_logger()
router = APIRouter()


class FileType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    DOC = "doc"
    TXT = "txt"
    MD = "md"
    XLSX = "xlsx"
    XLS = "xls"
    PPTX = "pptx"
    PPT = "ppt"
    HTML = "html"


class ParsedSection(BaseModel):
    title: Optional[str] = None
    content: str
    page: Optional[int] = None
    section_type: str = "text"
    metadata: dict = {}


class ParseResponse(BaseModel):
    filename: str
    file_type: str
    sections: List[ParsedSection]
    total_pages: Optional[int] = None
    word_count: int
    metadata: dict


class GenerateCardsRequest(BaseModel):
    content: str
    card_types: List[str] = ["basic", "cloze"]
    max_cards: int = 20
    difficulty: str = "medium"
    language: str = "en"


class GeneratedCard(BaseModel):
    type: str
    front: str
    back: str
    hints: List[str] = []
    tags: List[str] = []
    difficulty: float


class GenerateCardsResponse(BaseModel):
    cards: List[GeneratedCard]
    source_summary: str


# Parser registry
PARSERS = {
    "pdf": PDFParser,
    "docx": DocxParser,
    "doc": DocxParser,
    "txt": TextParser,
    "md": MarkdownParser,
    "xlsx": ExcelParser,
    "xls": ExcelParser,
    "pptx": PowerPointParser,
    "ppt": PowerPointParser,
    "html": HTMLParser,
}


def get_file_extension(filename: str) -> str:
    """Extract file extension."""
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


@router.post("/document", response_model=ParseResponse)
async def parse_document(
    file: UploadFile = File(...),
    extract_images: bool = False,
    extract_tables: bool = True,
) -> ParseResponse:
    """
    Parse a document and extract structured content.

    Supported formats: PDF, DOCX, TXT, MD, XLSX, PPTX, HTML
    """
    extension = get_file_extension(file.filename or "")

    if extension not in PARSERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {extension}. Supported: {list(PARSERS.keys())}",
        )

    logger.info("Parsing document", filename=file.filename, extension=extension)

    try:
        # Read file content
        content = await file.read()

        # Get appropriate parser
        parser_class = PARSERS[extension]
        parser = parser_class()

        # Parse document
        result = await parser.parse(
            content,
            filename=file.filename,
            extract_images=extract_images,
            extract_tables=extract_tables,
        )

        logger.info(
            "Document parsed successfully",
            filename=file.filename,
            sections=len(result.sections),
            word_count=result.word_count,
        )

        return result

    except Exception as e:
        logger.error("Failed to parse document", filename=file.filename, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to parse document: {str(e)}")


@router.post("/generate-cards", response_model=GenerateCardsResponse)
async def generate_cards_from_content(request: GenerateCardsRequest) -> GenerateCardsResponse:
    """
    Generate flashcards from parsed content using AI.
    """
    logger.info(
        "Generating cards",
        card_types=request.card_types,
        max_cards=request.max_cards,
        content_length=len(request.content),
    )

    try:
        generator = CardGenerator()
        result = await generator.generate(
            content=request.content,
            card_types=request.card_types,
            max_cards=request.max_cards,
            difficulty=request.difficulty,
            language=request.language,
        )

        logger.info("Cards generated", count=len(result.cards))
        return result

    except Exception as e:
        logger.error("Failed to generate cards", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to generate cards: {str(e)}")


@router.post("/batch")
async def parse_multiple_documents(
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = None,
) -> dict:
    """
    Parse multiple documents asynchronously.
    Returns a job ID to track progress.
    """
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per batch")

    # Generate job ID
    import uuid

    job_id = str(uuid.uuid4())

    # TODO: Add to background job queue
    logger.info("Batch parsing started", job_id=job_id, file_count=len(files))

    return {
        "job_id": job_id,
        "status": "processing",
        "file_count": len(files),
        "message": "Documents are being processed. Check /jobs/{job_id} for status.",
    }
