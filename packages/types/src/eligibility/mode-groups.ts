import {
  CardType,
  ConceptState,
  EligibilityGroup,
  EpistemicMode,
  RemediationCardType,
  TransformationType,
  TriggerType,
} from '../enums/index.js';

export const ALL_EPISTEMIC_MODES = Object.values(EpistemicMode);

export const ALL_ELIGIBILITY_GROUPS = Object.values(EligibilityGroup);

export const ALL_TRANSFORMATIONS = Object.values(TransformationType);

export type ContentCardType = CardType | RemediationCardType;

export interface IConceptTransformationHistoryEntry {
  transformation: TransformationType;
  usedAt?: string | number | Date;
}

export const MODE_GROUPS: Record<EligibilityGroup, readonly EpistemicMode[]> = {
  [EligibilityGroup.NEW_CONCEPT]: [
    EpistemicMode.INQUIRY_BASED,
    EpistemicMode.PROBLEM_BASED,
    EpistemicMode.CASE_BASED,
    EpistemicMode.MINIMAL_INFORMATION,
    EpistemicMode.NO_DEFINITION,
    EpistemicMode.MULTI_REPRESENTATION,
  ],
  [EligibilityGroup.REINFORCEMENT]: [
    EpistemicMode.GENERATIVE_RETRIEVAL,
    EpistemicMode.CONFIDENCE_WEIGHTED,
    EpistemicMode.PREDICTION_BASED,
    EpistemicMode.ESCALATION,
    EpistemicMode.TIME_PRESSURE,
    EpistemicMode.KNOWLEDGE_COMPRESSION,
  ],
  [EligibilityGroup.CONFUSION]: [
    EpistemicMode.LOOPHOLE_LEARNING,
    EpistemicMode.ADVERSARIAL,
    EpistemicMode.CONTRADICTION_EXPOSURE,
    EpistemicMode.ERROR_PATTERN_REFLECTION,
    EpistemicMode.HIERARCHY_RECONSTRUCTION,
    EpistemicMode.CAUSAL_CHAIN_COMPLETION,
    EpistemicMode.COUNTERFACTUAL,
    EpistemicMode.PERTURBATION,
    EpistemicMode.ADAPTIVE_MISCONCEPTION_INJECTION,
  ],
  [EligibilityGroup.WEAK_REASONING]: [
    EpistemicMode.LOOPHOLE_LEARNING,
    EpistemicMode.ADVERSARIAL,
    EpistemicMode.CONTRADICTION_EXPOSURE,
    EpistemicMode.GENERATIVE_RETRIEVAL,
    EpistemicMode.REVERSE_LEARNING,
    EpistemicMode.TEACHING_TO_LEARN,
    EpistemicMode.CONCEPT_RECOMBINATION,
    EpistemicMode.ERROR_PATTERN_REFLECTION,
    EpistemicMode.MINIMAL_INFORMATION,
    EpistemicMode.NO_DEFINITION,
    EpistemicMode.DIMENSIONAL_TRANSLATION,
    EpistemicMode.GRAPH_COMPLETION,
    EpistemicMode.HIERARCHY_RECONSTRUCTION,
    EpistemicMode.CAUSAL_CHAIN_COMPLETION,
    EpistemicMode.MULTI_REPRESENTATION,
    EpistemicMode.ADAPTIVE_MISCONCEPTION_INJECTION,
    EpistemicMode.COGNITIVE_DRIFT_DETECTION,
    EpistemicMode.KNOWLEDGE_COMPRESSION,
    EpistemicMode.EXPLAIN_YOUR_ALGORITHM,
  ],
  [EligibilityGroup.TRANSFER]: [
    EpistemicMode.INQUIRY_BASED,
    EpistemicMode.PROBLEM_BASED,
    EpistemicMode.CASE_BASED,
    EpistemicMode.CONCEPT_RECOMBINATION,
    EpistemicMode.DIMENSIONAL_TRANSLATION,
    EpistemicMode.AMBIGUITY_TOLERANCE,
    EpistemicMode.GRAPH_COMPLETION,
    EpistemicMode.HIERARCHY_RECONSTRUCTION,
    EpistemicMode.CAUSAL_CHAIN_COMPLETION,
    EpistemicMode.THESIS_ANTITHESIS_SYNTHESIS,
    EpistemicMode.COUNTERFACTUAL,
    EpistemicMode.MULTI_REPRESENTATION,
    EpistemicMode.PERTURBATION,
  ],
  [EligibilityGroup.META]: [
    EpistemicMode.REVERSE_LEARNING,
    EpistemicMode.TEACHING_TO_LEARN,
    EpistemicMode.CONFIDENCE_WEIGHTED,
    EpistemicMode.PREDICTION_BASED,
    EpistemicMode.ERROR_PATTERN_REFLECTION,
    EpistemicMode.AMBIGUITY_TOLERANCE,
    EpistemicMode.THESIS_ANTITHESIS_SYNTHESIS,
    EpistemicMode.COGNITIVE_DRIFT_DETECTION,
    EpistemicMode.KNOWLEDGE_COMPRESSION,
    EpistemicMode.EXPLAIN_YOUR_ALGORITHM,
  ],
  [EligibilityGroup.PRESSURE]: [
    EpistemicMode.ADVERSARIAL,
    EpistemicMode.ESCALATION,
    EpistemicMode.TIME_PRESSURE,
  ],
} as const;

