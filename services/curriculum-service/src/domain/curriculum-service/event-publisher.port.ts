import type {
  CurriculumEvidenceAccumulatedPayload,
  CurriculumFrontierUpdatedPayload,
  CurriculumLifecyclePayload,
  CurriculumNodeRuntimePayload,
  CurriculumProgressUpdatedPayload,
  CurriculumRevisionPayload,
  SessionCurriculumSliceSelectedPayload,
} from '@noema/events';
import type { CorrelationId } from '@noema/types';
import type { Prisma } from '@prisma/client';

export interface CurriculumEventPayloadMap {
  'curriculum.created': CurriculumLifecyclePayload;
  'curriculum.version.activated': CurriculumLifecyclePayload;
  'curriculum.progress.updated': CurriculumProgressUpdatedPayload;
  'curriculum.node.completed': CurriculumNodeRuntimePayload;
  'curriculum.frontier.updated': CurriculumFrontierUpdatedPayload;
  'curriculum.revision.proposed': CurriculumRevisionPayload;
  'curriculum.revision.applied': CurriculumRevisionPayload;
  'curriculum.realignment.evidence_accumulated': CurriculumEvidenceAccumulatedPayload;
  'session.curriculum_slice.selected': SessionCurriculumSliceSelectedPayload;
}

export type CurriculumEventType = keyof CurriculumEventPayloadMap;

export interface CurriculumEventPublishOptions {
  correlationId: CorrelationId;
  causationId?: string;
  tx?: Prisma.TransactionClient;
}

export interface CurriculumEventPublisherPort {
  publish<TEventType extends CurriculumEventType>(
    eventType: TEventType,
    payload: CurriculumEventPayloadMap[TEventType],
    options: CurriculumEventPublishOptions
  ): Promise<void>;
}
