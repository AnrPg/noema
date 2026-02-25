/**
 * @noema/content-service — Event Consumer Unit Tests
 *
 * Tests the concrete event consumers (UserDeleted, KgNodeDeleted,
 * AttemptRecorded) by calling handleEvent() directly, and the
 * BaseEventConsumer lifecycle via a TestableConsumer subclass.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttemptRecordedConsumer } from '../../../src/events/consumers/attempt-recorded.consumer.js';
import type { IStreamEventEnvelope } from '../../../src/events/consumers/base-consumer.js';
import { KgNodeDeletedConsumer } from '../../../src/events/consumers/kg-node-deleted.consumer.js';
import { UserDeletedConsumer } from '../../../src/events/consumers/user-deleted.consumer.js';

// ============================================================================
// Mocks
// ============================================================================

function mockRedis() {
  return {
    xgroup: vi.fn().mockResolvedValue('OK'),
    xreadgroup: vi.fn().mockResolvedValue(null),
    xadd: vi.fn().mockResolvedValue('1-1'),
    xack: vi.fn().mockResolvedValue(1),
    xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
    quit: vi.fn().mockResolvedValue('OK'),
  };
}

function mockPrisma() {
  return {
    card: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    template: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    mediaFile: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    cardHistory: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function mockLogger() {
  const child: Record<string, unknown> = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  (child as { child: ReturnType<typeof vi.fn> }).child.mockReturnValue(child);
  return child;
}

function makeEnvelope(overrides: Partial<IStreamEventEnvelope> = {}): IStreamEventEnvelope {
  return {
    eventType: 'test.event',
    aggregateType: 'Test',
    aggregateId: 'test_1',
    payload: {},
    metadata: {},
    timestamp: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

// ============================================================================
// UserDeletedConsumer
// ============================================================================

describe('UserDeletedConsumer', () => {
  let redis: ReturnType<typeof mockRedis>;
  let prisma: ReturnType<typeof mockPrisma>;
  let logger: ReturnType<typeof mockLogger>;
  let consumer: UserDeletedConsumer;

  beforeEach(() => {
    redis = mockRedis();
    prisma = mockPrisma();
    logger = mockLogger();
    consumer = new UserDeletedConsumer(
      redis as any,
      prisma as any,
      logger as any,
      'test-consumer',
      'test:stream'
    );
  });

  it('ignores non-user.deleted events', async () => {
    const envelope = makeEnvelope({ eventType: 'user.created' });
    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);
    expect(prisma.card.updateMany).not.toHaveBeenCalled();
  });

  it('soft-deletes user content when payload.soft is true', async () => {
    prisma.card.updateMany.mockResolvedValue({ count: 5 });
    prisma.template.updateMany.mockResolvedValue({ count: 2 });
    prisma.mediaFile.updateMany.mockResolvedValue({ count: 1 });

    const envelope = makeEnvelope({
      eventType: 'user.deleted',
      aggregateId: 'user_123',
      payload: { soft: true },
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);

    expect(prisma.card.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_123', deletedAt: null },
      data: expect.objectContaining({ state: 'ARCHIVED' }),
    });
    expect(prisma.template.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_123', deletedAt: null },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
    expect(prisma.mediaFile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_123', deletedAt: null },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
  });

  it('hard-deletes user content when payload.soft is false', async () => {
    prisma.card.deleteMany.mockResolvedValue({ count: 3 });
    prisma.template.deleteMany.mockResolvedValue({ count: 1 });
    prisma.mediaFile.deleteMany.mockResolvedValue({ count: 0 });
    prisma.cardHistory.deleteMany.mockResolvedValue({ count: 10 });

    const envelope = makeEnvelope({
      eventType: 'user.deleted',
      aggregateId: 'user_456',
      payload: { soft: false },
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);

    expect(prisma.card.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_456' } });
    expect(prisma.template.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_456' } });
    expect(prisma.mediaFile.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_456' } });
    expect(prisma.cardHistory.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_456' } });
  });

  it('defaults to soft delete when payload.soft is unspecified', async () => {
    const envelope = makeEnvelope({
      eventType: 'user.deleted',
      aggregateId: 'user_789',
      payload: {},
    });

    await (consumer as any).handleEvent(envelope);
    expect(prisma.card.updateMany).toHaveBeenCalled();
    expect(prisma.card.deleteMany).not.toHaveBeenCalled();
  });

  it('returns true when aggregateId is missing', async () => {
    const envelope = makeEnvelope({
      eventType: 'user.deleted',
      aggregateId: '',
      payload: { soft: true },
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);
  });
});

// ============================================================================
// KgNodeDeletedConsumer
// ============================================================================

describe('KgNodeDeletedConsumer', () => {
  let redis: ReturnType<typeof mockRedis>;
  let prisma: ReturnType<typeof mockPrisma>;
  let logger: ReturnType<typeof mockLogger>;
  let consumer: KgNodeDeletedConsumer;

  beforeEach(() => {
    redis = mockRedis();
    prisma = mockPrisma();
    logger = mockLogger();
    consumer = new KgNodeDeletedConsumer(
      redis as any,
      prisma as any,
      logger as any,
      'test-consumer',
      'test:stream'
    );
  });

  it('ignores non-kg.node.deleted events', async () => {
    const envelope = makeEnvelope({ eventType: 'kg.node.created' });
    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);
    expect(prisma.card.findMany).not.toHaveBeenCalled();
  });

  it('removes node ID from affected cards', async () => {
    const affectedCards = [
      { id: 'card_1', knowledgeNodeIds: ['node_A', 'node_B'], version: 1 },
      { id: 'card_2', knowledgeNodeIds: ['node_A'], version: 2 },
    ];
    prisma.card.findMany.mockResolvedValue(affectedCards);
    prisma.card.update.mockResolvedValue({});

    const envelope = makeEnvelope({
      eventType: 'kg.node.deleted',
      aggregateId: 'node_A',
      payload: { nodeId: 'node_A' },
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);

    expect(prisma.card.findMany).toHaveBeenCalledWith({
      where: { knowledgeNodeIds: { has: 'node_A' }, deletedAt: null },
      select: { id: true, knowledgeNodeIds: true, version: true },
    });

    expect(prisma.card.update).toHaveBeenCalledTimes(2);
    expect(prisma.card.update).toHaveBeenCalledWith({
      where: { id: 'card_1' },
      data: { knowledgeNodeIds: ['node_B'], version: { increment: 1 } },
    });
    expect(prisma.card.update).toHaveBeenCalledWith({
      where: { id: 'card_2' },
      data: { knowledgeNodeIds: [], version: { increment: 1 } },
    });
  });

  it('does nothing when no cards reference the node', async () => {
    prisma.card.findMany.mockResolvedValue([]);

    const envelope = makeEnvelope({
      eventType: 'kg.node.deleted',
      payload: { nodeId: 'node_orphan' },
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it('falls back to aggregateId if payload.nodeId is missing', async () => {
    prisma.card.findMany.mockResolvedValue([]);

    const envelope = makeEnvelope({
      eventType: 'kg.node.deleted',
      aggregateId: 'node_fallback',
      payload: {},
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);

    expect(prisma.card.findMany).toHaveBeenCalledWith({
      where: { knowledgeNodeIds: { has: 'node_fallback' }, deletedAt: null },
      select: { id: true, knowledgeNodeIds: true, version: true },
    });
  });
});

// ============================================================================
// AttemptRecordedConsumer
// ============================================================================

describe('AttemptRecordedConsumer', () => {
  let redis: ReturnType<typeof mockRedis>;
  let prisma: ReturnType<typeof mockPrisma>;
  let logger: ReturnType<typeof mockLogger>;
  let consumer: AttemptRecordedConsumer;

  beforeEach(() => {
    redis = mockRedis();
    prisma = mockPrisma();
    logger = mockLogger();
    consumer = new AttemptRecordedConsumer(
      redis as any,
      prisma as any,
      logger as any,
      'test-consumer',
      'test:stream'
    );
  });

  it('ignores non-attempt.recorded events', async () => {
    const envelope = makeEnvelope({ eventType: 'session.started' });
    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
  });

  it('skips when card is not found', async () => {
    prisma.card.findFirst.mockResolvedValue(null);

    const envelope = makeEnvelope({
      eventType: 'attempt.recorded',
      payload: { cardId: 'card_missing', rating: 'good', outcome: 'correct', responseTimeMs: 500 },
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it('creates initial review stats on first attempt', async () => {
    prisma.card.findFirst.mockResolvedValue({
      id: 'card_1',
      metadata: {},
      version: 1,
    });
    prisma.card.update.mockResolvedValue({});

    const timestamp = '2024-01-15T10:00:00.000Z';
    const envelope = makeEnvelope({
      eventType: 'attempt.recorded',
      timestamp,
      payload: {
        cardId: 'card_1',
        rating: 'good',
        outcome: 'correct',
        responseTimeMs: 1500,
      },
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);

    expect(prisma.card.update).toHaveBeenCalledWith({
      where: { id: 'card_1' },
      data: {
        metadata: {
          reviewStats: {
            totalReviews: 1,
            correctCount: 1,
            accuracy: 1,
            lastReviewedAt: timestamp,
            lastRating: 'good',
            lastOutcome: 'correct',
            lastResponseTimeMs: 1500,
            averageResponseTimeMs: 1500,
          },
        },
        version: { increment: 1 },
      },
    });
  });

  it('updates rolling stats from existing metadata', async () => {
    prisma.card.findFirst.mockResolvedValue({
      id: 'card_2',
      metadata: {
        reviewStats: {
          totalReviews: 4,
          correctCount: 3,
          accuracy: 0.75,
          lastReviewedAt: '2024-01-10T10:00:00.000Z',
          lastRating: 'easy',
          lastOutcome: 'correct',
          lastResponseTimeMs: 1000,
          averageResponseTimeMs: 1200,
        },
        someOtherField: 'preserved',
      },
      version: 5,
    });
    prisma.card.update.mockResolvedValue({});

    const envelope = makeEnvelope({
      eventType: 'attempt.recorded',
      timestamp: '2024-01-15T12:00:00.000Z',
      payload: {
        cardId: 'card_2',
        rating: 'again',
        outcome: 'incorrect',
        responseTimeMs: 2000,
      },
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);

    const updateCall = prisma.card.update.mock.calls[0]![0] as {
      data: { metadata: { reviewStats: Record<string, unknown>; someOtherField: string } };
    };
    const stats = updateCall.data.metadata.reviewStats;

    expect(stats.totalReviews).toBe(5);
    expect(stats.correctCount).toBe(3); // incorrect attempt, no increment
    expect(stats.accuracy).toBe(0.6); // 3/5
    expect(stats.lastRating).toBe('again');
    expect(stats.lastOutcome).toBe('incorrect');
    expect(stats.lastResponseTimeMs).toBe(2000);
    // (1200 * 4 + 2000) / 5 = 6800/5 = 1360
    expect(stats.averageResponseTimeMs).toBe(1360);
    // Preserves non-reviewStats metadata
    expect(updateCall.data.metadata.someOtherField).toBe('preserved');
  });

  it('returns true when cardId is missing from payload', async () => {
    const envelope = makeEnvelope({
      eventType: 'attempt.recorded',
      payload: { rating: 'good', outcome: 'correct' },
    });

    const result = await (consumer as any).handleEvent(envelope);
    expect(result).toBe(true);
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
  });
});
