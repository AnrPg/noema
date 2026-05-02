import { CurriculumNodeRuntimeState } from '@noema/types';
import type { SessionId } from '@noema/types';
import type { CompletionPolicy, CurriculumNode, CurriculumProgress } from './curriculum.types.js';

export function updateProgressFromEvaluation(input: {
  node: CurriculumNode;
  existing?: CurriculumProgress;
  correct: boolean;
  stabilitySnapshot?: number;
  sessionId: SessionId;
  policy: CompletionPolicy;
}): CurriculumProgress {
  if (input.existing?.runtimeState === CurriculumNodeRuntimeState.COMPLETED) {
    const completed: CurriculumProgress = {
      stableNodeKey: input.existing.stableNodeKey,
      runtimeState: input.existing.runtimeState,
      evaluationCount: input.existing.evaluationCount,
      correctStreak: input.existing.correctStreak,
      lastSessionId: input.sessionId,
    };
    const stabilitySnapshot = input.stabilitySnapshot ?? input.existing.stabilitySnapshot;
    if (stabilitySnapshot !== undefined) completed.stabilitySnapshot = stabilitySnapshot;
    if (input.existing.completedAt !== undefined)
      completed.completedAt = input.existing.completedAt;
    return {
      ...completed,
    };
  }

  const evaluationCount = (input.existing?.evaluationCount ?? 0) + 1;
  const correctStreak = input.correct ? (input.existing?.correctStreak ?? 0) + 1 : 0;
  const stabilitySnapshot = input.stabilitySnapshot ?? input.existing?.stabilitySnapshot;
  const completed =
    stabilitySnapshot !== undefined &&
    stabilitySnapshot >= input.node.masteryThreshold &&
    evaluationCount >= input.policy.minExposureSessions &&
    correctStreak >= input.policy.minCorrectStreak;

  const next: CurriculumProgress = {
    stableNodeKey: input.node.stableNodeKey,
    runtimeState: completed
      ? CurriculumNodeRuntimeState.COMPLETED
      : CurriculumNodeRuntimeState.IN_PROGRESS,
    evaluationCount,
    correctStreak,
    lastSessionId: input.sessionId,
  };
  if (stabilitySnapshot !== undefined) next.stabilitySnapshot = stabilitySnapshot;
  if (completed) next.completedAt = new Date();
  return next;
}
