import { StudyMode } from '@noema/types';
import type {
  ConceptId,
  CorrelationId,
  CurriculumNodeId,
  EvaluationId,
  LessonPlanId,
  SessionId,
  StepId,
  UserId,
} from '@noema/types';
import { LearningEventType, buildLearningEvent } from './events.js';

export const closedLoopGoldenIds = {
  userId: 'user_123456789012345678901' as UserId,
  sessionId: 'session_123456789012345678901' as SessionId,
  lessonPlanId: 'lesson_123456789012345678901' as LessonPlanId,
  stepId: 'step_123456789012345678901' as StepId,
  evaluationId: 'eval_123456789012345678901' as EvaluationId,
  conceptId: 'concept_123456789012345678901' as ConceptId,
  curriculumNodeId: 'cnode_123456789012345678901' as CurriculumNodeId,
  correlationId: 'correlation_123456789012345678901' as CorrelationId,
} as const;

export const closedLoopGoldenStepAnswered = buildLearningEvent({
  eventType: LearningEventType.STEP_ANSWERED,
  aggregateId: closedLoopGoldenIds.stepId,
  correlationId: closedLoopGoldenIds.correlationId,
  userId: closedLoopGoldenIds.userId,
  payload: {
    stepId: closedLoopGoldenIds.stepId,
    lessonPlanId: closedLoopGoldenIds.lessonPlanId,
    sessionId: closedLoopGoldenIds.sessionId,
    userId: closedLoopGoldenIds.userId,
    evaluationId: closedLoopGoldenIds.evaluationId,
    conceptRefs: [closedLoopGoldenIds.conceptId],
    selectedNodeIds: [closedLoopGoldenIds.curriculumNodeId],
    correct: true,
    selfRating: 'knew_it',
    trace: {
      frames: {
        f0: { score: 1, notes: 'clear' },
        f1: { score: 1, notes: 'clear' },
        f2: { score: 1, notes: 'clear' },
        f3: { score: 1, notes: 'clear' },
        f4: { score: 1, notes: 'clear' },
        f5: { score: 1, notes: 'clear' },
        f6: { score: 1, notes: 'clear' },
      },
    },
    studyMode: StudyMode.KNOWLEDGE_GAINING,
    epistemicMode: 'generative_retrieval',
    transformation: 'recall',
  },
});
