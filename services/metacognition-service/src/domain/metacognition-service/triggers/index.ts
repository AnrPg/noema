import type { ITriggerCandidate, ITriggerRuleInput } from '../types.js';
import { BoredomTriggerRule } from './boredom.rule.js';
import { ConfusionTriggerRule } from './confusion.rule.js';
import { FailureTriggerRule } from './failure.rule.js';
import { OverconfidenceTriggerRule } from './overconfidence.rule.js';
import { PrerequisiteGapTriggerRule } from './prerequisite-gap.rule.js';
import type { ITriggerRule } from './rule.js';
import { SlowThinkingTriggerRule } from './slow-thinking.rule.js';

export const DEFAULT_TRIGGER_RULES: ITriggerRule[] = [
  new FailureTriggerRule(),
  new ConfusionTriggerRule(),
  new OverconfidenceTriggerRule(),
  new SlowThinkingTriggerRule(),
  new BoredomTriggerRule(),
  new PrerequisiteGapTriggerRule(),
];

export function evaluateTriggerRules(
  input: ITriggerRuleInput,
  rules: ITriggerRule[] = DEFAULT_TRIGGER_RULES
): ITriggerCandidate[] {
  const byType = new Map<string, ITriggerCandidate>();
  for (const rule of rules) {
    for (const candidate of rule.evaluate(input)) {
      const existing = byType.get(candidate.type);
      if (existing === undefined || candidate.severity > existing.severity) {
        byType.set(candidate.type, candidate);
      }
    }
  }
  return [...byType.values()];
}

export type { ITriggerRule } from './rule.js';
