# Phase 06-A — Card System: Backend Endpoint + API Client

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the missing `GET /v1/cards/batch/recent` backend endpoint and completely rewrite the `@noema/api-client` content module to match the real backend domain types (42 card types, full DeckQuery, corrected DTOs, new batch hooks).

**Architecture:** The content-service backend already has all 42 types, full DeckQuery, batch rollback, and `findByBatchId` — all working. The api-client `types.ts` is completely stale (5 wrong type names, wrong field names). This plan fixes the gap: one new backend endpoint + full api-client rewrite. Zero frontend changes here.

**Tech Stack:** TypeScript, Fastify (content-service), Prisma `$queryRaw`, TanStack Query v5, `@noema/types` (CardType / RemediationCardType / CardState consts)

**Critical context:**
- `@noema/types` exports `CardType` (22 standard, lowercase string values) and `RemediationCardType` (20 remediation, lowercase string values) as `const` objects — NOT TypeScript enums. Values like `CardType.ATOMIC = 'atomic'`, `CardType.CLOZE = 'cloze'`.
- Backend repository maps `row.card_type.toLowerCase()` in `toDomain` — API JSON always has lowercase card types.
- `batchId` is stored in `cards.metadata._batchId` JSONB — no dedicated batch table.
- Route `GET /v1/cards/batch/recent` must be registered **before** `GET /v1/cards/batch/:batchId` in the Fastify plugin registration to prevent Fastify matching `"recent"` as the `:batchId` parameter.
- `IBatchCreateResult.created` is `ICard[]` (full card objects), not a count.
- State machine transitions: `draft→active|archived`, `active→suspended|archived`, `suspended→active|archived`, `archived→draft`

---

### Task 1: Add `GET /v1/cards/batch/recent` to content-service

**Files:**
- Modify: `services/content-service/src/types/content.types.ts` (add `IBatchSummary`)
- Modify: `services/content-service/src/domain/content-service/content.repository.ts` (add method to interface after line 178)
- Modify: `services/content-service/src/infrastructure/database/prisma-content.repository.ts` (add implementation after `softDeleteByBatchId`)
- Modify: `services/content-service/src/infrastructure/cache/cached-content.repository.ts` (add passthrough)
- Modify: `services/content-service/src/domain/content-service/content.service.ts` (add service method after `rollbackBatch`)
- Modify: `services/content-service/src/api/rest/content.routes.ts` (add route BEFORE `GET /v1/cards/batch/:batchId`)

**Step 1: Add `IBatchSummary` type**

In `services/content-service/src/types/content.types.ts`, find the `IBatchCreateResult` interface and add after it:

```typescript
/**
 * Summary of a batch create operation.
 * Used by GET /v1/cards/batch/recent to list recent batches.
 */
export interface IBatchSummary {
  /** The batch correlation ID (stored in card metadata._batchId) */
  batchId: string;
  /** Number of cards created in this batch */
  cardCount: number;
  /** ISO-8601 timestamp of the first card created in this batch */
  firstCreatedAt: string;
  /** ISO-8601 timestamp of the last card created in this batch */
  lastCreatedAt: string;
}
```

**Step 2: Add method to repository interface**

In `services/content-service/src/domain/content-service/content.repository.ts`, after `softDeleteByBatchId` (around line 178), add:

```typescript
/**
 * Find the most recent batch operations for a user.
 * Queries distinct _batchId values from card metadata JSONB.
 * @param userId - Owner user ID
 * @param limit - Max number of batches to return (capped at 50)
 * @returns Batch summaries ordered by most-recently-created first
 */
findRecentBatches(userId: UserId, limit: number): Promise<IBatchSummary[]>;
```

Also add `IBatchSummary` to the import at the top of this file.

**Step 3: Implement in PrismaContentRepository**

In `services/content-service/src/infrastructure/database/prisma-content.repository.ts`, after `softDeleteByBatchId` (after line ~563), add:

```typescript
async findRecentBatches(userId: UserId, limit: number): Promise<IBatchSummary[]> {
  // Use $queryRaw to query distinct _batchId values from the metadata JSONB column.
  // We GROUP BY the extracted JSON text value, then ORDER by the most recent card
  // created_at within each batch.
  // Prisma's $queryRaw returns bigint for COUNT — convert with Number().
  const rows = await this.prisma.$queryRaw<{
    batch_id: string;
    card_count: bigint;
    first_created_at: Date;
    last_created_at: Date;
  }[]>`
    SELECT
      metadata->>'_batchId'   AS batch_id,
      COUNT(*)                 AS card_count,
      MIN(created_at)          AS first_created_at,
      MAX(created_at)          AS last_created_at
    FROM "cards"
    WHERE "user_id"       = ${userId}
      AND "deleted_at"    IS NULL
      AND metadata->>'_batchId' IS NOT NULL
    GROUP BY metadata->>'_batchId'
    ORDER BY MAX(created_at) DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    batchId: r.batch_id,
    cardCount: Number(r.card_count),
    firstCreatedAt: r.first_created_at.toISOString(),
    lastCreatedAt: r.last_created_at.toISOString(),
  }));
}
```

Also import `IBatchSummary` at the top of this file.

**Step 4: Add passthrough to CachedContentRepository**

In `services/content-service/src/infrastructure/cache/cached-content.repository.ts`, after the `findByBatchId` passthrough (around line 216), add:

```typescript
async findRecentBatches(userId: UserId, limit: number): Promise<IBatchSummary[]> {
  // Intentionally not cached: batch operations are infrequent writes;
  // stale cache here could confuse the rollback workflow.
  return this.inner.findRecentBatches(userId, limit);
}
```

Import `IBatchSummary` at the top.

**Step 5: Add service method**

In `services/content-service/src/domain/content-service/content.service.ts`, after `rollbackBatch` (around line ~1420), add:

```typescript
/**
 * List the most recent batch operations for the current user.
 * Returns batch summaries ordered by most-recently-created first.
 */
