/**
 * @noema/knowledge-graph-service - Promotion Band Value Object
 *
 * Encapsulates the threshold tiers for the PKG→CKG aggregation pipeline.
 * A promotion band represents the level of cross-user evidence supporting
 * a concept's promotion to the canonical knowledge graph.
 */

import type { PromotionBand as PromotionBandEnum } from '@noema/types';

// ============================================================================
// Promotion Band Thresholds
// ============================================================================

/**
 * Minimum number of independent PKGs required to meet each band.
 *
 * These thresholds are intentionally conservative — promoting a concept to
 * the CKG is a high-stakes operation that should require strong consensus.
 */
const PROMOTION_THRESHOLDS: Readonly<Record<string, number>> = Object.freeze({
  weak: 3,
  moderate: 10,
  strong: 25,
  definitive: 50,
});

/**
 * Ordered bands from lowest to highest (for fromEvidenceCount lookup).
 */
const BAND_ORDER: readonly { band: PromotionBandEnum; threshold: number }[] = Object.freeze([
  { band: 'definitive' as PromotionBandEnum, threshold: 50 },
  { band: 'strong' as PromotionBandEnum, threshold: 25 },
  { band: 'moderate' as PromotionBandEnum, threshold: 10 },
  { band: 'weak' as PromotionBandEnum, threshold: 3 },
]);

// ============================================================================
// PromotionBand Utilities
// ============================================================================

/**
 * Promotion band factory and query utilities.
 */
export const PromotionBandUtil = {
  /**
   * Determine the highest promotion band achieved by the given evidence count.
   *
   * @param count Number of independent PKGs supporting the claim.
   * @returns The highest band the count qualifies for, or `'none'` if below
   *          the minimum threshold.
   */
  fromEvidenceCount(count: number): PromotionBandEnum {
    for (const { band, threshold } of BAND_ORDER) {
      if (count >= threshold) {
        return band;
      }
    }
    return 'none' as PromotionBandEnum;
  },

  /**
   * Check whether a given evidence count meets a specific band's requirement.
   *
   * @param band The band to check against.
   * @param count Number of independent PKGs.
   * @returns `true` if the count meets or exceeds the band's threshold.
   */
  meetsThreshold(band: PromotionBandEnum, count: number): boolean {
    if (band === ('none' as PromotionBandEnum)) {
      // 'none' band has no threshold — vacuously true
      return true;
    }
    const threshold = PROMOTION_THRESHOLDS[band];
    if (threshold === undefined) {
      throw new Error(
        `Unknown promotion band: '${band}'. Expected one of: weak, moderate, strong, definitive, none.`
      );
    }
    return count >= threshold;
  },

  /**
   * Get the minimum evidence count required for a band.
   *
   * @param band The promotion band.
   * @returns The threshold, or 0 for 'none'.
   */
  getThreshold(band: PromotionBandEnum): number {
    return PROMOTION_THRESHOLDS[band] ?? 0;
  },
} as const;
