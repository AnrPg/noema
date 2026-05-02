import { LearningInterventionType, TriggerType } from '@noema/types';
import type { ITriggerCandidate, ITriggerRuleInput } from '../types.js';
import type { ITriggerRule } from './rule.js';

const CONFUSION_ERROR_TYPES = new Set([
  'confusion',
  'discrimination',
  'near_neighbor_swap',
  'category_boundary_blur',
  'many_to_one_confusion',
  'one_to_many_confusion',
  'false_friend_cue',
]);

export class ConfusionTriggerRule implements ITriggerRule {
  public readonly name = 'confusion';

  public evaluate(input: ITriggerRuleInput): ITriggerCandidate[] {
    if (input.errorType === undefined || !CONFUSION_ERROR_TYPES.has(input.errorType)) return [];

    return [
      {
        type: TriggerType.CONFUSION,
        severity: Number(Math.max(0.45, 1 - input.reasoningQuality).toFixed(4)),
        detectedFrom: ['cue_selection', 'reasoning_transformation'],
        conceptRefs: input.conceptRefs,
        recommendedIntervention: LearningInterventionType.INSERT_CONTRASTIVE_STEP,
      },
    ];
  }
}
