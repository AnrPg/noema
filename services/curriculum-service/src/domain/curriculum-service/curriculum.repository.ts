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
import type { CurriculumVersionGraph } from './curriculum.types.js';

export interface CurriculumRepository {
  listByUser(userId: UserId, includeHidden?: boolean): Promise<ICurriculum[]>;
  create(userId: UserId, input: ICreateCurriculumInput): Promise<ICurriculum>;
  getById(userId: UserId, curriculumId: CurriculumId): Promise<ICurriculum | undefined>;
  getActiveVersion(curriculumId: CurriculumId): Promise<CurriculumVersionGraph | undefined>;
  getActiveVersionForUser(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<CurriculumVersionGraph | undefined>;
  listProgress(userId: UserId, curriculumId: CurriculumId): Promise<ICurriculumProgress[]>;
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
  }): Promise<ICurriculumProgress>;
  saveDraftVersion(input: {
    curriculumId: CurriculumId;
    parentVersionId?: CurriculumVersionId;
    graph: CurriculumVersionGraph;
    agentRunId?: string;
  }): Promise<CurriculumVersionId>;
  finalizeVersion(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    curriculumVersionId: CurriculumVersionId;
    guardianValidationId: string;
  }): Promise<void>;
  setFrozenNode(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    stableNodeKey: string;
    frozen: boolean;
  }): Promise<void>;
  listRevisionProposals(
    userId: UserId,
    curriculumId: CurriculumId
  ): Promise<ICurriculumRevisionProposal[]>;
  decideRevisionChange(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    changeId: RevisionChangeId;
    state: RevisionChangeState;
  }): Promise<ICurriculumRevisionProposal>;
  applyRevisionProposal(input: {
    userId: UserId;
    curriculumId: CurriculumId;
    proposalId: RevisionProposalId;
    guardianValidationId?: string;
  }): Promise<ICurriculumRevisionProposal>;
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
  }): Promise<IRealignmentEvidence>;
}
