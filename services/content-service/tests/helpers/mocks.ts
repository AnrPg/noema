/**
 * @noema/content-service — Mock Factories
 *
 * Vi-compatible mock implementations for all repository and infrastructure interfaces.
 */

import { vi } from 'vitest';
import type { IContentRepository } from '../../src/domain/content-service/content.repository.js';
import type { IEventPublisher } from '../../src/domain/shared/event-publisher.js';
import type { ITemplateRepository } from '../../src/domain/content-service/template.repository.js';
import type {
  IMediaRepository,
  IStorageProvider,
} from '../../src/domain/content-service/media.repository.js';

// ============================================================================
// Content Repository Mock
// ============================================================================

export function mockContentRepository(): {
  [K in keyof IContentRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findById: vi.fn(),
    findByIdForUser: vi.fn(),
    query: vi.fn(),
    count: vi.fn(),
    findByIds: vi.fn(),
    create: vi.fn(),
    createBatch: vi.fn(),
    update: vi.fn(),
    changeState: vi.fn(),
    softDelete: vi.fn(),
    hardDelete: vi.fn(),
    updateTags: vi.fn(),
    updateKnowledgeNodeIds: vi.fn(),
  };
}

// ============================================================================
// Template Repository Mock
// ============================================================================

export function mockTemplateRepository(): {
  [K in keyof ITemplateRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findById: vi.fn(),
    findByIdForUser: vi.fn(),
    query: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    incrementUsageCount: vi.fn(),
    softDelete: vi.fn(),
    hardDelete: vi.fn(),
  };
}

// ============================================================================
// Media Repository Mock
// ============================================================================

export function mockMediaRepository(): {
  [K in keyof IMediaRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    findById: vi.fn(),
    findByIdForUser: vi.fn(),
    findByUser: vi.fn(),
    create: vi.fn(),
    confirmUpload: vi.fn(),
    softDelete: vi.fn(),
    hardDelete: vi.fn(),
  };
}

// ============================================================================
// Storage Provider Mock
// ============================================================================

export function mockStorageProvider(): {
  [K in keyof IStorageProvider]: ReturnType<typeof vi.fn>;
} {
  return {
    getPresignedUploadUrl: vi.fn().mockResolvedValue('https://minio.local/upload?signed=1'),
    getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://minio.local/download?signed=1'),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    objectExists: vi.fn().mockResolvedValue(true),
  };
}

// ============================================================================
// Event Publisher Mock
// ============================================================================

export function mockEventPublisher(): {
  [K in keyof IEventPublisher]: ReturnType<typeof vi.fn>;
} {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    publishBatch: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// Logger Mock (Pino-compatible)
// ============================================================================

export function mockLogger() {
  const logger: Record<string, ReturnType<typeof vi.fn>> = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
  // child() returns the same mock logger
  logger.child.mockReturnValue(logger);
  return logger as unknown as import('pino').Logger;
}