async findRecentBatches(
  limit: number,
  context: IExecutionContext,
): Promise<IServiceResult<IBatchSummary[]>> {
  this.requireAuth(context);
  this.logger.info({ limit }, 'Listing recent batches');

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const batches = await this.repository.findRecentBatches(context.userId!, Math.min(limit, 50));

  return {
    data: batches,
    agentHints: {
      suggestedNextActions:
        batches.length > 0
          ? [
              {
                action: 'rollback_batch',
                description: 'Roll back a recent batch if something went wrong',
                priority: 'low' as const,
                category: 'correction' as const,
              },
            ]
          : [],
      relatedResources: [],
      confidence: 1.0,
      sourceQuality: 'high' as const,
      validityPeriod: 'short' as const,
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.1, effort: 0.1, roi: 1.0 },
      preferenceAlignment: [],
      reasoning: `Found ${String(batches.length)} recent batch operations`,
    },
  };
}
```

Import `IBatchSummary` in the imports block.

**Step 6: Register the route (BEFORE `:batchId` route)**

In `services/content-service/src/api/rest/content.routes.ts`, find the comment `// Batch Recovery & Rollback Routes` (around line 951). Add the new route **directly before** `GET /v1/cards/batch/:batchId`:

```typescript
/**
 * GET /v1/cards/batch/recent - List recent batch operations
 *
 * IMPORTANT: This route MUST be declared before GET /v1/cards/batch/:batchId
 * to prevent Fastify matching the literal path segment "recent" as :batchId.
 */
fastify.get<{ Querystring: { limit?: string } }>(
  '/v1/cards/batch/recent',
  {
    preHandler: authMiddleware,
    schema: {
      tags: ['Cards'],
      summary: 'List recent batch operations',
      description:
        'Returns the most recent batch IDs with card count and timestamps. ' +
        'Useful for the batch operations UI to list what can be rolled back.',
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            description: 'Maximum batches to return (default 10, capped at 50)',
          },
        },
      },
    },
  },
  async (request, reply) => {
    try {
      const context = buildContext(request);
      const rawLimit = Number(request.query.limit ?? '10');
      const limit = Number.isNaN(rawLimit) ? 10 : Math.max(1, Math.min(rawLimit, 50));
      const result = await contentService.findRecentBatches(limit, context);
      reply.send(wrapResponse(result.data, result.agentHints, request));
    } catch (error) {
      handleError(error, request, reply, fastify.log);
    }
  }
);
```

**Step 7: Build and test**

```bash
cd services/content-service
pnpm build
```
Expected: No TypeScript errors.

Manual smoke test (requires a running content-service with JWT):
```bash
curl -X GET "http://localhost:3003/v1/cards/batch/recent?limit=5" \
  -H "Authorization: Bearer <your-jwt>"
# Expected: { "data": [...], "agentHints": {...} }
```

**Step 8: Commit**

```bash
git add services/content-service/src/types/content.types.ts \
        services/content-service/src/domain/content-service/content.repository.ts \
        services/content-service/src/domain/content-service/content.service.ts \
        services/content-service/src/infrastructure/database/prisma-content.repository.ts \
        services/content-service/src/infrastructure/cache/cached-content.repository.ts \
        services/content-service/src/api/rest/content.routes.ts
git commit -m "feat(content): add GET /v1/cards/batch/recent endpoint for recent batch listing"
```

---

### Task 2: Rewrite `packages/api-client/src/content/types.ts`

**Files:**
- Rewrite: `packages/api-client/src/content/types.ts`

This is a **complete file replacement**. The existing file has 5 wrong type names and wrong field names throughout. Read it first, then replace entirely.

**Step 1: Write the new `types.ts`**

Replace the entire file content with:

```typescript
/**
 * @noema/api-client - Content Service Types
 *
 * DTOs for Content Service API. All types mirror the backend domain types.
 * Card types and state enums are re-exported from @noema/types for consistency.
 *
 * Source of truth for content shapes:
 *   services/content-service/src/domain/content-service/card-content.schemas.ts
 *   services/content-service/src/types/content.types.ts
 */

import type { IApiResponse } from '@noema/contracts';
import type { CardId, MediaId, NodeId, TemplateId, UserId } from '@noema/types';
// Re-export from @noema/types so consumers only need one import
export type { CardType, CardState, RemediationCardType } from '@noema/types';
import type { CardType, CardState, RemediationCardType } from '@noema/types';

// ============================================================================
// Derived union types
// ============================================================================

/** Union of all 42 card types (22 standard + 20 remediation) */
export type AnyCardType = CardType | RemediationCardType;

export type DifficultyLevel = 'beginner' | 'elementary' | 'intermediate' | 'advanced' | 'expert';

export type EventSource = 'user' | 'agent' | 'system' | 'import';

// ============================================================================
// Media Attachment (shared by many content types)
// ============================================================================

export interface IMediaAttachment {
  url: string;
  mimeType: string;
  alt?: string;
  position: 'front' | 'back' | 'shared';
}

// ============================================================================
// Card Content Base (all 42 types extend this)
// ============================================================================

export interface ICardContentBase {
  /** Question / prompt (Markdown) */
  front: string;
  /** Answer / explanation (Markdown) */
  back: string;
  hint?: string;
  explanation?: string;
  media?: IMediaAttachment[];
}

// ============================================================================
// Per-Type Content Interfaces (22 standard + 20 remediation)
// Verify each against card-content.schemas.ts in the content-service.
// ============================================================================

// Standard types

export interface IAtomicContent extends ICardContentBase {}

export interface IClozeItem {
  text: string;
  answer: string;
  position: number;
}
export interface IClozeContent extends ICardContentBase {
  template: string;
  clozes: IClozeItem[];
}

export interface IOcclusionRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  shape?: 'rect' | 'ellipse' | 'polygon';
}
export interface IImageOcclusionContent extends ICardContentBase {
  imageUrl: string;
  regions: IOcclusionRegion[];
}

export interface IAudioContent extends ICardContentBase {
  audioUrl: string;
  transcript?: string;
  playbackSpeed?: number;
  startTime?: number;
  endTime?: number;
}

export interface IProcessStep {
  order: number;
  title: string;
  description: string;
  imageUrl?: string;
}
export interface IProcessContent extends ICardContentBase {
  processName: string;
  steps: IProcessStep[];
}

export interface IComparisonItem {
  label: string;
  attributes: Record<string, string>;
}
export interface IComparisonContent extends ICardContentBase {
  items: IComparisonItem[];
  comparisonCriteria?: string[];
}

export interface IExceptionCase {
  condition: string;
  explanation: string;
}
export interface IExceptionContent extends ICardContentBase {
  rule: string;
  generalPrinciple?: string;
  exceptions: IExceptionCase[];
}

export interface IErrorSpottingContent extends ICardContentBase {
  errorText: string;
  correctedText: string;
  errorType?: string;
  errorExplanation?: string;
}

export interface IConfidenceScale {
  min: number;
  max: number;
  labels?: Record<string, string>;
}
export interface IConfidenceRatedContent extends ICardContentBase {
  correctAnswer: string;
  confidenceScale?: IConfidenceScale;
  calibrationFeedback?: string;
}

export interface IConceptNode {
  id: string;
  label: string;
  description?: string;
}
export interface IConceptEdge {
  from: string;
  to: string;
  label: string;
  description?: string;
}
export interface IConceptGraphContent extends ICardContentBase {
  targetConcept: string;
  nodes: IConceptNode[];
  edges: IConceptEdge[];
}

export interface ICaseOption {
  text: string;
  correct: boolean;
  feedback?: string;
}
export interface ICaseBasedContent extends ICardContentBase {
  scenario: string;
  question: string;
  options?: ICaseOption[];
  analysis?: string;
}

export interface IMultimodalItem {
  type: 'text' | 'image' | 'audio' | 'video';
  content: string;
  description?: string;
  order?: number;
}
export interface IMultimodalContent extends ICardContentBase {
  mediaItems: IMultimodalItem[];
  synthesisPrompt?: string;
}

export interface ITransferContent extends ICardContentBase {
  originalContext: string;
  novelContext: string;
  transferPrompt: string;
  structuralMapping?: string;
}

export interface IDisclosureLayer {
  order: number;
  content: string;
  revealCondition?: string;
}
export interface IProgressiveDisclosureContent extends ICardContentBase {
  layers: IDisclosureLayer[];
}

export interface IMultipleChoiceOption {
  text: string;
  correct: boolean;
  feedback?: string;
}
export interface IMultipleChoiceContent extends ICardContentBase {
  choices: IMultipleChoiceOption[];
  shuffleChoices?: boolean;
  allowMultiple?: boolean;
}

export interface ITrueFalseContent extends ICardContentBase {
  statement: string;
  isTrue: boolean;
}

export interface IMatchingPair {
  left: string;
  right: string;
}
export interface IMatchingContent extends ICardContentBase {
  pairs: IMatchingPair[];
  shufflePairs?: boolean;
}

export interface IOrderingItem {
  text: string;
  correctPosition: number;
}
export interface IOrderingContent extends ICardContentBase {
  items: IOrderingItem[];
  orderingCriterion: string;
}

export interface IDefinitionContent extends ICardContentBase {
  term: string;
  definition: string;
  examples?: string[];
  relatedTerms?: string[];
}

export interface ICauseEffectItem {
  description: string;
}
export interface ICauseEffectRelationship {
  causeIndex: number;
  effectIndex: number;
  explanation?: string;
}
export interface ICauseEffectContent extends ICardContentBase {
  causes: ICauseEffectItem[];
  effects: ICauseEffectItem[];
  relationships: ICauseEffectRelationship[];
}

export interface ITimelineEvent {
  date: string;
  title: string;
  description?: string;
}
export interface ITimelineContent extends ICardContentBase {
  events: ITimelineEvent[];
  timelineScope?: string;
}

export interface IDiagramLabel {
  x: number;
  y: number;
  text: string;
  answer: string;
}
export interface IDiagramContent extends ICardContentBase {
  imageUrl: string;
  labels: IDiagramLabel[];
  diagramType?: string;
}

// Remediation types

export interface IContrastivePairContent extends ICardContentBase {
  itemA: string;
  itemB: string;
  sharedContext: string;
  keyDifferences: string[];
}

export interface IMinimalPairContent extends ICardContentBase {
  itemA: string;
  itemB: string;
  discriminatingFeature: string;
  differenceContext?: string;
}

export interface IFalseFriendContent extends ICardContentBase {
  termA: string;
  termB: string;
  actualMeaning: string;
  domainContext?: string;
}

export interface IOldVsNewDefinitionContent extends ICardContentBase {
  term: string;
  oldDefinition: string;
  newDefinition: string;
  changeReason: string;
}

export interface IBoundaryCaseContent extends ICardContentBase {
  concept: string;
  boundaryCondition: string;
  isIncluded: boolean;
  reasoning: string;
}

export interface IRuleScopeContent extends ICardContentBase {
  rule: string;
  appliesWhen: string[];
  doesNotApplyWhen: string[];
}

export interface IDiscriminantFeatureItem {
  name: string;
  diagnostic: boolean;
  value: string;
}
export interface IDiscriminantFeatureContent extends ICardContentBase {
  concept: string;
  features: IDiscriminantFeatureItem[];
}

export interface IAssumptionCheckContent extends ICardContentBase {
  statement: string;
  hiddenAssumption: string;
  consequence: string;
}

export interface ICounterexampleContent extends ICardContentBase {
  claim: string;
  counterexample: string;
  significance?: string;
}

export interface IRepresentationItem {
  type: string;
  content: string;
}
export interface IRepresentationSwitchContent extends ICardContentBase {
  concept: string;
  representations: IRepresentationItem[];
}

export interface IRetrievalCueItem {
  cue: string;
  effectiveness: 'strong' | 'moderate' | 'weak';
}
export interface IRetrievalCueContent extends ICardContentBase {
  target: string;
  cues: IRetrievalCueItem[];
  context?: string;
}

export interface IEncodingRepairContent extends ICardContentBase {
  concept: string;
  incorrectEncoding: string;
  correctEncoding: string;
  repairStrategy: string;
}

export interface IOverwriteDrillContent extends ICardContentBase {
  incorrectResponse: string;
  correctResponse: string;
  drillPrompts: string[];
}

export interface IAvailabilityBiasDisconfirmationContent extends ICardContentBase {
  biasedBelief: string;
  evidence: string;
  baseRate?: string;
  biasExplanation?: string;
}

export interface ISelfCheckStep {
  step: number;
  question: string;
}
export interface ISelfCheckRitualContent extends ICardContentBase {
  concept: string;
  checkSteps: ISelfCheckStep[];
  trigger: string;
}

export interface ICalibrationTrainingContent extends ICardContentBase {
  statement: string;
  trueConfidence: number;
  calibrationPrompt: string;
}

export interface IAttributionReframingContent extends ICardContentBase {
  outcome: string;
  emotionalAttribution: string;
  processAttribution: string;
}

export interface IStrategyReminderContent extends ICardContentBase {
  strategy: string;
  whenToUse: string;
  whenNotToUse: string;
  exampleApplication: string;
}

export interface IConfusableItem {
  term: string;
  definition: string;
  distinguishingFeature: string;
}
export interface IConfusableSetDrillContent extends ICardContentBase {
  items: IConfusableItem[];
  confusionPattern: string;
}

export interface IPartialKnowledgeDecompositionContent extends ICardContentBase {
  concept: string;
  knownParts: string[];
  unknownParts: string[];
}

// ============================================================================
// Content mapped by card type (enables type-safe narrowing in renderers/forms)
// ============================================================================

import type { CardType as CT, RemediationCardType as RCT } from '@noema/types';

export type CardContentByType = {
  // Standard (22)
  [CT.ATOMIC]: IAtomicContent;
  [CT.CLOZE]: IClozeContent;
  [CT.IMAGE_OCCLUSION]: IImageOcclusionContent;
  [CT.AUDIO]: IAudioContent;
  [CT.PROCESS]: IProcessContent;
  [CT.COMPARISON]: IComparisonContent;
  [CT.EXCEPTION]: IExceptionContent;
  [CT.ERROR_SPOTTING]: IErrorSpottingContent;
  [CT.CONFIDENCE_RATED]: IConfidenceRatedContent;
  [CT.CONCEPT_GRAPH]: IConceptGraphContent;
  [CT.CASE_BASED]: ICaseBasedContent;
  [CT.MULTIMODAL]: IMultimodalContent;
  [CT.TRANSFER]: ITransferContent;
  [CT.PROGRESSIVE_DISCLOSURE]: IProgressiveDisclosureContent;
  [CT.MULTIPLE_CHOICE]: IMultipleChoiceContent;
  [CT.TRUE_FALSE]: ITrueFalseContent;
  [CT.MATCHING]: IMatchingContent;
  [CT.ORDERING]: IOrderingContent;
  [CT.DEFINITION]: IDefinitionContent;
  [CT.CAUSE_EFFECT]: ICauseEffectContent;
  [CT.TIMELINE]: ITimelineContent;
  [CT.DIAGRAM]: IDiagramContent;
  // Remediation (20)
  [RCT.CONTRASTIVE_PAIR]: IContrastivePairContent;
  [RCT.MINIMAL_PAIR]: IMinimalPairContent;
  [RCT.FALSE_FRIEND]: IFalseFriendContent;
  [RCT.OLD_VS_NEW_DEFINITION]: IOldVsNewDefinitionContent;
  [RCT.BOUNDARY_CASE]: IBoundaryCaseContent;
  [RCT.RULE_SCOPE]: IRuleScopeContent;
  [RCT.DISCRIMINANT_FEATURE]: IDiscriminantFeatureContent;
  [RCT.ASSUMPTION_CHECK]: IAssumptionCheckContent;
  [RCT.COUNTEREXAMPLE]: ICounterexampleContent;
  [RCT.REPRESENTATION_SWITCH]: IRepresentationSwitchContent;
  [RCT.RETRIEVAL_CUE]: IRetrievalCueContent;
  [RCT.ENCODING_REPAIR]: IEncodingRepairContent;
  [RCT.OVERWRITE_DRILL]: IOverwriteDrillContent;
  [RCT.AVAILABILITY_BIAS_DISCONFIRMATION]: IAvailabilityBiasDisconfirmationContent;
  [RCT.SELF_CHECK_RITUAL]: ISelfCheckRitualContent;
  [RCT.CALIBRATION_TRAINING]: ICalibrationTrainingContent;
  [RCT.ATTRIBUTION_REFRAMING]: IAttributionReframingContent;
  [RCT.STRATEGY_REMINDER]: IStrategyReminderContent;
  [RCT.CONFUSABLE_SET_DRILL]: IConfusableSetDrillContent;
  [RCT.PARTIAL_KNOWLEDGE_DECOMPOSITION]: IPartialKnowledgeDecompositionContent;
};

// ============================================================================
// Card DTO (discriminated union — enables full type narrowing by cardType)
// ============================================================================

interface ICardDtoBase {
  id: CardId;
  userId: UserId;
  state: CardState;
  difficulty: DifficultyLevel;
  knowledgeNodeIds: NodeId[];
  tags: string[];
  source: EventSource;
  metadata: Record<string, unknown>;
  contentHash?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  version: number;
}

/**
 * Full card DTO returned by GET /v1/cards/:id.
 * Use cardType to narrow content: `if (card.cardType === 'cloze') { card.content.template }`
 */
export type ICardDto = {
  [K in AnyCardType]: ICardDtoBase & {
    cardType: K;
    content: CardContentByType[K];
  };
}[AnyCardType];

/**
 * Read-optimised card summary returned by paginated list/query endpoints.
 * Has `preview` (first 200 chars of `front`) instead of full `content`.
 */
export interface ICardSummaryDto {
  id: CardId;
  userId: UserId;
  cardType: AnyCardType;
  state: CardState;
  difficulty: DifficultyLevel;
  /** First 200 chars of content.front, for card library display */
  preview: string;
  knowledgeNodeIds: NodeId[];
  tags: string[];
  source: EventSource;
  contentHash?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ============================================================================
// Deck Query Input (full, matching backend IDeckQuery)
// ============================================================================

export interface IDeckQueryInput {
  cardTypes?: AnyCardType[];
  states?: CardState[];
  difficulties?: DifficultyLevel[];
  knowledgeNodeIds?: NodeId[];
  /** 'any' = has any, 'all' = has all, 'exact' = has exactly these */
  knowledgeNodeIdMode?: 'any' | 'all' | 'exact';
  tags?: string[];
  sources?: EventSource[];
  /** Full-text search across front/back/hint (PostgreSQL tsvector) */
  search?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  sortBy?: 'created_at' | 'updated_at' | 'difficulty';
  sortOrder?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
  cursor?: string;
}

// ============================================================================
// Card Stats (matching backend ICardStats)
// ============================================================================

export interface ICardStatsDto {
  totalCards: number;
  totalDeleted: number;
  /** Keys are lowercase CardState values: 'draft', 'active', etc. */
  byState: Record<string, number>;
  /** Keys are lowercase DifficultyLevel values */
  byDifficulty: Record<string, number>;
  /** Keys are lowercase AnyCardType values */
  byCardType: Record<string, number>;
  /** Keys are lowercase EventSource values */
  bySource: Record<string, number>;
  oldestCard: string | null;
  newestCard: string | null;
  recentlyUpdated: number;
}

// ============================================================================
// Card History (matching backend ICardHistory)
// ============================================================================

export interface ICardHistoryDto {
  id: string;
  cardId: CardId;
  userId: UserId;
  version: number;
  cardType: AnyCardType;
  state: CardState;
  difficulty: DifficultyLevel;
  /** Full content snapshot at this version */
  content: ICardContentBase & Record<string, unknown>;
  tags: string[];
  knowledgeNodeIds: NodeId[];
  metadata: Record<string, unknown>;
  changeType: string;
  changedBy: UserId;
  createdAt: string;
}

// ============================================================================
// Batch Operations (matching backend types)
// ============================================================================

export interface IBatchCreateError {
  index: number;
  error: string;
}

export interface IBatchCreateResult {
  /** Correlation ID stored in card metadata._batchId */
  batchId: string;
  /** Full card objects that were successfully created */
  created: ICardDto[];
  failed: IBatchCreateError[];
  total: number;
  successCount: number;
  failureCount: number;
}

/** Summary of a batch operation — used by the recent batches list */
export interface IBatchSummaryDto {
  batchId: string;
  cardCount: number;
  firstCreatedAt: string;
  lastCreatedAt: string;
}

export interface IBatchStateUpdateItem {
  cardId: CardId;
  state: CardState;
  version: number;
}

export interface IBatchStateUpdateResult {
  updated: number;
  failed: { cardId: CardId; error: string }[];
}

// ============================================================================
// Cursor Pagination
// ============================================================================

export interface ICardsCursorResult {
  items: ICardSummaryDto[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
}

export interface IPaginatedCardsResult {
  items: ICardSummaryDto[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Templates
// ============================================================================

export interface ITemplateDtoBase {
  id: TemplateId;
  name: string;
  description?: string;
  cardType: AnyCardType;
  content: ICardContentBase & Record<string, unknown>;
  difficulty: DifficultyLevel;
  knowledgeNodeIds: NodeId[];
  tags: string[];
  visibility: 'private' | 'public' | 'shared';
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type TemplateDto = ITemplateDtoBase;

export interface ICreateTemplateInput {
  name: string;
  description?: string;
  cardType: AnyCardType;
  content: ICardContentBase & Record<string, unknown>;
  difficulty?: DifficultyLevel;
  knowledgeNodeIds?: NodeId[];
  tags?: string[];
  visibility?: 'private' | 'public' | 'shared';
}

export interface IUpdateTemplateInput {
  name?: string;
  description?: string;
  content?: ICardContentBase & Record<string, unknown>;
}

// ============================================================================
// Media
// ============================================================================

export interface IMediaFileDto {
  id: MediaId;
  filename: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  bucket: string;
  objectKey: string;
  alt?: string;
  createdAt: string;
}

export interface IUploadUrlResult {
  uploadUrl: string;
  mediaId: MediaId;
  /** Presigned URL expiry (ISO-8601) */
  expiresAt: string;
}

// ============================================================================
// Create / Update / State Change Inputs
// ============================================================================

export interface ICreateCardInput {
  cardType: AnyCardType;
  content: ICardContentBase & Record<string, unknown>;
  difficulty?: DifficultyLevel;
  knowledgeNodeIds?: NodeId[];
  tags?: string[];
  source?: EventSource;
  metadata?: Record<string, unknown>;
}

export interface IUpdateCardInput {
  content?: ICardContentBase & Record<string, unknown>;
  difficulty?: DifficultyLevel;
  knowledgeNodeIds?: NodeId[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface IUpdateCardTagsInput {
  tags: string[];
}

export interface IUpdateCardNodeLinksInput {
  knowledgeNodeIds: NodeId[];
}

export interface IChangeCardStateInput {
  state: CardState;
}

export interface IBatchCreateInput {
  cards: ICreateCardInput[];
}

// ============================================================================
// Session Seed
// ============================================================================

export interface ISessionSeedQuery {
  deckQuery: IDeckQueryInput;
  limit?: number;
}

export interface ISessionSeedDto {
  cardIds: CardId[];
  totalAvailable: number;
}

// ============================================================================
// Validation
// ============================================================================

export interface ICardValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Response aliases
// ============================================================================

export type CardResponse = IApiResponse<ICardDto>;
export type CardSummaryListResponse = IApiResponse<IPaginatedCardsResult>;
export type CardsCursorResponse = IApiResponse<ICardsCursorResult>;
export type CardStatsResponse = IApiResponse<ICardStatsDto>;
export type CardHistoryResponse = IApiResponse<ICardHistoryDto[]>;
export type BatchCreateResponse = IApiResponse<IBatchCreateResult>;
export type BatchStateUpdateResponse = IApiResponse<IBatchStateUpdateResult>;
export type BatchSummaryListResponse = IApiResponse<IBatchSummaryDto[]>;
export type TemplateResponse = IApiResponse<TemplateDto>;
export type TemplatesListResponse = IApiResponse<TemplateDto[]>;
export type MediaResponse = IApiResponse<IMediaFileDto>;
export type UploadUrlResponse = IApiResponse<IUploadUrlResult>;
export type SessionSeedResponse = IApiResponse<ISessionSeedDto>;
export type CardValidationResponse = IApiResponse<ICardValidationResult>;
```

