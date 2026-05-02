import { describe, expect, it } from 'vitest';
import {
  CardType,
  ConceptState,
  EligibilityGroup,
  EpistemicMode,
  RemediationCardType,
  TransformationType,
  TriggerType,
} from '../enums/index.js';
import {
  ALL_ELIGIBILITY_GROUPS,
  ALL_EPISTEMIC_MODES,
  ALL_TRANSFORMATIONS,
  DEFAULT_CARD_TRANSFORMATIONS,
  MODE_GROUPS,
  MODE_TO_ELIGIBILITY_GROUPS,
  getDefaultCompatibleTransformations,
  getDefaultEligibilityGroupsForTransformations,
  selectEligibleGroup,
  selectModeFromGroup,
  selectTransformation,
} from './mode-groups.js';

const expectedModeGroups: Record<EpistemicMode, readonly EligibilityGroup[]> = {
  [EpistemicMode.INQUIRY_BASED]: [EligibilityGroup.NEW_CONCEPT, EligibilityGroup.TRANSFER],
  [EpistemicMode.PROBLEM_BASED]: [EligibilityGroup.NEW_CONCEPT, EligibilityGroup.TRANSFER],
  [EpistemicMode.CASE_BASED]: [EligibilityGroup.NEW_CONCEPT, EligibilityGroup.TRANSFER],
  [EpistemicMode.LOOPHOLE_LEARNING]: [EligibilityGroup.CONFUSION, EligibilityGroup.WEAK_REASONING],
  [EpistemicMode.ADVERSARIAL]: [
    EligibilityGroup.CONFUSION,
    EligibilityGroup.WEAK_REASONING,
    EligibilityGroup.PRESSURE,
  ],
  [EpistemicMode.CONTRADICTION_EXPOSURE]: [
    EligibilityGroup.CONFUSION,
    EligibilityGroup.WEAK_REASONING,
  ],
  [EpistemicMode.GENERATIVE_RETRIEVAL]: [
    EligibilityGroup.REINFORCEMENT,
    EligibilityGroup.WEAK_REASONING,
  ],
  [EpistemicMode.REVERSE_LEARNING]: [EligibilityGroup.WEAK_REASONING, EligibilityGroup.META],
  [EpistemicMode.TEACHING_TO_LEARN]: [EligibilityGroup.WEAK_REASONING, EligibilityGroup.META],
  [EpistemicMode.CONCEPT_RECOMBINATION]: [
    EligibilityGroup.TRANSFER,
    EligibilityGroup.WEAK_REASONING,
  ],
  [EpistemicMode.CONFIDENCE_WEIGHTED]: [EligibilityGroup.REINFORCEMENT, EligibilityGroup.META],
  [EpistemicMode.PREDICTION_BASED]: [EligibilityGroup.REINFORCEMENT, EligibilityGroup.META],
  [EpistemicMode.ERROR_PATTERN_REFLECTION]: [
    EligibilityGroup.CONFUSION,
    EligibilityGroup.WEAK_REASONING,
    EligibilityGroup.META,
  ],
  [EpistemicMode.MINIMAL_INFORMATION]: [
    EligibilityGroup.NEW_CONCEPT,
    EligibilityGroup.WEAK_REASONING,
  ],
  [EpistemicMode.NO_DEFINITION]: [EligibilityGroup.NEW_CONCEPT, EligibilityGroup.WEAK_REASONING],
  [EpistemicMode.DIMENSIONAL_TRANSLATION]: [
    EligibilityGroup.TRANSFER,
    EligibilityGroup.WEAK_REASONING,
  ],
  [EpistemicMode.ESCALATION]: [EligibilityGroup.PRESSURE, EligibilityGroup.REINFORCEMENT],
  [EpistemicMode.TIME_PRESSURE]: [EligibilityGroup.PRESSURE, EligibilityGroup.REINFORCEMENT],
  [EpistemicMode.AMBIGUITY_TOLERANCE]: [EligibilityGroup.META, EligibilityGroup.TRANSFER],
  [EpistemicMode.GRAPH_COMPLETION]: [EligibilityGroup.TRANSFER, EligibilityGroup.WEAK_REASONING],
  [EpistemicMode.HIERARCHY_RECONSTRUCTION]: [
    EligibilityGroup.TRANSFER,
    EligibilityGroup.WEAK_REASONING,
    EligibilityGroup.CONFUSION,
  ],
  [EpistemicMode.CAUSAL_CHAIN_COMPLETION]: [
    EligibilityGroup.TRANSFER,
    EligibilityGroup.WEAK_REASONING,
    EligibilityGroup.CONFUSION,
  ],
  [EpistemicMode.THESIS_ANTITHESIS_SYNTHESIS]: [EligibilityGroup.TRANSFER, EligibilityGroup.META],
  [EpistemicMode.COUNTERFACTUAL]: [EligibilityGroup.TRANSFER, EligibilityGroup.CONFUSION],
  [EpistemicMode.MULTI_REPRESENTATION]: [
    EligibilityGroup.NEW_CONCEPT,
    EligibilityGroup.TRANSFER,
    EligibilityGroup.WEAK_REASONING,
  ],
  [EpistemicMode.PERTURBATION]: [EligibilityGroup.TRANSFER, EligibilityGroup.CONFUSION],
  [EpistemicMode.ADAPTIVE_MISCONCEPTION_INJECTION]: [
    EligibilityGroup.CONFUSION,
    EligibilityGroup.WEAK_REASONING,
  ],
  [EpistemicMode.COGNITIVE_DRIFT_DETECTION]: [
    EligibilityGroup.META,
    EligibilityGroup.WEAK_REASONING,
  ],
  [EpistemicMode.KNOWLEDGE_COMPRESSION]: [
    EligibilityGroup.REINFORCEMENT,
    EligibilityGroup.META,
    EligibilityGroup.WEAK_REASONING,
  ],
  [EpistemicMode.EXPLAIN_YOUR_ALGORITHM]: [EligibilityGroup.META, EligibilityGroup.WEAK_REASONING],
};

