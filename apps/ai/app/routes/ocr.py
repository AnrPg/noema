# =============================================================================
# OCR (OPTICAL CHARACTER RECOGNITION) ROUTES
# =============================================================================

import io
from typing import List, Optional

import structlog
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

logger = structlog.get_logger()
router = APIRouter()


class OCRResult(BaseModel):
    text: str
    confidence: float
    language: Optional[str] = None
    blocks: List[dict] = []


class OCRBatchResult(BaseModel):
    results: List[OCRResult]
    total_files: int
    successful: int


@router.post("/image", response_model=OCRResult)
async def extract_text_from_image(
    file: UploadFile = File(...),
    language: str = Query(default="eng", description="OCR language (e.g., eng, fra, deu)"),
    psm: int = Query(default=3, ge=0, le=13, description="Page segmentation mode"),
) -> OCRResult:
    """
    Extract text from an image using OCR.

    Page Segmentation Modes (PSM):
    - 0: Orientation and script detection (OSD) only
    - 1: Automatic page segmentation with OSD
    - 3: Fully automatic page segmentation (default)
    - 6: Assume a single uniform block of text
    - 7: Treat the image as a single text line
    - 11: Sparse text - find as much text as possible
    """
    logger.info(
        "OCR request",
        filename=file.filename,
        language=language,
        psm=psm,
    )

    # Validate file type
    allowed_types = [
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/tiff",
        "image/bmp",
    ]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {file.content_type}",
        )

    try:
        import pytesseract
        from PIL import Image

        # Read image
        content = await file.read()
        image = Image.open(io.BytesIO(content))

        # Configure Tesseract
        config = f"--psm {psm}"

        # Perform OCR
        text = pytesseract.image_to_string(
            image,
            lang=language,
            config=config,
        )

        # Get detailed data for confidence
        data = pytesseract.image_to_data(
            image,
            lang=language,
            config=config,
            output_type=pytesseract.Output.DICT,
        )

        # Calculate average confidence
        confidences = [int(c) for c in data["conf"] if int(c) > 0]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        # Extract blocks
        blocks = []
        current_block = -1
        block_text = []

        for i, word in enumerate(data["text"]):
            if data["block_num"][i] != current_block:
                if block_text:
                    blocks.append(
                        {
                            "block_num": current_block,
                            "text": " ".join(block_text),
                        }
                    )
                current_block = data["block_num"][i]
                block_text = []

            if word.strip():
                block_text.append(word)

        if block_text:
            blocks.append(
                {
                    "block_num": current_block,
                    "text": " ".join(block_text),
                }
            )

        logger.info(
            "OCR completed",
            text_length=len(text),
            confidence=avg_confidence,
            blocks=len(blocks),
        )

        return OCRResult(
            text=text.strip(),
            confidence=avg_confidence / 100,  # Normalize to 0-1
            language=language,
            blocks=blocks,
        )

    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="OCR service not available (pytesseract not installed)",
        )
    except Exception as e:
        logger.error("OCR failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch", response_model=OCRBatchResult)
async def extract_text_batch(
    files: List[UploadFile] = File(...),
    language: str = Query(default="eng"),
) -> OCRBatchResult:
    """
    Extract text from multiple images.
    """
    logger.info("Batch OCR request", file_count=len(files))

    results = []
    successful = 0

    for file in files:
        try:
            result = await extract_text_from_image(file, language)
            results.append(result)
            successful += 1
        except Exception as e:
            logger.warning(
                "OCR failed for file",
                filename=file.filename,
                error=str(e),
            )
            results.append(
                OCRResult(
                    text="",
                    confidence=0.0,
                    language=language,
                    blocks=[],
                )
            )

    return OCRBatchResult(
        results=results,
        total_files=len(files),
        successful=successful,
    )


@router.post("/pdf")
async def extract_text_from_pdf_images(
    file: UploadFile = File(...),
    language: str = Query(default="eng"),
    dpi: int = Query(default=300, ge=72, le=600),
) -> dict:
    """
    Extract text from a scanned PDF using OCR.
    Converts PDF pages to images and performs OCR on each.
    """
    logger.info(
        "PDF OCR request",
        filename=file.filename,
        language=language,
        dpi=dpi,
    )

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="File must be a PDF",
        )

    try:
        import fitz  # PyMuPDF
        import pytesseract
        from PIL import Image

        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")

        pages = []
        full_text = []

        for page_num, page in enumerate(doc):
            # Convert page to image
            mat = fitz.Matrix(dpi / 72, dpi / 72)  # Scale for DPI
            pix = page.get_pixmap(matrix=mat)

            # Convert to PIL Image
            img = Image.frombytes(
                "RGB",
                [pix.width, pix.height],
                pix.samples,
            )

            # OCR
            text = pytesseract.image_to_string(img, lang=language)

            pages.append(
                {
                    "page": page_num + 1,
                    "text": text.strip(),
                    "word_count": len(text.split()),
                }
            )
            full_text.append(text)

        combined_text = "\n\n".join(full_text)

        logger.info(
            "PDF OCR completed",
            pages=len(pages),
            total_words=len(combined_text.split()),
        )

        return {
            "text": combined_text.strip(),
            "pages": pages,
            "page_count": len(pages),
            "word_count": len(combined_text.split()),
        }

    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Required library not available: {str(e)}",
        )
    except Exception as e:
        logger.error("PDF OCR failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/languages")
async def get_available_languages() -> dict:
    """
    Get list of available OCR languages.
    """
    try:
        import pytesseract

        languages = pytesseract.get_languages()

        # Language name mapping
        lang_names = {
            "eng": "English",
            "fra": "French",
            "deu": "German",
            "spa": "Spanish",
            "ita": "Italian",
            "por": "Portuguese",
            "rus": "Russian",
            "chi_sim": "Chinese (Simplified)",
            "chi_tra": "Chinese (Traditional)",
            "jpn": "Japanese",
            "kor": "Korean",
            "ara": "Arabic",
            "hin": "Hindi",
            "nld": "Dutch",
        }

        return {
            "languages": [
                {
                    "code": lang,
                    "name": lang_names.get(lang, lang),
                }
                for lang in languages
                if lang != "osd"  # Exclude OSD
            ],
        }

    except ImportError:
        return {
            "languages": [],
            "error": "pytesseract not installed",
        }
