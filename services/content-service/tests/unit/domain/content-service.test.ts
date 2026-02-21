/**
 * @noema/content-service — ContentService Unit Tests
 *
 * Tests all business logic in ContentService with mocked dependencies.
 */

import type { CardId, CardState } from '@noema/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentService } from '../../../src/domain/content-service/content.service.js';
import {
  AuthorizationError,
  BatchLimitExceededError,
  BusinessRuleError,
  CardNotFoundError,
  ValidationError,
} from '../../../src/domain/content-service/errors/index.js';
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
      repo.create.mockImplementation(async (data) => card({ id: data.id, userId: data.userId }));

      await service.create(input, ctx);

      const createCall = repo.create.mock.calls[0]![0] as { id: string };
      expect(createCall.id).toMatch(/^card_/);
    });
  });

  // ==========================================================================
  // createBatch()
  // ==========================================================================

  describe('createBatch()', () => {
    it('creates a batch of cards', async () => {
      const inputs = [createCardInput(), createCardInput()];
      const ctx = executionContext();
      repo.createBatch.mockResolvedValue({
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
      const query = { limit: -1 }; // Invalid

      await expect(service.query(query as any, ctx)).rejects.toThrow(ValidationError);
    });

    it('non-admins can only query their own cards', async () => {
      const ctx = executionContext();
      repo.query.mockResolvedValue({ items: [], total: 0, hasMore: false });

      await service.query({ userId: 'other_user' } as any, ctx);

      // Should use context.userId, not the requested userId
      expect(repo.query).toHaveBeenCalledWith(expect.anything(), ctx.userId);
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
      const tooManyTags = Array.from({ length: 31 }, (_, i) => `tag-${i}`);

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
      const nid = 'node_aaaaaaaaaaaaaaaaaaaaa';
      const updated = card({ ...existing, knowledgeNodeIds: [nid as any] });
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
    it('returns valid: true for correct atomic content', async () => {
      const ctx = executionContext();
      const result = await service.validateContent('atomic', atomicContent(), ctx);

      expect(result.data.valid).toBe(true);
      expect(result.data.errors).toBeUndefined();
    });

    it('returns valid: false with error details for invalid content', async () => {
      const ctx = executionContext();
      const result = await service.validateContent('cloze', atomicContent(), ctx);

      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.length).toBeGreaterThan(0);
    });

    it('returns error for unknown card type', async () => {
      const ctx = executionContext();
      const result = await service.validateContent('nonexistent', atomicContent(), ctx);

      expect(result.data.valid).toBe(false);
    });
  });

  // ==========================================================================
  // batchChangeState()
  // ==========================================================================

  describe('batchChangeState()', () => {
    it('changes state for multiple cards', async () => {
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
        [id1, id2],
        'active' as CardState,
        undefined,
        1,
        ctx
      );

      expect(result.data.succeeded).toHaveLength(2);
      expect(result.data.failed).toHaveLength(0);
    });

    it('rejects batch exceeding 100 cards', async () => {
      const ctx = executionContext();
      const ids = Array.from({ length: 101 }, () => cardId());

      await expect(
        service.batchChangeState(ids, 'active' as CardState, undefined, 1, ctx)
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
        [id1, id2],
        'active' as CardState,
        undefined,
        1,
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

      expect(repo.softDelete).toHaveBeenCalledWith(existing.id, existing.version);
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
});