**Step 2: Build to check types compile**

```bash
cd packages/api-client
pnpm build
```
Expected: TypeScript errors in `api.ts` and `hooks.ts` because they still reference old type names — that's expected; fix them in Tasks 3 and 4.

**Step 3: Commit**

```bash
git add packages/api-client/src/content/types.ts
git commit -m "feat(api-client): rewrite content types for all 42 card types + full DeckQuery"
```

---

### Task 3: Update `packages/api-client/src/content/api.ts`

**Files:**
- Modify: `packages/api-client/src/content/api.ts`

Read the current file first. Then apply changes:

**Step 1: Identify and fix breaking changes**

The key changes needed in `api.ts`:
- Any call using old type names (`type`, `nodeLinks`, `categoryId`, `learningState`) must be updated
- Add `findRecentBatches(limit: number): Promise<BatchSummaryListResponse>`
- The existing `deleteBatch(batchId)` is correct (DELETE /v1/cards/batch/:batchId = rollback) — just re-export with a clearer name alias

In the `cardsApi` object, add:

```typescript
findRecentBatches: async (limit = 10): Promise<BatchSummaryListResponse> => {
  const params = new URLSearchParams({ limit: String(limit) });
  return httpClient.get(`/v1/cards/batch/recent?${params.toString()}`);
},

rollbackBatch: async (batchId: string): Promise<IApiResponse<{ batchId: string; deletedCount: number }>> => {
  return httpClient.delete(`/v1/cards/batch/${encodeURIComponent(batchId)}`);
},

findCardsByBatchId: async (batchId: string): Promise<IApiResponse<ICardDto[]>> => {
  return httpClient.get(`/v1/cards/batch/${encodeURIComponent(batchId)}`);
},

batchChangeState: async (
  items: IBatchStateUpdateItem[]
): Promise<BatchStateUpdateResponse> => {
  return httpClient.post('/v1/cards/batch/state', { items });
},
```

