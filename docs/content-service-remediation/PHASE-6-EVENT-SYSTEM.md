# Phase 6: Event System

## Objective

Implement event consumers that react to cross-service domain events. Currently,
the content-service only **publishes** events — it never **consumes** events
from other services. This phase adds consumers for `user.deleted`,
`kg.node.deleted`, and `session.completed` events.

## Prerequisites

- Phases 1–5 completed
- Understanding of the `@noema/events` package's Redis Streams consumer API

## Gaps Fixed

- **Gap #1 (partial):** Empty `src/events/consumers/` and `src/agents/hints/`
  directories
- **Gap #11:** Missing event consumers

## Improvements Implemented

- **Improvement #6:** Implement event consumers

---

## Global Instructions for Claude

> **IMPORTANT CONSTRAINTS — follow these in every phase:**
>
> - This is a TypeScript project using ESM (`"type": "module"`) — all local
>   imports must use `.js` extensions.
> - Use `import type` for type-only imports per the project convention.
> - Preserve the existing JSDoc/comment banner style at top of every file.
> - Preserve the
>   `// ============================================================================`
>   section separator style.
> - Do not rename existing public types or interfaces — only add new ones or
>   extend with optional fields.
> - Run `pnpm typecheck` after each task to verify zero type errors.
> - Never modify files in `generated/`, `node_modules/`, or `dist/`.
> - Use the existing error class hierarchy from
>   `src/domain/content-service/errors/content.errors.ts`.
> - When editing existing files, change only what is required — do not reformat
>   unrelated code.
> - After completing ALL tasks, run `pnpm typecheck && pnpm test && pnpm lint`.

---

## Context: Event Infrastructure

The project uses **Redis Streams** for inter-service events. The `@noema/events`
package provides:

- `RedisEventPublisher` for publishing (already used by content-service)
- Event type definitions in `@noema/events/content`, `@noema/events/user`, etc.

Check the `@noema/events` package to understand the consumer API. Look for:

```bash
ls packages/events/src/
```

Typical Redis Streams consumer pattern:

```typescript
// Consumer group reads from a stream
await redis.xreadgroup(
  'GROUP',
  groupName,
  consumerName,
  'COUNT',
  batchSize,
  'BLOCK',
  timeout,
  'STREAMS',
  streamKey,
  '>'
);
```

If `@noema/events` doesn't provide a consumer base class, create one in the
content-service.

---

## Task 1: Create Event Consumer Infrastructure

### Step 1: Check `@noema/events` for consumer utilities

Read the `@noema/events` package to determine if there's an existing consumer
class:

```bash
find packages/events -name "*.ts" | head -20
cat packages/events/src/index.ts
```

If no consumer base exists, create a local one.

### Step 2: Create a base event consumer

Create `src/events/consumers/base-consumer.ts`:

