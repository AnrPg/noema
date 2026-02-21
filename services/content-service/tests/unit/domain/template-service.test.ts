/**
 * @noema/content-service — TemplateService Unit Tests
 *
 * Tests create, read, update, delete, instantiate operations
 * with mocked repository and event publisher.
 */

import type { TemplateId } from '@noema/types';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  ValidationError,
} from '../../../src/domain/content-service/errors/index.js';
import {
  TemplateNotFoundError,
  TemplateService,
} from '../../../src/domain/content-service/template.service.js';
import {
  adminContext,
  createTemplateInput,
  executionContext,
  template,
  templateId,
  unauthenticatedContext,
} from '../../fixtures/index.js';
import { mockEventPublisher, mockLogger, mockTemplateRepository } from '../../helpers/mocks.js';

describe('TemplateService', () => {
  let service: TemplateService;
  let repo: ReturnType<typeof mockTemplateRepository>;
  let events: ReturnType<typeof mockEventPublisher>;
  let logger: ReturnType<typeof mockLogger>;

  beforeEach(() => {
    repo = mockTemplateRepository();
    events = mockEventPublisher();
    logger = mockLogger();
    service = new TemplateService(repo, events, logger);
  });

  // ==========================================================================
  // create()
  // ==========================================================================

  describe('create()', () => {
    it('creates a template and publishes event', async () => {
      const input = createTemplateInput();
      const ctx = executionContext();
      const created = template({ userId: ctx.userId! });
      repo.create.mockResolvedValue(created);

      const result = await service.create(input, ctx);

      expect(result.data).toBe(created);
      expect(repo.create).toHaveBeenCalledOnce();
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'template.created' })
      );
    });

    it('rejects unauthenticated requests', async () => {
      const input = createTemplateInput();
      await expect(service.create(input, unauthenticatedContext())).rejects.toThrow(
        AuthorizationError
      );
    });

    it('rejects invalid template input', async () => {
      const input = createTemplateInput({ name: '' }); // empty name
      const ctx = executionContext();

      await expect(service.create(input, ctx)).rejects.toThrow(ValidationError);
    });
  });

  // ==========================================================================
  // findById()
  // ==========================================================================

  describe('findById()', () => {
    it('returns a template for the owner', async () => {
      const ctx = executionContext();
      const existing = template({ userId: ctx.userId!, visibility: 'private' });
      repo.findById.mockResolvedValue(existing);

      const result = await service.findById(existing.id, ctx);

      expect(result.data).toBe(existing);
    });

    it('throws TemplateNotFoundError when not found', async () => {
      const ctx = executionContext();
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(templateId() as TemplateId, ctx)).rejects.toThrow(
        TemplateNotFoundError
      );
    });

    it('hides private templates from non-owners', async () => {
      const ctx = executionContext();
      const otherTemplate = template({ visibility: 'private' }); // different userId
      repo.findById.mockResolvedValue(otherTemplate);

      await expect(service.findById(otherTemplate.id, ctx)).rejects.toThrow(TemplateNotFoundError);
    });

    it('allows admin to see private templates', async () => {
      const ctx = adminContext();
      const otherTemplate = template({ visibility: 'private' });
      repo.findById.mockResolvedValue(otherTemplate);

      const result = await service.findById(otherTemplate.id, ctx);

      expect(result.data).toBe(otherTemplate);
    });
  });

  // ==========================================================================
  // query()
  // ==========================================================================

  describe('query()', () => {
    it('returns paginated template results', async () => {
      const ctx = executionContext();
      repo.query.mockResolvedValue({ items: [], total: 0, hasMore: false });

      const result = await service.query({}, ctx);

      expect(result.data.total).toBe(0);
    });

    it('rejects unauthenticated queries', async () => {
      await expect(service.query({}, unauthenticatedContext())).rejects.toThrow(AuthorizationError);
    });
  });

  // ==========================================================================
  // update()
  // ==========================================================================

  describe('update()', () => {
    it('updates a template and publishes event', async () => {
      const ctx = executionContext();
      const existing = template({ userId: ctx.userId! });
      const updated = template({ ...existing, name: 'Updated Name' });
      repo.findById.mockResolvedValue(existing);
      repo.update.mockResolvedValue(updated);

      const result = await service.update(existing.id, { name: 'Updated Name' }, 1, ctx);

      expect(result.data.name).toBe('Updated Name');
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'template.updated' })
      );
    });

    it('rejects update for non-owner', async () => {
      const ctx = executionContext();
      const other = template(); // different userId
      repo.findById.mockResolvedValue(other);

      await expect(service.update(other.id, { name: 'New' }, 1, ctx)).rejects.toThrow(
        TemplateNotFoundError
      );
    });
  });

  // ==========================================================================
  // delete()
  // ==========================================================================

  describe('delete()', () => {
    it('soft-deletes a template', async () => {
      const ctx = executionContext();
      const existing = template({ userId: ctx.userId! });
      repo.findById.mockResolvedValue(existing);
      repo.softDelete.mockResolvedValue(undefined);

      await service.delete(existing.id, true, ctx);

      expect(repo.softDelete).toHaveBeenCalledWith(existing.id, existing.version);
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'template.deleted' })
      );
    });

    it('rejects hard-delete for non-admin', async () => {
      const ctx = executionContext();
      const existing = template({ userId: ctx.userId! });
      repo.findById.mockResolvedValue(existing);

      await expect(service.delete(existing.id, false, ctx)).rejects.toThrow(AuthorizationError);
    });

    it('allows admin hard-delete', async () => {
      const ctx = adminContext();
      const existing = template();
      repo.findById.mockResolvedValue(existing);
      repo.hardDelete.mockResolvedValue(undefined);

      await service.delete(existing.id, false, ctx);

      expect(repo.hardDelete).toHaveBeenCalledWith(existing.id);
    });
  });

  // ==========================================================================
  // instantiate()
  // ==========================================================================

  describe('instantiate()', () => {
    it('converts template to card input', async () => {
      const ctx = executionContext();
      const existing = template({ userId: ctx.userId!, visibility: 'public' as any });
      repo.findById.mockResolvedValue(existing);
      repo.incrementUsageCount.mockResolvedValue(undefined);

      const result = await service.instantiate(existing.id, {}, ctx);

      expect(result.data.cardType).toBe(existing.cardType);
      expect(result.data.content).toBe(existing.content);
      expect(result.data.metadata).toHaveProperty('templateId', existing.id);
      expect(repo.incrementUsageCount).toHaveBeenCalledWith(existing.id);
    });

    it('applies overrides', async () => {
      const ctx = executionContext();
      const existing = template({ userId: ctx.userId!, visibility: 'public' as any });
      repo.findById.mockResolvedValue(existing);
      repo.incrementUsageCount.mockResolvedValue(undefined);

      const result = await service.instantiate(existing.id, { tags: ['override-tag'] }, ctx);

      expect(result.data.tags).toEqual(['override-tag']);
    });
  });
});
