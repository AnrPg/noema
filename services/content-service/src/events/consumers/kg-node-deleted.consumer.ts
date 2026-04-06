/**
 * @noema/content-service - KG Node Deleted Event Consumer
 *
 * Listens for 'pkg.node.removed' events from the knowledge-graph-service
 * stream and removes the deleted node ID from all cards' knowledgeNodeIds
 * arrays. Preserves the remaining node links and increments the card version.
 */

import { KnowledgeGraphEventType } from '@noema/events/knowledge-graph';
import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import { BaseEventConsumer } from '@noema/events/consumer';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { PrismaClient } from '../../../generated/prisma/index.js';

// ============================================================================
// Default config
// ============================================================================

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'content-service:kg-node-deleted',
    consumerName: overrides.consumerName,
    batchSize: 10,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 10_000,
    deadLetterStreamKey: 'noema:dlq:content-service:kg-node-deleted',
  };
}

// ============================================================================
// Consumer
// ============================================================================

export class KgNodeDeletedConsumer extends BaseEventConsumer {
  private readonly prisma: PrismaClient;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    logger: Logger,
    consumerName: string,
    sourceStreamKey = 'noema:events:knowledge-graph-service'
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
    this.prisma = prisma;
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    if (envelope.eventType !== KnowledgeGraphEventType.PKG_NODE_REMOVED) {
      return true; // Not our event — acknowledge it
    }

    const nodeId = (envelope.payload as { nodeId?: string }).nodeId ?? envelope.aggregateId;
    if (nodeId === '') {
      this.logger.warn({ envelope }, 'pkg.node.removed event missing nodeId');
      return true;
    }

    this.logger.info({ nodeId }, 'Processing pkg.node.removed — removing from linked cards');

    // Find all non-deleted cards referencing this node
    const affectedCards = await this.prisma.card.findMany({
      where: {
        knowledgeNodeIds: { has: nodeId },
        deletedAt: null,
      },
      select: { id: true, knowledgeNodeIds: true, version: true },
    });

    if (affectedCards.length === 0) {
      this.logger.debug({ nodeId }, 'No cards reference this node — nothing to update');
      return true;
    }

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

    this.logger.info({ nodeId, updatedCards: updated }, 'Node reference removed from cards');
    return true;
  }
}