export const MODE_TO_ELIGIBILITY_GROUPS: Record<EpistemicMode, readonly EligibilityGroup[]> =
  ALL_EPISTEMIC_MODES.reduce(
    (acc, mode) => {
      acc[mode] = ALL_ELIGIBILITY_GROUPS.filter((group) => MODE_GROUPS[group].includes(mode));
      return acc;
    },
    {} as Record<EpistemicMode, EligibilityGroup[]>
  );

export const DEFAULT_CARD_TRANSFORMATIONS: Record<ContentCardType, readonly TransformationType[]> =
  {
    [CardType.ATOMIC]: [TransformationType.RECALL],
    [CardType.CLOZE]: [TransformationType.RECALL],
    [CardType.DEFINITION]: [TransformationType.RECALL],
    [CardType.MULTIPLE_CHOICE]: [TransformationType.RECALL],
    [CardType.TRUE_FALSE]: [TransformationType.RECALL],
    [CardType.MATCHING]: [TransformationType.RECALL],
    [CardType.ORDERING]: [TransformationType.RECALL],
    [CardType.DIAGRAM]: [TransformationType.RECALL],
    [CardType.IMAGE_OCCLUSION]: [TransformationType.RECALL],
    [CardType.AUDIO]: [TransformationType.RECALL],
    [CardType.MULTIMODAL]: [TransformationType.RECALL],
    [CardType.PROCESS]: [TransformationType.APPLICATION],
    [CardType.CASE_BASED]: [TransformationType.APPLICATION],
    [CardType.TRANSFER]: [TransformationType.APPLICATION],
    [CardType.PROGRESSIVE_DISCLOSURE]: [TransformationType.APPLICATION],
    [CardType.COMPARISON]: [TransformationType.COMPARISON],
    [RemediationCardType.CONTRASTIVE_PAIR]: [TransformationType.COMPARISON],
    [RemediationCardType.MINIMAL_PAIR]: [TransformationType.COMPARISON],
    [RemediationCardType.FALSE_FRIEND]: [TransformationType.COMPARISON],
    [RemediationCardType.OLD_VS_NEW_DEFINITION]: [TransformationType.COMPARISON],
    [RemediationCardType.DISCRIMINANT_FEATURE]: [TransformationType.COMPARISON],
    [RemediationCardType.CONFUSABLE_SET_DRILL]: [TransformationType.COMPARISON],
    [CardType.EXCEPTION]: [TransformationType.PERTURBATION],
    [RemediationCardType.BOUNDARY_CASE]: [TransformationType.PERTURBATION],
    [RemediationCardType.RULE_SCOPE]: [TransformationType.PERTURBATION],
    [RemediationCardType.COUNTEREXAMPLE]: [TransformationType.PERTURBATION],
    [RemediationCardType.ASSUMPTION_CHECK]: [TransformationType.PERTURBATION],
    [CardType.ERROR_SPOTTING]: [TransformationType.ERROR_DETECTION],
    [RemediationCardType.AVAILABILITY_BIAS_DISCONFIRMATION]: [TransformationType.ERROR_DETECTION],
    [RemediationCardType.OVERWRITE_DRILL]: [TransformationType.ERROR_DETECTION],
    [RemediationCardType.PARTIAL_KNOWLEDGE_DECOMPOSITION]: [TransformationType.ERROR_DETECTION],
    [CardType.CONFIDENCE_RATED]: [TransformationType.EXPLANATION],
    [RemediationCardType.CALIBRATION_TRAINING]: [TransformationType.EXPLANATION],
    [RemediationCardType.SELF_CHECK_RITUAL]: [TransformationType.EXPLANATION],
    [RemediationCardType.ATTRIBUTION_REFRAMING]: [TransformationType.EXPLANATION],
    [RemediationCardType.STRATEGY_REMINDER]: [TransformationType.EXPLANATION],
    [RemediationCardType.RETRIEVAL_CUE]: [TransformationType.EXPLANATION],
    [RemediationCardType.ENCODING_REPAIR]: [TransformationType.EXPLANATION],
    [RemediationCardType.REPRESENTATION_SWITCH]: [TransformationType.EXPLANATION],
    [CardType.CAUSE_EFFECT]: [TransformationType.EXPLANATION, TransformationType.COMPARISON],
    [CardType.CONCEPT_GRAPH]: [TransformationType.EXPLANATION, TransformationType.COMPARISON],
    [CardType.TIMELINE]: [TransformationType.EXPLANATION, TransformationType.COMPARISON],
  };

