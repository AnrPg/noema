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

// Renderer imports will be added in Tasks T6–T12.
// Replace FallbackRenderer with the specific renderer as each task completes.

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
  [RemediationCardType.ASSUMPTION_CHECK]: FallbackRenderer,
  [RemediationCardType.COUNTEREXAMPLE]: FallbackRenderer,
  [RemediationCardType.REPRESENTATION_SWITCH]: FallbackRenderer,
  [RemediationCardType.RETRIEVAL_CUE]: FallbackRenderer,
  [RemediationCardType.ENCODING_REPAIR]: FallbackRenderer,
  [RemediationCardType.OVERWRITE_DRILL]: FallbackRenderer,
  [RemediationCardType.AVAILABILITY_BIAS_DISCONFIRMATION]: FallbackRenderer,
  [RemediationCardType.SELF_CHECK_RITUAL]: FallbackRenderer,
  [RemediationCardType.CALIBRATION_TRAINING]: FallbackRenderer,
  [RemediationCardType.ATTRIBUTION_REFRAMING]: FallbackRenderer,
  [RemediationCardType.STRATEGY_REMINDER]: FallbackRenderer,
  [RemediationCardType.CONFUSABLE_SET_DRILL]: FallbackRenderer,
  [RemediationCardType.PARTIAL_KNOWLEDGE_DECOMPOSITION]: FallbackRenderer,
};

export function CardRenderer(props: ICardRendererProps): React.JSX.Element {
  const Renderer = RENDERER_MAP[props.card.cardType] ?? FallbackRenderer;
  return <Renderer {...props} />;
}

export type { ICardRendererProps, CardRendererMode } from './types.js';
export { CardShell } from './card-shell.js';
export { FallbackRenderer } from './fallback-renderer.js';
