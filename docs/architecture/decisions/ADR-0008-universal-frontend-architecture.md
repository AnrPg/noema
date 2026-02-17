# ADR-0008: Universal Frontend Architecture

## Status

Accepted

## Date

2026-02-17

## Context

Noema is a doctoral-level research platform for metacognitive learning that
requires ubiquitous access across all devices. Users will:

1. Conduct **deep learning sessions** on desktop/tablet (extended study)
2. Perform **quick reviews** on mobile (commute, breaks)
3. Receive **micro-reminders** on smartwatch (due card alerts, quick recall)
4. Access **anywhere** via web browser (any device)

Key requirements identified:

- **Offline-first**: Critical for spaced repetition (users review anywhere)
- **All platforms**: Web, iOS, Android, macOS, Windows, Linux, watchOS, Wear OS
- **Agent-created sessions**: Agents generate learning sessions; all clients
  consume them
- **No time pressure**: Architecture over speed; invest in long-term
  maintainability
- **Team capacity**: Resources available for separate codebases where necessary

## Decision

We adopt a **Layered Universal Platform** architecture with maximum code sharing
across platforms, native implementations where required for optimal UX, and a
unified offline sync engine.

### 1. Platform Strategy

| Platform        | Technology               | Rationale                                |
| --------------- | ------------------------ | ---------------------------------------- |
| **Web**         | Next.js 14+ (App Router) | Best DX, SSR, PWA capability             |
| **Mobile**      | React Native + Expo      | Native performance, WatermelonDB         |
| **Desktop**     | Tauri (Rust)             | Native Linux/Windows/macOS, small bundle |
| **Tablet**      | Adaptive Mobile App      | Same RN codebase with responsive UI      |
| **Apple Watch** | Native SwiftUI           | WatchOS requires native                  |
| **Wear OS**     | Native Kotlin/Compose    | Wear OS requires native                  |

### 2. Shared Packages Architecture

```
packages/
├── core/                    # Business logic (TypeScript)
│   ├── stores/              # Zustand state management
│   ├── api/                 # Generated OpenAPI client
│   ├── sync/                # Offline sync engine
│   ├── fsrs/                # FSRS scheduling algorithm
│   └── types/               # Shared TypeScript types
│
├── ui/                      # Design system
│   ├── tokens/              # Design tokens (colors, spacing, typography)
│   ├── primitives/          # Headless components (platform-agnostic)
│   ├── web/                 # React DOM renderers
│   └── native/              # React Native renderers
│
├── storage/                 # Storage abstraction layer
│   ├── interface/           # IStorageAdapter contract
│   ├── dexie/               # Web: IndexedDB via Dexie
│   ├── watermelon/          # Mobile: WatermelonDB (SQLite)
│   └── sqlite/              # Desktop: better-sqlite3 via Tauri
│
└── watch-bridge/            # Watch ↔ Phone communication
    ├── ios/                 # WatchConnectivity wrapper
    └── android/             # Data Layer API wrapper
```

### 3. App Structure

```
apps/
├── web/                     # Next.js 14+
│   ├── app/                 # App Router
│   │   ├── (auth)/          # Login, register, forgot password
│   │   ├── (dashboard)/     # Main authenticated app
│   │   ├── learn/           # Study sessions
│   │   ├── library/         # Cards, decks, categories
│   │   └── settings/        # User preferences
│   └── components/          # Web-specific components
│
├── mobile/                  # React Native + Expo
│   ├── app/                 # Expo Router (file-based)
│   │   ├── (auth)/
│   │   ├── (tabs)/
│   │   └── learn/
│   └── components/          # Mobile-specific components
│
├── desktop/                 # Tauri
│   ├── src-tauri/           # Rust backend
│   │   ├── src/             # Tauri commands, system integration
│   │   └── Cargo.toml
│   └── ui/                  # Embeds web app or shared React
│
├── watchos/                 # Native Swift
│   ├── NoemaWatch/          # WatchOS app
│   │   ├── Views/           # SwiftUI views
│   │   ├── Models/          # Data models
│   │   └── Services/        # WatchConnectivity
│   └── NoemaWatchExtension/ # Complications
│
└── wearos/                  # Native Kotlin
    ├── app/src/main/
    │   ├── java/.../        # Kotlin/Compose UI
    │   └── res/
    └── tiles/               # Glanceable tiles
```

### 4. Offline Sync Strategy

#### Storage Adapter Interface

