import {
  CurriculumEvidenceAccumulatedPayloadSchema,
  CurriculumFrontierUpdatedPayloadSchema,
  CurriculumLifecyclePayloadSchema,
  CurriculumNodeRuntimePayloadSchema,
  CurriculumProgressUpdatedPayloadSchema,
  CurriculumRevisionPayloadSchema,
  SessionCurriculumSliceSelectedPayloadSchema,
  type CurriculumEvidenceAccumulatedPayload,
  type CurriculumRevisionPayload,
} from '@noema/events';
import { ID_PREFIXES, type EventId } from '@noema/types';
import { nanoid } from 'nanoid';
import type {
  CurriculumEventPayloadMap,
  CurriculumEventPublisherPort,
  CurriculumEventPublishOptions,
  CurriculumEventType,
} from '../../domain/curriculum-service/event-publisher.port.js';
import type { IOutboxRepository } from '../../domain/curriculum-service/outbox.repository.js';

const EVENT_SCHEMAS = {
  'curriculum.created': CurriculumLifecyclePayloadSchema,
  'curriculum.version.activated': CurriculumLifecyclePayloadSchema,
  'curriculum.progress.updated': CurriculumProgressUpdatedPayloadSchema,
  'curriculum.node.completed': CurriculumNodeRuntimePayloadSchema,
  'curriculum.frontier.updated': CurriculumFrontierUpdatedPayloadSchema,
  'curriculum.revision.proposed': CurriculumRevisionPayloadSchema,
  'curriculum.revision.applied': CurriculumRevisionPayloadSchema,
  'curriculum.realignment.evidence_accumulated': CurriculumEvidenceAccumulatedPayloadSchema,
  'session.curriculum_slice.selected': SessionCurriculumSliceSelectedPayloadSchema,
} as const;

function aggregateForEvent(
  eventType: CurriculumEventType,
  payload: CurriculumEventPayloadMap[CurriculumEventType]
): { aggregateType: string; aggregateId: string } {
  switch (eventType) {
    case 'curriculum.created':
      return {
        aggregateType: 'Curriculum',
        aggregateId: payload.curriculumId,
      };
    case 'curriculum.version.activated': {
      const versionId =
        'curriculumVersionId' in payload && typeof payload.curriculumVersionId === 'string'
          ? payload.curriculumVersionId
          : '';
      return {
        aggregateType: 'CurriculumVersion',
        aggregateId: versionId !== '' ? versionId : payload.curriculumId,
      };
    }
    case 'curriculum.progress.updated':
    case 'curriculum.node.completed':
    case 'curriculum.frontier.updated':
      return {
        aggregateType: 'CurriculumProgress',
        aggregateId: payload.curriculumId,
      };
    case 'curriculum.realignment.evidence_accumulated': {
      const evidencePayload = payload as CurriculumEvidenceAccumulatedPayload;
      return {
        aggregateType: 'RealignmentEvidence',
        aggregateId: `${evidencePayload.curriculumId}:${evidencePayload.stableNodeKey}:${evidencePayload.triggerType}`,
      };
    }
    case 'curriculum.revision.proposed':
    case 'curriculum.revision.applied': {
      const revisionPayload = payload as CurriculumRevisionPayload;
      return {
        aggregateType: 'CurriculumRevisionProposal',
        aggregateId: revisionPayload.proposalId,
      };
    }
    case 'session.curriculum_slice.selected': {
      const slicePayload =
        payload as CurriculumEventPayloadMap['session.curriculum_slice.selected'];
      return {
        aggregateType: 'Session',
        aggregateId: slicePayload.sessionId,
      };
    }
  }
}

export class CurriculumOutboxEventPublisher implements CurriculumEventPublisherPort {
  constructor(private readonly outboxRepository: IOutboxRepository) {}

  async publish<TEventType extends CurriculumEventType>(
    eventType: TEventType,
    payload: CurriculumEventPayloadMap[TEventType],
    options: CurriculumEventPublishOptions
  ): Promise<void> {
    EVENT_SCHEMAS[eventType].parse(payload);
    const aggregate = aggregateForEvent(eventType, payload);

    await this.outboxRepository.enqueue(
      {
        id: `${ID_PREFIXES.EventId}${nanoid(21)}` as EventId,
        eventType,
        aggregateType: aggregate.aggregateType,
        aggregateId: aggregate.aggregateId,
        payload,
        metadata: {
          correlationId: options.correlationId,
          userId: payload.userId as never,
          ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
        },
      },
      options.tx
    );
  }
}
