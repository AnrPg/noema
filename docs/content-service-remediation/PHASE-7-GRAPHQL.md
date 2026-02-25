# Phase 7: GraphQL Layer

## Objective

Implement a GraphQL API layer using **Mercurius** (the project's chosen GraphQL
framework for Fastify) alongside the existing REST API. GraphQL provides
efficient data fetching for the mobile and web apps with field-level selection
and relationship resolution.

## Prerequisites

- Phases 1–6 completed
- Familiarity with Mercurius (GraphQL plugin for Fastify)

## Gaps Fixed

- **Gap #1 (partial):** Empty `src/api/graphql/resolvers/` directory
- **Gap #18:** GraphQL layer not implemented

## Improvements Implemented

- **Improvement #16:** Implement GraphQL layer

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

## Task 1: Install Dependencies

```bash
cd services/content-service
pnpm add mercurius graphql
pnpm add -D @types/mercurius
```

**Note:** If `@types/mercurius` doesn't exist, Mercurius ships its own types.

---

## Task 2: Define GraphQL Schema

Create `src/api/graphql/schema.ts`:

```typescript
/**
 * @noema/content-service - GraphQL Schema Definition
 *
 * SDL-first schema for the content-service GraphQL API.
 * Types mirror the REST API resources.
 */

// ============================================================================
// Schema SDL
// ============================================================================

export const typeDefs = `
  # ============================================================================
  # Scalars
  # ============================================================================
  scalar DateTime
  scalar JSON

  # ============================================================================
  # Enums
  # ============================================================================
  enum CardState {
    draft
    active
    suspended
    archived
  }

  enum DifficultyLevel {
    beginner
    elementary
    intermediate
    advanced
    expert
  }

  enum EventSource {
    user
    agent
    system
    import
  }

  enum SortOrder {
    asc
    desc
  }

  enum TemplateVisibility {
    private
    public
    shared
  }

  # ============================================================================
  # Types
  # ============================================================================
  type Card {
    id: ID!
    userId: String!
    cardType: String!
    state: CardState!
    difficulty: DifficultyLevel!
    content: JSON!
    knowledgeNodeIds: [String!]!
    tags: [String!]!
    source: EventSource!
    metadata: JSON!
    createdAt: DateTime!
    updatedAt: DateTime!
    deletedAt: DateTime
    createdBy: String
    updatedBy: String
    version: Int!
    # Relations
    history(limit: Int = 10, offset: Int = 0): [CardHistoryEntry!]!
  }

  type CardSummary {
    id: ID!
    userId: String!
    cardType: String!
    state: CardState!
    difficulty: DifficultyLevel!
    preview: String!
    knowledgeNodeIds: [String!]!
    tags: [String!]!
    source: EventSource!
    createdAt: DateTime!
    updatedAt: DateTime!
    version: Int!
  }

  type CardHistoryEntry {
    id: ID!
    cardId: String!
    version: Int!
    content: JSON!
    difficulty: String!
    state: String!
    changeType: String!
    changedBy: String!
    createdAt: DateTime!
  }

  type Template {
    id: ID!
    userId: String!
    name: String!
    description: String
    cardType: String!
    content: JSON!
    difficulty: DifficultyLevel!
    knowledgeNodeIds: [String!]!
    tags: [String!]!
    visibility: TemplateVisibility!
    usageCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
    version: Int!
  }

  type MediaFile {
    id: ID!
    userId: String!
    filename: String!
    originalFilename: String!
    mimeType: String!
    sizeBytes: String!
    alt: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type CardStats {
    totalCards: Int!
    byState: JSON!
    byCardType: JSON!
    byDifficulty: JSON!
    recentlyCreated: Int!
    recentlyUpdated: Int!
  }

  # ============================================================================
  # Pagination
  # ============================================================================
  type PaginatedCards {
    items: [CardSummary!]!
    total: Int!
    hasMore: Boolean!
  }

  type CursorPaginatedCards {
    items: [CardSummary!]!
    nextCursor: String
    prevCursor: String
    hasMore: Boolean!
  }

  type PaginatedTemplates {
    items: [Template!]!
    total: Int!
    hasMore: Boolean!
  }

  # ============================================================================
  # Inputs
  # ============================================================================
  input CardQueryInput {
    cardTypes: [String!]
    states: [CardState!]
    difficulties: [DifficultyLevel!]
    knowledgeNodeIds: [String!]
    knowledgeNodeIdMode: String
    tags: [String!]
    sources: [EventSource!]
    search: String
    sortBy: String
    sortOrder: SortOrder
    offset: Int
    limit: Int
  }

  input CreateCardInput {
    cardType: String!
    content: JSON!
    difficulty: DifficultyLevel
    knowledgeNodeIds: [String!]!
    tags: [String!]
    source: EventSource
    metadata: JSON
  }

  input UpdateCardInput {
    content: JSON
    difficulty: DifficultyLevel
    knowledgeNodeIds: [String!]
    tags: [String!]
    metadata: JSON
  }

  input CreateTemplateInput {
    name: String!
    description: String
    cardType: String!
    content: JSON!
    difficulty: DifficultyLevel
    knowledgeNodeIds: [String!]
    tags: [String!]
    visibility: TemplateVisibility
  }

  # ============================================================================
  # Queries
  # ============================================================================
  type Query {
    card(id: ID!): Card
    cards(query: CardQueryInput): PaginatedCards!
    cardsCursor(query: CardQueryInput, cursor: String, limit: Int, direction: String): CursorPaginatedCards!
    cardStats: CardStats!
    template(id: ID!): Template
    templates(offset: Int, limit: Int): PaginatedTemplates!
  }

  # ============================================================================
  # Mutations
  # ============================================================================
  type Mutation {
    createCard(input: CreateCardInput!): Card!
    updateCard(id: ID!, input: UpdateCardInput!, version: Int!): Card!
    changeCardState(id: ID!, state: CardState!, version: Int!, reason: String): Card!
    deleteCard(id: ID!, version: Int!): Boolean!
    restoreCard(id: ID!): Card!
    updateCardTags(id: ID!, tags: [String!]!, version: Int!): Card!
    createTemplate(input: CreateTemplateInput!): Template!
  }
`;
```

---

## Task 3: Implement Resolvers

Create `src/api/graphql/resolvers/index.ts`:

```typescript
/**
 * @noema/content-service - GraphQL Resolvers
 *
 * Root resolver map wiring GraphQL operations to service methods.
 */

import type { CardId, UserId } from '@noema/types';
import type { ContentService } from '../../../domain/content-service/content.service.js';
import type { TemplateService } from '../../../domain/content-service/template.service.js';
import type { IHistoryRepository } from '../../../infrastructure/database/prisma-history.repository.js';
import type { IExecutionContext } from '../../../types/content.types.js';

// ============================================================================
// Types
// ============================================================================

interface IGraphQLContext {
  user: {
    userId: string;
    email: string;
    roles?: string[];
  };
  correlationId: string;
}

function buildServiceContext(ctx: IGraphQLContext): IExecutionContext {
  return {
    userId: ctx.user.userId as UserId,
    correlationId: ctx.correlationId,
    source: 'user',
    roles: ctx.user.roles ?? [],
  };
}

// ============================================================================
// Resolver Factory
// ============================================================================

export function createResolvers(
  contentService: ContentService,
  templateService: TemplateService,
  historyRepository?: IHistoryRepository
) {
  return {
    // ========================================================================
    // Query Resolvers
    // ========================================================================
    Query: {
      card: async (
        _root: unknown,
        args: { id: string },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await contentService.findById(
          args.id as CardId,
          context
        );
        return result.data;
      },

      cards: async (
        _root: unknown,
        args: { query?: Record<string, unknown> },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await contentService.query(args.query ?? {}, context);
        return result.data;
      },

      cardsCursor: async (
        _root: unknown,
        args: {
          query?: Record<string, unknown>;
          cursor?: string;
          limit?: number;
          direction?: string;
        },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await contentService.queryCursor(
          args.query ?? {},
          context,
          args.cursor,
          args.limit,
          (args.direction ?? 'forward') as 'forward' | 'backward'
        );
        return result.data;
      },

      cardStats: async (
        _root: unknown,
        _args: unknown,
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await contentService.getStats(context);
        return result.data;
      },

      template: async (
        _root: unknown,
        args: { id: string },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await templateService.findById(args.id, context);
        return result.data;
      },

      templates: async (
        _root: unknown,
        args: { offset?: number; limit?: number },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await templateService.query(
          { offset: args.offset, limit: args.limit },
          context
        );
        return result.data;
      },
    },

    // ========================================================================
    // Mutation Resolvers
    // ========================================================================
    Mutation: {
      createCard: async (
        _root: unknown,
        args: { input: Record<string, unknown> },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await contentService.create(args.input as any, context);
        return result.data;
      },

      updateCard: async (
        _root: unknown,
        args: { id: string; input: Record<string, unknown>; version: number },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await contentService.update(
          args.id as CardId,
          args.input as any,
          args.version,
          context
        );
        return result.data;
      },

      changeCardState: async (
        _root: unknown,
        args: { id: string; state: string; version: number; reason?: string },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const stateInput = { state: args.state, reason: args.reason };
        const result = await contentService.changeState(
          args.id as CardId,
          stateInput as any,
          args.version,
          context
        );
        return result.data;
      },

      deleteCard: async (
        _root: unknown,
        args: { id: string; version: number },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        await contentService.delete(args.id as CardId, args.version, context);
        return true;
      },

      restoreCard: async (
        _root: unknown,
        args: { id: string },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await contentService.restore(args.id as CardId, context);
        return result.data;
      },

      updateCardTags: async (
        _root: unknown,
        args: { id: string; tags: string[]; version: number },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await contentService.updateTags(
          args.id as CardId,
          args.tags,
          args.version,
          context
        );
        return result.data;
      },

      createTemplate: async (
        _root: unknown,
        args: { input: Record<string, unknown> },
        ctx: IGraphQLContext
      ) => {
        const context = buildServiceContext(ctx);
        const result = await templateService.create(args.input as any, context);
        return result.data;
      },
    },

    // ========================================================================
    // Field Resolvers
    // ========================================================================
    Card: {
      history: async (
        card: { id: string },
        args: { limit: number; offset: number }
      ) => {
        if (!historyRepository) return [];
        return historyRepository.getHistory(
          card.id as CardId,
          args.limit,
          args.offset
        );
      },
    },

    // ========================================================================
    // Custom Scalars
    // ========================================================================
    DateTime: {
      // Mercurius handles scalars — provide serialize/parseValue
      serialize: (value: unknown) =>
        typeof value === 'string' ? value : String(value),
      parseValue: (value: unknown) => String(value),
    },
  };
}
```

---

## Task 4: Implement DataLoader for Batched Queries

Create `src/api/graphql/loaders.ts`:

```typescript
/**
 * @noema/content-service - GraphQL DataLoaders
 *
 * Batched data loading to prevent N+1 queries in GraphQL resolvers.
 */

import type { CardId, UserId } from '@noema/types';
import type { IContentRepository } from '../../domain/content-service/content.repository.js';

// ============================================================================
// Loader Factory
// ============================================================================

/**
 * Create a card loader that batches findByIds calls.
 * Compatible with Mercurius's built-in loader support.
 */
export function createCardLoader(repository: IContentRepository) {
  return async (
    queries: Array<{ obj: Record<string, unknown>; params: { id: string } }>,
    context: { user: { userId: string } }
  ) => {
    const ids = queries.map((q) => q.params.id as CardId);
    const userId = context.user.userId as UserId;
    const cards = await repository.findByIds(ids, userId);
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    return ids.map((id) => cardMap.get(id) ?? null);
  };
}
```

---

## Task 5: Register Mercurius in Bootstrap

**`src/index.ts`:**

Add imports:

```typescript
import mercurius from 'mercurius';
import { typeDefs } from './api/graphql/schema.js';
import { createResolvers } from './api/graphql/resolvers/index.js';
```

Register after REST routes:

```typescript
// Register GraphQL
const resolvers = createResolvers(
  contentService,
  templateService,
  historyRepository
);

await fastify.register(mercurius, {
  schema: typeDefs,
  resolvers,
  graphiql: config.service.environment !== 'production',
  path: '/graphql',
  context: (request) => {
    // Extract user from JWT (set by auth middleware)
    const user = (request as any).user ?? { userId: 'anonymous', email: '' };
    const correlationId = request.id ?? `cor_${Date.now().toString(36)}`;
    return { user, correlationId };
  },
  errorFormatter: (result, ctx) => {
    // Log GraphQL errors
    ctx.app.log.error({ errors: result.errors }, 'GraphQL error');
    return { statusCode: result.statusCode || 200, response: result };
  },
});

logger.info('GraphQL endpoint registered at /graphql');
```

### Important: Authentication for GraphQL

GraphQL requests to `/graphql` should also be authenticated. Add a preHandler:

```typescript
// Add auth to GraphQL endpoint
fastify.addHook('preHandler', async (request, reply) => {
  if (request.url === '/graphql' && request.method === 'POST') {
    await authMiddleware(request, reply);
  }
});
```

Or better, use Mercurius's `context` function to verify the token:

```typescript
context: async (request) => {
  // Verify JWT manually for GraphQL requests
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    throw new mercurius.ErrorWithProps('Unauthorized', {}, 401);
  }
  const token = authHeader.replace('Bearer ', '');
  const user = await tokenVerifier.verify(token);
  if (!user) {
    throw new mercurius.ErrorWithProps('Invalid token', {}, 401);
  }
  return {
    user,
    correlationId: request.id ?? `cor_${Date.now().toString(36)}`,
  };
},
```

**Note:** Check how `tokenVerifier` works in the existing auth middleware and
replicate the pattern.

---

## Task 6: Create barrel exports

Create `src/api/graphql/index.ts`:

```typescript
export { typeDefs } from './schema.js';
export { createResolvers } from './resolvers/index.js';
export { createCardLoader } from './loaders.js';
```

---

## Checklist

- [ ] `mercurius` and `graphql` installed
- [ ] SDL schema defined in `src/api/graphql/schema.ts` covering all Card,
      Template, MediaFile types
- [ ] All REST query endpoints mirrored as GraphQL queries
- [ ] Create, update, delete, restore, state change mutations implemented
- [ ] `Card.history` field resolver uses `IHistoryRepository`
- [ ] DataLoader created for batched card lookups
- [ ] Mercurius registered in `src/index.ts` with auth context
- [ ] GraphiQL enabled in non-production environments
- [ ] GraphQL authentication verifies JWT
- [ ] Custom DateTime scalar serialization works
- [ ] Barrel exports created
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
