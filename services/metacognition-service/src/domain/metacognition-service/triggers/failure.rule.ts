import { LearningInterventionType, TriggerType } from '@noema/types';
import type { ITriggerCandidate, ITriggerRuleInput } from '../types.js';
import type { ITriggerRule } from './rule.js';

export class FailureTriggerRule implements ITriggerRule {
  public readonly name = 'failure';

  public evaluate(input: ITriggerRuleInput): ITriggerCandidate[] {
    if (input.correct && input.combinedScore >= 0.3) return [];

    const severity = Math.min(
      1,
      Math.max(0.35, 1 - input.combinedScore + input.recentFailures * 0.1)
    );
    return [
      {
        type: TriggerType.FAILURE,
        severity: Number(severity.toFixed(4)),
        detectedFrom: ['retrieval_generation', 'reasoning_transformation'],
        conceptRefs: input.conceptRefs,
        recommendedIntervention: LearningInterventionType.INSERT_REPAIR_STEP,
      },
    ];
  }
}
