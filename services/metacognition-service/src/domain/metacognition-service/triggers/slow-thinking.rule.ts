import { LearningInterventionType, TriggerType } from '@noema/types';
import type { ITriggerCandidate, ITriggerRuleInput } from '../types.js';
import type { ITriggerRule } from './rule.js';

const SLOW_RESPONSE_MS = 45_000;

export class SlowThinkingTriggerRule implements ITriggerRule {
  public readonly name = 'slow-thinking';

  public evaluate(input: ITriggerRuleInput): ITriggerCandidate[] {
    if (input.responseTimeMs === undefined || input.responseTimeMs < SLOW_RESPONSE_MS) return [];

    const excess = Math.min(1, (input.responseTimeMs - SLOW_RESPONSE_MS) / SLOW_RESPONSE_MS);
    return [
      {
        type: TriggerType.SLOW_THINKING,
        severity: Number(Math.max(0.35, excess).toFixed(4)),
        detectedFrom: ['task_parsing', 'commitment_monitoring'],
        conceptRefs: input.conceptRefs,
        recommendedIntervention: LearningInterventionType.REDUCE_DIFFICULTY,
      },
    ];
  }
}
