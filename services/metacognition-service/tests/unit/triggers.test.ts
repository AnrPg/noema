import { LearningInterventionType, StepSelfRating, TriggerType } from '@noema/types';
import { describe, expect, it } from 'vitest';
import { evaluateTriggerRules } from '../../src/domain/metacognition-service/triggers/index.js';

const base = {
  evaluationId: 'eval_123456789012345678901' as never,
  userId: 'user_123456789012345678901' as never,
  stepId: 'step_123456789012345678901' as never,
  sessionId: 'session_123456789012345678901' as never,
  conceptRefs: ['concept_123456789012345678901' as never],
  correct: true,
  selfRating: StepSelfRating.HESITATED,
  reasoningQuality: 0.7,
  confidenceSignal: 0.5,
  combinedScore: 0.62,
  recentFailures: 0,
  prerequisiteGapConceptIds: [],
};

describe('trigger rules', () => {
  it('fires overconfidence for confident but low-reasoning correct answers', () => {
    const triggers = evaluateTriggerRules({
      ...base,
      selfRating: StepSelfRating.KNEW_IT,
      confidenceSignal: 1,
      reasoningQuality: 0.2,
      combinedScore: 0.24,
    });

    expect(triggers).toContainEqual(
      expect.objectContaining({
        type: TriggerType.OVERCONFIDENCE,
        recommendedIntervention: LearningInterventionType.INSERT_CALIBRATION_STEP,
      })
    );
  });

  it('fires confusion from discrimination error types', () => {
    const triggers = evaluateTriggerRules({ ...base, errorType: 'near_neighbor_swap' });
    expect(triggers).toContainEqual(expect.objectContaining({ type: TriggerType.CONFUSION }));
  });

  it('fires prerequisite gap on explicit gap concepts', () => {
    const gap = 'concept_gap1234567890123456' as never;
    const triggers = evaluateTriggerRules({
      ...base,
      prerequisiteGapConceptIds: [gap],
    });
    expect(triggers).toContainEqual(
      expect.objectContaining({
        type: TriggerType.PREREQUISITE_GAP,
        conceptRefs: [gap],
      })
    );
  });
});