```typescript
/**
 * @noema/content-service - Base Event Consumer
 *
 * Redis Streams consumer using consumer groups for reliable at-least-once delivery.
 * Each consumer instance joins a consumer group, ensuring load balancing across
 * multiple service replicas.
 */

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

// ============================================================================
// Types
// ============================================================================

export interface IEventConsumerConfig {
  /** Redis stream key to consume from */
  streamKey: string;
  /** Consumer group name (shared across replicas) */
  groupName: string;
  /** Unique consumer name (per replica) */
  consumerName: string;
  /** Batch size per read */
  batchSize: number;
  /** Block timeout in milliseconds (0 = non-blocking) */
  blockTimeout: number;
  /** Max retries before sending to dead-letter */
  maxRetries: number;
}

export interface IStreamEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Base Consumer
// ============================================================================

export abstract class BaseEventConsumer {
  protected readonly redis: Redis;
  protected readonly config: IEventConsumerConfig;
  protected readonly logger: Logger;
  private running = false;
  private shutdownRequested = false;

  constructor(redis: Redis, config: IEventConsumerConfig, logger: Logger) {
    this.redis = redis;
    this.config = config;
    this.logger = logger.child({
      component: this.constructor.name,
      group: config.groupName,
    });
  }

  /**
   * Initialize the consumer group (idempotent).
   */
  async initialize(): Promise<void> {
    try {
      await this.redis.xgroup(
        'CREATE',
        this.config.streamKey,
        this.config.groupName,
        '0',
        'MKSTREAM'
      );
      this.logger.info('Consumer group created');
    } catch (error: unknown) {
      // BUSYGROUP = group already exists — that's fine
      if (error instanceof Error && error.message.includes('BUSYGROUP')) {
        this.logger.debug('Consumer group already exists');
      } else {
        throw error;
      }
    }
  }

  /**
   * Start the consumer loop.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.shutdownRequested = false;

    this.logger.info('Starting event consumer');

    // First, process any pending (unacknowledged) messages
    await this.processPending();

    // Then, consume new messages
    while (!this.shutdownRequested) {
      try {
        await this.consumeBatch();
      } catch (error) {
        this.logger.error({ error }, 'Error in consumer loop — retrying in 5s');
        await this.sleep(5000);
      }
    }

    this.running = false;
    this.logger.info('Event consumer stopped');
  }

  /**
   * Request graceful shutdown.
   */
  stop(): void {
    this.shutdownRequested = true;
  }

  /**
   * Override in subclass: handle a single event.
   * Return true to ACK, false to NACK (will be retried).
   */
  protected abstract handleEvent(event: IStreamEvent): Promise<boolean>;

  // ============================================================================
  // Private
  // ============================================================================

  private async consumeBatch(): Promise<void> {
    const results = (await this.redis.xreadgroup(
      'GROUP',
      this.config.groupName,
      this.config.consumerName,
      'COUNT',
      this.config.batchSize,
      'BLOCK',
      this.config.blockTimeout,
      'STREAMS',
      this.config.streamKey,
      '>'
    )) as [string, [string, string[]][]][] | null;

    if (!results) return; // Timeout, no new messages

    for (const [_streamKey, messages] of results) {
      for (const [messageId, fields] of messages) {
        const event = this.parseStreamMessage(messageId, fields);
        if (!event) {
          this.logger.warn(
            { messageId },
            'Unparseable stream message — acknowledging to skip'
          );
          await this.redis.xack(
            this.config.streamKey,
            this.config.groupName,
            messageId
          );
          continue;
        }

        try {
          const success = await this.handleEvent(event);
          if (success) {
            await this.redis.xack(
              this.config.streamKey,
              this.config.groupName,
              messageId
            );
          }
          // If not successful, the message remains pending and will be retried
        } catch (error) {
          this.logger.error(
            { error, messageId, eventType: event.type },
            'Handler threw — message NOT acknowledged'
          );
        }
      }
    }
  }

  private async processPending(): Promise<void> {
    // Read pending messages for this consumer
    const pending = (await this.redis.xreadgroup(
      'GROUP',
      this.config.groupName,
      this.config.consumerName,
      'COUNT',
      this.config.batchSize,
      'STREAMS',
      this.config.streamKey,
      '0' // '0' = read pending messages
    )) as [string, [string, string[]][]][] | null;

    if (!pending) return;

    for (const [_streamKey, messages] of pending) {
      for (const [messageId, fields] of messages) {
        if (!fields || fields.length === 0) {
          // Already acknowledged in a previous run
          continue;
        }
        const event = this.parseStreamMessage(messageId, fields);
        if (!event) {
          await this.redis.xack(
            this.config.streamKey,
            this.config.groupName,
            messageId
          );
          continue;
        }

        try {
          const success = await this.handleEvent(event);
          if (success) {
            await this.redis.xack(
              this.config.streamKey,
              this.config.groupName,
              messageId
            );
          }
        } catch (error) {
          this.logger.error(
            { error, messageId },
            'Pending message handler threw'
          );
        }
      }
    }
  }

  private parseStreamMessage(
    messageId: string,
    fields: string[]
  ): IStreamEvent | null {
    try {
      // Redis stream fields are flat key-value pairs: ['key1', 'val1', 'key2', 'val2']
      const fieldMap: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldMap[fields[i]!] = fields[i + 1]!;
      }

      const type = fieldMap['type'] ?? fieldMap['eventType'] ?? '';
      const dataStr = fieldMap['data'] ?? fieldMap['payload'] ?? '{}';
      const metaStr = fieldMap['metadata'] ?? '{}';

      return {
        id: messageId,
        type,
        data: JSON.parse(dataStr),
        metadata: JSON.parse(metaStr),
      };
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## Task 2: User Deleted Consumer

When a user is deleted (from user-service), we should archive all their cards.

Create `src/events/consumers/user-deleted.consumer.ts`:

```typescript
/**
 * @noema/content-service - User Deleted Event Consumer
 *
 * Listens for 'user.deleted' events and archives all cards belonging to the deleted user.
 * This ensures orphaned cards don't persist after user account deletion.
 */

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import { BaseEventConsumer } from './base-consumer.js';
import type { IStreamEvent } from './base-consumer.js';

