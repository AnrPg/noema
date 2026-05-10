/**
 * @noema/content-service — ContentService Unit Tests
 *
 * Tests all business logic in ContentService with mocked dependencies.
 */

import { ContentEventType } from '@noema/events/content';
import {
  CardTransformKind,
  EpistemicMode,
  StudyMode,
  TransformationType,
  type CardState,
  type NodeId,
} from '@noema/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentService } from '../../../src/domain/content-service/content.service.js';
import {
  AuthorizationError,
  BatchLimitExceededError,
  BusinessRuleError,
  CardNotFoundError,
  DuplicateCardError,
  ValidationError,
} from '../../../src/domain/content-service/errors/index.js';
import { generateContentHash } from '../../../src/utils/content-hash.js';
import {
  adminContext,
  atomicContent,
  card,
  cardId,
  cardSummary,
  createCardInput,
  executionContext,
  resetIdCounter,
  unauthenticatedContext,
} from '../../fixtures/index.js';
import { mockContentRepository, mockEventPublisher, mockLogger } from '../../helpers/mocks.js';

// ============================================================================
// Setup
// ============================================================================

describe('ContentService', () => {
  let service: ContentService;
  let repo: ReturnType<typeof mockContentRepository>;
  let events: ReturnType<typeof mockEventPublisher>;
  let logger: ReturnType<typeof mockLogger>;

  beforeEach(() => {
    resetIdCounter();
    repo = mockContentRepository();
    events = mockEventPublisher();
    logger = mockLogger();
    service = new ContentService(repo, events, logger);
  });

  // ==========================================================================
  // create()
  // ==========================================================================

  describe('create()', () => {
    it('creates a card and publishes an event', async () => {
      const input = createCardInput();
      const ctx = executionContext();
      const created = card({ userId: ctx.userId! });
      repo.create.mockResolvedValue(created);

      const result = await service.create(input, ctx);

      expect(result.data).toBe(created);
      expect(repo.create).toHaveBeenCalledOnce();
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'card.created' })
      );
      expect(result.agentHints).toBeDefined();
      expect(result.agentHints.suggestedNextActions.length).toBeGreaterThan(0);
    });

    it('rejects unauthenticated requests', async () => {
      const input = createCardInput();
      await expect(service.create(input, unauthenticatedContext())).rejects.toThrow(
        AuthorizationError
      );
    });

    it('rejects invalid card type', async () => {
      const input = createCardInput({ cardType: 'nonexistent' as any });
      const ctx = executionContext();

      await expect(service.create(input, ctx)).rejects.toThrow(ValidationError);
    });

    it('validates type-specific content via superRefine', async () => {
      // Cloze card without required cloze fields
      const input = createCardInput({
        cardType: 'cloze' as any,
        content: atomicContent(), // missing template + clozes
      });
      const ctx = executionContext();

      await expect(service.create(input, ctx)).rejects.toThrow(ValidationError);
    });

    it('generates a card_ prefixed ID', async () => {
      const input = createCardInput();
      const ctx = executionContext();
      repo.create.mockImplementation((data) =>
        Promise.resolve(card({ id: data.id, userId: data.userId }))
      );

      await service.create(input, ctx);

      const createCall = repo.create.mock.calls[0]![0] as { id: string };
      expect(createCall.id).toMatch(/^card_/);
    });

    it('throws DuplicateCardError when content hash already exists', async () => {
      const input = createCardInput();
      const ctx = executionContext();
      const existingCard = card({ userId: ctx.userId! });
      repo.findByContentHash.mockResolvedValue(existingCard);

      await expect(service.create(input, ctx)).rejects.toThrow(DuplicateCardError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('includes existing card in DuplicateCardError', async () => {
      const input = createCardInput();
      const ctx = executionContext();
      const existingCard = card({ userId: ctx.userId! });
      repo.findByContentHash.mockResolvedValue(existingCard);

      try {
        await service.create(input, ctx);
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateCardError);
        const dupError = error as DuplicateCardError;
        expect(dupError.existingCardId).toBe(existingCard.id);
        expect(dupError.existingCard).toBeDefined();
      }
    });

    it('passes contentHash to repository on create', async () => {
      const input = createCardInput();
      const ctx = executionContext();
      repo.create.mockImplementation((data) =>
        Promise.resolve(card({ id: data.id, userId: data.userId }))
      );

      await service.create(input, ctx);

      const createCall = repo.create.mock.calls[0]![0] as { contentHash?: string };
      expect(createCall.contentHash).toBeDefined();
      expect(typeof createCall.contentHash).toBe('string');
      expect(createCall.contentHash!.length).toBe(64); // SHA-256 hex
    });

    it('sanitizes HTML in card content before creation', async () => {
      const input = createCardInput({
        content: {
          front: '<p>What is 2+2?</p><script>alert("xss")</script>',
          back: '<b>4</b>',
        } as any,
      });
      const ctx = executionContext();
      repo.create.mockImplementation((data) =>
        Promise.resolve(card({ id: data.id, userId: data.userId, content: data.content }))
      );

      await service.create(input, ctx);

      const createCall = repo.create.mock.calls[0]![0] as {
        content: { front: string; back: string };
      };
      expect(createCall.content.front).not.toContain('<script>');
      expect(createCall.content.back).toContain('<b>4</b>');
    });
  });

  // ==========================================================================
  // createBatch()
  // ==========================================================================

  describe('createBatch()', () => {
    it('creates a batch of cards', async () => {
      const inputs = [
        createCardInput({ content: atomicContent({ front: 'Batch Q1', back: 'Batch A1' }) }),
        createCardInput({ content: atomicContent({ front: 'Batch Q2', back: 'Batch A2' }) }),
      ];
      const ctx = executionContext();
      repo.createBatch.mockResolvedValue({
        batchId: 'batch_test123',
        created: [card(), card()],
        failed: [],
        total: 2,
        successCount: 2,
        failureCount: 0,
      });

      const result = await service.createBatch(inputs, ctx);

      expect(result.data.successCount).toBe(2);
      expect(result.data.failureCount).toBe(0);
      expect(events.publishBatch).toHaveBeenCalledOnce();
    });

    it('replays an idempotent batch instead of recreating cards', async () => {
      const inputs = [createCardInput({ content: atomicContent({ front: 'Replay Q', back: 'Replay A' }) })];
      const existing = [card({ metadata: { _batchId: 'agentjob_replay_1' } as any })];
      const ctx = executionContext({ idempotencyKey: 'agentjob_replay_1' });
      repo.findByBatchId.mockResolvedValue(existing);

      const result = await service.createBatch(inputs, ctx);

      expect(result.data.batchId).toBe('agentjob_replay_1');
      expect(result.data.created).toEqual(existing);
      expect(repo.createBatch).not.toHaveBeenCalled();
      expect(events.publishBatch).not.toHaveBeenCalled();
    });

    it('rejects batch exceeding 100 cards', async () => {
      const inputs = Array.from({ length: 101 }, () => createCardInput());
      const ctx = executionContext();

      await expect(service.createBatch(inputs, ctx)).rejects.toThrow(BatchLimitExceededError);
    });

    it('rejects unauthenticated batch requests', async () => {
      await expect(service.createBatch([], unauthenticatedContext())).rejects.toThrow(
        AuthorizationError
      );
    });

    it('filters out duplicate cards in batch (existing in DB)', async () => {
      const inputs = [
        createCardInput({ content: atomicContent({ front: 'Q1', back: 'A1' }) }),
        createCardInput({ content: atomicContent({ front: 'Q2', back: 'A2' }) }),
      ];
      const ctx = executionContext();

      // First card's hash "already exists" in the DB
      const contentHash = generateContentHash(
        inputs[0]!.cardType,
        inputs[0]!.content as Record<string, unknown>
      );
      const existingCard = card({ userId: ctx.userId!, content: inputs[0]!.content, contentHash });
      repo.findByContentHashes.mockResolvedValue([existingCard]);

      repo.createBatch.mockResolvedValue({
        batchId: 'batch_test',
        created: [card()],
        failed: [],
        total: 1,
        successCount: 1,
        failureCount: 0,
      });

      const result = await service.createBatch(inputs, ctx);

      // One card should be filtered as duplicate and show in failed
      expect(result.data.failureCount).toBeGreaterThanOrEqual(1);
    });

    it('detects intra-batch duplicates (same content in batch)', async () => {
      const sameContent = atomicContent({ front: 'Duplicate', back: 'Same' });
      const inputs = [
        createCardInput({ content: sameContent }),
        createCardInput({ content: sameContent }),
      ];
      const ctx = executionContext();

      repo.createBatch.mockResolvedValue({
        batchId: 'batch_test',
        created: [card()],
        failed: [],
        total: 1,
        successCount: 1,
        failureCount: 0,
      });

      const result = await service.createBatch(inputs, ctx);

      // Second card should be rejected as intra-batch duplicate
      expect(result.data.failureCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('transformCard()', () => {
    it('uses the content transform agent and returns multiple persisted variants', async () => {
      const ctx = executionContext();
      const parent = card({
        id: cardId('parent'),
        userId: ctx.userId!,
        cardType: 'atomic' as any,
        primaryConceptId: 'concept_123456789012345678901' as any,
        relatedConceptIds: [],
        anchoredCkgNodeIds: ['concept_123456789012345678901'] as any,
        anchoredPkgNodeIds: ['node_123456789012345678901'] as any,
        content: atomicContent(),
      });
      const transformAgent = {
        generateContent: vi.fn(),
        transformCard: vi.fn().mockResolvedValue({
          agentRunId: 'run_transform_1',
          drafts: [
            {
              parentCardId: parent.id,
              cardType: 'atomic',
              conceptIds: [parent.primaryConceptId],
              anchoredCkgNodeIds: parent.anchoredCkgNodeIds,
              anchoredPkgNodeIds: parent.anchoredPkgNodeIds,
              content: {
                front: 'Variant one front',
                back: 'Variant one back',
              },
              tags: ['variant-one'],
              difficulty: parent.difficulty,
              factualityScore: 0.9,
              rationale: 'first variant',
            },
            {
              parentCardId: parent.id,
              cardType: 'definition',
              conceptIds: [parent.primaryConceptId],
              anchoredCkgNodeIds: parent.anchoredCkgNodeIds,
              anchoredPkgNodeIds: parent.anchoredPkgNodeIds,
              content: {
                front: 'Variant two front',
                back: 'Variant two back',
              },
              tags: ['variant-two'],
              difficulty: parent.difficulty,
              factualityScore: 0.9,
              rationale: 'second variant',
            },
          ],
          rejectedDrafts: [],
        }),
      };
      repo.findByIdForUser.mockResolvedValue(parent);
      service = new ContentService(repo, events, logger, undefined, undefined, transformAgent as any);
      vi.spyOn(service, 'create')
        .mockResolvedValueOnce({
          data: card({ ...parent, id: cardId(), cardType: 'atomic' as any }),
          agentHints: {} as any,
        })
        .mockResolvedValueOnce({
          data: card({ ...parent, id: cardId(), cardType: 'definition' as any }),
          agentHints: {} as any,
        });

      const result = await service.transformCard(
        parent.id,
        {
          transformationKind: CardTransformKind.CHANGE_CARD_TYPE,
          targetCardTypes: ['comparison' as any, 'cloze' as any],
          count: 2,
          prompt: 'Transform this into different study formats.',
        },
        ctx
      );

      expect(transformAgent.transformCard).toHaveBeenCalledOnce();
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.cardType).toBe('atomic');
      expect(result.data[1]?.cardType).toBe('definition');
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: ContentEventType.CARD_TRANSFORMATION_CREATED })
      );
    });
  });

  describe('importGeneratedContentBatch()', () => {
    it('creates or reuses a generation job and persists imported cards idempotently', async () => {
      const ctx = executionContext({
        idempotencyKey: 'agentjob_import_1',
        userId: 'user_import' as any,
      });
      const conceptId = 'concept_aaaaaaaaaaaaaaaaaaaa1';
      repo.findGenerationJobById.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'cgenjob_existing' as any,
        userId: ctx.userId!,
        status: 'completed',
        mode: 'agent_autonomous',
        conceptIds: [conceptId],
        documentIds: [],
        requestedCardTypes: ['atomic'],
        requestPayload: {},
        resultPayload: { batchId: 'agentjob_import_1' },
        createdCardIds: ['card_existing' as any],
        rejectedDrafts: [],
        agentRunId: 'run_1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      repo.createGenerationJob.mockResolvedValue({
        id: 'cgenjob_existing' as any,
        userId: ctx.userId!,
        status: 'requested',
        mode: 'agent_autonomous',
        conceptIds: [conceptId],
        documentIds: [],
        requestedCardTypes: ['atomic'],
        requestPayload: {},
        resultPayload: {},
        createdCardIds: [],
        rejectedDrafts: [],
        agentRunId: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      repo.updateGenerationJob.mockResolvedValue({
        id: 'cgenjob_existing' as any,
        userId: ctx.userId!,
        status: 'completed',
        mode: 'agent_autonomous',
        conceptIds: [conceptId],
        documentIds: [],
        requestedCardTypes: ['atomic'],
        requestPayload: {},
        resultPayload: { batchId: 'agentjob_import_1', createdCount: 1 },
        createdCardIds: ['card_generated' as any],
        rejectedDrafts: [],
        agentRunId: 'run_1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      repo.createBatch.mockResolvedValue({
        batchId: 'agentjob_import_1',
        created: [card({ id: 'card_generated' as any, userId: ctx.userId! })],
        failed: [],
        total: 1,
        successCount: 1,
        failureCount: 0,
      });
      repo.findByBatchId.mockResolvedValueOnce([]);

      const result = await service.importGeneratedContentBatch(
        {
          job: {
            mode: 'agent_autonomous',
            conceptIds: [conceptId] as any,
            desiredCardTypes: ['atomic'] as any,
          },
          cards: [createCardInput()],
          rejectedDrafts: [],
          agentRunId: 'run_1',
          resultPayload: {},
        },
        ctx
      );

      expect(result.data.batch.batchId).toBe('agentjob_import_1');
      expect(repo.createGenerationJob).toHaveBeenCalledOnce();
      expect(repo.updateGenerationJob).toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'content.generation.requested' })
      );
    });

    it('imports generated activity variants through the Guardian-gated variant path', async () => {
      const ctx = executionContext({
        idempotencyKey: 'agentjob_import_variants',
        userId: 'user_import' as any,
      });
      const conceptId = 'concept_ABCDEFGHIJKLMNOPQRSTU';
      const guardian = {
        validateGeneratedVariant: vi.fn().mockResolvedValue({
          result: 'accepted',
          reasonCodes: [],
          blocking: false,
          validationId: 'guard_variant',
        }),
      };
      service = new ContentService(repo, events, logger, undefined, guardian);
      repo.findGenerationJobById.mockResolvedValueOnce(null);
      repo.createGenerationJob.mockResolvedValue({
        id: 'cgenjob_variants' as any,
        userId: ctx.userId!,
        status: 'requested',
        mode: 'agent_autonomous',
        conceptIds: [conceptId],
        documentIds: [],
        requestedCardTypes: ['atomic'],
        requestPayload: {},
        resultPayload: {},
        createdCardIds: [],
        rejectedDrafts: [],
        agentRunId: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      repo.updateGenerationJob.mockResolvedValue({
        id: 'cgenjob_variants' as any,
        userId: ctx.userId!,
        status: 'completed',
        mode: 'agent_autonomous',
        conceptIds: [conceptId],
        documentIds: [],
        requestedCardTypes: ['atomic'],
        requestPayload: {},
        resultPayload: { activityVariantCount: 1 },
        createdCardIds: ['card_generated' as any],
        rejectedDrafts: [],
        agentRunId: 'run_1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      repo.createBatch.mockResolvedValue({
        batchId: 'agentjob_import_variants',
        created: [card({ id: 'card_generated' as any, userId: ctx.userId! })],
        failed: [],
        total: 1,
        successCount: 1,
        failureCount: 0,
      });
      repo.findByBatchId.mockResolvedValueOnce([]);
      repo.createGeneratedActivityVariant.mockImplementation((input) =>
        Promise.resolve({ ...input, createdAt: '2026-05-02T00:00:00.000Z', hitCount: 0 })
      );

      const result = await service.importGeneratedContentBatch(
        {
          job: {
            mode: 'agent_autonomous',
            conceptIds: [conceptId] as any,
            desiredCardTypes: ['atomic'] as any,
          },
          cards: [createCardInput()],
          activityVariants: [
            {
              conceptId: conceptId as any,
              studyMode: StudyMode.KNOWLEDGE_GAINING,
              transformationType: TransformationType.EXPLANATION,
              epistemicMode: EpistemicMode.GENERATIVE_RETRIEVAL,
              difficultyBucket: 2,
              sourceCardIds: [],
              prompt: 'Explain the concept in your own words.',
              renderPayload: {},
              expectedResponseType: 'free_text',
              responseSchema: { type: 'string' },
              variantSeed: 'seed-import-1',
              generatorMetadata: { agentRunId: 'run_1' },
              ttlAt: '2026-05-03T00:00:00.000Z',
            },
          ],
          agentRunId: 'run_1',
          rejectedDrafts: [],
          resultPayload: {},
        },
        ctx
      );

      expect(guardian.validateGeneratedVariant).toHaveBeenCalledOnce();
      expect(result.data.activityVariants).toHaveLength(1);
      expect(repo.createGeneratedActivityVariant).toHaveBeenCalledWith(
        expect.objectContaining({ guardianValidationId: 'guard_variant' })
      );
    });
  });

  // ==========================================================================
  // findById()
  // ==========================================================================

  describe('findById()', () => {
    it('returns a card by ID for the owner', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId! });
      repo.findByIdForUser.mockResolvedValue(existing);

      const result = await service.findById(existing.id, ctx);

      expect(result.data).toBe(existing);
    });

    it('throws CardNotFoundError when card does not exist', async () => {
      const ctx = executionContext();
      repo.findByIdForUser.mockResolvedValue(null);
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(cardId(), ctx)).rejects.toThrow(CardNotFoundError);
    });

    it('allows admins to see any card', async () => {
      const ctx = adminContext();
      const existing = card(); // different userId
      repo.findByIdForUser.mockResolvedValue(null);
      repo.findById.mockResolvedValue(existing);

      const result = await service.findById(existing.id, ctx);

      expect(result.data).toBe(existing);
    });
  });

  describe('createGeneratedActivityVariant()', () => {
    const generatedInput = () => ({
      conceptId: 'concept_ABCDEFGHIJKLMNOPQRSTU',
      studyMode: StudyMode.KNOWLEDGE_GAINING,
      transformationType: TransformationType.RECALL,
      epistemicMode: EpistemicMode.GENERATIVE_RETRIEVAL,
      difficultyBucket: 2,
      sourceCardIds: [cardId()],
      prompt: 'Explain the concept in your own words.',
      renderPayload: {},
      expectedResponseType: 'free_text',
      responseSchema: { type: 'string' },
      variantSeed: 'seed-1',
      generatorMetadata: { model: 'test' },
      ttlAt: '2026-05-03T00:00:00.000Z',
    });

    it('validates with Guardian before storing a generated variant', async () => {
      const ctx = executionContext();
      const guardian = {
        validateGeneratedVariant: vi.fn().mockResolvedValue({
          result: 'accepted',
          reasonCodes: [],
          blocking: false,
          validationId: 'guard_accepted',
        }),
      };
      service = new ContentService(repo, events, logger, undefined, guardian);
      repo.createGeneratedActivityVariant.mockImplementation((input) =>
        Promise.resolve({ ...input, createdAt: '2026-05-02T00:00:00.000Z', hitCount: 0 })
      );

      const result = await service.createGeneratedActivityVariant(generatedInput(), ctx);

      expect(guardian.validateGeneratedVariant).toHaveBeenCalledOnce();
      expect(repo.createGeneratedActivityVariant).toHaveBeenCalledWith(
        expect.objectContaining({ guardianValidationId: 'guard_accepted' })
      );
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'generated_activity_variant.created' })
      );
      expect(result.data.guardianValidationId).toBe('guard_accepted');
    });

    it('does not store a generated variant rejected by Guardian', async () => {
      const ctx = executionContext();
      const guardian = {
        validateGeneratedVariant: vi.fn().mockResolvedValue({
          result: 'rejected',
          reasonCodes: ['generated_variant.prompt.leaks_answer'],
          blocking: true,
          validationId: 'guard_rejected',
        }),
      };
      service = new ContentService(repo, events, logger, undefined, guardian);

      await expect(service.createGeneratedActivityVariant(generatedInput(), ctx)).rejects.toThrow(
        BusinessRuleError
      );
      expect(repo.createGeneratedActivityVariant).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // query()
  // ==========================================================================

  describe('query()', () => {
    it('queries cards and returns paginated results', async () => {
      const ctx = executionContext();
      const summaries = [cardSummary(), cardSummary()];
      repo.query.mockResolvedValue({ items: summaries, total: 2, hasMore: false });

      const result = await service.query({}, ctx);

      expect(result.data.items).toHaveLength(2);
      expect(result.data.total).toBe(2);
    });

    it('rejects invalid query parameters', async () => {
      const ctx = executionContext();
      const query: Parameters<ContentService['query']>[0] = { limit: -1 }; // Invalid

      await expect(service.query(query, ctx)).rejects.toThrow(ValidationError);
    });

    it('non-admins can only query their own cards', async () => {
      const ctx = executionContext();
      repo.query.mockResolvedValue({ items: [], total: 0, hasMore: false });

      const requestedQuery: Parameters<ContentService['query']>[0] = { userId: 'other_user' };

      await service.query(requestedQuery, ctx);

      // Should use context.userId, not the requested userId
      expect(repo.query).toHaveBeenCalledWith(expect.anything(), ctx.userId);
    });
  });

  // ==========================================================================
  // queryCursor()
  // ==========================================================================

  describe('queryCursor()', () => {
    it('returns cursor-paginated results', async () => {
      const ctx = executionContext();
      const summaries = [cardSummary(), cardSummary()];
      repo.queryCursor.mockResolvedValue({
        items: summaries,
        nextCursor: 'abc123',
        prevCursor: null,
        hasMore: true,
      });

      const result = await service.queryCursor({}, ctx, undefined, 20);

      expect(result.data.items).toHaveLength(2);
      expect(result.data.nextCursor).toBe('abc123');
      expect(result.data.hasMore).toBe(true);
    });

    it('passes cursor and direction to the repository', async () => {
      const ctx = executionContext();
      repo.queryCursor.mockResolvedValue({
        items: [],
        nextCursor: null,
        prevCursor: null,
        hasMore: false,
      });

      await service.queryCursor({}, ctx, 'my_cursor', 10, 'backward');

      expect(repo.queryCursor).toHaveBeenCalledWith(
        expect.anything(),
        ctx.userId,
        'my_cursor',
        10,
        'backward'
      );
    });

    it('rejects unauthenticated requests', async () => {
      const ctx = unauthenticatedContext();
      await expect(service.queryCursor({}, ctx)).rejects.toThrow(AuthorizationError);
    });
  });

  // ==========================================================================
  // update()
  // ==========================================================================

  describe('update()', () => {
    it('updates a card and publishes event', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId!, state: 'draft' as CardState });
      const updated = card({ ...existing, content: atomicContent({ front: 'New Q?' }) });
      repo.findById.mockResolvedValue(existing);
      repo.update.mockResolvedValue(updated);

      const result = await service.update(
        existing.id,
        { content: atomicContent({ front: 'New Q?' }) },
        1,
        ctx
      );

      expect(result.data).toBe(updated);
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'card.updated' })
      );
    });

    it('rejects update on archived card', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId!, state: 'archived' as CardState });
      repo.findById.mockResolvedValue(existing);

      await expect(
        service.update(existing.id, { content: atomicContent() }, 1, ctx)
      ).rejects.toThrow('Cannot update when card state is archived');
    });

    it('validates type-specific content on update', async () => {
      const ctx = executionContext();
      const existing = card({
        userId: ctx.userId!,
        cardType: 'cloze' as any,
        state: 'draft' as CardState,
      });
      repo.findById.mockResolvedValue(existing);

      // Attempt to update cloze card with atomic content (missing template/clozes)
      await expect(
        service.update(existing.id, { content: atomicContent() }, 1, ctx)
      ).rejects.toThrow(ValidationError);
    });

    it('rejects update for non-owner', async () => {
      const ctx = executionContext();
      const existing = card(); // different userId
      repo.findById.mockResolvedValue(existing);

      await expect(
        service.update(existing.id, { content: atomicContent() }, 1, ctx)
      ).rejects.toThrow(CardNotFoundError);
    });
  });

  // ==========================================================================
  // changeState()
  // ==========================================================================

  describe('changeState()', () => {
    it('transitions draft → active', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId!, state: 'draft' as CardState });
      const activated = card({ ...existing, state: 'active' as CardState });
      repo.findById.mockResolvedValue(existing);
      repo.changeState.mockResolvedValue(activated);

      const result = await service.changeState(
        existing.id,
        { state: 'active' as CardState },
        1,
        ctx
      );

      expect(result.data.state).toBe('active');
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'card.state.changed' })
      );
    });

    it('rejects invalid state transitions', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId!, state: 'draft' as CardState });
      repo.findById.mockResolvedValue(existing);

      // draft → suspended is not allowed
      await expect(
        service.changeState(existing.id, { state: 'suspended' as CardState }, 1, ctx)
      ).rejects.toThrow(BusinessRuleError);
    });

    it.each([
      ['draft', 'active'],
      ['draft', 'archived'],
      ['active', 'suspended'],
      ['active', 'archived'],
      ['suspended', 'active'],
      ['suspended', 'archived'],
      ['archived', 'draft'],
    ])('allows %s → %s', async (from, to) => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId!, state: from as CardState });
      const transitioned = card({ ...existing, state: to as CardState });
      repo.findById.mockResolvedValue(existing);
      repo.changeState.mockResolvedValue(transitioned);

      const result = await service.changeState(existing.id, { state: to as CardState }, 1, ctx);

      expect(result.data.state).toBe(to);
    });

    it.each([
      ['draft', 'suspended'],
      ['active', 'draft'],
      ['suspended', 'draft'],
      ['archived', 'active'],
      ['archived', 'suspended'],
    ])('rejects %s → %s', async (from, to) => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId!, state: from as CardState });
      repo.findById.mockResolvedValue(existing);

      await expect(
        service.changeState(existing.id, { state: to as CardState }, 1, ctx)
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ==========================================================================
  // updateTags()
  // ==========================================================================

  describe('updateTags()', () => {
    it('updates tags and publishes event', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId! });
      const updated = card({ ...existing, tags: ['math', 'algebra'] });
      repo.findById.mockResolvedValue(existing);
      repo.updateTags.mockResolvedValue(updated);

      const result = await service.updateTags(existing.id, ['math', 'algebra'], 1, ctx);

      expect(result.data.tags).toEqual(['math', 'algebra']);
    });

    it('rejects invalid tags (uppercase)', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId! });
      repo.findById.mockResolvedValue(existing);

      await expect(service.updateTags(existing.id, ['INVALID-TAG'], 1, ctx)).rejects.toThrow(
        ValidationError
      );
    });

    it('rejects tags exceeding limit', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId! });
      repo.findById.mockResolvedValue(existing);
      const tooManyTags = Array.from({ length: 31 }, (_, i) => `tag-${String(i)}`);

      await expect(service.updateTags(existing.id, tooManyTags, 1, ctx)).rejects.toThrow(
        ValidationError
      );
    });
  });

  // ==========================================================================
  // updateKnowledgeNodeIds()
  // ==========================================================================

  describe('updateKnowledgeNodeIds()', () => {
    it('updates node IDs and publishes event', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId! });
      const nid = 'node_aaaaaaaaaaaaaaaaaaaaa' as NodeId;
      const updated = card({ ...existing, knowledgeNodeIds: [nid] });
      repo.findById.mockResolvedValue(existing);
      repo.updateKnowledgeNodeIds.mockResolvedValue(updated);

      const result = await service.updateKnowledgeNodeIds(existing.id, [nid], 1, ctx);

      expect(result.data.knowledgeNodeIds).toEqual([nid]);
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'card.knowledge-nodes.updated' })
      );
    });
  });

  // ==========================================================================
  // count()
  // ==========================================================================

  describe('count()', () => {
    it('returns count matching query', async () => {
      const ctx = executionContext();
      repo.count.mockResolvedValue(42);

      const result = await service.count({}, ctx);

      expect(result.data.count).toBe(42);
    });
  });

  // ==========================================================================
  // validateContent()
  // ==========================================================================

  describe('validateContent()', () => {
    it('returns valid: true for correct atomic content', () => {
      const ctx = executionContext();
      const result = service.validateContent('atomic', atomicContent(), ctx);

      expect(result.data.valid).toBe(true);
      expect(result.data.errors).toBeUndefined();
    });

    it('returns valid: false with error details for invalid content', () => {
      const ctx = executionContext();
      const result = service.validateContent('cloze', atomicContent(), ctx);

      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.length).toBeGreaterThan(0);
    });

    it('returns error for unknown card type', () => {
      const ctx = executionContext();
      const result = service.validateContent('nonexistent', atomicContent(), ctx);

      expect(result.data.valid).toBe(false);
    });
  });

  // ==========================================================================
  // batchChangeState()
  // ==========================================================================

  describe('batchChangeState()', () => {
    it('changes state for multiple cards with per-card versions', async () => {
      const ctx = executionContext();
      const id1 = cardId();
      const id2 = cardId();
      const existing1 = card({ id: id1, userId: ctx.userId!, state: 'draft' as CardState });
      const existing2 = card({ id: id2, userId: ctx.userId!, state: 'draft' as CardState });

      // findById will be called for each card (in changeState → requireCardOwnership)
      repo.findById.mockResolvedValueOnce(existing1).mockResolvedValueOnce(existing2);
      repo.changeState
        .mockResolvedValueOnce(card({ ...existing1, state: 'active' as CardState }))
        .mockResolvedValueOnce(card({ ...existing2, state: 'active' as CardState }));

      const result = await service.batchChangeState(
        [
          { id: id1, version: 1 },
          { id: id2, version: 1 },
        ],
        'active' as CardState,
        undefined,
        ctx
      );

      expect(result.data.succeeded).toHaveLength(2);
      expect(result.data.failed).toHaveLength(0);
    });

    it('rejects batch exceeding 100 cards', async () => {
      const ctx = executionContext();
      const items = Array.from({ length: 101 }, () => ({ id: cardId(), version: 1 }));

      await expect(
        service.batchChangeState(items, 'active' as CardState, undefined, ctx)
      ).rejects.toThrow(BatchLimitExceededError);
    });

    it('reports individual failures without stopping', async () => {
      const ctx = executionContext();
      const id1 = cardId();
      const id2 = cardId();
      const existing1 = card({ id: id1, userId: ctx.userId!, state: 'draft' as CardState });

      // First card succeeds, second not found
      repo.findById.mockResolvedValueOnce(existing1).mockResolvedValueOnce(null);
      repo.changeState.mockResolvedValueOnce(card({ ...existing1, state: 'active' as CardState }));

      const result = await service.batchChangeState(
        [
          { id: id1, version: 1 },
          { id: id2, version: 1 },
        ],
        'active' as CardState,
        undefined,
        ctx
      );

      expect(result.data.succeeded).toHaveLength(1);
      expect(result.data.failed).toHaveLength(1);
      expect(result.data.failed[0]!.id).toBe(id2);
    });
  });

  // ==========================================================================
  // delete()
  // ==========================================================================

  describe('delete()', () => {
    it('soft-deletes a card', async () => {
      const ctx = executionContext();
      const existing = card({ userId: ctx.userId! });
      repo.findById.mockResolvedValue(existing);
      repo.softDelete.mockResolvedValue(undefined);

      await service.delete(existing.id, true, ctx);

      expect(repo.softDelete).toHaveBeenCalledWith(
        existing.id,
        existing.version,
        ctx.userId ?? undefined
      );
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'card.deleted' })
      );
    });

    it('hard-deletes requires admin', async () => {
      const ctx = executionContext(); // not admin
      const existing = card({ userId: ctx.userId! });
      repo.findById.mockResolvedValue(existing);

      await expect(service.delete(existing.id, false, ctx)).rejects.toThrow(AuthorizationError);
    });

    it('allows admin hard-delete', async () => {
      const ctx = adminContext();
      const existing = card();
      repo.findById.mockResolvedValue(existing);
      repo.hardDelete.mockResolvedValue(undefined);

      await service.delete(existing.id, false, ctx);

      expect(repo.hardDelete).toHaveBeenCalledWith(existing.id);
    });
  });

  // ==========================================================================
  // restore()
  // ==========================================================================

  describe('restore()', () => {
    it('restores a soft-deleted card and publishes event', async () => {
      const ctx = executionContext();
      const restored = card({ userId: ctx.userId!, state: 'DRAFT' as CardState });
      repo.restore.mockResolvedValue(restored);

      const result = await service.restore(restored.id, ctx);

      expect(repo.restore).toHaveBeenCalledWith(restored.id, ctx.userId ?? undefined);
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'card.restored' })
      );
      expect(result.data.id).toBe(restored.id);
    });

    it('requires authentication', async () => {
      const ctx = unauthenticatedContext();
      await expect(service.restore(cardId(), ctx)).rejects.toThrow(AuthorizationError);
    });
  });

  // ==========================================================================
  // Batch recovery
  // ==========================================================================

  describe('findByBatchId()', () => {
    it('returns cards from the repository for the authenticated user', async () => {
      const ctx = executionContext();
      const batchId = 'batch_example123';
      const cards = [card({ userId: ctx.userId! }), card({ userId: ctx.userId! })];
      repo.findByBatchId.mockResolvedValue(cards);

      const result = await service.findByBatchId(batchId, ctx);

      expect(repo.findByBatchId).toHaveBeenCalledWith(batchId, ctx.userId ?? undefined);
      expect(result.data).toEqual(cards);
    });

    it('requires authentication', async () => {
      await expect(
        service.findByBatchId('batch_example123', unauthenticatedContext())
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ==========================================================================
  // getStats()
  // ==========================================================================

  describe('getStats()', () => {
    it('returns stats from repository', async () => {
      const ctx = executionContext();
      const stats = {
        totalCards: 42,
        totalDeleted: 3,
        byState: { DRAFT: 10, ACTIVE: 30, SUSPENDED: 2, RETIRED: 0 },
        byDifficulty: { EASY: 5, MEDIUM: 20, HARD: 15, EXPERT: 2 },
        byCardType: { ATOMIC: 30, CLOZE: 10, MULTIPLE_CHOICE: 2 },
        bySource: { MANUAL: 20, AI_GENERATED: 22 },
        oldestCard: new Date('2024-01-01'),
        newestCard: new Date('2025-01-01'),
        recentlyUpdated: 5,
      };
      repo.getStats.mockResolvedValue(stats);

      const result = await service.getStats(ctx);

      expect(repo.getStats).toHaveBeenCalledWith(ctx.userId ?? undefined);
      expect(result.data).toEqual(stats);
    });

    it('requires authentication', async () => {
      const ctx = unauthenticatedContext();
      await expect(service.getStats(ctx)).rejects.toThrow(AuthorizationError);
    });
  });
});
