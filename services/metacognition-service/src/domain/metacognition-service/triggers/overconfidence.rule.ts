import { LearningInterventionType, StepSelfRating, TriggerType } from '@noema/types';
import type { ITriggerCandidate, ITriggerRuleInput } from '../types.js';
import type { ITriggerRule } from './rule.js';

export class OverconfidenceTriggerRule implements ITriggerRule {
  public readonly name = 'overconfidence';

  public evaluate(input: ITriggerRuleInput): ITriggerCandidate[] {
    const confident = input.selfRating === StepSelfRating.KNEW_IT || input.confidenceSignal >= 0.85;
    const contradicted = !input.correct || input.reasoningQuality < 0.3;
    if (!confident || !contradicted) return [];

    return [
      {
        type: TriggerType.OVERCONFIDENCE,
        severity: Number((input.confidenceSignal - input.reasoningQuality).toFixed(4)),
        detectedFrom: ['commitment_monitoring', 'outcome_attribution'],
        conceptRefs: input.conceptRefs,
        recommendedIntervention: LearningInterventionType.INSERT_CALIBRATION_STEP,
      },
    ];
  }
}