export interface ISelectEligibleGroupInput {
  conceptIsNew: boolean;
  conceptState: ConceptState;
  reasoningQualityRecent: number;
  attemptsSinceStable: number;
  lastTriggerType?: TriggerType;
  thresholds: {
    R_REAS: number;
    N_TRANSFER: number;
  };
}

export function selectEligibleGroup(input: ISelectEligibleGroupInput): EligibilityGroup {
  if (input.lastTriggerType === TriggerType.CONFUSION) {
    return EligibilityGroup.CONFUSION;
  }

  if (
    input.lastTriggerType === TriggerType.OVERCONFIDENCE ||
    input.lastTriggerType === TriggerType.SLOW_THINKING
  ) {
    return EligibilityGroup.META;
  }

  if (
    input.conceptState === ConceptState.UNSTABLE &&
    input.reasoningQualityRecent < input.thresholds.R_REAS
  ) {
    return EligibilityGroup.WEAK_REASONING;
  }

  if (
    input.conceptState === ConceptState.STABLE &&
    input.attemptsSinceStable > input.thresholds.N_TRANSFER
  ) {
    return EligibilityGroup.TRANSFER;
  }

  if (input.conceptIsNew) {
    return EligibilityGroup.NEW_CONCEPT;
  }

  return EligibilityGroup.REINFORCEMENT;
}

export function selectModeFromGroup(
  group: EligibilityGroup,
  recentModes: readonly EpistemicMode[] = []
): EpistemicMode {
  const modes = MODE_GROUPS[group];
  const selected = [...modes].sort((left, right) => {
    const recencyDifference = recencyRank(recentModes, left) - recencyRank(recentModes, right);
    return recencyDifference === 0 ? left.localeCompare(right) : recencyDifference;
  })[0];

  if (selected === undefined) {
    throw new Error(`Eligibility group has no modes: ${group}`);
  }

  return selected;
}

export function selectTransformation(
  history: readonly (TransformationType | IConceptTransformationHistoryEntry)[] = [],
  recentWindow = 3
): TransformationType {
  const transformations = history.map(readTransformation);
  const usedRecently = new Set(transformations.slice(-recentWindow));
  let eligible = ALL_TRANSFORMATIONS.filter((transformation) => !usedRecently.has(transformation));

  if (eligible.length === 0) {
    eligible = ALL_TRANSFORMATIONS;
  }

  const selected = [...eligible].sort((left, right) => {
    const recencyDifference =
      recencyRank(transformations, left) - recencyRank(transformations, right);
    return recencyDifference === 0 ? left.localeCompare(right) : recencyDifference;
  })[0];

  if (selected === undefined) {
    throw new Error('No transformations configured');
  }

  return selected;
}

export function getDefaultCompatibleTransformations(
  cardType: ContentCardType
): readonly TransformationType[] {
  return DEFAULT_CARD_TRANSFORMATIONS[cardType];
}

export function getDefaultEligibilityGroupsForTransformations(
  transformations: readonly TransformationType[]
): readonly EligibilityGroup[] {
  const groups = new Set<EligibilityGroup>();

  for (const transformation of transformations) {
    switch (transformation) {
      case TransformationType.RECALL:
        groups.add(EligibilityGroup.REINFORCEMENT);
        break;
      case TransformationType.EXPLANATION:
        groups.add(EligibilityGroup.WEAK_REASONING);
        groups.add(EligibilityGroup.META);
        break;
      case TransformationType.COMPARISON:
        groups.add(EligibilityGroup.CONFUSION);
        groups.add(EligibilityGroup.TRANSFER);
        break;
      case TransformationType.APPLICATION:
        groups.add(EligibilityGroup.NEW_CONCEPT);
        groups.add(EligibilityGroup.TRANSFER);
        break;
      case TransformationType.PERTURBATION:
        groups.add(EligibilityGroup.CONFUSION);
        groups.add(EligibilityGroup.PRESSURE);
        break;
      case TransformationType.ERROR_DETECTION:
        groups.add(EligibilityGroup.CONFUSION);
        groups.add(EligibilityGroup.WEAK_REASONING);
        break;
    }
  }

  return [...groups].sort();
}

function readTransformation(
  value: TransformationType | IConceptTransformationHistoryEntry
): TransformationType {
  return typeof value === 'string' ? value : value.transformation;
}

function recencyRank<T>(history: readonly T[], value: T): number {
  const index = history.lastIndexOf(value);
  return index === -1 ? Number.NEGATIVE_INFINITY : index;
}
