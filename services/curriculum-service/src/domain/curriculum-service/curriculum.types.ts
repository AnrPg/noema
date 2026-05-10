/* eslint-disable @typescript-eslint/naming-convention */
import type {
  CurriculumBranchDriftState,
  CurriculumBranchEntryStrategy,
  ConceptId,
  CurriculumEdgeId,
  CurriculumEdgeType,
  CurriculumNodeId,
  CurriculumNodeRuntimeState,
  CurriculumPathRole,
  CurriculumVersionId,
  RevisionChangeKind,
  RevisionChangeState,
  SessionId,
} from '@noema/types';

export interface CurriculumBranchInfo {
  pathRole?: CurriculumPathRole | undefined;
  branchGroupKey?: string | undefined;
  branchEntryStrategy?: CurriculumBranchEntryStrategy | undefined;
  branchExitTargets?: string[] | undefined;
  focusTags?: string[] | undefined;
  isMainPath?: boolean | undefined;
}

export interface CurriculumBranchState {
  branchGroupKey: string;
  selectedPathRole?: CurriculumPathRole | undefined;
  selectedNodeKey?: string | undefined;
  selectionSource?: string | undefined;
  selectedAt?: Date | string | undefined;
  lastConfirmedAt?: Date | string | undefined;
  driftState: CurriculumBranchDriftState;
}

export interface CurriculumNode {
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
  branchInfo?: CurriculumBranchInfo | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface CurriculumEdge {
  id: CurriculumEdgeId;
  curriculumVersionId: CurriculumVersionId;
  fromNodeId: CurriculumNodeId;
  toNodeId: CurriculumNodeId;
  type: CurriculumEdgeType;
  rationale?: string | undefined;
  orderingWeight: number;
}

export interface CurriculumVersionGraph {
  id: CurriculumVersionId;
  nodes: CurriculumNode[];
  edges: CurriculumEdge[];
}

export interface CurriculumProgress {
  stableNodeKey: string;
  runtimeState: CurriculumNodeRuntimeState;
  evaluationCount: number;
  correctStreak: number;
  stabilitySnapshot?: number | undefined;
  lastSessionId?: SessionId | undefined;
  completedAt?: Date | string | undefined;
}

export interface ScheduleSnapshot {
  conceptId: ConceptId;
  dueAt?: Date;
  stability?: number;
}

export interface SessionSlicePolicy {
  maxNewNodes: number;
  maxNodes: number;
  preferredBranchGroupKeys?: string[] | undefined;
}

export interface CompletionPolicy {
  minExposureSessions: number;
  minCorrectStreak: number;
}

export interface RevisionChange {
  id: string;
  kind: RevisionChangeKind;
  payload: Record<string, unknown>;
  state: RevisionChangeState;
  rejectionReason?: string;
}

export interface RealignmentEvidence {
  curriculumId: string;
  stableNodeKey: string;
  triggerType: string;
  sessionIds: string[];
  accumulatedWeight: number;
  threshold: number;
}