export class UserDeletedConsumer extends BaseEventConsumer {
  private readonly prisma: PrismaClient;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    logger: Logger,
    consumerName: string
  ) {
    super(
      redis,
      {
        streamKey: 'noema:events:user-service',
        groupName: 'content-service:user-deleted',
        consumerName,
        batchSize: 10,
        blockTimeout: 5000,
        maxRetries: 3,
      },
      logger
    );
    this.prisma = prisma;
  }

  protected async handleEvent(event: IStreamEvent): Promise<boolean> {
    if (event.type !== 'user.deleted') {
      // Not our event — acknowledge and skip
      return true;
    }

    const userId = event.data.userId as string;
    if (!userId) {
      this.logger.warn({ event }, 'user.deleted event missing userId');
      return true; // ACK malformed event to avoid infinite retry
    }

    this.logger.info(
      { userId },
      'Processing user.deleted — archiving all user cards'
    );

    // Archive all active cards for this user
    const result = await this.prisma.card.updateMany({
      where: {
        userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        state: 'ARCHIVED',
      },
    });

    // Also archive templates
    await this.prisma.template.updateMany({
      where: {
        userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // Also archive media files
    await this.prisma.mediaFile.updateMany({
      where: {
        userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    this.logger.info(
      { userId, archivedCards: result.count },
      'User content archived'
    );
    return true;
  }
}
```

---

## Task 3: Knowledge Node Deleted Consumer

When a knowledge graph node is deleted, remove its reference from all linked
cards.

Create `src/events/consumers/kg-node-deleted.consumer.ts`:

```typescript
/**
 * @noema/content-service - KG Node Deleted Event Consumer
 *
 * Listens for 'kg.node.deleted' events and removes the deleted node ID
 * from all cards' knowledgeNodeIds arrays.
 */

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import { BaseEventConsumer } from './base-consumer.js';
import type { IStreamEvent } from './base-consumer.js';

export class KgNodeDeletedConsumer extends BaseEventConsumer {
  private readonly prisma: PrismaClient;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    logger: Logger,
    consumerName: string
  ) {
    super(
      redis,
      {
        streamKey: 'noema:events:knowledge-graph-service',
        groupName: 'content-service:kg-node-deleted',
        consumerName,
        batchSize: 10,
        blockTimeout: 5000,
        maxRetries: 3,
      },
      logger
    );
    this.prisma = prisma;
  }

  protected async handleEvent(event: IStreamEvent): Promise<boolean> {
    if (event.type !== 'kg.node.deleted') {
      return true; // Not our event
    }

    const nodeId = event.data.nodeId as string;
    if (!nodeId) {
      this.logger.warn({ event }, 'kg.node.deleted event missing nodeId');
      return true;
    }

    this.logger.info(
      { nodeId },
      'Processing kg.node.deleted — removing from linked cards'
    );

    // Find all cards that reference this node
    const affectedCards = await this.prisma.card.findMany({
      where: {
        knowledgeNodeIds: { has: nodeId },
        deletedAt: null,
      },
      select: { id: true, knowledgeNodeIds: true, version: true },
    });

    // Update each card to remove the node ID
    let updated = 0;
    for (const card of affectedCards) {
      const newNodeIds = card.knowledgeNodeIds.filter((id) => id !== nodeId);
      await this.prisma.card.update({
        where: { id: card.id },
        data: {
          knowledgeNodeIds: newNodeIds,
          version: { increment: 1 },
        },
      });
      updated++;
    }

    this.logger.info(
      { nodeId, updatedCards: updated },
      'Node reference removed from cards'
    );
    return true;
  }
}
```

---

## Task 4: Session Completed Consumer

When a study session completes, update card metadata with scheduling hints from
the session.

Create `src/events/consumers/session-completed.consumer.ts`:

```typescript
/**
 * @noema/content-service - Session Completed Event Consumer
 *
 * Listens for 'session.completed' events and updates card metadata
 * with latest review statistics from the session service.
 */

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient, Prisma } from '../../../generated/prisma/index.js';
import { BaseEventConsumer } from './base-consumer.js';
import type { IStreamEvent } from './base-consumer.js';

export class SessionCompletedConsumer extends BaseEventConsumer {
  private readonly prisma: PrismaClient;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    logger: Logger,
    consumerName: string
  ) {
    super(
      redis,
      {
        streamKey: 'noema:events:session-service',
        groupName: 'content-service:session-completed',
        consumerName,
        batchSize: 10,
        blockTimeout: 5000,
        maxRetries: 3,
      },
      logger
    );
    this.prisma = prisma;
  }

  protected async handleEvent(event: IStreamEvent): Promise<boolean> {
    if (event.type !== 'session.completed') {
      return true;
    }

    const sessionData = event.data as {
      sessionId?: string;
      userId?: string;
      cardResults?: Array<{
        cardId: string;
        rating: number;
        responseTimeMs: number;
        correct: boolean;
      }>;
    };

    if (!sessionData.cardResults || sessionData.cardResults.length === 0) {
      this.logger.debug(
        { sessionId: sessionData.sessionId },
        'Session completed with no card results'
      );
      return true;
    }

    this.logger.info(
      {
        sessionId: sessionData.sessionId,
        cardCount: sessionData.cardResults.length,
      },
      'Processing session.completed — updating card metadata'
    );

    for (const result of sessionData.cardResults) {
      try {
        const card = await this.prisma.card.findUnique({
          where: { id: result.cardId },
          select: { metadata: true },
        });

        if (!card) continue;

        const currentMeta = card.metadata as Record<string, unknown>;
        const reviewStats = (currentMeta.reviewStats ?? {}) as Record<
          string,
          unknown
        >;
        const totalReviews = ((reviewStats.totalReviews as number) ?? 0) + 1;
        const correctCount =
          ((reviewStats.correctCount as number) ?? 0) +
          (result.correct ? 1 : 0);

        const updatedMeta = {
          ...currentMeta,
          reviewStats: {
            totalReviews,
            correctCount,
            accuracy: totalReviews > 0 ? correctCount / totalReviews : 0,
            lastReviewedAt: new Date().toISOString(),
            lastRating: result.rating,
            lastResponseTimeMs: result.responseTimeMs,
          },
        };

        await this.prisma.card.update({
          where: { id: result.cardId },
          data: {
            metadata: updatedMeta as unknown as Prisma.JsonObject,
            version: { increment: 1 },
          },
        });
      } catch (error) {
        this.logger.warn(
          { error, cardId: result.cardId },
          'Failed to update card metadata from session'
        );
        // Continue processing other cards — don't fail the entire event
      }
    }

    return true;
  }
}
```

---

## Task 5: Wire Consumers in Bootstrap

### Step 1: Add consumer config to `src/config/index.ts`

```typescript
consumers: {
  enabled: boolean;
  consumerName: string;
}
```

In `loadConfig()`:

```typescript
consumers: {
  enabled: optionalEnvBool('EVENT_CONSUMERS_ENABLED', true),
  consumerName: optionalEnv('CONSUMER_NAME', `content-service-${process.pid}`),
},
```

### Step 2: Initialize and start consumers in `src/index.ts`

```typescript
import { UserDeletedConsumer } from './events/consumers/user-deleted.consumer.js';
import { KgNodeDeletedConsumer } from './events/consumers/kg-node-deleted.consumer.js';
import { SessionCompletedConsumer } from './events/consumers/session-completed.consumer.js';

// After route registration:
const consumers: BaseEventConsumer[] = [];

if (config.consumers.enabled) {
  const userDeletedConsumer = new UserDeletedConsumer(
    redis,
    prisma,
    logger,
    config.consumers.consumerName
  );
  const kgNodeDeletedConsumer = new KgNodeDeletedConsumer(
    redis,
    prisma,
    logger,
    config.consumers.consumerName
  );
  const sessionCompletedConsumer = new SessionCompletedConsumer(
    redis,
    prisma,
    logger,
    config.consumers.consumerName
  );

  consumers.push(
    userDeletedConsumer,
    kgNodeDeletedConsumer,
    sessionCompletedConsumer
  );

  // Initialize consumer groups
  await Promise.all(consumers.map((c) => c.initialize()));

  // Start consumers (non-blocking — they run in background loops)
  for (const consumer of consumers) {
    // Don't await — consumers run indefinitely
    consumer.start().catch((error) => {
      logger.error(
        { error, consumer: consumer.constructor.name },
        'Consumer crashed'
      );
    });
  }

  logger.info({ consumerCount: consumers.length }, 'Event consumers started');
}
```

### Step 3: Add consumers to graceful shutdown

```typescript
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Received shutdown signal');

  // Stop consumers first
  for (const consumer of consumers) {
    consumer.stop();
  }

  await fastify.close();
  await redis.quit();
  await prisma.$disconnect();

  logger.info('Service shutdown complete');
  process.exit(0);
};
```

---

## Task 6: Create Agent Hints Directory

Create `src/agents/hints/content.hints.ts`:

```typescript
/**
 * @noema/content-service - Agent Content Hints
 *
 * Hint generators that produce structured metadata for AI agents.
 * These hints appear in IServiceResult.agentHints and help agents
 * make informed decisions about follow-up actions.
 */

// ============================================================================
// Hint Types
// ============================================================================

export interface IContentHint {
  type: string;
  message: string;
  suggestedAction?: string;
  priority: 'low' | 'medium' | 'high';
}

// ============================================================================
// Hint Generators
// ============================================================================

/**
 * Generate hints based on card state transitions.
 */
export function generateStateTransitionHints(
  fromState: string,
  toState: string,
  cardType: string
): IContentHint[] {
  const hints: IContentHint[] = [];

  if (fromState === 'draft' && toState === 'active') {
    hints.push({
      type: 'activation',
      message: 'Card activated — it is now eligible for scheduling.',
      suggestedAction:
        'Consider linking to knowledge graph nodes if not already linked.',
      priority: 'low',
    });
  }

  if (toState === 'suspended') {
    hints.push({
      type: 'suspension',
      message: 'Card suspended — it will not appear in review sessions.',
      suggestedAction: 'Review and update content before reactivating.',
      priority: 'medium',
    });
  }

  if (toState === 'archived') {
    hints.push({
      type: 'archival',
      message:
        'Card archived — it can be restored with POST /v1/cards/:id/restore.',
      suggestedAction: 'Verify this was intentional.',
      priority: 'low',
    });
  }

  return hints;
}

/**
 * Generate hints based on card quality signals.
 */
export function generateQualityHints(card: {
  content: Record<string, unknown>;
  tags: string[];
  knowledgeNodeIds: string[];
}): IContentHint[] {
  const hints: IContentHint[] = [];

  if (card.tags.length === 0) {
    hints.push({
      type: 'missing_tags',
      message:
        'Card has no tags. Tags improve discoverability and organization.',
      suggestedAction: 'Add relevant tags.',
      priority: 'medium',
    });
  }

  if (card.knowledgeNodeIds.length === 0) {
    hints.push({
      type: 'unlinked',
      message: 'Card is not linked to any knowledge graph nodes.',
      suggestedAction: 'Link to relevant PKG nodes for curriculum integration.',
      priority: 'high',
    });
  }

  return hints;
}
```

Create `src/agents/hints/index.ts`:

```typescript
export * from './content.hints.js';
```

---

## Task 7: Create barrel export for consumers

Create `src/events/consumers/index.ts`:

```typescript
export { BaseEventConsumer } from './base-consumer.js';
export type { IEventConsumerConfig, IStreamEvent } from './base-consumer.js';
export { UserDeletedConsumer } from './user-deleted.consumer.js';
export { KgNodeDeletedConsumer } from './kg-node-deleted.consumer.js';
export { SessionCompletedConsumer } from './session-completed.consumer.js';
```

---

## Checklist

- [ ] `BaseEventConsumer` created with XREADGROUP consumer group pattern
- [ ] Consumer handles initialization, pending messages, graceful shutdown
- [ ] `UserDeletedConsumer` archives all content on user deletion
- [ ] `KgNodeDeletedConsumer` removes node references from cards
- [ ] `SessionCompletedConsumer` updates card metadata with review stats
- [ ] All consumers registered in `src/index.ts` bootstrap
- [ ] Consumer group creation is idempotent (handles BUSYGROUP)
- [ ] Consumers included in graceful shutdown
- [ ] Consumer enabled/disabled via `EVENT_CONSUMERS_ENABLED` env var
- [ ] `src/agents/hints/content.hints.ts` created with hint generators
- [ ] `src/events/consumers/index.ts` barrel export created
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
