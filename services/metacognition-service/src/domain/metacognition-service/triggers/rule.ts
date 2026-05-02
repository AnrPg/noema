import type { ITriggerCandidate, ITriggerRuleInput } from '../types.js';

export interface ITriggerRule {
  readonly name: string;
  evaluate(input: ITriggerRuleInput): ITriggerCandidate[];
}
