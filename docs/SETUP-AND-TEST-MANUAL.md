# 🧠 Manthanein - Complete Setup & Testing Manual

A comprehensive guide for setting up, testing, and using the Manthanein AI-Enhanced Spaced Repetition Learning Platform.

---

## 📋 Table of Contents

1. [Prerequisites](#-prerequisites)
2. [Initial Project Setup](#-step-1-initial-project-setup)
3. [Start Infrastructure Services](#-step-2-start-infrastructure-services)
4. [Database Setup](#-step-3-database-setup)
5. [Run Tests](#-step-4-run-tests)
6. [Start Development Servers](#-step-5-start-development-servers)
7. [Access the Applications](#-step-6-access-the-applications)
8. [Test API Endpoints](#-step-7-test-api-endpoints)
9. [Using the Mobile App](#-step-8-using-the-mobile-app)
10. [Docker Commands Reference](#-step-9-docker-commands-reference)
11. [Troubleshooting](#-step-10-troubleshooting)
12. [Development Workflow Summary](#-step-11-development-workflow-summary)
13. [Quick Start Commands](#-quick-start-commands)

---

## 📋 Prerequisites

Before starting, ensure you have the following installed:

| Tool               | Version   | Installation                                                |
| ------------------ | --------- | ----------------------------------------------------------- |
| **Node.js**        | >= 18.0.0 | [Download](https://nodejs.org/)                             |
| **pnpm**           | >= 8.0.0  | `npm install -g pnpm`                                       |
| **Docker Desktop** | Latest    | [Download](https://www.docker.com/products/docker-desktop/) |
| **Python**         | >= 3.11   | For AI service (if running locally)                         |
| **Git**            | Latest    | [Download](https://git-scm.com/)                            |

### Verify Installation

```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Check pnpm version
pnpm --version  # Should be >= 8.0.0

# Check Docker
docker --version
docker-compose --version

# Check Python (optional, for local AI development)
python3 --version  # Should be >= 3.11
```

---

## 🚀 Step 1: Initial Project Setup

### 1.1 Clone and Enter Project Directory

```bash
# Clone with submodules (recommended)
git clone --recurse-submodules <your-repo-url>
cd Manthanein
```

> **Note**: This project uses git submodules for external dependencies (e.g., Duolingo's HLR algorithm). The `--recurse-submodules` flag ensures they are cloned automatically.

**If you already cloned without submodules:**

```bash
git submodule update --init
```

### 1.2 Install All Dependencies

```bash
pnpm install
```

### 1.3 Setup Environment Variables

```bash
# Copy the example environment file
cp env.example .env
```

### 1.4 Edit `.env` File

Open `.env` in your editor and configure these key values:

```bash
# DATABASE (note: docker-compose uses port 5435 externally)
DATABASE_URL="postgresql://flashcard_user:flashcard_dev_password@localhost:5435/flashcard_db"

# REDIS
REDIS_URL="redis://localhost:6379"

# JWT AUTHENTICATION
# Generate a secure secret using: openssl rand -base64 32
JWT_SECRET="your-secure-random-secret-key-here"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# API SERVER
PORT=3000
NODE_ENV=development
CORS_ORIGIN="*"

# MINIO / S3 STORAGE
MINIO_ENDPOINT="localhost"
MINIO_PORT=9000
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin123"
MINIO_BUCKET_NAME="flashcards"
MINIO_USE_SSL=false

# QDRANT VECTOR DATABASE
QDRANT_URL="http://localhost:6333"

# AI SERVICES (Optional - for AI features)
OPENAI_API_KEY=""      # Get from https://platform.openai.com/api-keys
ANTHROPIC_API_KEY=""   # Get from https://console.anthropic.com/

# EXPO / REACT NATIVE
EXPO_PUBLIC_API_URL="http://localhost:3000"
EXPO_PUBLIC_WS_URL="ws://localhost:3000"
```

---

## 🐳 Step 2: Start Infrastructure Services

### 2.1 Start All Docker Services

```bash
docker-compose up -d
```

### 2.2 Verify All Services Are Running

```bash
docker-compose ps
```

**Expected Services:**

| Container            | Port        | Purpose               | Health Check     |
| -------------------- | ----------- | --------------------- | ---------------- |
| `flashcard-postgres` | 5435 → 5432 | PostgreSQL database   | `pg_isready`     |
| `flashcard-redis`    | 6379        | Cache & real-time     | `redis-cli ping` |
| `flashcard-minio`    | 9000, 9001  | S3-compatible storage | `mc ready`       |
| `flashcard-qdrant`   | 6333, 6334  | Vector database (AI)  | TCP check        |
| `flashcard-adminer`  | 8080        | Database UI           | -                |
| `manthanein-ai`      | 8001        | AI service            | `curl /health`   |

### 2.3 View Service Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f ai
docker-compose logs -f redis
```

### 2.4 Check Individual Service Health

```bash
# PostgreSQL
docker exec flashcard-postgres pg_isready -U flashcard_user -d flashcard_db

# Redis
docker exec flashcard-redis redis-cli ping

# AI Service
curl http://localhost:8001/health
```

---

## 🗄️ Step 3: Database Setup

### 3.1 Build Shared Package First

The shared package contains types and algorithms used by other packages:

```bash
pnpm build:shared
```

### 3.2 Generate Prisma Client

```bash
pnpm --filter @manthanein/api db:generate
```

### 3.3 Run Database Migrations

```bash
pnpm --filter @manthanein/api db:migrate
```

When prompted, provide a name for the migration (e.g., "init").

### 3.4 Push Schema (Alternative to Migrations)

For quick prototyping without migration history:

```bash
pnpm --filter @manthanein/api db:push
```

### 3.5 Seed Initial Data (Optional)

```bash
pnpm --filter @manthanein/api db:seed
```

### 3.6 Open Prisma Studio (Database GUI)

```bash
pnpm --filter @manthanein/api db:studio
```

Access at: **http://localhost:5555**

---

## 🧪 Step 4: Run Tests

### 4.1 Run All Tests

```bash
pnpm test
```

### 4.2 Run Tests for Specific Package

```bash
# Test shared package (algorithms, types, gamification)
pnpm --filter @manthanein/shared test

# Test API package
pnpm --filter @manthanein/api test
```

### 4.3 Run Tests in Watch Mode

```bash
# Watch mode for continuous testing during development
pnpm --filter @manthanein/shared test:watch
```

### 4.4 Type Checking

```bash
# Check all packages
pnpm typecheck

# Specific package
pnpm --filter @manthanein/api typecheck
pnpm --filter @manthanein/mobile typecheck
pnpm --filter @manthanein/shared typecheck
```

### 4.5 Linting

```bash
# Lint all packages
pnpm lint

# Format code with Prettier
pnpm format
```

### 4.6 Full Quality Check

```bash
# Run all checks before committing
pnpm lint && pnpm typecheck && pnpm test
```

---

## 🖥️ Step 5: Start Development Servers

### 5.1 Start All Services (Recommended)

```bash
pnpm dev
```

This starts in parallel using Turborepo:

- Backend API on `http://localhost:3000`
- Mobile app on `http://localhost:8081`
- Shared package in watch mode

### 5.2 Start Individual Services

```bash
# Backend API only
pnpm --filter @manthanein/api dev

# Mobile app only
pnpm --filter @manthanein/mobile start

# Shared package in watch mode
pnpm --filter @manthanein/shared dev
```

### 5.3 Start Mobile App for Specific Platform

```bash
# Web browser
pnpm --filter @manthanein/mobile web

# iOS Simulator (macOS only)
pnpm --filter @manthanein/mobile ios

# Android Emulator
pnpm --filter @manthanein/mobile android
```

---

## 📱 Step 6: Access the Applications

### 6.1 Mobile App (Expo)

| Platform             | Access Method                                                          |
| -------------------- | ---------------------------------------------------------------------- |
| **Web Browser**      | http://localhost:8081                                                  |
| **iOS Simulator**    | Run `pnpm --filter @manthanein/mobile ios`                             |
| **Android Emulator** | Run `pnpm --filter @manthanein/mobile android`                         |
| **Physical Device**  | Scan QR code from terminal with [Expo Go](https://expo.dev/client) app |

### 6.2 Backend API

| Tool                   | URL                                 | Description             |
| ---------------------- | ----------------------------------- | ----------------------- |
| **REST API**           | http://localhost:3000               | Main API endpoint       |
| **GraphQL Playground** | http://localhost:3000/graphql       | Interactive GraphQL IDE |
| **Swagger API Docs**   | http://localhost:3000/documentation | REST API documentation  |
| **Health Check**       | http://localhost:3000/health        | Server health status    |

### 6.3 AI Service

| Tool                   | URL                          | Description           |
| ---------------------- | ---------------------------- | --------------------- |
| **FastAPI Swagger UI** | http://localhost:8001/docs   | Interactive API docs  |
| **ReDoc**              | http://localhost:8001/redoc  | Alternative API docs  |
| **Health Check**       | http://localhost:8001/health | Service health status |

### 6.4 Development Tools

| Tool                 | URL                             | Credentials                                                                                          |
| -------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Adminer (DB UI)**  | http://localhost:8080           | Server: `postgres`<br>User: `flashcard_user`<br>Pass: `flashcard_dev_password`<br>DB: `flashcard_db` |
| **MinIO Console**    | http://localhost:9001           | User: `minioadmin`<br>Pass: `minioadmin123`                                                          |
| **Prisma Studio**    | http://localhost:5555           | Run `pnpm db:studio` first                                                                           |
| **Qdrant Dashboard** | http://localhost:6333/dashboard | No auth required                                                                                     |

---

## 🔍 Step 7: Test API Endpoints

### 7.1 Health Checks

```bash
# Backend API health
curl http://localhost:3000/health

# AI Service health
curl http://localhost:8001/health

# Expected response: {"status": "ok", ...}
```

### 7.2 GraphQL Queries

Open **http://localhost:3000/graphql** and try these queries:

#### Health Query

```graphql
query {
  health {
    status
    timestamp
  }
}
```

#### Get User (after authentication)

```graphql
query {
  me {
    id
    email
    displayName
    createdAt
  }
}
```

### 7.3 REST API Testing

#### Register a New User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securePassword123",
    "displayName": "Test User"
  }'
```

#### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securePassword123"
  }'
```

### 7.4 AI Service Endpoints

#### Test Document Parsing

```bash
curl -X POST http://localhost:8001/parse/upload \
  -F "file=@/path/to/your/document.pdf"
```

#### Test Text Embeddings

```bash
curl -X POST http://localhost:8001/embed/text \
  -H "Content-Type: application/json" \
  -d '{"text": "What is spaced repetition learning?"}'
```

#### Test AI Flashcard Generation

```bash
curl -X POST http://localhost:8001/generate/flashcards \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Spaced repetition is a learning technique that incorporates increasing intervals of time between subsequent review of previously learned material.",
    "count": 5,
    "card_type": "basic"
  }'
```

#### Test OCR

```bash
curl -X POST http://localhost:8001/ocr/image \
  -F "file=@/path/to/your/image.png"
```

#### Test Content Analysis

```bash
curl -X POST http://localhost:8001/analyze/content \
  -H "Content-Type: application/json" \
  -d '{"content": "Your text content to analyze..."}'
```

---

## 📝 Step 8: Using the Mobile App

### 8.1 Authentication Flow

1. **Open the app** at http://localhost:8081
2. **Register** - Navigate to `/register` to create a new account
3. **Login** - Use `/login` with your credentials
4. **Forgot Password** - Access `/forgot-password` if needed

### 8.2 Main Navigation (Tabs)

| Tab          | Route       | Description                   |
| ------------ | ----------- | ----------------------------- |
| **Home**     | `/`         | Dashboard with stats overview |
| **Decks**    | `/decks`    | Manage flashcard decks        |
| **Study**    | `/study`    | Active study sessions         |
| **Progress** | `/progress` | Learning statistics & charts  |
| **Profile**  | `/profile`  | User settings & preferences   |

### 8.3 Study Workflow

1. **Create a Deck**
   - Go to Decks tab
   - Tap "Create New Deck"
   - Enter deck name and description

2. **Add Cards**
   - Open a deck
   - Tap "Add Card"
   - Choose card type:
     - Basic (Front/Back)
     - Cloze (Fill-in-the-blank)
     - Multiple Choice
     - Image Occlusion
     - And more...

3. **Start Studying**
   - Select a deck
   - Tap "Study Now"
   - Review cards and rate your recall:
     - **Again** - Complete blackout
     - **Hard** - Struggled to recall
     - **Good** - Correct with effort
     - **Easy** - Instant recall

4. **Track Progress**
   - View XP earned
   - Check streak status
   - Monitor learning statistics
   - Unlock achievements

### 8.4 AI Features

- **Auto-Generate Cards**: Upload documents and let AI create flashcards
- **Smart Recommendations**: Get personalized study suggestions
- **Content Analysis**: Analyze learning materials for key concepts

---

## 🐳 Step 9: Docker Commands Reference

### Basic Operations

```bash
# Start all services in detached mode
docker-compose up -d

# Stop all services
docker-compose down

# Restart all services
docker-compose restart

# View running containers
docker-compose ps
```

### Logs & Debugging

```bash
# View all logs (follow mode)
docker-compose logs -f

# View specific service logs
docker-compose logs -f ai
docker-compose logs -f postgres
docker-compose logs -f redis

# View last 100 lines
docker-compose logs --tail=100 ai
```

### Service Management

```bash
# Restart a specific service
docker-compose restart ai
docker-compose restart postgres

# Rebuild and restart AI service after code changes
docker-compose build ai && docker-compose up -d ai

# Stop a specific service
docker-compose stop ai

# Start a specific service
docker-compose start ai
```

### Data Management

```bash
# Remove all containers (keeps data volumes)
docker-compose down

# Remove all containers AND data volumes (CAUTION!)
docker-compose down -v

# Remove all containers, volumes, and images
docker-compose down -v --rmi all
```

### Database Access

```bash
# Connect to PostgreSQL directly
docker exec -it flashcard-postgres psql -U flashcard_user -d flashcard_db

# Connect to Redis CLI
docker exec -it flashcard-redis redis-cli

# Backup database
docker exec flashcard-postgres pg_dump -U flashcard_user flashcard_db > backup.sql

# Restore database
docker exec -i flashcard-postgres psql -U flashcard_user flashcard_db < backup.sql
```

---

## 🛠️ Step 10: Troubleshooting

### Common Issues & Solutions

| Issue                               | Possible Cause                   | Solution                                         |
| ----------------------------------- | -------------------------------- | ------------------------------------------------ |
| **Port already in use**             | Another process using the port   | `docker-compose down` and check: `lsof -i :PORT` |
| **Database connection error**       | PostgreSQL not healthy           | Check: `docker-compose ps postgres`              |
| **Prisma migration fails**          | Wrong DATABASE_URL port          | Use port `5435` in `.env`                        |
| **AI service not starting**         | Missing dependencies or API keys | Check: `docker-compose logs ai`                  |
| **Mobile app can't connect to API** | Wrong API URL                    | Verify `EXPO_PUBLIC_API_URL` in `.env`           |
| **Redis connection refused**        | Redis not running                | Check: `docker-compose ps redis`                 |
| **MinIO access denied**             | Wrong credentials                | Verify MINIO credentials in `.env`               |

### Debug Commands

```bash
# Check all container status
docker-compose ps

# Check container resource usage
docker stats

# Inspect a specific container
docker inspect flashcard-postgres

# Check network connectivity
docker network ls
docker network inspect manthanein_flashcard-network
```

### Reset Everything

```bash
# Nuclear option - complete reset
docker-compose down -v          # Stop and remove all containers & volumes
pnpm clean                      # Remove all node_modules
rm -rf node_modules             # Extra cleanup
pnpm install                    # Fresh install
docker-compose up -d            # Start infrastructure
pnpm build:shared               # Build shared package
pnpm db:migrate                 # Setup database
pnpm dev                        # Start development
```

### Log Analysis

```bash
# Check for errors in AI service
docker-compose logs ai 2>&1 | grep -i error

# Check PostgreSQL for connection issues
docker-compose logs postgres 2>&1 | grep -i "connection\|error"

# Monitor real-time logs for all services
docker-compose logs -f --tail=50
```

---

## 📊 Step 11: Development Workflow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT WORKFLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SETUP (One-time)                                                │
│  ─────────────────                                               │
│  1. pnpm install              # Install dependencies             │
│  2. cp env.example .env       # Setup environment                │
│  3. docker-compose up -d      # Start infrastructure             │
│  4. pnpm build:shared         # Build shared package             │
│  5. pnpm db:migrate           # Setup database                   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DAILY DEVELOPMENT                                               │
│  ─────────────────                                               │
│  1. docker-compose up -d      # Ensure services running          │
│  2. pnpm dev                  # Start all dev servers            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ACCESS POINTS                                                   │
│  ─────────────                                                   │
│  • Mobile App:     http://localhost:8081                         │
│  • API GraphQL:    http://localhost:3000/graphql                 │
│  • API Swagger:    http://localhost:3000/documentation           │
│  • AI Docs:        http://localhost:8001/docs                    │
│  • Database UI:    http://localhost:8080                         │
│  • MinIO Console:  http://localhost:9001                         │
│  • Prisma Studio:  http://localhost:5555 (run db:studio)         │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TESTING & QUALITY                                               │
│  ─────────────────                                               │
│  • pnpm test                  # Run all tests                    │
│  • pnpm typecheck             # Type checking                    │
│  • pnpm lint                  # Linting                          │
│  • pnpm format                # Format code                      │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE COMMITTING                                               │
│  ─────────────────                                               │
│  pnpm lint && pnpm typecheck && pnpm test                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Quick Start Commands

### One-Liner Setup (After Cloning)

```bash
git submodule update --init && pnpm install && cp env.example .env && docker-compose up -d && pnpm build:shared && pnpm db:migrate && pnpm dev
```

### Daily Development Start

```bash
docker-compose up -d && pnpm dev
```

### Quick Test & Lint

```bash
pnpm lint && pnpm typecheck && pnpm test
```

### Complete Reset

```bash
docker-compose down -v && pnpm clean && pnpm install && docker-compose up -d && pnpm build:shared && pnpm db:migrate
```

---

## 📦 Git Submodules

This project includes external repositories as git submodules:

| Submodule           | Path                          | Source                                                                          |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| halflife-regression | `apps/ai/halflife-regression` | [duolingo/halflife-regression](https://github.com/duolingo/halflife-regression) |

### Managing Submodules

```bash
# Initialize after cloning (if you didn't use --recurse-submodules)
git submodule update --init

# Update to latest upstream commit
git submodule update --remote

# Check submodule status
git submodule status
```

> ⚠️ **Important**: Commits inside a submodule stay in your local clone. You cannot push to the original repository (e.g., Duolingo's repo) without write access. To make persistent changes, fork the submodule repo and update `.gitmodules` to point to your fork.

---

## 📚 Additional Resources

- **README.md** - Project overview and features
- **packages/api/prisma/schema.prisma** - Database schema
- **apps/ai/README.md** - AI service documentation
- **docker-compose.yml** - Infrastructure configuration

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run quality checks: `pnpm lint && pnpm typecheck && pnpm test`
5. Commit with conventional commits: `pnpm commit`
6. Push and create a Pull Request

---

**Built with ❤️ for learners everywhere. Happy studying! 🚀**
