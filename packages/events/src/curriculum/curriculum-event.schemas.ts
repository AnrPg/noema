/**
 * Curriculum closed-loop event schemas.
 *
 * Canonical payload ownership lives in @noema/learning-kernel. @noema/events
 * keeps these exports so existing publisher and consumer modules use the same
 * runtime validators without owning a duplicate schema graph.
 */

import {
  CurriculumEvidenceAccumulatedPayloadSchema,
  CurriculumFrontierUpdatedPayloadSchema,
  CurriculumLifecyclePayloadSchema,
  CurriculumNodeRuntimePayloadSchema,
  CurriculumProgressUpdatedPayloadSchema,
  CurriculumRevisionChangePayloadSchema,
  CurriculumRevisionPayloadSchema,
  SessionCurriculumSliceSelectedPayloadSchema,
} from '@noema/learning-kernel';
import { createEventSchema } from '../schemas.js';

export {
  CurriculumEvidenceAccumulatedPayloadSchema,
  CurriculumFrontierUpdatedPayloadSchema,
  CurriculumLifecyclePayloadSchema,
  CurriculumNodeRuntimePayloadSchema,
  CurriculumProgressUpdatedPayloadSchema,
  CurriculumRevisionChangePayloadSchema,
  CurriculumRevisionPayloadSchema,
  SessionCurriculumSliceSelectedPayloadSchema,
};

export const CurriculumCreatedEventSchema = createEventSchema(
  'curriculum.created',
  'Curriculum',
  CurriculumLifecyclePayloadSchema
);
export const CurriculumVersionActivatedEventSchema = createEventSchema(
  'curriculum.version.activated',
  'CurriculumVersion',
  CurriculumLifecyclePayloadSchema
);
export const CurriculumFrontierUpdatedEventSchema = createEventSchema(
  'curriculum.frontier.updated',
  'CurriculumProgress',
  CurriculumFrontierUpdatedPayloadSchema
);
export const CurriculumProgressUpdatedEventSchema = createEventSchema(
  'curriculum.progress.updated',
  'CurriculumProgress',
  CurriculumProgressUpdatedPayloadSchema
);
export const CurriculumNodeCompletedEventSchema = createEventSchema(
  'curriculum.node.completed',
  'CurriculumProgress',
  CurriculumNodeRuntimePayloadSchema
);
export const CurriculumEvidenceAccumulatedEventSchema = createEventSchema(
  'curriculum.realignment.evidence_accumulated',
  'RealignmentEvidence',
  CurriculumEvidenceAccumulatedPayloadSchema
);
export const CurriculumRevisionAppliedEventSchema = createEventSchema(
  'curriculum.revision.applied',
  'CurriculumRevisionProposal',
  CurriculumRevisionPayloadSchema
);
export const CurriculumRevisionChangeApprovedEventSchema = createEventSchema(
  'curriculum.revision.change.approved',
  'RevisionChange',
  CurriculumRevisionChangePayloadSchema
);
export const CurriculumRevisionChangeRejectedEventSchema = createEventSchema(
  'curriculum.revision.change.rejected',
  'RevisionChange',
  CurriculumRevisionChangePayloadSchema
);
export const SessionCurriculumSliceSelectedEventSchema = createEventSchema(
  'session.curriculum_slice.selected',
  'Session',
  SessionCurriculumSliceSelectedPayloadSchema
);
