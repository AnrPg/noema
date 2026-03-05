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

// Renderer imports will be added in Tasks T6–T12.
// Replace FallbackRenderer with the specific renderer as each task completes.

const RENDERER_MAP: Record<string, React.ComponentType<ICardRendererProps>> = {
  // ── Standard Card Types (22) ────────────────────────────────────────────────
  [CardType.ATOMIC]: FallbackRenderer,
  [CardType.CLOZE]: FallbackRenderer,
  [CardType.IMAGE_OCCLUSION]: FallbackRenderer,
  [CardType.AUDIO]: FallbackRenderer,
  [CardType.PROCESS]: FallbackRenderer,
  [CardType.COMPARISON]: FallbackRenderer,
  [CardType.EXCEPTION]: FallbackRenderer,
  [CardType.ERROR_SPOTTING]: FallbackRenderer,
  [CardType.CONFIDENCE_RATED]: FallbackRenderer,
  [CardType.CONCEPT_GRAPH]: FallbackRenderer,
  [CardType.CASE_BASED]: FallbackRenderer,
  [CardType.MULTIMODAL]: FallbackRenderer,
  [CardType.TRANSFER]: FallbackRenderer,
  [CardType.PROGRESSIVE_DISCLOSURE]: FallbackRenderer,
  [CardType.MULTIPLE_CHOICE]: FallbackRenderer,
  [CardType.TRUE_FALSE]: FallbackRenderer,
  [CardType.MATCHING]: FallbackRenderer,
  [CardType.ORDERING]: FallbackRenderer,
  [CardType.DEFINITION]: FallbackRenderer,
  [CardType.CAUSE_EFFECT]: FallbackRenderer,
  [CardType.TIMELINE]: FallbackRenderer,
  [CardType.DIAGRAM]: FallbackRenderer,
  // ── Remediation Card Types (20) ─────────────────────────────────────────────
  [RemediationCardType.CONTRASTIVE_PAIR]: FallbackRenderer,
  [RemediationCardType.MINIMAL_PAIR]: FallbackRenderer,
  [RemediationCardType.FALSE_FRIEND]: FallbackRenderer,
  [RemediationCardType.OLD_VS_NEW_DEFINITION]: FallbackRenderer,
  [RemediationCardType.BOUNDARY_CASE]: FallbackRenderer,
  [RemediationCardType.RULE_SCOPE]: FallbackRenderer,
  [RemediationCardType.DISCRIMINANT_FEATURE]: FallbackRenderer,
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
