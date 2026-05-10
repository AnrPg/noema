import { nanoid } from 'nanoid';
import type { z } from 'zod';
import { ID_PREFIXES } from '@noema/types';
import type { CorrelationId, EventId, UserId } from '@noema/types';
import {
  BaseEventSchema,
  ConceptStateChangedPayloadSchema,
  ContentCoverageUpdatedPayloadSchema,
  CurriculumEvidenceAccumulatedPayloadSchema,
  CurriculumFrontierUpdatedPayloadSchema,
  CurriculumLifecyclePayloadSchema,
  CurriculumNodeRuntimePayloadSchema,
  CurriculumProgressUpdatedPayloadSchema,
  CurriculumRevisionChangePayloadSchema,
  CurriculumRevisionPayloadSchema,
  GamificationProjectionUpdatedPayloadSchema,
  MetacognitionEvaluationRecordedPayloadSchema,
  MetacognitionTriggerFiredPayloadSchema,
  SchedulerConceptStateUpdatedPayloadSchema,
  SessionCurriculumSliceSelectedPayloadSchema,
  StepAnsweredEventPayloadSchema,
  StepEventPayloadSchema,
  StrategyReplanPayloadSchema,
  createEventSchema,
} from './schemas.js';

export const LearningEventType = {
  STEP_PLANNED: 'step.planned',
  STEP_PRESENTED: 'step.presented',
  STEP_ANSWERED: 'step.answered',
  STEP_EVALUATED: 'step.evaluated',
  METACOGNITION_EVALUATION_RECORDED: 'metacognition.evaluation.recorded',
  METACOGNITION_TRIGGER_FIRED: 'metacognition.trigger.fired',
  SCHEDULER_CONCEPT_STATE_UPDATED: 'scheduler.concept_state.updated',
  KNOWLEDGE_GRAPH_CONCEPT_STATE_CHANGED: 'knowledge_graph.concept_state.changed',
  STRATEGY_REPLAN_COMMITTED: 'strategy.replan.committed',
  CURRICULUM_CREATED: 'curriculum.created',
  CURRICULUM_VERSION_ACTIVATED: 'curriculum.version.activated',
  CURRICULUM_PROGRESS_UPDATED: 'curriculum.progress.updated',
  CURRICULUM_NODE_COMPLETED: 'curriculum.node.completed',
  CURRICULUM_FRONTIER_UPDATED: 'curriculum.frontier.updated',
  CURRICULUM_REALIGNMENT_EVIDENCE_ACCUMULATED:
    'curriculum.realignment.evidence_accumulated',
  CURRICULUM_REVISION_APPLIED: 'curriculum.revision.applied',
  CURRICULUM_REVISION_CHANGE_APPROVED: 'curriculum.revision.change.approved',
  CURRICULUM_REVISION_CHANGE_REJECTED: 'curriculum.revision.change.rejected',
  SESSION_CURRICULUM_SLICE_SELECTED: 'session.curriculum_slice.selected',
  CONTENT_COVERAGE_UPDATED: 'content.coverage.updated',
  GAMIFICATION_PROJECTION_UPDATED: 'gamification.projection.updated',
} as const;

export type LearningEventType = (typeof LearningEventType)[keyof typeof LearningEventType];

