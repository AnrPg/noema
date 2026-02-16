# 🎯 Design Patterns for Noema Architecture

**Complete guide to design patterns that will benefit your AI-enhanced spaced repetition platform**

---

## 📚 Table of Contents

1. [Architectural Patterns](#architectural-patterns)
2. [Microservices Patterns](#microservices-patterns)
3. [Event-Driven Patterns](#event-driven-patterns)
4. [Domain-Driven Design Patterns](#domain-driven-design-patterns)
5. [Agent & AI Patterns](#agent--ai-patterns)
6. [Data Patterns](#data-patterns)
7. [Resilience Patterns](#resilience-patterns)
8. [API Patterns](#api-patterns)
9. [Testing Patterns](#testing-patterns)
10. [Performance Patterns](#performance-patterns)

---

## 1. 🏗️ Architectural Patterns

### 1.1 Microservices Architecture
**What:** Decompose application into small, independent services
**Why for Noema:** 
- 15 services can scale independently
- Different services can use different tech stacks
- Easier to update individual learning algorithms
- Fault isolation (one service failure doesn't break everything)

**Implementation:**
```
noema/
├── user-service/           # User management
├── content-service/        # Cards, decks
├── scheduler-service/      # FSRS algorithm
├── knowledge-graph-service/ # Ontology
└── [11 more services]
```

---

### 1.2 Event-Driven Architecture (EDA)
**What:** Services communicate via events instead of direct calls
**Why for Noema:**
- Loose coupling between services
- Async processing (e.g., analytics don't block card review)
- Event replay for debugging
- Audit trail for learning progress

**Implementation:**
```typescript
// Card created → Multiple services react
card.created event →
  - gamification-service awards XP
  - analytics-service updates stats
  - knowledge-graph-service links concepts
  - metacognition-service tracks patterns
```

---

### 1.3 CQRS (Command Query Responsibility Segregation)
**What:** Separate read and write models
**Why for Noema:**
- Reads (dashboard, analytics) don't affect writes (card reviews)
- Optimize each independently
- Better performance for complex queries

**Implementation:**
```typescript
// Write model
interface CreateCardCommand {
  deckId: string;
  content: CardContent;
}

// Read model (optimized for queries)
interface CardReadModel {
  id: string;
  content: CardContent;
  stats: ReviewStatistics;
  knowledgeGraphPosition: GraphNode;
  // Denormalized data for fast reads
}
```

---

### 1.4 Event Sourcing
**What:** Store state changes as events, not current state
**Why for Noema:**
- Perfect for learning analytics (track every review)
- Can rebuild state at any point in time
- Audit trail for compliance
- Debug user learning patterns

**Implementation:**
```typescript
// Instead of storing current state:
Card { id, difficulty: 5.2, interval: 30 }

// Store events:
[
  CardCreated { id, initialDifficulty: 5.0 },
  CardReviewed { id, rating: 4, newDifficulty: 5.1 },
  CardReviewed { id, rating: 5, newDifficulty: 5.2, newInterval: 30 }
]
// Rebuild state by replaying events
```

---

## 2. 🔄 Microservices Patterns

### 2.1 API Gateway Pattern
**What:** Single entry point for all client requests
**Why for Noema:**
- Mobile app doesn't need to know about 15 services
- Centralized auth, rate limiting, logging
- Routing, request aggregation

**Implementation:**
```
Mobile App → API Gateway → Routes to:
  - /cards → content-service
  - /review → session-service
  - /stats → analytics-service
```

---

### 2.2 Backend for Frontend (BFF)
**What:** Separate backend for each client type
**Why for Noema:**
- Mobile needs different data than web admin
- Optimize for each client's needs

**Implementation:**
```
Mobile BFF → Optimized for mobile (minimal data)
Web Admin BFF → Rich data for analytics dashboards
```

---

### 2.3 Saga Pattern
**What:** Manage distributed transactions across services
**Why for Noema:**
- Complex operations span multiple services
- Need compensating transactions on failure

**Implementation:**
```typescript
// Creating a deck with initial cards
CreateDeckSaga:
  1. content-service.createDeck()
  2. knowledge-graph-service.createDeckNode()
  3. gamification-service.setupDeckAchievements()
  
  If step 2 fails:
  - Compensate: content-service.deleteDeck()
```

---

### 2.4 Strangler Fig Pattern
**What:** Gradually replace legacy system
**Why for Noema:**
- Migrate from monolith to microservices gradually
- Reduce risk

**Implementation:**
```
Phase 1: Extract user-service
Phase 2: Extract content-service
Phase 3: Extract scheduler-service
...
```

---

## 3. 📡 Event-Driven Patterns

### 3.1 Pub/Sub Pattern
**What:** Publishers don't know about subscribers
**Why for Noema:**
- Add new subscribers without changing publishers
- Multiple services can react to same event

**Implementation:**
```typescript
// Publisher (content-service)
eventBus.publish('card.created', { cardId: '123' });

// Subscribers (don't know about each other)
gamification-service.on('card.created', awardXP);
analytics-service.on('card.created', trackCreation);
knowledge-graph-service.on('card.created', linkConcepts);
```

---

### 3.2 Outbox Pattern
**What:** Ensure database updates and events are published atomically
**Why for Noema:**
- No lost events (critical for learning progress)
- Consistency between database and event stream

**Implementation:**
```typescript
// Single transaction
await db.transaction(async (tx) => {
  // 1. Update database
  await tx.cards.create({ id: '123', ... });
  
  // 2. Write to outbox table
  await tx.outbox.create({
    eventType: 'card.created',
    payload: { cardId: '123' },
    published: false
  });
});

// Separate process publishes from outbox
```

---

### 3.3 Event Carried State Transfer
**What:** Events contain enough data for subscribers
**Why for Noema:**
- Subscribers don't need to query publisher
- Reduces coupling

**Implementation:**
```typescript
// Good: Full data in event
{
  type: 'card.reviewed',
  card: { id: '123', content: '...', difficulty: 5.2 },
  review: { rating: 4, duration: 15000 }
}

// Bad: Just ID
{
  type: 'card.reviewed',
  cardId: '123'  // Subscriber must query content-service
}
```

---

## 4. 🎨 Domain-Driven Design Patterns

### 4.1 Bounded Context
**What:** Clear boundaries between domains
**Why for Noema:**
- Each service has its own model
- Same concept can mean different things

**Implementation:**
```
Content Context: Card = { id, front, back, type }
Scheduler Context: Card = { id, difficulty, stability, interval }
Knowledge Graph Context: Card = { id, conceptNodes, relationships }
```

---

### 4.2 Aggregates
**What:** Cluster of entities treated as single unit
**Why for Noema:**
- Transaction boundaries
- Consistency rules

**Implementation:**
```typescript
// Deck is aggregate root
class Deck {
  private cards: Card[];  // Entities within aggregate
  
  addCard(card: Card) {
    // Business rules enforced here
    if (this.cards.length >= this.maxCards) {
      throw new Error('Deck full');
    }
    this.cards.push(card);
    this.publishEvent('card.added', { deckId: this.id, cardId: card.id });
  }
}
```

---

### 4.3 Repository Pattern
**What:** Abstract data access
**Why for Noema:**
- Domain layer doesn't know about database
- Easy to swap databases
- Testable

**Implementation:**
```typescript
interface CardRepository {
  findById(id: string): Promise<Card | null>;
  save(card: Card): Promise<void>;
  findByDeck(deckId: string): Promise<Card[]>;
}

// Implementation
class PrismaCardRepository implements CardRepository {
  async findById(id: string) {
    const data = await prisma.card.findUnique({ where: { id } });
    return data ? this.toDomain(data) : null;
  }
}
```

---

### 4.4 Domain Events
**What:** Events that domain experts care about
**Why for Noema:**
- Capture important business events
- Drive event-driven architecture

**Implementation:**
```typescript
// Domain events
- CardMastered (user achieved 95% confidence)
- StreakBroken (user missed daily review)
- ConceptLinked (knowledge graph connection made)
- DifficultyAdjusted (FSRS algorithm updated card)
```

---

### 4.5 Anti-Corruption Layer
**What:** Translate between different models
**Why for Noema:**
- Protect domain from external systems
- Clean integration

**Implementation:**
```typescript
// External LLM API returns different format
class LLMAdapter {
  toCardContent(llmResponse: LLMResponse): CardContent {
    // Translate external format to domain format
    return {
      front: llmResponse.question,
      back: llmResponse.answer,
      hints: llmResponse.explanations.map(this.toHint)
    };
  }
}
```

---

## 5. 🤖 Agent & AI Patterns

### 5.1 Strategy Pattern
**What:** Interchangeable algorithms
**Why for Noema:**
- Different learning strategies per user
- Easy to add new strategies

**Implementation:**
```typescript
interface LearningStrategy {
  selectNextCard(deck: Deck, user: User): Card;
}

class ExplorationStrategy implements LearningStrategy {
  selectNextCard(deck: Deck, user: User): Card {
    // Breadth-first, serendipitous
  }
}

class GoalDrivenStrategy implements LearningStrategy {
  selectNextCard(deck: Deck, user: User): Card {
    // Targeted, exam-focused
  }
}

// Runtime selection
const strategy = user.currentMode === 'exam' 
  ? new GoalDrivenStrategy() 
  : new ExplorationStrategy();
```

---

### 5.2 Chain of Responsibility
**What:** Pass request through chain of handlers
**Why for Noema:**
- Metacognitive layers process in order
- Each layer can modify or stop processing

**Implementation:**
```typescript
// 8 metacognitive layers
class MetacognitionPipeline {
  private layers = [
    new TelemetryLayer(),
    new ThinkingTraceLayer(),
    new MentalDebuggerLayer(),
    new PatchPlannerLayer(),
    new StrategyEngineLayer(),
    new CalibrationLayer(),
    new KnowledgeGraphLayer(),
    new WatchtowerLayer(),
  ];
  
  async process(input: ReviewSession): Promise<EnrichedSession> {
    let result = input;
    for (const layer of this.layers) {
      result = await layer.process(result);
      if (layer.shouldStop(result)) break;
    }
    return result;
  }
}
```

---

### 5.3 Observer Pattern
**What:** Objects notify observers of changes
**Why for Noema:**
- React to learning events
- Multiple agents observe same data

**Implementation:**
```typescript
class UserKnowledgeState {
  private observers: Observer[] = [];
  
  attach(observer: Observer) {
    this.observers.push(observer);
  }
  
  updateKnowledge(concept: Concept, mastery: number) {
    this.knowledge.set(concept, mastery);
    this.notifyObservers();
  }
  
  private notifyObservers() {
    for (const observer of this.observers) {
      observer.update(this);
    }
  }
}

// Observers
diagnosticAgent.observe(userState);
strategyAgent.observe(userState);
calibrationAgent.observe(userState);
```

---

### 5.4 Template Method Pattern
**What:** Define skeleton, subclasses fill in steps
**Why for Noema:**
- All agents follow same structure
- Customize specific steps

**Implementation:**
```typescript
abstract class BaseAgent {
  async execute(input: AgentInput): Promise<AgentOutput> {
    const validated = this.validateInput(input);
    const context = this.buildContext(validated);
    const result = await this.executeAgentLoop(context);  // Abstract
    const enriched = this.enrichResult(result);
    return this.formatOutput(enriched);
  }
  
  protected abstract executeAgentLoop(context: Context): Promise<Result>;
}

class LearningAgent extends BaseAgent {
  protected async executeAgentLoop(context: Context) {
    // Learning-specific ReAct loop
  }
}
```

---

### 5.5 Decorator Pattern
**What:** Add behavior to objects dynamically
**Why for Noema:**
- Add capabilities to agents at runtime
- Compose complex behaviors

**Implementation:**
```typescript
interface Agent {
  execute(input: Input): Promise<Output>;
}

class CachingDecorator implements Agent {
  constructor(private agent: Agent, private cache: Cache) {}
  
  async execute(input: Input): Promise<Output> {
    const cached = await this.cache.get(input);
    if (cached) return cached;
    
    const result = await this.agent.execute(input);
    await this.cache.set(input, result);
    return result;
  }
}

class LoggingDecorator implements Agent {
  constructor(private agent: Agent, private logger: Logger) {}
  
  async execute(input: Input): Promise<Output> {
    this.logger.info('Executing agent', { input });
    const result = await this.agent.execute(input);
    this.logger.info('Agent completed', { result });
    return result;
  }
}

// Compose
const agent = new LoggingDecorator(
  new CachingDecorator(
    new LearningAgent(),
    cache
  ),
  logger
);
```

---

## 6. 💾 Data Patterns

### 6.1 Cache-Aside Pattern
**What:** Application manages cache
**Why for Noema:**
- Fast access to frequently reviewed cards
- Reduce database load

**Implementation:**
```typescript
async getCard(id: string): Promise<Card> {
  // 1. Try cache
  const cached = await redis.get(`card:${id}`);
  if (cached) return JSON.parse(cached);
  
  // 2. Miss → Load from DB
  const card = await db.cards.findUnique({ where: { id } });
  
  // 3. Store in cache
  await redis.set(`card:${id}`, JSON.stringify(card), 'EX', 3600);
  
  return card;
}
```

---

### 6.2 Read-Through / Write-Through Cache
**What:** Cache intercepts all read/writes
**Why for Noema:**
- Simpler application code
- Consistent caching

**Implementation:**
```typescript
class CachedCardRepository implements CardRepository {
  constructor(
    private db: PrismaCardRepository,
    private cache: Redis
  ) {}
  
  async findById(id: string): Promise<Card> {
    return await this.cache.getOrSet(
      `card:${id}`,
      () => this.db.findById(id),
      3600
    );
  }
}
```

---

### 6.3 Materialized View Pattern
**What:** Pre-compute and store query results
**Why for Noema:**
- Fast analytics dashboards
- Complex knowledge graph queries

**Implementation:**
```typescript
// Instead of computing on every request
SELECT u.*, 
       COUNT(DISTINCT d.id) as deck_count,
       COUNT(c.id) as card_count,
       AVG(r.rating) as avg_rating
FROM users u
JOIN decks d ON d.user_id = u.id
JOIN cards c ON c.deck_id = d.id
JOIN reviews r ON r.card_id = c.id
GROUP BY u.id

// Maintain materialized view
CREATE MATERIALIZED VIEW user_statistics AS ...
REFRESH MATERIALIZED VIEW user_statistics;
```

---

### 6.4 Database per Service Pattern
**What:** Each service has its own database
**Why for Noema:**
- True service independence
- Optimize database for service needs
- Scale independently

**Implementation:**
```
user-service → PostgreSQL (relational user data)
knowledge-graph-service → Neo4j (graph data)
vector-service → Qdrant (vector embeddings)
cache-service → Redis (ephemeral data)
```

---

## 7. 🛡️ Resilience Patterns

### 7.1 Circuit Breaker Pattern
**What:** Stop calling failing service
**Why for Noema:**
- Prevent cascade failures
- Fail fast

**Implementation:**
```typescript
class CircuitBreaker {
  private state = 'closed';  // closed | open | half-open
  private failures = 0;
  private threshold = 5;
  
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      throw new Error('Circuit breaker open');
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      setTimeout(() => this.state = 'half-open', 60000);
    }
  }
}
```

---

### 7.2 Retry Pattern
**What:** Retry failed operations
**Why for Noema:**
- Handle transient failures
- Improve reliability

**Implementation:**
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i); // Exponential backoff
      await sleep(delay);
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

### 7.3 Bulkhead Pattern
**What:** Isolate resources to prevent total failure
**Why for Noema:**
- One heavy query doesn't block all requests
- Resource isolation

**Implementation:**
```typescript
// Separate thread pools
const normalPool = new Pool({ size: 10 });
const heavyQueryPool = new Pool({ size: 2 });
const aiAgentPool = new Pool({ size: 5 });

// Heavy operations use dedicated pool
async function generateCards(topic: string) {
  return await aiAgentPool.execute(() => 
    aiService.generateCards(topic)
  );
}
```

---

### 7.4 Timeout Pattern
**What:** Set time limits on operations
**Why for Noema:**
- Prevent indefinite waiting
- Maintain responsiveness

**Implementation:**
```typescript
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}

// Usage
const cards = await withTimeout(
  aiService.generateCards(topic),
  5000  // 5 second timeout
);
```

---

## 8. 🌐 API Patterns

### 8.1 Pagination Pattern
**What:** Return data in chunks
**Why for Noema:**
- Handle large decks
- Better performance

**Implementation:**
```typescript
// Cursor-based (recommended)
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor?: string;
    hasMore: boolean;
  };
}

// Offset-based (simpler)
interface OffsetPaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}
```

---

### 8.2 Rate Limiting Pattern
**What:** Limit request frequency
**Why for Noema:**
- Prevent abuse
- Fair resource allocation

**Implementation:**
```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private capacity: number,
    private refillRate: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  tryConsume(): boolean {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }
  
  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate / 1000;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}
```

---

### 8.3 Versioning Pattern
**What:** Support multiple API versions
**Why for Noema:**
- Backward compatibility
- Gradual migration

**Implementation:**
```typescript
// URL versioning
app.get('/v1/cards', handlerV1);
app.get('/v2/cards', handlerV2);

// Header versioning
app.get('/cards', (req, res) => {
  const version = req.header('API-Version');
  if (version === '2') {
    return handlerV2(req, res);
  }
  return handlerV1(req, res);
});
```

---

## 9. 🧪 Testing Patterns

### 9.1 Test Pyramid
**What:** Many unit tests, fewer integration, few E2E
**Why for Noema:**
- Fast feedback
- Reliable tests

**Implementation:**
```
     /\      E2E: Test full user flows (10%)
    /  \     
   /____\    Integration: Test service boundaries (30%)
  /      \   
 /________\  Unit: Test business logic (60%)
```

---

### 9.2 Contract Testing
**What:** Test API contracts between services
**Why for Noema:**
- Catch breaking changes early
- Independent deployment

**Implementation:**
```typescript
// content-service publishes contract
describe('Card API Contract', () => {
  it('should return card with required fields', async () => {
    const card = await api.get('/cards/123');
    
    expect(card).toMatchObject({
      id: expect.any(String),
      content: {
        front: expect.any(String),
        back: expect.any(String),
      },
      createdAt: expect.any(String),
    });
  });
});

// scheduler-service verifies contract
```

---

### 9.3 Test Doubles (Mocks, Stubs, Fakes)
**What:** Replace dependencies in tests
**Why for Noema:**
- Fast, isolated tests
- Test edge cases

**Implementation:**
```typescript
// Mock
const mockCardRepo = {
  findById: jest.fn().mockResolvedValue(testCard),
  save: jest.fn(),
};

// Stub
class StubLLMService implements LLMService {
  async generateHints() {
    return ['hint1', 'hint2'];
  }
}

// Fake (in-memory)
class FakeCardRepository implements CardRepository {
  private cards = new Map<string, Card>();
  
  async findById(id: string) {
    return this.cards.get(id) || null;
  }
}
```

---

## 10. ⚡ Performance Patterns

### 10.1 Lazy Loading
**What:** Load data when needed
**Why for Noema:**
- Faster initial load
- Reduce bandwidth

**Implementation:**
```typescript
// Don't load all categories upfront
class Deck {
  private _categories?: Category[];
  
  async getCategories(): Promise<Category[]> {
    if (!this._categories) {
      this._categories = await db.categories.findMany({
        where: { deckId: this.id }
      });
    }
    return this._categories;
  }
}
```

---

### 10.2 Batch Processing
**What:** Process multiple items together
**Why for Noema:**
- Reduce database round trips
- Better throughput

**Implementation:**
```typescript
// Instead of
for (const card of cards) {
  await db.cards.update({ where: { id: card.id }, data: card });
}

// Do
await db.cards.updateMany({
  data: cards.map(c => ({ where: { id: c.id }, data: c }))
});
```

---

### 10.3 Debouncing / Throttling
**What:** Limit function execution rate
**Why for Noema:**
- Reduce API calls as user types
- Better UX

**Implementation:**
```typescript
// Debounce: Execute after quiet period
const debouncedSearch = debounce(async (query: string) => {
  const results = await api.search(query);
  updateUI(results);
}, 300);

// Throttle: Execute at most once per interval
const throttledSave = throttle(async (data: CardData) => {
  await api.updateCard(data);
}, 1000);
```

---

## 📊 Summary: Which Patterns for Which Parts?

### Core Platform
- ✅ Microservices Architecture
- ✅ Event-Driven Architecture
- ✅ API Gateway
- ✅ CQRS
- ✅ Event Sourcing (for reviews)

### Services Layer
- ✅ Repository Pattern
- ✅ Domain Events
- ✅ Bounded Context
- ✅ Aggregates
- ✅ Saga Pattern

### Agents Layer
- ✅ Strategy Pattern
- ✅ Chain of Responsibility
- ✅ Template Method
- ✅ Decorator Pattern
- ✅ Observer Pattern

### Data Layer
- ✅ Database per Service
- ✅ Cache-Aside
- ✅ Materialized Views
- ✅ Outbox Pattern

### Reliability
- ✅ Circuit Breaker
- ✅ Retry with Backoff
- ✅ Bulkhead
- ✅ Timeout

### API Design
- ✅ Pagination
- ✅ Rate Limiting
- ✅ Versioning

---

## 🎯 Recommended Implementation Order

**Phase 1: Foundation**
1. Microservices Architecture
2. API Gateway
3. Repository Pattern
4. Event-Driven Architecture

**Phase 2: Core Functionality**
5. CQRS (for analytics)
6. Bounded Context (DDD)
7. Strategy Pattern (learning modes)
8. Cache-Aside

**Phase 3: Reliability**
9. Circuit Breaker
10. Retry Pattern
11. Outbox Pattern

**Phase 4: Advanced**
12. Event Sourcing
13. Saga Pattern
14. Materialized Views
15. Chain of Responsibility (metacognition)

---

**Start with patterns that provide immediate value, add complexity as needed!** 🚀
