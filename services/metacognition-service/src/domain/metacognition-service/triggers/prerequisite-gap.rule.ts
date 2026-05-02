import { LearningInterventionType, TriggerType } from '@noema/types';
import type { ITriggerCandidate, ITriggerRuleInput } from '../types.js';
import type { ITriggerRule } from './rule.js';

export class PrerequisiteGapTriggerRule implements ITriggerRule {
  public readonly name = 'prerequisite-gap';

  public evaluate(input: ITriggerRuleInput): ITriggerCandidate[] {
    if (input.prerequisiteGapConceptIds.length === 0) return [];

    return [
      {
        type: TriggerType.PREREQUISITE_GAP,
        severity: 0.8,
        detectedFrom: ['task_parsing', 'outcome_attribution'],
        conceptRefs: input.prerequisiteGapConceptIds,
        recommendedIntervention: LearningInterventionType.BRANCH_TO_PREREQUISITE,
      },
    ];
  }
}
