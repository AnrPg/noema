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

## ⚙️ Configuration & Settings System

Manthanein features a **professional-grade settings system** designed for power users while remaining intuitive for beginners. Every setting includes explanations, and the system tracks your configuration history for easy rollback.

### 🏗️ Architecture Overview

#### Hierarchical Scopes

Settings are resolved through a 6-level hierarchy, where lower scopes override higher ones:

| Scope        | Description                  | Example Use Case                  |
| ------------ | ---------------------------- | --------------------------------- |
| **Global**   | System-wide defaults         | App installation defaults         |
| **Profile**  | User preferences (synced)    | Your personal study style         |
| **Deck**     | Per-deck overrides           | Japanese deck needs different TTS |
| **Template** | Per-card-template settings   | Audio cards need longer timers    |
| **Session**  | Temporary session settings   | "Focus mode" for exam prep        |
| **Device**   | Device-specific (not synced) | Volume, haptics on this phone     |

> 💡 **Tip**: Most users only need Profile settings. Use Deck/Template overrides when you have specific needs for certain content.

---

### 📚 Settings Categories

#### 1. Study Settings

Control your daily learning workload and scheduling algorithm.

| Setting                 | Default | Recommendation                               |
| ----------------------- | ------- | -------------------------------------------- |
| **Daily Card Goal**     | 50      | Start with 20-30 if new to spaced repetition |
| **New Cards Per Day**   | 20      | Keep at 10-15 for sustainable learning       |
| **Max Reviews Per Day** | 200     | Increase if reviews pile up                  |
| **Session Duration**    | 20 min  | 15-25 min maintains focus                    |
| **Scheduler**           | FSRS    | Best accuracy; SM-2 for simplicity           |

> ⚠️ **Warning**: Setting "New Cards Per Day" too high causes review backlogs. Each new card generates 5-7 reviews in the first month!

**Scheduler Options:**

- **FSRS** (Recommended): Most accurate, adapts to your memory patterns
- **SM-2**: Classic algorithm, simpler but less adaptive
- **HLR**: Duolingo's algorithm, good for language learning

#### 2. Display Settings

Customize the visual experience.

| Setting            | Options                    | Notes                            |
| ------------------ | -------------------------- | -------------------------------- |
| **Theme**          | Light / Dark / System      | System follows device settings   |
| **Font Size**      | Small → XL                 | Affects card content readability |
| **Card Animation** | Flip / Slide / Fade / None | "None" for faster reviews        |
| **Show Timer**     | On/Off                     | Helps pace your responses        |

> 💡 **Tip**: Enable "Dark Mode" for night studying to reduce eye strain.

#### 3. Audio Settings

Configure sounds, haptics, and text-to-speech.

| Setting             | Default | Notes                                       |
| ------------------- | ------- | ------------------------------------------- |
| **Sound Effects**   | On      | Feedback sounds for actions                 |
| **Haptic Feedback** | On      | Vibration feedback (disable if distracting) |
| **TTS Enabled**     | Off     | Auto-read cards aloud                       |
| **TTS Voice**       | System  | Some voices better for languages            |
| **TTS Speed**       | 1.0x    | Slow down for learning pronunciation        |

> ⚠️ **Warning**: TTS increases battery usage. Enable only for language learning decks.

#### 4. Notification Settings

Control reminders and alerts.

| Setting             | Default | Recommendation                        |
| ------------------- | ------- | ------------------------------------- |
| **Daily Reminder**  | On      | Set at a consistent time you'll study |
| **Reminder Time**   | 9:00 AM | Morning reviews have better retention |
| **Streak Warnings** | On      | Helps maintain your streak            |
| **Weekly Digest**   | On      | Review your progress                  |

> 💡 **Tip**: Set your reminder 30 minutes before a routine activity (breakfast, commute) to build a habit.

#### 5. Privacy Settings

Control data collection and sharing.

| Setting                | Default | Description                           |
| ---------------------- | ------- | ------------------------------------- |
| **Analytics**          | On      | Anonymous usage stats improve the app |
| **Crash Reports**      | On      | Helps fix bugs faster                 |
| **Share Progress**     | Friends | Who can see your stats                |
| **Profile Visibility** | Public  | Your profile in leaderboards          |

> 🔒 **Privacy Note**: All AI processing can be done locally. Enable "Local AI Only" in AI Settings for maximum privacy.

#### 6. Sync Settings

Configure cross-device synchronization.

| Setting                 | Default | Description                                |
| ----------------------- | ------- | ------------------------------------------ |
| **Auto Sync**           | On      | Sync when app opens/closes                 |
| **Sync Frequency**      | 5 min   | How often to check for changes             |
| **Offline Mode**        | Auto    | Manual/Auto/Disabled                       |
| **Conflict Resolution** | Ask     | What to do when device and server disagree |

**Conflict Resolution Options:**

- **Ask** (Default): Prompt you to choose which version to keep
- **Server Wins**: Always use the server version
- **Local Wins**: Always use this device's version
- **Newest Wins**: Keep whichever was modified most recently

> ⚠️ **Warning**: "Local Wins" can cause data loss if you forget to sync before switching devices.

#### 7. Accessibility Settings

