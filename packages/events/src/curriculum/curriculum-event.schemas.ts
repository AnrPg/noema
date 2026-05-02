import {
  ConceptIdSchema,
  CurriculumIdSchema,
  CurriculumNodeIdSchema,
  CurriculumNodeRuntimeStateSchema,
  CurriculumVersionIdSchema,
  RevisionChangeIdSchema,
  RevisionProposalIdSchema,
  UserIdSchema,
} from '@noema/validation';
import { z } from 'zod';
import { createEventSchema } from '../schemas.js';

export const CurriculumLifecyclePayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  userId: UserIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema.optional(),
});

export const CurriculumFrontierUpdatedPayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  userId: UserIdSchema,
  frontierNodeIds: z.array(CurriculumNodeIdSchema),
});

export const CurriculumNodeRuntimePayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  userId: UserIdSchema,
  nodeId: CurriculumNodeIdSchema,
  stableNodeKey: z.string().min(1),
  runtimeState: CurriculumNodeRuntimeStateSchema,
});

export const CurriculumProgressUpdatedPayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  userId: UserIdSchema,
  stableNodeKey: z.string().min(1),
  evaluationCount: z.number().int().nonnegative(),
  correctStreak: z.number().int().nonnegative(),
  stabilitySnapshot: z.number().nonnegative().optional(),
});

export const CurriculumEvidenceAccumulatedPayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  userId: UserIdSchema,
  stableNodeKey: z.string().min(1),
  triggerType: z.string().min(1),
  accumulatedWeight: z.number().nonnegative(),
  threshold: z.number().positive(),
});

export const CurriculumRevisionPayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  proposalId: RevisionProposalIdSchema,
  userId: UserIdSchema,
  appliedVersionId: CurriculumVersionIdSchema.optional(),
});

export const CurriculumRevisionChangePayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  proposalId: RevisionProposalIdSchema,
  changeId: RevisionChangeIdSchema,
  userId: UserIdSchema,
});

export const SessionCurriculumSliceSelectedPayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  userId: UserIdSchema,
  selectedNodeIds: z.array(CurriculumNodeIdSchema),
  conceptIds: z.array(ConceptIdSchema),
});

export const CurriculumCreatedEventSchema = createEventSchema(
  'curriculum.created',
  'Curriculum',
  CurriculumLifecyclePayloadSchema
);
export const CurriculumDraftUpdatedEventSchema = createEventSchema(
  'curriculum.draft.updated',
  'Curriculum',
  CurriculumLifecyclePayloadSchema
);
export const CurriculumVersionValidatedEventSchema = createEventSchema(
  'curriculum.version.validated',
  'CurriculumVersion',
  CurriculumLifecyclePayloadSchema
);
export const CurriculumVersionActivatedEventSchema = createEventSchema(
  'curriculum.version.activated',
  'CurriculumVersion',
  CurriculumLifecyclePayloadSchema
);
export const CurriculumVersionSupersededEventSchema = createEventSchema(
  'curriculum.version.superseded',
  'CurriculumVersion',
  CurriculumLifecyclePayloadSchema
);
export const CurriculumArchivedEventSchema = createEventSchema(
  'curriculum.archived',
  'Curriculum',
  CurriculumLifecyclePayloadSchema
);
export const CurriculumFrontierUpdatedEventSchema = createEventSchema(
  'curriculum.frontier.updated',
  'CurriculumProgress',
  CurriculumFrontierUpdatedPayloadSchema
);
export const CurriculumNodeCompletedEventSchema = createEventSchema(
  'curriculum.node.completed',
  'CurriculumProgress',
  CurriculumNodeRuntimePayloadSchema
);
export const CurriculumProgressUpdatedEventSchema = createEventSchema(
  'curriculum.progress.updated',
  'CurriculumProgress',
  CurriculumProgressUpdatedPayloadSchema
);
export const CurriculumRealignmentEvidenceAccumulatedEventSchema = createEventSchema(
  'curriculum.realignment.evidence_accumulated',
  'RealignmentEvidence',
  CurriculumEvidenceAccumulatedPayloadSchema
);
export const CurriculumRevisionProposedEventSchema = createEventSchema(
  'curriculum.revision.proposed',
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
export const CurriculumRevisionAppliedEventSchema = createEventSchema(
  'curriculum.revision.applied',
  'CurriculumRevisionProposal',
  CurriculumRevisionPayloadSchema
);
export const SessionCurriculumSliceSelectedEventSchema = createEventSchema(
  'session.curriculum_slice.selected',
  'Session',
  SessionCurriculumSliceSelectedPayloadSchema
);
