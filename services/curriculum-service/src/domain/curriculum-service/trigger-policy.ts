export const CURRICULUM_TRIGGER_POLICY: Record<
  string,
  { eligible: boolean; weight: number; threshold: number }
> = {
  prerequisite_gap: { eligible: true, weight: 1, threshold: 2 },
  persistent_misconception: { eligible: true, weight: 1, threshold: 2 },
  concept_confusion: { eligible: true, weight: 1, threshold: 2 },
  zero_retention: { eligible: true, weight: 1.5, threshold: 2 },
  structural_invalidation: { eligible: true, weight: 2, threshold: 2 },
  failure: { eligible: false, weight: 0, threshold: 0 },
  slow_thinking: { eligible: false, weight: 0, threshold: 0 },
  overconfidence: { eligible: false, weight: 0, threshold: 0 },
  boredom: { eligible: false, weight: 0, threshold: 0 },
  fatigue_detected: { eligible: false, weight: 0, threshold: 0 },
  flow_disruption: { eligible: false, weight: 0, threshold: 0 },
  time_pressure: { eligible: false, weight: 0, threshold: 0 },
};

export function isCurriculumEligibleTrigger(triggerType: string): boolean {
  return CURRICULUM_TRIGGER_POLICY[triggerType]?.eligible === true;
}

export function shouldGenerateRevisionProposal(input: {
  triggerType: string;
  accumulatedWeight: number;
  threshold: number;
  sessionIds: string[];
}): boolean {
  return (
    isCurriculumEligibleTrigger(input.triggerType) &&
    input.accumulatedWeight >= input.threshold &&
    new Set(input.sessionIds).size >= 2
  );
}
