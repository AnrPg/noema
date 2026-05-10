/* eslint-disable @typescript-eslint/naming-convention */
import type {
  ICurriculum,
  ICurriculumProgress,
  ICurriculumRevisionProposal,
  ICreateCurriculumInput,
  IRealignmentEvidence,
} from '@noema/contracts';
import type {
  CurriculumId,
  CurriculumVersionId,
  CurriculumNodeRuntimeState,
  RevisionChangeId,
  RevisionChangeState,
  RevisionProposalId,
  SessionId,
  UserId,
} from '@noema/types';
import type { Prisma } from '@prisma/client';
import type { CurriculumVersionGraph } from './curriculum.types.js';

export interface CurriculumRepository {
  listByUser(userId: UserId, includeHidden?: boolean): Promise<ICurriculum[]>;
  create(
    userId: UserId,
    input: ICreateCurriculumInput,
    tx?: Prisma.TransactionClient
  ): Promise<ICurriculum>;
  getById(userId: UserId, curriculumId: CurriculumId): Promise<ICurriculum | undefined>;
  getActiveVersion(curriculumId: CurriculumId): Promise<CurriculumVersionGraph | undefined>;
  getActiveVersionForUser(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<CurriculumVersionGraph | undefined>;
  listProgress(
    userId: UserId,
    curriculumId: CurriculumId,
    tx?: Prisma.TransactionClient
  ): Promise<ICurriculumProgress[]>;
  upsertProgress(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    runtimeState: CurriculumNodeRuntimeState;
    sessionId: SessionId;
    evaluationCount: number;
    correctStreak: number;
    stabilitySnapshot?: number;
    completedAt?: Date | string;
  }, tx?: Prisma.TransactionClient): Promise<ICurriculumProgress>;
  markEvaluationEventProcessed(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    evaluationId: string;
    sourceEventId?: string;
    sessionId: SessionId;
  }, tx?: Prisma.TransactionClient): Promise<boolean>;
  saveDraftVersion(input: {
    curriculumId: CurriculumId;
    parentVersionId?: CurriculumVersionId;
    graph: CurriculumVersionGraph;
    agentRunId?: string;
  }, tx?: Prisma.TransactionClient): Promise<CurriculumVersionId>;
  finalizeVersion(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    curriculumVersionId: CurriculumVersionId;
    guardianValidationId: string;
  }, tx?: Prisma.TransactionClient): Promise<void>;
  setFrozenNode(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    frozen: boolean;
  }, tx?: Prisma.TransactionClient): Promise<void>;
  updateCurriculumMetadata(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    metadata: ICurriculum['metadata'];
  }, tx?: Prisma.TransactionClient): Promise<void>;
  listRevisionProposals(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<ICurriculumRevisionProposal[]>;
  createRevisionProposal(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposedFromVersionId: CurriculumVersionId;
    reason: ICurriculumRevisionProposal['reason'];
    evidence: Record<string, unknown>;
    rationale: string;
    changes: Array<{
      kind: ICurriculumRevisionProposal['changes'][number]['kind'];
      payload: Record<string, unknown>;
      rationale?: string;
    }>;
    expiresAt?: Date | string;
  }, tx?: Prisma.TransactionClient): Promise<ICurriculumRevisionProposal>;
  decideRevisionChange(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    changeId: RevisionChangeId;
    state: RevisionChangeState;
  }, tx?: Prisma.TransactionClient): Promise<ICurriculumRevisionProposal>;
  applyRevisionProposal(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    guardianValidationId?: string;
  }, tx?: Prisma.TransactionClient): Promise<ICurriculumRevisionProposal>;
  listRealignmentEvidence(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<IRealignmentEvidence[]>;
  accumulateRealignmentEvidence(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    triggerType: string;
    sessionId: SessionId;
    weight: number;
    threshold: number;
  }, tx?: Prisma.TransactionClient): Promise<IRealignmentEvidence>;
}
