'use client';

/**
 * @noema/web - Card Renderers
 * CardRenderer factory — dispatches to the correct renderer by card type.
 * All 42 entries start as FallbackRenderer and get replaced in Tasks T6–T12.
 */

import * as React from 'react';
import { CardType, RemediationCardType } from '@noema/types';
import { FallbackRenderer } from './fallback-renderer.js';
import type { ICardRendererProps } from './types.js';
import AtomicRenderer from './atomic.js';
import DefinitionRenderer from './definition.js';
import TrueFalseRenderer from './true-false.js';
import MultipleChoiceRenderer from './multiple-choice.js';
import ConfidenceRatedRenderer from './confidence-rated.js';
import ClozeRenderer from './cloze.js';
import MatchingRenderer from './matching.js';
import OrderingRenderer from './ordering.js';
import ProcessRenderer from './process.js';
import TimelineRenderer from './timeline.js';
import CauseEffectRenderer from './cause-effect.js';
import ImageOcclusionRenderer from './image-occlusion.js';
import AudioCardRenderer from './audio-card.js';
import DiagramRenderer from './diagram.js';
import MultimodalRenderer from './multimodal.js';
import ComparisonRenderer from './comparison.js';
import ExceptionRenderer from './exception.js';
import ErrorSpottingRenderer from './error-spotting.js';
import ConceptGraphRenderer from './concept-graph.js';
import CaseBasedRenderer from './case-based.js';
import TransferRenderer from './transfer.js';
import ProgressiveDisclosureRenderer from './progressive-disclosure.js';
import ContrastivePairRenderer from './remediation/contrastive-pair.js';
import MinimalPairRenderer from './remediation/minimal-pair.js';
import FalseFriendRenderer from './remediation/false-friend.js';
import OldVsNewDefinitionRenderer from './remediation/old-vs-new-definition.js';
import BoundaryCaseRenderer from './remediation/boundary-case.js';
import RuleScopeRenderer from './remediation/rule-scope.js';
import DiscriminantFeatureRenderer from './remediation/discriminant-feature.js';
import AssumptionCheckRenderer from './remediation/assumption-check.js';
import CounterexampleRenderer from './remediation/counterexample.js';
import RepresentationSwitchRenderer from './remediation/representation-switch.js';
import RetrievalCueRenderer from './remediation/retrieval-cue.js';
import EncodingRepairRenderer from './remediation/encoding-repair.js';
import OverwriteDrillRenderer from './remediation/overwrite-drill.js';
import AvailabilityBiasDisconfirmationRenderer from './remediation/availability-bias-disconfirmation.js';
import SelfCheckRitualRenderer from './remediation/self-check-ritual.js';
import CalibrationTrainingRenderer from './remediation/calibration-training.js';
import AttributionReframingRenderer from './remediation/attribution-reframing.js';
import StrategyReminderRenderer from './remediation/strategy-reminder.js';
import ConfusableSetDrillRenderer from './remediation/confusable-set-drill.js';
import PartialKnowledgeDecompositionRenderer from './remediation/partial-knowledge-decomposition.js';

export const RENDERER_MAP: Record<string, React.ComponentType<ICardRendererProps>> = {
  // ── Standard Card Types (22) ────────────────────────────────────────────────
  [CardType.ATOMIC]: AtomicRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.CLOZE]: ClozeRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.IMAGE_OCCLUSION]: ImageOcclusionRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.AUDIO]: AudioCardRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.PROCESS]: ProcessRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.COMPARISON]: ComparisonRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.EXCEPTION]: ExceptionRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.ERROR_SPOTTING]: ErrorSpottingRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.CONFIDENCE_RATED]: ConfidenceRatedRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.CONCEPT_GRAPH]: ConceptGraphRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.CASE_BASED]: CaseBasedRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.MULTIMODAL]: MultimodalRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.TRANSFER]: TransferRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.PROGRESSIVE_DISCLOSURE]:
    ProgressiveDisclosureRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.MULTIPLE_CHOICE]: MultipleChoiceRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.TRUE_FALSE]: TrueFalseRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.MATCHING]: MatchingRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.ORDERING]: OrderingRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.DEFINITION]: DefinitionRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.CAUSE_EFFECT]: CauseEffectRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.TIMELINE]: TimelineRenderer as React.ComponentType<ICardRendererProps>,
  [CardType.DIAGRAM]: DiagramRenderer as React.ComponentType<ICardRendererProps>,
  // ── Remediation Card Types (20) ─────────────────────────────────────────────
  [RemediationCardType.CONTRASTIVE_PAIR]:
    ContrastivePairRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.MINIMAL_PAIR]:
    MinimalPairRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.FALSE_FRIEND]:
    FalseFriendRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.OLD_VS_NEW_DEFINITION]:
    OldVsNewDefinitionRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.BOUNDARY_CASE]:
    BoundaryCaseRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.RULE_SCOPE]: RuleScopeRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.DISCRIMINANT_FEATURE]:
    DiscriminantFeatureRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.ASSUMPTION_CHECK]:
    AssumptionCheckRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.COUNTEREXAMPLE]:
    CounterexampleRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.REPRESENTATION_SWITCH]:
    RepresentationSwitchRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.RETRIEVAL_CUE]:
    RetrievalCueRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.ENCODING_REPAIR]:
    EncodingRepairRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.OVERWRITE_DRILL]:
    OverwriteDrillRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.AVAILABILITY_BIAS_DISCONFIRMATION]:
    AvailabilityBiasDisconfirmationRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.SELF_CHECK_RITUAL]:
    SelfCheckRitualRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.CALIBRATION_TRAINING]:
    CalibrationTrainingRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.ATTRIBUTION_REFRAMING]:
    AttributionReframingRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.STRATEGY_REMINDER]:
    StrategyReminderRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.CONFUSABLE_SET_DRILL]:
    ConfusableSetDrillRenderer as React.ComponentType<ICardRendererProps>,
  [RemediationCardType.PARTIAL_KNOWLEDGE_DECOMPOSITION]:
    PartialKnowledgeDecompositionRenderer as React.ComponentType<ICardRendererProps>,
};

export function CardRenderer(props: ICardRendererProps): React.JSX.Element {
  const Renderer = RENDERER_MAP[props.card.cardType] ?? FallbackRenderer;
  return <Renderer {...props} />;
}

export type { ICardRendererProps, CardRendererMode } from './types.js';
export { CardShell } from './card-shell.js';
export { FallbackRenderer } from './fallback-renderer.js';
