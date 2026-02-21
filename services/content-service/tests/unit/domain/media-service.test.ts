/**
 * @noema/content-service — MediaService Unit Tests
 *
 * Tests upload flow, read, and delete operations
 * with mocked repository, storage provider, and event publisher.
 */

import type { MediaId } from '@noema/types';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  BusinessRuleError,
  ValidationError,
} from '../../../src/domain/content-service/errors/index.js';
import {
  MediaNotFoundError,
  MediaService,
} from '../../../src/domain/content-service/media.service.js';
import {
  executionContext,
  mediaFile,
  mediaId,
  unauthenticatedContext,
} from '../../fixtures/index.js';
import {
  mockEventPublisher,
  mockLogger,
  mockMediaRepository,
  mockStorageProvider,
} from '../../helpers/mocks.js';

describe('MediaService', () => {
  let service: MediaService;
  let repo: ReturnType<typeof mockMediaRepository>;
  let storage: ReturnType<typeof mockStorageProvider>;
  let events: ReturnType<typeof mockEventPublisher>;
  let logger: ReturnType<typeof mockLogger>;

  const BUCKET = 'test-bucket';
  const URL_EXPIRY = 3600;

  beforeEach(() => {
    repo = mockMediaRepository();
    storage = mockStorageProvider();
    events = mockEventPublisher();
    logger = mockLogger();
    service = new MediaService(repo, storage, events, BUCKET, URL_EXPIRY, logger);
  });

  // ==========================================================================
  // requestUploadUrl()
  // ==========================================================================

  describe('requestUploadUrl()', () => {
    const validInput = {
      originalFilename: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: 5000,
    };

    it('returns presigned upload URL', async () => {
      const ctx = executionContext();
      repo.create.mockResolvedValue(mediaFile());

      const result = await service.requestUploadUrl(validInput, ctx);

      expect(result.data.uploadUrl).toContain('https://');
      expect(result.data.mediaId).toMatch(/^media/);
      expect(result.data.bucket).toBe(BUCKET);
      expect(result.data.expiresAt).toBeDefined();
    });

    it('rejects unauthenticated requests', async () => {
      await expect(service.requestUploadUrl(validInput, unauthenticatedContext())).rejects.toThrow(
        AuthorizationError
      );
    });

    it('rejects unsupported MIME type', async () => {
      const ctx = executionContext();
      await expect(
        service.requestUploadUrl({ ...validInput, mimeType: 'application/exe' }, ctx)
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects file exceeding max size', async () => {
      const ctx = executionContext();
      // Schema validation catches the size before the business rule check
      await expect(
        service.requestUploadUrl(
          { ...validInput, sizeBytes: 200 * 1024 * 1024 }, // 200MB
          ctx
        )
      ).rejects.toThrow();
    });

    it('rejects invalid input (missing filename)', async () => {
      const ctx = executionContext();
      await expect(
        service.requestUploadUrl({ mimeType: 'image/png', sizeBytes: 100 }, ctx)
      ).rejects.toThrow(ValidationError);
    });
  });

  // ==========================================================================
  // confirmUpload()
  // ==========================================================================

  describe('confirmUpload()', () => {
    it('confirms upload and publishes event', async () => {
      const ctx = executionContext();
      const existing = mediaFile({ userId: ctx.userId! });
      repo.findByIdForUser.mockResolvedValue(existing);
      storage.objectExists.mockResolvedValue(true);
      repo.confirmUpload.mockResolvedValue(existing);

      const result = await service.confirmUpload(existing.id, { sizeBytes: 5000 }, ctx);

      expect(result.data).toBe(existing);
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'media.uploaded' })
      );
    });

    it('throws when media not found', async () => {
      const ctx = executionContext();
      repo.findByIdForUser.mockResolvedValue(null);

      await expect(
        service.confirmUpload(mediaId() as MediaId, { sizeBytes: 5000 }, ctx)
      ).rejects.toThrow(MediaNotFoundError);
    });

    it('throws when object not in storage', async () => {
      const ctx = executionContext();
      const existing = mediaFile({ userId: ctx.userId! });
      repo.findByIdForUser.mockResolvedValue(existing);
      storage.objectExists.mockResolvedValue(false);

      await expect(service.confirmUpload(existing.id, { sizeBytes: 5000 }, ctx)).rejects.toThrow(
        BusinessRuleError
      );
    });
  });

  // ==========================================================================
  // findById()
  // ==========================================================================

  describe('findById()', () => {
    it('returns media for the owner', async () => {
      const ctx = executionContext();
      const existing = mediaFile({ userId: ctx.userId! });
      repo.findByIdForUser.mockResolvedValue(existing);

      const result = await service.findById(existing.id, ctx);

      expect(result.data).toBe(existing);
    });

    it('throws when media not found', async () => {
      const ctx = executionContext();
      repo.findByIdForUser.mockResolvedValue(null);

      await expect(service.findById(mediaId() as MediaId, ctx)).rejects.toThrow(MediaNotFoundError);
    });
  });

  // ==========================================================================
  // getDownloadUrl()
  // ==========================================================================

  describe('getDownloadUrl()', () => {
    it('returns presigned download URL', async () => {
      const ctx = executionContext();
      const existing = mediaFile({ userId: ctx.userId! });
      repo.findByIdForUser.mockResolvedValue(existing);

      const result = await service.getDownloadUrl(existing.id, ctx);

      expect(result.data.downloadUrl).toContain('https://');
      expect(result.data.expiresAt).toBeDefined();
    });
  });

  // ==========================================================================
  // listUserMedia()
  // ==========================================================================

  describe('listUserMedia()', () => {
    it('returns media list for current user', async () => {
      const ctx = executionContext();
      repo.findByUser.mockResolvedValue({ items: [mediaFile()], total: 1 });

      const result = await service.listUserMedia({}, ctx);

      expect(result.data.total).toBe(1);
    });

    it('rejects unauthenticated requests', async () => {
      await expect(service.listUserMedia({}, unauthenticatedContext())).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  // ==========================================================================
  // delete()
  // ==========================================================================

  describe('delete()', () => {
    it('deletes media from storage and repository', async () => {
      const ctx = executionContext();
      const existing = mediaFile({ userId: ctx.userId! });
      repo.findByIdForUser.mockResolvedValue(existing);
      storage.deleteObject.mockResolvedValue(undefined);
      repo.softDelete.mockResolvedValue(undefined);

      const result = await service.delete(existing.id, ctx);

      expect(result.data.deleted).toBe(true);
      expect(storage.deleteObject).toHaveBeenCalledWith(existing.objectKey);
      expect(repo.softDelete).toHaveBeenCalledWith(existing.id);
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'media.deleted' })
      );
    });

    it('proceeds with metadata delete even if storage delete fails', async () => {
      const ctx = executionContext();
      const existing = mediaFile({ userId: ctx.userId! });
      repo.findByIdForUser.mockResolvedValue(existing);
      storage.deleteObject.mockRejectedValue(new Error('Storage error'));
      repo.softDelete.mockResolvedValue(undefined);

      const result = await service.delete(existing.id, ctx);

      expect(result.data.deleted).toBe(true);
      expect(repo.softDelete).toHaveBeenCalledWith(existing.id);
    });

    it('throws when media not found', async () => {
      const ctx = executionContext();
      repo.findByIdForUser.mockResolvedValue(null);

      await expect(service.delete(mediaId() as MediaId, ctx)).rejects.toThrow(MediaNotFoundError);
    });
  });
});