```typescript
interface IStorageAdapter {
  // Basic CRUD
  get<T>(collection: string, id: string): Promise<T | null>;
  set<T>(collection: string, id: string, value: T): Promise<void>;
  delete(collection: string, id: string): Promise<void>;

  // Queries
  query<T>(collection: string, filter: QueryFilter): Promise<T[]>;

  // Sync operations
  getChangesSince(timestamp: number): Promise<Change[]>;
  applyChanges(changes: Change[]): Promise<ApplyResult>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

#### Sync Engine

```typescript
interface ISyncEngine {
  // Track local modifications
  trackChange(change: LocalChange): void;

  // Sync with server
  sync(): Promise<SyncResult>;

  // Conflict resolution
  resolveConflict(local: Entity, server: Entity): ResolvedEntity;

  // Status
  getSyncStatus(): SyncStatus;
  getPendingChanges(): LocalChange[];
}
```

#### Conflict Resolution Strategies (per entity type)

| Entity Type     | Strategy                                         |
| --------------- | ------------------------------------------------ |
| User Settings   | Last-write-wins with vector clocks               |
| Card Reviews    | Union merge (keep all attempts, never lose data) |
| Card Content    | User choice with visual diff                     |
| Progress Data   | Union merge (preserve all progress)              |
| Graph Mutations | CKG: server wins; PKG: client wins               |

### 5. Watch Implementation

Watches are **companion devices**, not standalone apps:

```
┌─────────────────────────────────────────────────────┐
│                    WATCH                             │
│  ┌───────────────────────────────────────────────┐  │
│  │  Cached Data (from phone):                    │  │
│  │  - Due cards count                            │  │
│  │  - Today's progress (cards reviewed, XP)      │  │
│  │  - 10-20 pre-fetched cards for quick review   │  │
│  │  - Session created by agents (simplified)     │  │
│  └───────────────────────────────────────────────┘  │
│                         ↕                            │
│                 [Platform Bridge]                    │
│            WatchConnectivity (iOS)                   │
│            Data Layer API (Android)                  │
└─────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────┐
│                    PHONE                             │
│  ┌───────────────────────────────────────────────┐  │
│  │  Full Offline Database (WatermelonDB)         │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  Watch Sync Coordinator                 │  │  │
│  │  │  - Pushes due cards to watch            │  │  │
│  │  │  - Receives review results from watch   │  │  │
│  │  │  - Updates local DB                     │  │  │
│  │  │  - Syncs to cloud when online           │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Watch MVP Features:**

- Display due cards count (complication/tile)
- Quick review of agent-created session cards
- Simple yes/no or swipe gestures for recall rating
- Voice input for typed answers (optional)
- Progress sync back to phone

### 6. Design System

Since no existing design exists, we create a custom design system:

#### Design Tokens

```typescript
// packages/ui/tokens/colors.ts
export const colors = {
  // Semantic colors
  primary: { 50: '...', 100: '...', ..., 900: '...' },
  secondary: { ... },
  success: { ... },
  warning: { ... },
  error: { ... },

  // Semantic aliases
  background: { default: '...', paper: '...', elevated: '...' },
  text: { primary: '...', secondary: '...', disabled: '...' },
  border: { default: '...', focus: '...' },
} as const;

// packages/ui/tokens/spacing.ts
export const spacing = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48,
} as const;

// packages/ui/tokens/typography.ts
export const typography = {
  fontFamily: { sans: '...', mono: '...' },
  fontSize: { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, ... },
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  lineHeight: { tight: 1.25, normal: 1.5, relaxed: 1.75 },
} as const;
```

#### Headless Primitives

Platform-agnostic logic components that render differently per platform:

```typescript
// packages/ui/primitives/button.tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}

// packages/ui/web/button.tsx - React DOM renderer
// packages/ui/native/button.tsx - React Native renderer
```

### 7. State Management

#### Zustand Stores (shared across platforms)

```typescript
// packages/core/stores/auth.store.ts
interface AuthState {
  user: User | null;
  tokens: TokenPair | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  updateProfile: (updates: ProfileUpdate) => Promise<void>;
}

// packages/core/stores/session.store.ts
interface SessionState {
  currentSession: LearningSession | null;
  cards: Card[];
  currentCardIndex: number;

  // Actions
  startSession: (config: SessionConfig) => Promise<void>;
  recordAttempt: (attempt: Attempt) => Promise<void>;
  endSession: () => Promise<void>;
}

// packages/core/stores/sync.store.ts
interface SyncState {
  status: 'idle' | 'syncing' | 'error';
  lastSyncAt: number | null;
  pendingChanges: number;

  // Actions
  sync: () => Promise<void>;
  forceSync: () => Promise<void>;
}
```

