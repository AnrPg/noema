import type { ConceptId, CurriculumId, CurriculumVersionId, LearningMode, SessionId, StudyMode, UserId } from '@noema/types';

import type { CurriculumNode, CurriculumVersionGraph, ScheduleSnapshot } from './curriculum.types.js';

export interface ISchedulerClient {
  getConceptStates(userId: string, conceptIds: ConceptId[]): Promise<ScheduleSnapshot[]>;
}

export interface IKnowledgeGraphClient {
  validateConceptAnchors(conceptIds: ConceptId[]): Promise<boolean>;
}

export interface IPedagogyGuardianClient {
  validateCurriculumVersion(
    graph: CurriculumVersionGraph
  ): Promise<{ accepted: boolean; validationId: string }>;
}

export interface ICurriculumDesignAgentClient {
  generateDraft(input: Record<string, unknown>): Promise<{
    agentRunId: string;
    nodes: CurriculumNode[];
    edges: CurriculumVersionGraph['edges'];
    rationale: string;
  }>;
  proposeRevision(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ISessionLearningContext {
  sessionId: SessionId;
  userId: UserId;
  curriculumId: CurriculumId;
  curriculumVersionId: CurriculumVersionId | null;
  studyMode: StudyMode;
  learningMode: LearningMode;
}

export interface ISessionLearningContextClient {
  getSessionLearningContext(input: {
    userId: UserId;
    sessionId: SessionId;
  }): Promise<ISessionLearningContext | null>;
}
