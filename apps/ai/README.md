# Manthanein AI Service

AI-powered backend service for the Manthanein flashcard and spaced repetition application.

## Features

- **Document Parsing**: Extract text from PDF, DOCX, PPTX, images (OCR), and more
- **Embeddings**: Generate semantic embeddings using sentence-transformers
- **Vector Search**: Semantic search using Qdrant vector database
- **Audio Transcription**: Speech-to-text using OpenAI Whisper
- **AI Flashcard Generation**: Automatically generate flashcards from documents
- **Multi-LLM Support**: Integration with OpenAI, Anthropic, and Google AI

## API Endpoints

### Health
- `GET /health` - Health check endpoint

### Embeddings
- `POST /embeddings/generate` - Generate embeddings for text
- `POST /embeddings/search` - Semantic search in vector database

### Documents
- `POST /documents/parse` - Parse and extract text from documents
- `POST /documents/analyze` - Analyze document structure

### Flashcards
- `POST /flashcards/generate` - AI-generate flashcards from content
- `POST /flashcards/improve` - Improve existing flashcard content

### Audio
- `POST /audio/transcribe` - Transcribe audio to text

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `GOOGLE_AI_API_KEY` | Google AI API key | - |
| `QDRANT_HOST` | Qdrant server host | `localhost` |
| `QDRANT_PORT` | Qdrant server port | `6333` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run the server
uvicorn src.main:app --reload --port 8000

# Run tests
pytest
```

## Docker

```bash
# Build image
docker build -t manthanein-ai .

# Run container
docker run -p 8000:8000 manthanein-ai
```

## License

MIT