### 8. API Client Generation

Auto-generate typed API client from OpenAPI specs:

```typescript
// packages/core/api/client.ts
// Generated from services/*/docs/api/openapi.yaml

import { createClient } from '@hey-api/client-fetch';

export const apiClient = createClient({
  baseUrl: process.env.API_URL,
  headers: () => ({
    Authorization: `Bearer ${getAccessToken()}`,
  }),
});

// Type-safe methods
export const userApi = {
  create: (data: CreateUserRequest) => apiClient.post('/users', data),
  getById: (id: string) => apiClient.get(`/users/${id}`),
  update: (id: string, data: UpdateUserRequest) =>
    apiClient.patch(`/users/${id}`, data),
  delete: (id: string) => apiClient.delete(`/users/${id}`),
  // ... authentication methods
};
```

## Implementation Priority

### Phase 1: Foundation (Weeks 1-4)

1. `packages/core` — Stores, API client, types
2. `packages/ui` — Design tokens, primitives
3. `packages/storage` — Interface + Dexie adapter (web)

### Phase 2: Web App (Weeks 5-10)

1. `apps/web` — Full Next.js implementation
   - Authentication flows
   - Dashboard
   - Learning sessions
   - Library management
   - Settings
2. Integration with user-service backend

### Phase 3: Mobile App (Weeks 11-18)

1. `packages/storage/watermelon` — WatermelonDB adapter
2. `apps/mobile` — React Native + Expo
   - Same features as web
   - Offline-first with full sync
   - Responsive tablet layouts

### Phase 4: Desktop App (Weeks 19-22)

1. `apps/desktop` — Tauri wrapper
   - Embeds web UI or dedicated React build
   - Native file system access
   - System notifications
   - Auto-updates

### Phase 5: Offline Sync Engine (Weeks 23-26)

1. `packages/sync` — Full sync implementation
   - Change tracking
   - Conflict resolution
   - Background sync
   - Queue management

### Phase 6: Watch Apps (Weeks 27-32)

1. `packages/watch-bridge` — Phone ↔ Watch communication
2. `apps/watchos` — Apple Watch native
3. `apps/wearos` — Wear OS native

## Consequences

### Positive

- **Maximum code sharing** (70-80% across web/mobile/desktop)
- **Single source of truth** for business logic and types
- **True offline-first** across all platforms
- **Native where it matters** (watch apps, desktop integration)
- **Flexible foundation** for future platforms
- **Type-safe throughout** with generated API clients

### Negative

- **Higher initial complexity** than single-platform approach
- **Watch apps require platform-specific teams** (Swift, Kotlin)
- **Sync complexity** with CRDT/vector clocks
- **Testing overhead** across multiple platforms

### Risks & Mitigations

| Risk                         | Mitigation                                    |
| ---------------------------- | --------------------------------------------- |
| Package coupling issues      | Clear interfaces, dependency injection        |
| Platform-specific bugs       | Extensive E2E testing per platform            |
| Sync conflicts in production | Conservative conflict resolution, user choice |
| Watch API changes            | Abstract behind bridge layer                  |

## Alternatives Considered

### Single PWA for All

**Rejected because:**

- Inferior offline support compared to native SQLite
- No true desktop integration (Linux/Windows native)
- Cannot access watch OS APIs

### Separate Codebases Per Platform

**Rejected because:**

- 4x development effort
- Inconsistent behavior across platforms
- Type drift between implementations

### React Native Web (One Codebase)

**Rejected because:**

- Web bundle size concerns
- SSR complexity with RN Web
- Desktop would still need separate approach

### Flutter

**Rejected because:**

- Dart ecosystem less mature than TypeScript
- Harder to share with existing TS backend types
- Watch support still requires native

## References

- [Noema Project Context](../../PROJECT_CONTEXT.md)
- [ADR-0001: Dual-Graph Architecture](./ADR-0001-dual-graph-architecture.md)
- [ADR-0007: User Service Implementation](./ADR-0007-user-service-implementation.md)
- [Tauri Documentation](https://tauri.app/)
- [WatermelonDB](https://watermelondb.dev/)
- [Expo Router](https://expo.github.io/router/)