export const LearningEventSchemas = {
  [LearningEventType.STEP_PLANNED]: createEventSchema('step.planned', 'Step', StepEventPayloadSchema),
  [LearningEventType.STEP_PRESENTED]: createEventSchema(
    'step.presented',
    'Step',
    StepEventPayloadSchema
  ),
  [LearningEventType.STEP_ANSWERED]: createEventSchema(
    'step.answered',
    'Step',
    StepAnsweredEventPayloadSchema
  ),
  [LearningEventType.STEP_EVALUATED]: createEventSchema(
    'step.evaluated',
    'Step',
    StepEventPayloadSchema
  ),
  [LearningEventType.METACOGNITION_EVALUATION_RECORDED]: createEventSchema(
    'metacognition.evaluation.recorded',
    'Evaluation',
    MetacognitionEvaluationRecordedPayloadSchema
  ),
  [LearningEventType.METACOGNITION_TRIGGER_FIRED]: createEventSchema(
    'metacognition.trigger.fired',
    'Trigger',
    MetacognitionTriggerFiredPayloadSchema
  ),
  [LearningEventType.SCHEDULER_CONCEPT_STATE_UPDATED]: createEventSchema(
    'scheduler.concept_state.updated',
    'ConceptScheduleState',
    SchedulerConceptStateUpdatedPayloadSchema
  ),
  [LearningEventType.KNOWLEDGE_GRAPH_CONCEPT_STATE_CHANGED]: createEventSchema(
    'knowledge_graph.concept_state.changed',
    'ConceptStateProjection',
    ConceptStateChangedPayloadSchema
  ),
  [LearningEventType.STRATEGY_REPLAN_COMMITTED]: createEventSchema(
    'strategy.replan.committed',
    'Replan',
    StrategyReplanPayloadSchema
  ),
  [LearningEventType.CURRICULUM_CREATED]: createEventSchema(
    'curriculum.created',
    'Curriculum',
    CurriculumLifecyclePayloadSchema
  ),
  [LearningEventType.CURRICULUM_VERSION_ACTIVATED]: createEventSchema(
    'curriculum.version.activated',
    'CurriculumVersion',
    CurriculumLifecyclePayloadSchema
  ),
  [LearningEventType.CURRICULUM_PROGRESS_UPDATED]: createEventSchema(
    'curriculum.progress.updated',
    'CurriculumProgress',
    CurriculumProgressUpdatedPayloadSchema
  ),
  [LearningEventType.CURRICULUM_NODE_COMPLETED]: createEventSchema(
    'curriculum.node.completed',
    'CurriculumProgress',
    CurriculumNodeRuntimePayloadSchema
  ),
  [LearningEventType.CURRICULUM_FRONTIER_UPDATED]: createEventSchema(
    'curriculum.frontier.updated',
    'CurriculumProgress',
    CurriculumFrontierUpdatedPayloadSchema
  ),
  [LearningEventType.CURRICULUM_REALIGNMENT_EVIDENCE_ACCUMULATED]: createEventSchema(
    'curriculum.realignment.evidence_accumulated',
    'RealignmentEvidence',
    CurriculumEvidenceAccumulatedPayloadSchema
  ),
  [LearningEventType.CURRICULUM_REVISION_APPLIED]: createEventSchema(
    'curriculum.revision.applied',
    'CurriculumRevisionProposal',
    CurriculumRevisionPayloadSchema
  ),
  [LearningEventType.CURRICULUM_REVISION_CHANGE_APPROVED]: createEventSchema(
    'curriculum.revision.change.approved',
    'RevisionChange',
    CurriculumRevisionChangePayloadSchema
  ),
  [LearningEventType.CURRICULUM_REVISION_CHANGE_REJECTED]: createEventSchema(
    'curriculum.revision.change.rejected',
    'RevisionChange',
    CurriculumRevisionChangePayloadSchema
  ),
  [LearningEventType.SESSION_CURRICULUM_SLICE_SELECTED]: createEventSchema(
    'session.curriculum_slice.selected',
    'Session',
    SessionCurriculumSliceSelectedPayloadSchema
  ),
  [LearningEventType.CONTENT_COVERAGE_UPDATED]: createEventSchema(
    'content.coverage.updated',
    'ConceptCardCoverage',
    ContentCoverageUpdatedPayloadSchema
  ),
  [LearningEventType.GAMIFICATION_PROJECTION_UPDATED]: createEventSchema(
    'gamification.projection.updated',
    'GamificationProjection',
    GamificationProjectionUpdatedPayloadSchema
  ),
} as const;

export type LearningEventSchemaMap = typeof LearningEventSchemas;
export type LearningEventPayload<T extends LearningEventType> = z.infer<
  LearningEventSchemaMap[T]
>['payload'];
export type LearningEvent<T extends LearningEventType = LearningEventType> = z.infer<
  LearningEventSchemaMap[T]
>;

