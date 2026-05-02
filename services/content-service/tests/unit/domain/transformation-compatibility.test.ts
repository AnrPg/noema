import { CardType, EligibilityGroup, RemediationCardType, TransformationType } from '@noema/types';
import { describe, expect, it } from 'vitest';
import { CreateCardInputSchema } from '../../../src/domain/content-service/content.schemas.js';
import {
  DEFAULT_SUPPORTED_STUDY_MODES,
  getDefaultCompatibleTransformations,
  getDefaultEligibilityGroupsForTransformations,
} from '../../../src/domain/content-service/transformation-compatibility.js';

describe('content-service transformation compatibility', () => {
  it('uses the realignment defaults for standard and remediation card types', () => {
    expect(getDefaultCompatibleTransformations(CardType.ATOMIC)).toEqual([
      TransformationType.RECALL,
    ]);
    expect(getDefaultCompatibleTransformations(CardType.CAUSE_EFFECT)).toEqual([
      TransformationType.EXPLANATION,
      TransformationType.COMPARISON,
    ]);
    expect(getDefaultCompatibleTransformations(RemediationCardType.BOUNDARY_CASE)).toEqual([
      TransformationType.PERTURBATION,
    ]);
  });

  it('derives stable eligibility defaults for multi-transformation cards', () => {
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

  it('rejects explicit empty compatible transformations at the create boundary', () => {
    const result = CreateCardInputSchema.safeParse({
      cardType: CardType.ATOMIC,
      content: {
        front: 'What is a concept?',
        back: 'A unit of meaning.',
      },
      compatibleTransformations: [],
    });

    expect(result.success).toBe(false);
  });

  it('keeps knowledge gaining as the default study mode for new cards', () => {
    expect(DEFAULT_SUPPORTED_STUDY_MODES).toEqual(['knowledge_gaining']);
  });
});
