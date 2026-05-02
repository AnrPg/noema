/**
 * Card-type compatibility defaults for Step Activity transformations.
 *
 * Mirrors IMPLEMENTATION_PLAN_FINAL.md §6.1.
 */

import {
  getDefaultCompatibleTransformations as getSharedDefaultCompatibleTransformations,
  getDefaultEligibilityGroupsForTransformations as getSharedDefaultEligibilityGroupsForTransformations,
  type CardType,
  type EligibilityGroup,
  type RemediationCardType,
  type StudyMode,
  type TransformationType,
} from '@noema/types';

export type AnyContentCardType = CardType | RemediationCardType;

export const DEFAULT_SUPPORTED_STUDY_MODES: StudyMode[] = ['knowledge_gaining'];

export function getDefaultCompatibleTransformations(
  cardType: AnyContentCardType
): TransformationType[] {
  return [...getSharedDefaultCompatibleTransformations(cardType)];
}

export function getDefaultEligibilityGroupsForTransformations(
  transformations: readonly TransformationType[]
): EligibilityGroup[] {
  return [...getSharedDefaultEligibilityGroupsForTransformations(transformations)];
}