export const LearningEventRegistry = {
  [LearningEventType.STEP_PLANNED]: {
    producer: 'session-service',
    stream: 'noema:events:session-service',
    consumers: ['pedagogy-guardian-service'],
    aggregateType: 'Step',
  },
  [LearningEventType.STEP_PRESENTED]: {
    producer: 'session-service',
    stream: 'noema:events:session-service',
    consumers: ['session-service'],
    aggregateType: 'Step',
  },
  [LearningEventType.STEP_ANSWERED]: {
    producer: 'session-service',
    stream: 'noema:events:session-service',
    consumers: ['metacognition-service'],
    aggregateType: 'Step',
  },
  [LearningEventType.STEP_EVALUATED]: {
    producer: 'session-service',
    stream: 'noema:events:session-service',
    consumers: ['session-service'],
    aggregateType: 'Step',
  },
  [LearningEventType.METACOGNITION_EVALUATION_RECORDED]: {
    producer: 'metacognition-service',
    stream: 'noema:events:metacognition-service',
    consumers: ['session-service', 'scheduler-service', 'knowledge-graph-service', 'curriculum-service', 'gamification-service'],
    aggregateType: 'Evaluation',
  },
  [LearningEventType.METACOGNITION_TRIGGER_FIRED]: {
    producer: 'metacognition-service',
    stream: 'noema:events:metacognition-service',
    consumers: ['session-service', 'curriculum-service'],
    aggregateType: 'Trigger',
  },
  [LearningEventType.STRATEGY_REPLAN_COMMITTED]: {
    producer: 'session-service',
    stream: 'noema:events:session-service',
    consumers: ['pedagogy-guardian-service'],
    aggregateType: 'Replan',
  },
  [LearningEventType.SCHEDULER_CONCEPT_STATE_UPDATED]: {
    producer: 'scheduler-service',
    stream: 'noema:events:scheduler-service',
    consumers: ['knowledge-graph-service', 'curriculum-service'],
    aggregateType: 'ConceptScheduleState',
  },
  [LearningEventType.KNOWLEDGE_GRAPH_CONCEPT_STATE_CHANGED]: {
    producer: 'knowledge-graph-service',
    stream: 'noema:events:knowledge-graph-service',
    consumers: ['gamification-service'],
    aggregateType: 'ConceptStateProjection',
  },
  [LearningEventType.CURRICULUM_CREATED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['gamification-service'],
    aggregateType: 'Curriculum',
  },
  [LearningEventType.CURRICULUM_VERSION_ACTIVATED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['content-service', 'session-service'],
    aggregateType: 'CurriculumVersion',
  },
  [LearningEventType.CURRICULUM_PROGRESS_UPDATED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['gamification-service'],
    aggregateType: 'CurriculumProgress',
  },
  [LearningEventType.CURRICULUM_NODE_COMPLETED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['content-service', 'gamification-service'],
    aggregateType: 'CurriculumProgress',
  },
  [LearningEventType.CURRICULUM_FRONTIER_UPDATED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['content-service'],
    aggregateType: 'CurriculumProgress',
  },
  [LearningEventType.CURRICULUM_REALIGNMENT_EVIDENCE_ACCUMULATED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['session-service'],
    aggregateType: 'RealignmentEvidence',
  },
  [LearningEventType.CURRICULUM_REVISION_APPLIED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['session-service', 'content-service'],
    aggregateType: 'CurriculumRevisionProposal',
  },
  [LearningEventType.CURRICULUM_REVISION_CHANGE_APPROVED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['curriculum-service'],
    aggregateType: 'RevisionChange',
  },
  [LearningEventType.CURRICULUM_REVISION_CHANGE_REJECTED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['curriculum-service'],
    aggregateType: 'RevisionChange',
  },
  [LearningEventType.SESSION_CURRICULUM_SLICE_SELECTED]: {
    producer: 'curriculum-service',
    stream: 'noema:events:curriculum-service',
    consumers: ['session-service'],
    aggregateType: 'Session',
  },
  [LearningEventType.CONTENT_COVERAGE_UPDATED]: {
    producer: 'content-service',
    stream: 'noema:events:content-service',
    consumers: ['curriculum-service', 'gamification-service'],
    aggregateType: 'ConceptCardCoverage',
  },
  [LearningEventType.GAMIFICATION_PROJECTION_UPDATED]: {
    producer: 'gamification-service',
    stream: 'noema:events:gamification-service',
    consumers: ['web-service'],
    aggregateType: 'GamificationProjection',
  },
} as const;

export function buildLearningEvent<T extends LearningEventType>(input: {
  eventType: T;
  aggregateId: string;
  payload: LearningEventPayload<T>;
  correlationId: CorrelationId;
  userId?: UserId | null;
  causationId?: EventId | string | null;
  timestamp?: string;
}): LearningEvent<T> {
  const schema = LearningEventSchemas[input.eventType];
  const base = {
    eventId: `${ID_PREFIXES.EventId}${nanoid(21)}` as EventId,
    eventType: input.eventType,
    aggregateType: schema.shape.aggregateType.value,
    aggregateId: input.aggregateId,
    version: 1,
    timestamp: input.timestamp ?? new Date().toISOString(),
    metadata: {
      correlationId: input.correlationId,
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
    },
    payload: input.payload,
  };
  return schema.parse(base) as LearningEvent<T>;
}

export function parseLearningEvent(event: unknown): LearningEvent {
  const base = BaseEventSchema.parse(event);
  const schema = LearningEventSchemas[base.eventType as LearningEventType];
  return schema.parse(event) as LearningEvent;
}
