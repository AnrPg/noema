import type { ITypedEvent } from '../types.js';
import type {
  CurriculumEvidenceAccumulatedPayloadSchema,
  CurriculumFrontierUpdatedPayloadSchema,
  CurriculumLifecyclePayloadSchema,
  CurriculumNodeRuntimePayloadSchema,
  CurriculumProgressUpdatedPayloadSchema,
  CurriculumRevisionChangePayloadSchema,
  CurriculumRevisionPayloadSchema,
  SessionCurriculumSliceSelectedPayloadSchema,
} from './curriculum-event.schemas.js';
import type { z } from 'zod';

export type CurriculumLifecyclePayload = z.infer<typeof CurriculumLifecyclePayloadSchema>;
export type CurriculumFrontierUpdatedPayload = z.infer<
  typeof CurriculumFrontierUpdatedPayloadSchema
>;
export type CurriculumNodeRuntimePayload = z.infer<typeof CurriculumNodeRuntimePayloadSchema>;
export type CurriculumProgressUpdatedPayload = z.infer<
  typeof CurriculumProgressUpdatedPayloadSchema
>;
export type CurriculumEvidenceAccumulatedPayload = z.infer<
  typeof CurriculumEvidenceAccumulatedPayloadSchema
>;
export type CurriculumRevisionPayload = z.infer<typeof CurriculumRevisionPayloadSchema>;
export type CurriculumRevisionChangePayload = z.infer<typeof CurriculumRevisionChangePayloadSchema>;
export type SessionCurriculumSliceSelectedPayload = z.infer<
  typeof SessionCurriculumSliceSelectedPayloadSchema
>;

export type CurriculumCreatedEvent = ITypedEvent<
  'curriculum.created',
  'Curriculum',
  CurriculumLifecyclePayload
>;
export type CurriculumFrontierUpdatedEvent = ITypedEvent<
  'curriculum.frontier.updated',
  'CurriculumProgress',
  CurriculumFrontierUpdatedPayload
>;
export type CurriculumRevisionProposedEvent = ITypedEvent<
  'curriculum.revision.proposed',
  'CurriculumRevisionProposal',
  CurriculumRevisionPayload
>;
export type SessionCurriculumSliceSelectedEvent = ITypedEvent<
  'session.curriculum_slice.selected',
  'Session',
  SessionCurriculumSliceSelectedPayload
>;