const defaultSelectionInput = {
  conceptIsNew: false,
  conceptState: ConceptState.UNSTABLE,
  reasoningQualityRecent: 0.8,
  attemptsSinceStable: 0,
  thresholds: { R_REAS: 0.5, N_TRANSFER: 3 },
};

describe('mode eligibility groups', () => {
  it('matches the implementation plan mapping for all 30 epistemic modes', () => {
    expect(ALL_EPISTEMIC_MODES).toHaveLength(30);
    expect(Object.keys(MODE_TO_ELIGIBILITY_GROUPS)).toHaveLength(30);

    for (const mode of ALL_EPISTEMIC_MODES) {
      expect(new Set(MODE_TO_ELIGIBILITY_GROUPS[mode])).toEqual(new Set(expectedModeGroups[mode]));
    }
  });

  it('keeps every mode assigned and every group broad enough for variation', () => {
    const assigned = new Set(Object.values(MODE_GROUPS).flat());

    for (const mode of ALL_EPISTEMIC_MODES) {
      expect(assigned.has(mode)).toBe(true);
      expect(MODE_TO_ELIGIBILITY_GROUPS[mode].length).toBeGreaterThanOrEqual(1);
    }

    for (const group of ALL_ELIGIBILITY_GROUPS) {
      expect(MODE_GROUPS[group].length).toBeGreaterThanOrEqual(3);
    }
  });

  it('routes triggers before concept-state rules', () => {
    expect(
      selectEligibleGroup({
        ...defaultSelectionInput,
        conceptState: ConceptState.UNSTABLE,
        reasoningQualityRecent: 0.1,
        lastTriggerType: TriggerType.CONFUSION,
      })
    ).toBe(EligibilityGroup.CONFUSION);

    expect(
      selectEligibleGroup({
        ...defaultSelectionInput,
        conceptState: ConceptState.STABLE,
        attemptsSinceStable: 99,
        lastTriggerType: TriggerType.OVERCONFIDENCE,
      })
    ).toBe(EligibilityGroup.META);

    expect(
      selectEligibleGroup({
        ...defaultSelectionInput,
        conceptIsNew: true,
        lastTriggerType: TriggerType.SLOW_THINKING,
      })
    ).toBe(EligibilityGroup.META);
  });

  it('routes weak reasoning, transfer, new concepts, and fallback deterministically', () => {
    expect(
      selectEligibleGroup({
        ...defaultSelectionInput,
        conceptState: ConceptState.UNSTABLE,
        reasoningQualityRecent: 0.49,
      })
    ).toBe(EligibilityGroup.WEAK_REASONING);

    expect(
      selectEligibleGroup({
        ...defaultSelectionInput,
        conceptState: ConceptState.STABLE,
        attemptsSinceStable: 4,
      })
    ).toBe(EligibilityGroup.TRANSFER);

    expect(selectEligibleGroup({ ...defaultSelectionInput, conceptIsNew: true })).toBe(
      EligibilityGroup.NEW_CONCEPT
    );

    expect(selectEligibleGroup(defaultSelectionInput)).toBe(EligibilityGroup.REINFORCEMENT);
  });

  it('selects least-recently-used modes with deterministic key tiebreaks', () => {
    expect(selectModeFromGroup(EligibilityGroup.PRESSURE)).toBe(EpistemicMode.ADVERSARIAL);

    expect(
      selectModeFromGroup(EligibilityGroup.PRESSURE, [
        EpistemicMode.ADVERSARIAL,
        EpistemicMode.ESCALATION,
      ])
    ).toBe(EpistemicMode.TIME_PRESSURE);

    expect(
      selectModeFromGroup(EligibilityGroup.PRESSURE, [
        EpistemicMode.ADVERSARIAL,
        EpistemicMode.ESCALATION,
        EpistemicMode.TIME_PRESSURE,
      ])
    ).toBe(EpistemicMode.ADVERSARIAL);
  });
});

