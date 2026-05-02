import type {
  ConceptId,
  CurriculumEdgeId,
  CurriculumEdgeType,
  CurriculumId,
  CurriculumNodeId,
  CurriculumNodeRuntimeState,
  CurriculumOriginMode,
  CurriculumRevisionReason,
  CurriculumState,
  CurriculumVersionId,
  CurriculumVersionState,
  RevisionChangeId,
  RevisionChangeKind,
  RevisionChangeState,
  RevisionProposalId,
  SessionId,
  StudyMode,
  UserId,
} from '@noema/types';

export interface ICurriculumNode {
  id: CurriculumNodeId;
  curriculumVersionId: CurriculumVersionId;
  stableNodeKey: string;
  ckgConceptId?: ConceptId | undefined;
  proposedConcept?: Record<string, unknown> | undefined;
  label: string;
  learningObjective?: string | undefined;
  stabilityThreshold: number;
  estimatedSessions: number;
  traversalWeight: number;
  metadata?: Record<string, unknown> | undefined;
}

export interface ICurriculumEdge {
  id: CurriculumEdgeId;
  curriculumVersionId: CurriculumVersionId;
  fromNodeId: CurriculumNodeId;
  toNodeId: CurriculumNodeId;
  type: CurriculumEdgeType;
  rationale?: string | undefined;
  orderingWeight: number;
}

export interface ICurriculumVersion {
  id: CurriculumVersionId;
  curriculumId: CurriculumId;
  versionNumber: number;
  state: CurriculumVersionState;
  parentVersionId?: CurriculumVersionId | undefined;
  agentRunId?: string | undefined;
  guardianValidationId?: string | undefined;
  createdAt: string;
  finalizedAt?: string | undefined;
  supersededAt?: string | undefined;
  nodes: ICurriculumNode[];
  edges: ICurriculumEdge[];
}

export interface ICurriculum {
  id: CurriculumId;
  userId: UserId;
  title: string;
  description?: string | undefined;
  goal?: string | undefined;
  domain?: string | undefined;
  originMode: CurriculumOriginMode;
  state: CurriculumState;
  activeVersionId?: CurriculumVersionId | undefined;
  metadata: {
    frozenStableNodeKeys?: string[] | undefined;
    hiddenFromVault?: boolean | undefined;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  activeVersion?: ICurriculumVersion | undefined;
}

export interface ICurriculumProgress {
  id: string;
  curriculumId: CurriculumId;
  userId: UserId;
  stableNodeKey: string;
  runtimeState: CurriculumNodeRuntimeState;
  firstTouchedAt?: string | undefined;
  completedAt?: string | undefined;
  lastSessionId?: SessionId | undefined;
  evaluationCount: number;
  correctStreak: number;
  stabilitySnapshot?: number | undefined;
}

export interface IRevisionChange {
  id: RevisionChangeId;
  proposalId: RevisionProposalId;
  kind: RevisionChangeKind;
  payload: Record<string, unknown>;
  rationale?: string | undefined;
  state: RevisionChangeState;
  decidedAt?: string | undefined;
  rejectionReason?: string | undefined;
}

export interface ICurriculumRevisionProposal {
  id: RevisionProposalId;
  curriculumId: CurriculumId;
  proposedFromVersionId: CurriculumVersionId;
  reason: CurriculumRevisionReason;
  evidence: Record<string, unknown>;
  rationale: string;
  expiresAt: string;
  createdAt: string;
  appliedVersionId?: CurriculumVersionId | undefined;
  changes: IRevisionChange[];
}

export interface IRealignmentEvidence {
  id: string;
  curriculumId: CurriculumId;
  stableNodeKey: string;
  triggerType: string;
  sessionIds: SessionId[];
  accumulatedWeight: number;
  threshold: number;
  firstSeenAt: string;
  lastSeenAt: string;
  consumedByProposalId?: RevisionProposalId | undefined;
}

export interface ICreateCurriculumInput {
  title: string;
  description?: string | undefined;
  goal?: string | undefined;
  domain?: string | undefined;
  originMode?: CurriculumOriginMode | undefined;
}

export interface IGenerateCurriculumInput {
  goal: string;
  domain?: string | undefined;
  depth?: 'survey' | 'foundational' | 'deep';
  studyMode?: StudyMode | undefined;
  rootConceptIds?: ConceptId[] | undefined;
  maxNodes?: number | undefined;
  maxDepth?: number | undefined;
  excludeConceptIds?: ConceptId[] | undefined;
}

export interface ISessionSliceRequest {
  maxNewNodes?: number | undefined;
  maxNodes?: number | undefined;
}

export interface ISessionSlice {
  curriculumVersionId: CurriculumVersionId;
  selectedNodeIds: CurriculumNodeId[];
  conceptIds: ConceptId[];
  rationale: string;
}

export interface IFreezeNodeInput {
  stableNodeKey: string;
}

export interface IRecordCurriculumEvaluationInput {
  stableNodeKey: string;
  correct: boolean;
  stabilitySnapshot?: number | undefined;
  sessionId: SessionId;
  minExposureSessions?: number | undefined;
  minCorrectStreak?: number | undefined;
}

export interface IRecordRealignmentEvidenceInput {
  stableNodeKey: string;
  triggerType: string;
  sessionId: SessionId;
  weight?: number | undefined;
  threshold?: number | undefined;
}

export interface IApplyRevisionProposalInput {
  guardianValidationId?: string | undefined;
}