Also update the `ICreateCardInput` and `IUpdateCardInput` usage in API call bodies to use the new field names (`cardType` not `type`, `knowledgeNodeIds` not `nodeLinks`).

**Step 2: Fix the update card call to include version**

The backend `PATCH /v1/cards/:id` expects `{ data: IUpdateCardInput, version: number }`:

```typescript
updateCard: async (id: CardId, input: IUpdateCardInput, version: number): Promise<CardResponse> => {
  return httpClient.patch(`/v1/cards/${id}`, { data: input, version });
},
```

**Step 3: Build and check**

```bash
cd packages/api-client
pnpm build
```
Expected: Errors should now only be in `hooks.ts` (old import names).

**Step 4: Commit**

```bash
git add packages/api-client/src/content/api.ts
git commit -m "feat(api-client): update api.ts for new types, add recent-batches + rollback + batch-state endpoints"
```

---

### Task 4: Update `packages/api-client/src/content/hooks.ts`

**Files:**
- Modify: `packages/api-client/src/content/hooks.ts`

Read the current file. Then update:

**Step 1: Update imports in hooks.ts**

Replace the old type imports with new ones:

```typescript
import type {
  AnyCardType,
  BatchCreateResponse,
  BatchSummaryListResponse,
  BatchStateUpdateResponse,
  CardHistoryResponse,
  CardResponse,
  CardsCursorResponse,
  CardStatsResponse,
  CardSummaryListResponse,
  CardValidationResponse,
  IBatchCreateInput,
  IBatchStateUpdateItem,
  ICardDto,
  ICardHistoryDto,
  ICardStatsDto,
  ICardSummaryDto,
  IChangeCardStateInput,
  ICreateCardInput,
  IDeckQueryInput,
  ISessionSeedDto,
  ISessionSeedQuery,
  IUpdateCardInput,
  IUpdateCardNodeLinksInput,
  IUpdateCardTagsInput,
  ICreateTemplateInput,
  IUpdateTemplateInput,
  MediaResponse,
  SessionSeedResponse,
  TemplateDto,
  TemplateResponse,
  TemplatesListResponse,
  UploadUrlResponse,
} from './types.js';
```