describe('transformation selection', () => {
  it('avoids the recent three transformations and then picks least-recently-used', () => {
    expect(
      selectTransformation([
        TransformationType.RECALL,
        TransformationType.EXPLANATION,
        TransformationType.COMPARISON,
      ])
    ).toBe(TransformationType.APPLICATION);

    expect(
      selectTransformation([
        TransformationType.RECALL,
        TransformationType.EXPLANATION,
        TransformationType.COMPARISON,
        TransformationType.APPLICATION,
        TransformationType.PERTURBATION,
        TransformationType.ERROR_DETECTION,
      ])
    ).toBe(TransformationType.RECALL);
  });

  it('cycles all six transformations before repeating under iterative use', () => {
    const history: TransformationType[] = [];

    for (const expected of ALL_TRANSFORMATIONS) {
      const selected = selectTransformation(history);
      expect(selected).toBe(expected);
      history.push(selected);
    }

    expect(new Set(history)).toEqual(new Set(ALL_TRANSFORMATIONS));
    expect(selectTransformation(history)).toBe(TransformationType.RECALL);
  });

  it('accepts scheduler-style history entries', () => {
    expect(selectTransformation([{ transformation: TransformationType.RECALL }])).toBe(
      TransformationType.EXPLANATION
    );
  });
});

describe('card transformation defaults', () => {
  it('covers every card and remediation card type with at least one transformation', () => {
    const allContentTypes = [...Object.values(CardType), ...Object.values(RemediationCardType)];

    for (const cardType of allContentTypes) {
      expect(DEFAULT_CARD_TRANSFORMATIONS[cardType]).toBeDefined();
      expect(DEFAULT_CARD_TRANSFORMATIONS[cardType].length).toBeGreaterThanOrEqual(1);
    }
  });

  it('matches the special explanation plus comparison defaults', () => {
    expect(getDefaultCompatibleTransformations(CardType.CAUSE_EFFECT)).toEqual([
      TransformationType.EXPLANATION,
      TransformationType.COMPARISON,
    ]);
    expect(getDefaultCompatibleTransformations(CardType.CONCEPT_GRAPH)).toEqual([
      TransformationType.EXPLANATION,
      TransformationType.COMPARISON,
    ]);
    expect(getDefaultCompatibleTransformations(CardType.TIMELINE)).toEqual([
      TransformationType.EXPLANATION,
      TransformationType.COMPARISON,
    ]);
  });

  it('derives default eligibility groups from compatible transformations', () => {
    expect(
      getDefaultEligibilityGroupsForTransformations([
        TransformationType.EXPLANATION,
        TransformationType.COMPARISON,
      ])
    ).toEqual([
      EligibilityGroup.CONFUSION,
      EligibilityGroup.META,
      EligibilityGroup.TRANSFER,
      EligibilityGroup.WEAK_REASONING,
    ]);
  });
});
