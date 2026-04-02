import type { IEventConsumerConfig, IStreamEventEnvelope } from '@noema/events/consumer';
import { BaseEventConsumer } from '@noema/events/consumer';
import { KnowledgeGraphEventType } from '@noema/events';
import type {
  ICkgMutationRejectedPayload,
  IPkgEdgeCreatedPayload,
  IPkgEdgeRemovedPayload,
  IPkgEdgeUpdatedPayload,
  IPkgNodeCreatedPayload,
  IPkgNodeRemovedPayload,
  IPkgNodeUpdatedPayload,
} from '@noema/events';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { type PkgAggregationApplicationService } from '../../application/knowledge-graph/aggregation/index.js';

function buildConfig(overrides: {
  sourceStreamKey: string;
  consumerName: string;
}): IEventConsumerConfig {
  return {
    sourceStreamKey: overrides.sourceStreamKey,
    consumerGroup: 'kg-service:pkg-aggregation',
    consumerName: overrides.consumerName,
    batchSize: 25,
    blockMs: 5000,
    retryBaseDelayMs: 500,
    maxProcessAttempts: 5,
    pendingIdleMs: 60_000,
    pendingBatchSize: 50,
    drainTimeoutMs: 15_000,
    deadLetterStreamKey: 'noema:dlq:kg-service:pkg-aggregation',
  };
}

export class PkgAggregationConsumer extends BaseEventConsumer {
  constructor(
    redis: Redis,
    private readonly aggregationService: PkgAggregationApplicationService,
    logger: Logger,
    consumerName: string,
    sourceStreamKey: string
  ) {
    super(redis, buildConfig({ sourceStreamKey, consumerName }), logger);
  }

  protected async handleEvent(envelope: IStreamEventEnvelope): Promise<boolean> {
    const metadata = {
      eventId: envelope.eventId,
      correlationId:
        typeof envelope.metadata['correlationId'] === 'string'
          ? envelope.metadata['correlationId']
          : undefined,
      timestamp: envelope.timestamp,
    };

    switch (envelope.eventType) {
      case KnowledgeGraphEventType.PKG_NODE_CREATED:
        await this.aggregationService.processPkgNodeCreated(
          envelope.payload as unknown as IPkgNodeCreatedPayload,
          metadata
        );
        return true;
      case KnowledgeGraphEventType.PKG_NODE_UPDATED:
        await this.aggregationService.processPkgNodeUpdated(
          envelope.payload as unknown as IPkgNodeUpdatedPayload,
          metadata
        );
        return true;
      case KnowledgeGraphEventType.PKG_NODE_REMOVED:
        await this.aggregationService.processPkgNodeRemoved(
          envelope.payload as unknown as IPkgNodeRemovedPayload,
          metadata
        );
        return true;
      case KnowledgeGraphEventType.PKG_EDGE_CREATED:
        await this.aggregationService.processPkgEdgeCreated(
          envelope.payload as unknown as IPkgEdgeCreatedPayload,
          metadata
        );
        return true;
      case KnowledgeGraphEventType.PKG_EDGE_UPDATED:
        await this.aggregationService.processPkgEdgeUpdated(
          envelope.payload as unknown as IPkgEdgeUpdatedPayload,
          metadata
        );
        return true;
      case KnowledgeGraphEventType.PKG_EDGE_REMOVED:
        await this.aggregationService.processPkgEdgeRemoved(
          envelope.payload as unknown as IPkgEdgeRemovedPayload,
          metadata
        );
        return true;
      case KnowledgeGraphEventType.CKG_MUTATION_REJECTED:
        await this.aggregationService.processAggregationMutationRejected(
          envelope.payload as unknown as ICkgMutationRejectedPayload,
          metadata
        );
        return true;
      default:
        return true;
    }
  }
}
