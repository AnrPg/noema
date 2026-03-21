'use client';

/**
 * @noema/web - Card Renderers
 * CardRenderer factory — dispatches to the correct renderer by card type.
 * All 42 entries start as FallbackRenderer and get replaced in Tasks T6–T12.
 */

import * as React from 'react';
import { CardType, RemediationCardType } from '@noema/types';
import { FallbackRenderer } from './fallback-renderer';
import type { ICardRendererProps } from './types';
import AtomicRenderer from './atomic';
import DefinitionRenderer from './definition';
import TrueFalseRenderer from './true-false';
import MultipleChoiceRenderer from './multiple-choice';
import ConfidenceRatedRenderer from './confidence-rated';
import ClozeRenderer from './cloze';
import MatchingRenderer from './matching';
import OrderingRenderer from './ordering';
import ProcessRenderer from './process';
import TimelineRenderer from './timeline';
import CauseEffectRenderer from './cause-effect';
import ImageOcclusionRenderer from './image-occlusion';
import AudioCardRenderer from './audio-card';
import DiagramRenderer from './diagram';
import MultimodalRenderer from './multimodal';
import ComparisonRenderer from './comparison';
import ExceptionRenderer from './exception';
import ErrorSpottingRenderer from './error-spotting';
import ConceptGraphRenderer from './concept-graph';
import CaseBasedRenderer from './case-based';
import TransferRenderer from './transfer';
import ProgressiveDisclosureRenderer from './progressive-disclosure';
import ContrastivePairRenderer from './remediation/contrastive-pair';
import MinimalPairRenderer from './remediation/minimal-pair';
import FalseFriendRenderer from './remediation/false-friend';
import OldVsNewDefinitionRenderer from './remediation/old-vs-new-definition';
import BoundaryCaseRenderer from './remediation/boundary-case';
import RuleScopeRenderer from './remediation/rule-scope';
import DiscriminantFeatureRenderer from './remediation/discriminant-feature';
import AssumptionCheckRenderer from './remediation/assumption-check';
import CounterexampleRenderer from './remediation/counterexample';
import RepresentationSwitchRenderer from './remediation/representation-switch';
import RetrievalCueRenderer from './remediation/retrieval-cue';
import EncodingRepairRenderer from './remediation/encoding-repair';
import OverwriteDrillRenderer from './remediation/overwrite-drill';
import AvailabilityBiasDisconfirmationRenderer from './remediation/availability-bias-disconfirmation';
import SelfCheckRitualRenderer from './remediation/self-check-ritual';
import CalibrationTrainingRenderer from './remediation/calibration-training';
import AttributionReframingRenderer from './remediation/attribution-reframing';
import StrategyReminderRenderer from './remediation/strategy-reminder';
import ConfusableSetDrillRenderer from './remediation/confusable-set-drill';
import PartialKnowledgeDecompositionRenderer from './remediation/partial-knowledge-decomposition';

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

interface IRendererBoundaryProps {
  rendererKey: string;
  rendererProps: ICardRendererProps;
  children: React.ReactNode;
}

interface IRendererBoundaryState {
  hasError: boolean;
}

class RendererErrorBoundary extends React.Component<
  IRendererBoundaryProps,
  IRendererBoundaryState
> {
  override state: IRendererBoundaryState = { hasError: false };

  static getDerivedStateFromError(): IRendererBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[CardRenderer]', {
      cardId: this.props.rendererProps.card.id,
      cardType: this.props.rendererProps.card.cardType,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  override componentDidUpdate(prevProps: IRendererBoundaryProps): void {
    const previousCard = prevProps.rendererProps.card;
    const nextCard = this.props.rendererProps.card;

    if (
      this.state.hasError &&
      (prevProps.rendererKey !== this.props.rendererKey ||
        previousCard.id !== nextCard.id ||
        previousCard.version !== nextCard.version)
    ) {
      this.setState({ hasError: false });
    }
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return <FallbackRenderer {...this.props.rendererProps} />;
    }

    return this.props.children;
  }
}

export function CardRenderer(props: ICardRendererProps): React.JSX.Element {
  const Renderer = RENDERER_MAP[props.card.cardType] ?? FallbackRenderer;

  return (
    <RendererErrorBoundary rendererKey={props.card.cardType} rendererProps={props}>
      <Renderer {...props} />
    </RendererErrorBoundary>
  );
}

export type { ICardRendererProps, CardRendererMode } from './types';
export { CardShell } from './card-shell';
export { FallbackRenderer } from './fallback-renderer';
