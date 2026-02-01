# 🧠 Manthanein - AI-Enhanced Spaced Repetition Learning Platform

A cross-platform flashcard and spaced repetition learning application with AI-powered features, gamification, and research-backed algorithms.

## ✨ Features

- **15+ Card Types**: Basic, Cloze, Multiple Choice, Matching, Ordering, Image Occlusion, Audio, Comparison, Cause-Effect, Timeline, and more
- **Research-Backed Algorithms**: FSRS v6.1.1, HLR (Duolingo), SM-2
- **AI-Powered Generation**: Automatic flashcard creation from documents
- **Document Parsing**: PDF, DOCX, PPTX, images (with OCR)
- **Gamification**: XP, levels, achievements, streaks, skill trees
- **Plugin System**: Extensible architecture for custom features
- **Offline-First**: WatermelonDB for seamless offline experience
- **Cross-Platform**: iOS, Android, Web from single codebase

## 🚀 Quick Start

### Prerequisites

Make sure you have these installed:

- **Node.js** >= 18.0.0 ([Download](https://nodejs.org/))
- **pnpm** >= 8.0.0 (Install: `npm install -g pnpm`)
- **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop/))
- **Python** >= 3.11 (for AI service)
- **Git** ([Download](https://git-scm.com/))

### 1️⃣ Initial Setup

```bash
# Clone the repository (with submodules)
git clone --recurse-submodules <your-repo-url>
cd Manthanein

# If you already cloned without --recurse-submodules, run:
git submodule update --init

# Install all dependencies
pnpm install

# Copy environment variables
cp env.example .env

# Edit .env with your configuration (add API keys for AI features)
```

### 2️⃣ Start Development Services

```bash
# Start all infrastructure (PostgreSQL, Redis, MinIO, Qdrant)
docker-compose up -d

# Verify all services are running
docker-compose ps

# Services running:
# - flashcard-postgres (port 5432) - Main database
# - flashcard-redis (port 6379) - Cache & pub/sub
# - flashcard-minio (ports 9000, 9001) - File storage
# - flashcard-qdrant (ports 6333, 6334) - Vector database
# - flashcard-adminer (port 8080) - Database UI
# - manthanein-ai (port 8001) - AI service
```

### 3️⃣ Start Development

```bash
# Run database migrations
pnpm --filter @manthanein/api prisma migrate dev

# Start all services
pnpm dev

# Or start individual services:
pnpm --filter @manthanein/api dev      # Backend API
pnpm --filter @manthanein/mobile dev   # Mobile app
```

### 4️⃣ Access Development Tools

- **Mobile App**: http://localhost:8081 (Expo web)
- **API Docs**: http://localhost:3000/graphql (GraphQL Playground)
- **AI Docs**: http://localhost:8001/docs (FastAPI Swagger)
- **Adminer (Database UI)**: http://localhost:8080
- **MinIO Console**: http://localhost:9001

## 📦 Project Structure

```
Manthanein/
├── packages/
│   ├── shared/              # Shared code
│   │   └── src/
│   │       ├── types/       # TypeScript definitions
│   │       ├── algorithms/  # FSRS, HLR, schedulers
│   │       ├── plugins/     # Plugin manager
│   │       └── gamification/ # XP, achievements, streaks
│   └── api/                 # Backend API
│       ├── prisma/          # Database schema
│       └── src/
│           ├── routes/      # REST endpoints
│           ├── graphql/     # GraphQL schema & resolvers
│           └── config/      # Environment, database, etc.
├── apps/
│   ├── mobile/              # React Native (Expo)
│   │   ├── app/             # File-based routing
│   │   └── src/
│   │       ├── stores/      # Zustand state
│   │       ├── services/    # API client
│   │       └── theme/       # UI theming
│   └── ai/                  # Python AI Service
│       └── app/
│           ├── routes/      # FastAPI endpoints
│           └── services/    # AI business logic
└── docker-compose.yml
```

## 📚 Tech Stack

### Frontend (Mobile)

- **React Native** + **Expo** (iOS, Android, Web)
- **Expo Router** - File-based navigation
- **NativeWind** - Tailwind CSS for React Native
- **Zustand** - State management
- **TanStack Query** - Server state & caching
- **WatermelonDB** - Offline-first database
- **Reanimated** - Smooth animations

### Backend (API)

- **Node.js** + **Fastify** - High-performance server
- **Mercurius** - GraphQL for Fastify
- **Prisma** - Type-safe database ORM
- **PostgreSQL** - Primary database
- **Redis** - Caching & pub/sub
- **MinIO** - S3-compatible file storage

### AI Service

- **Python** + **FastAPI** - AI microservice
- **sentence-transformers** - Local embeddings
- **OpenAI/Anthropic** - LLM providers
- **Qdrant** - Vector database
- **PyMuPDF** - PDF parsing
- **pytesseract** - OCR

### Algorithms

- **FSRS v6.1.1** - Free Spaced Repetition Scheduler
- **HLR** - Half-Life Regression (Duolingo) - [Git Submodule](https://github.com/duolingo/halflife-regression)
- **SM-2** - SuperMemo algorithm

> **Note**: The HLR algorithm is included as a git submodule from Duolingo's research repository. See [Submodules](#-git-submodules) section for details.

## 🛠️ Development Commands

```bash
# Install dependencies
pnpm install

# Start all services
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Lint & format
pnpm lint
pnpm format

# Database operations
pnpm --filter @manthanein/api prisma studio     # Open Prisma Studio
pnpm --filter @manthanein/api prisma migrate dev # Run migrations
pnpm --filter @manthanein/api prisma generate    # Generate client
```

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# View AI service logs
docker-compose logs -f ai

# Stop all services
docker-compose down

# Rebuild AI service after changes
docker-compose build ai && docker-compose up -d ai

# Remove all data (CAUTION)
docker-compose down -v
```

## 🔌 Plugin System

Create custom plugins to extend functionality:

```typescript
import { PluginManager, Plugin } from "@manthanein/shared";

const myPlugin: Plugin = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  type: "card-type",
  hooks: {
    onCardCreate: async (card) => {
      // Custom logic
      return card;
    },
  },
};

PluginManager.register(myPlugin);
```

## 🎮 Gamification

Built-in gamification features:

- **XP System**: Earn XP for reviews, streaks, achievements
- **Levels**: Progress through learning levels
- **Achievements**: Unlock badges for milestones
- **Streaks**: Daily study streak tracking
- **Skill Trees**: Unlock advanced features

## 📦 Git Submodules

This project includes external repositories as git submodules:

| Submodule           | Path                          | Source                                                                          | Purpose                         |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------- |
| halflife-regression | `apps/ai/halflife-regression` | [duolingo/halflife-regression](https://github.com/duolingo/halflife-regression) | HLR spaced repetition algorithm |

### Submodule Commands

```bash
# Initialize submodules after cloning
git submodule update --init

# Update submodule to latest upstream commit
git submodule update --remote

# After updating, commit the new submodule reference
git add apps/ai/halflife-regression
git commit -m "chore: update halflife-regression submodule"
```

> ⚠️ **Important**: Changes made inside a submodule are committed to your local clone only. You cannot push to the original Duolingo repository unless you have write access. If you need to modify the submodule, fork it first and update `.gitmodules` to point to your fork.

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

**Built with ❤️ for learners everywhere. Let's make studying enjoyable! 🚀**
