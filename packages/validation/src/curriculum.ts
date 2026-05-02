import { z } from 'zod';
import {
  ConceptIdSchema,
  CurriculumEdgeIdSchema,
  CurriculumIdSchema,
  CurriculumNodeIdSchema,
  CurriculumVersionIdSchema,
  RevisionChangeIdSchema,
  RevisionProposalIdSchema,
  SessionIdSchema,
  UserIdSchema,
} from './ids.js';
import {
  CurriculumEdgeTypeSchema,
  CurriculumNodeRuntimeStateSchema,
  CurriculumOriginModeSchema,
  CurriculumRevisionReasonSchema,
  CurriculumStateSchema,
  CurriculumVersionStateSchema,
  RevisionChangeKindSchema,
  RevisionChangeStateSchema,
  StudyModeSchema,
} from './enums.js';

export const CurriculumProposedConceptSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().optional(),
    mutationProposalId: z.string().min(1).optional(),
    status: z.enum(['proposed', 'validated', 'committed']).optional(),
  })
  .catchall(z.unknown());

export const CurriculumNodeSchema = z.object({
  id: CurriculumNodeIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  stableNodeKey: z.string().min(1).max(200),
  ckgConceptId: ConceptIdSchema.optional(),
  proposedConcept: CurriculumProposedConceptSchema.optional(),
  label: z.string().min(1).max(300),
  learningObjective: z.string().max(1000).optional(),
  masteryThreshold: z.number().gt(0).lte(1),
  estimatedSessions: z.number().int().positive(),
  traversalWeight: z.number().positive().default(1),
  metadata: z.record(z.unknown()).default({}),
});

export const CurriculumEdgeSchema = z.object({
  id: CurriculumEdgeIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  fromNodeId: CurriculumNodeIdSchema,
  toNodeId: CurriculumNodeIdSchema,
  type: CurriculumEdgeTypeSchema,
  rationale: z.string().max(2000).optional(),
  orderingWeight: z.number().default(0),
});

export const CurriculumVersionSchema = z.object({
  id: CurriculumVersionIdSchema,
  curriculumId: CurriculumIdSchema,
  versionNumber: z.number().int().positive(),
  state: CurriculumVersionStateSchema,
  parentVersionId: CurriculumVersionIdSchema.optional(),
  agentRunId: z.string().optional(),
  guardianValidationId: z.string().optional(),
  createdAt: z.string().datetime(),
  finalizedAt: z.string().datetime().optional(),
  supersededAt: z.string().datetime().optional(),
  nodes: z.array(CurriculumNodeSchema),
  edges: z.array(CurriculumEdgeSchema),
});

export const CurriculumSchema = z.object({
  id: CurriculumIdSchema,
  userId: UserIdSchema,
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  goal: z.string().max(2000).optional(),
  domain: z.string().max(200).optional(),
  originMode: CurriculumOriginModeSchema,
  state: CurriculumStateSchema,
  activeVersionId: CurriculumVersionIdSchema.optional(),
  metadata: z
    .object({
      frozenStableNodeKeys: z.array(z.string().min(1)).optional(),
      hiddenFromVault: z.boolean().optional(),
    })
    .catchall(z.unknown())
    .default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeVersion: CurriculumVersionSchema.optional(),
});

export const CurriculumProgressSchema = z.object({
  id: z.string().min(1),
  curriculumId: CurriculumIdSchema,
  userId: UserIdSchema,
  stableNodeKey: z.string().min(1),
  runtimeState: CurriculumNodeRuntimeStateSchema,
  firstTouchedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  lastSessionId: SessionIdSchema.optional(),
  evaluationCount: z.number().int().nonnegative(),
  correctStreak: z.number().int().nonnegative(),
  stabilitySnapshot: z.number().nonnegative().optional(),
});

export const RevisionChangeSchema = z.object({
  id: RevisionChangeIdSchema,
  proposalId: RevisionProposalIdSchema,
  kind: RevisionChangeKindSchema,
  payload: z.record(z.unknown()),
  rationale: z.string().max(2000).optional(),
  state: RevisionChangeStateSchema,
  decidedAt: z.string().datetime().optional(),
  rejectionReason: z.string().optional(),
});

export const CurriculumRevisionProposalSchema = z.object({
  id: RevisionProposalIdSchema,
  curriculumId: CurriculumIdSchema,
  proposedFromVersionId: CurriculumVersionIdSchema,
  reason: CurriculumRevisionReasonSchema,
  evidence: z.record(z.unknown()),
  rationale: z.string().min(1).max(4000),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  appliedVersionId: CurriculumVersionIdSchema.optional(),
  changes: z.array(RevisionChangeSchema),
});

export const CreateCurriculumInputSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  goal: z.string().max(2000).optional(),
  domain: z.string().max(200).optional(),
  originMode: CurriculumOriginModeSchema.optional(),
});

export const GenerateCurriculumInputSchema = z.object({
  goal: z.string().min(1).max(2000),
  domain: z.string().max(200).optional(),
  depth: z.enum(['survey', 'foundational', 'deep']).optional(),
  studyMode: StudyModeSchema.optional(),
  rootConceptIds: z.array(ConceptIdSchema).default([]),
  maxNodes: z.number().int().positive().max(500).optional(),
  maxDepth: z.number().int().positive().max(50).optional(),
  excludeConceptIds: z.array(ConceptIdSchema).default([]),
});

export const SessionSliceRequestSchema = z.object({
  maxNewNodes: z.number().int().positive().max(20).optional(),
  maxNodes: z.number().int().positive().max(50).optional(),
});

export const SessionSliceSchema = z.object({
  curriculumVersionId: CurriculumVersionIdSchema,
  selectedNodeIds: z.array(CurriculumNodeIdSchema),
  conceptIds: z.array(ConceptIdSchema),
  rationale: z.string(),
});

export const FreezeNodeInputSchema = z.object({
  stableNodeKey: z.string().min(1).max(200),
});

export const DecideRevisionChangeInputSchema = z.object({
  state: z.enum(['approved', 'rejected']),
});

export const RecordCurriculumEvaluationInputSchema = z.object({
  stableNodeKey: z.string().min(1).max(200),
  correct: z.boolean(),
  stabilitySnapshot: z.number().nonnegative().optional(),
  sessionId: SessionIdSchema,
  minExposureSessions: z.number().int().positive().max(20).default(3),
  minCorrectStreak: z.number().int().positive().max(20).default(2),
});

export const RecordRealignmentEvidenceInputSchema = z.object({
  stableNodeKey: z.string().min(1).max(200),
  triggerType: z.string().min(1).max(100),
  sessionId: SessionIdSchema,
  weight: z.number().positive().max(20).optional(),
  threshold: z.number().positive().max(20).optional(),
});

export const ApplyRevisionProposalInputSchema = z.object({
  guardianValidationId: z.string().min(1).optional(),
});