Make the app easier to use.

| Setting                 | Description                        |
| ----------------------- | ---------------------------------- |
| **High Contrast**       | Increases text/background contrast |
| **Reduce Motion**       | Disables animations                |
| **Large Touch Targets** | Makes buttons bigger               |
| **Screen Reader Hints** | Enhanced VoiceOver/TalkBack        |
| **Auto-Advance**        | Automatically show next card       |

#### 8. AI Settings

Configure AI-powered features. **All AI features are opt-in.**

| Setting                  | Default | Description                   |
| ------------------------ | ------- | ----------------------------- |
| **AI Enabled**           | Off     | Master switch for AI features |
| **Card Suggestions**     | Off     | AI suggests related cards     |
| **Smart Scheduling**     | Off     | AI adjusts intervals          |
| **Local Processing**     | On      | Keep data on device           |
| **Explain AI Decisions** | On      | Show why AI made suggestions  |

> 🤖 **AI Rules**:
>
> - AI never changes your data without confirmation
> - All AI suggestions can be dismissed
> - AI decisions are always explainable
> - You can disable AI entirely at any time

#### 9. Advanced Settings

For power users and troubleshooting.

| Setting                   | Description               | Warning            |
| ------------------------- | ------------------------- | ------------------ |
| **Debug Mode**            | Shows technical info      | Slows app          |
| **Verbose Logging**       | Detailed logs for support | Uses storage       |
| **Experimental Features** | Try new features early    | May be unstable    |
| **Cache Size**            | Local cache limit         | Lower = slower     |
| **Export Format**         | JSON / CSV / Anki         | JSON most complete |

#### 10. Plugin Settings

Settings contributed by installed plugins appear here. Each plugin defines its own configuration options using JSON Schema.

> 🧩 **Plugin Safety**: Only install plugins from trusted sources. Review permissions before installation.

---

### 📜 Configuration History

Every settings change is logged with:

- **Timestamp**: When the change occurred
- **Scope**: Which level (Global/Profile/Deck/etc.)
- **Source**: Who made the change (User/Plugin/System/Import)
- **Before/After**: Previous and new values
- **Impact**: Human-readable explanation of what changed

**Viewing History:**

1. Go to Settings → History (clock icon)
2. See checkpoints or recent changes
3. Tap any change to see details
4. Use "Restore" to rollback

---

### ⭐ Last Known Good Configuration (LKGC)

LKGC is your "safety checkpoint" – a configuration snapshot you've verified works well.

**When to Tag LKGC:**

- After finding settings that work for you
- Before experimenting with new settings
- When the app suggests it (after meeting criteria)

**Auto-Suggestion Criteria:**
The app will suggest tagging LKGC when:

- ✅ Configuration stable for 7+ days
- ✅ 10+ successful study sessions
- ✅ 80%+ average accuracy
- ✅ 100+ cards reviewed
- ✅ No reported issues

**Using LKGC:**

1. **Tag**: Settings → LKGC → "Tag Current as LKGC"
2. **Restore**: Settings → LKGC → "Restore LKGC"
3. **View**: See what settings were saved with LKGC

> 💡 **Tip**: Always tag LKGC after optimizing your scheduler settings. It's your safety net if experiments go wrong.

---

### 📤 Export & Import

**Export** your full configuration:

1. Settings → Advanced → Export Configuration
2. Choose format (JSON recommended)
3. Save or share the file

**Import** a configuration:

1. Settings → Advanced → Import Configuration
2. Select your config file
3. Review changes before applying

> ⚠️ **Warning**: Importing replaces your current settings. Export your current config first as a backup.

---

### 🔄 Reset Options

| Action                     | Scope                  | Use Case            |
| -------------------------- | ---------------------- | ------------------- |
| **Reset Section**          | Single category        | Fix one broken area |
| **Reset All**              | Everything             | Fresh start         |
| **Rollback to LKGC**       | Return to tagged state | Undo experiments    |
| **Rollback to Checkpoint** | Any saved checkpoint   | Precise restoration |

---

### 🎯 Quick Start Recommendations

**For Beginners:**

1. Keep defaults for first week
2. Set Daily Reminder to a consistent time
3. Start with 15 new cards/day
4. Use FSRS scheduler

**For Language Learners:**

1. Enable TTS for target language decks
2. Set TTS speed to 0.8x initially
3. Use Deck-level overrides for pronunciation practice

**For Exam Prep:**

1. Increase Daily Goal temporarily
2. Create a "Focus" session profile
3. Disable notifications during study
4. Use Session scope for temporary settings

**For Privacy-Conscious Users:**

1. Disable Analytics
2. Enable "Local AI Only"
3. Set Profile Visibility to "Private"
4. Use "Local Wins" for sync conflicts

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

````bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# View AI service logs
docker-compose logs -f ai

# Stop all services
docker-compose down

# Rebuild AI service after changes
docker-compose build ai && docker

### Submodule Commands

```bash
# Initialize submodules after cloning
git submodule update --init

# Update submodule to latest upstream commit
git submodule update --remote

# After updating, commit the new submodule reference
git add apps/ai/halflife-regression
git commit -m "chore: update halflife-regression submodule"
````

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