**Step 2: Update query key factory**

Add `recentBatches`, `batchCards`, `batchState` keys:

```typescript
export const contentKeys = {
  all: ['content'] as const,
  cards: () => [...contentKeys.all, 'cards'] as const,
  list: (query?: IDeckQueryInput) => [...contentKeys.cards(), 'list', query] as const,
  cursor: (query?: Omit<IDeckQueryInput, 'cursor'>) =>
    [...contentKeys.cards(), 'cursor', query] as const,
  detail: (id: CardId) => [...contentKeys.cards(), 'detail', id] as const,
  stats: () => [...contentKeys.cards(), 'stats'] as const,
  history: (id: CardId) => [...contentKeys.cards(), 'history', id] as const,
  batchCards: (batchId: string) => [...contentKeys.cards(), 'batch', batchId] as const,
  recentBatches: (limit?: number) => [...contentKeys.cards(), 'recent-batches', limit] as const,
  templates: () => [...contentKeys.all, 'templates'] as const,
  template: (id: TemplateId) => [...contentKeys.templates(), id] as const,
  media: (id: MediaId) => [...contentKeys.all, 'media', id] as const,
};
```

**Step 3: Update useCards return type**

```typescript
export function useCards(
  query: IDeckQueryInput,
  options?: Omit<UseQueryOptions<CardSummaryListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.list(query),
    queryFn: () => cardsApi.queryCards(query),
    ...options,
  });
}
```

**Step 4: Update useCardStats return type**

```typescript
export function useCardStats(
  options?: Omit<UseQueryOptions<CardStatsResponse, Error, ICardStatsDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.stats(),
    queryFn: () => cardsApi.getStats(),
    select: (r) => r.data,
    ...options,
  });
}
```

**Step 5: Add new hooks**

Add after the existing batch hooks:

```typescript
// ============================================================================
// Batch Recovery Hooks
// ============================================================================

/** Fetch all cards in a specific batch (for batch detail view) */
export function useCardsByBatchId(
  batchId: string,
  options?: Omit<UseQueryOptions<IApiResponse<ICardDto[]>>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.batchCards(batchId),
    queryFn: () => cardsApi.findCardsByBatchId(batchId),
    enabled: batchId !== '',
    ...options,
  });
}

/** List recent batch operations (for batch operations page) */
export function useRecentBatches(
  limit = 10,
  options?: Omit<UseQueryOptions<BatchSummaryListResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: contentKeys.recentBatches(limit),
    queryFn: () => cardsApi.findRecentBatches(limit),
    ...options,
  });
}

/** Rollback an entire batch — soft-deletes all cards in the batch */
export function useRollbackBatch(
  options?: UseMutationOptions<
    IApiResponse<{ batchId: string; deletedCount: number }>,
    Error,
    string
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => cardsApi.rollbackBatch(batchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
    },
    ...options,
  });
}

/** Batch state transition — change state on multiple cards at once */
export function useBatchCardStateTransition(
  options?: UseMutationOptions<BatchStateUpdateResponse, Error, IBatchStateUpdateItem[]>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: IBatchStateUpdateItem[]) => cardsApi.batchChangeState(items),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
    },
    ...options,
  });
}
```

**Step 6: Add useCardStateTransition hook**

```typescript
/** Change state of a single card */
export function useCardStateTransition(
  options?: UseMutationOptions<
    CardResponse,
    Error,
    { id: CardId; state: import('@noema/types').CardState; version: number }
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state, version }) =>
      cardsApi.changeCardState(id, { state }, version),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: contentKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: contentKeys.stats() });
    },
    ...options,
  });
}
```

**Step 7: Export new types from package index**

In `packages/api-client/src/index.ts`, ensure the new types are exported:

```typescript
export type {
  AnyCardType,
  ICardDto,
  ICardSummaryDto,
  ICardHistoryDto,
  IBatchSummaryDto,
  IBatchStateUpdateItem,
  CardContentByType,
  IDeckQueryInput,
  ICreateCardInput,
  IUpdateCardInput,
  // ... all new types
} from './content/types.js';
export {
  useCardsByBatchId,
  useRecentBatches,
  useRollbackBatch,
  useBatchCardStateTransition,
  useCardStateTransition,
} from './content/hooks.js';
```

**Step 8: Build clean**

```bash
cd packages/api-client
pnpm build
```
Expected: 0 TypeScript errors.

**Step 9: Rebuild dependent packages**

```bash
cd apps/web
pnpm build 2>&1 | head -50
```
Expected: Type errors in existing dashboard components that use old content types — these will be fixed in later plan phases.

**Step 10: Commit**

```bash
git add packages/api-client/src/content/hooks.ts \
        packages/api-client/src/index.ts
git commit -m "feat(api-client): add batch recovery hooks, state transition hooks, fix all type imports"
```
