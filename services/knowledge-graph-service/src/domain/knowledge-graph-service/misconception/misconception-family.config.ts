/**
 * @noema/knowledge-graph-service — Misconception Family Configuration
 *
 * Pre-defined family categories that group misconceptions by cognitive origin.
 * Stored as a JSON config so families can be extended without code changes.
 *
 * Family assignment is rule-based: each family specifies a list of
 * `MisconceptionType` values it matches. The first match wins (families are
 * evaluated in declaration order).
 */

import type { MisconceptionType } from '@noema/types';

// ============================================================================
// Family definition
// ============================================================================

export interface IMisconceptionFamily {
  /** Machine-readable key (kebab-case, unique) */
  readonly key: string;
  /** Human-readable label */
  readonly label: string;
  /** Short description of the cognitive origin */
  readonly description: string;
  /**
   * Which misconception types map to this family.
   * A wildcard `'*'` entry means "match any unmatched type" (fallback).
   */
  readonly misconceptionTypes: readonly (MisconceptionType | '*')[];
}

// ============================================================================
// Family registry
// ============================================================================

/**
 * Ordered list of misconception families.
 * Evaluated top-to-bottom; first match wins. The last entry should be a
 * wildcard catch-all.
 *
 * Family groupings align with the cognitive-origin categories already present
 * in the MisconceptionType enum comments, plus the spec-defined families
 * from Phase 6.
 */
export const MISCONCEPTION_FAMILIES: readonly IMisconceptionFamily[] = [
  // ── Graph-structure families ───────────────────────────────────────────
  {
    key: 'graph-structural',
    label: 'Graph Structural',
    description: 'Structural issues in the knowledge graph (cycles, orphans, phantom links)',
    misconceptionTypes: [
      'circular_dependency',
      'orphan_concept',
      'phantom_link',
      'missing_prerequisite',
      'false_hierarchy',
    ],
  },
  {
    key: 'overgeneralization',
    label: 'Overgeneralization',
    description: 'Applying a rule or concept too broadly',
    misconceptionTypes: ['over_generalization', 'scope_confusion', 'boundary_error'],
  },
  {
    key: 'undergeneralization',
    label: 'Undergeneralization',
    description: 'Failing to apply a rule where it applies, or under-specifying a concept',
    misconceptionTypes: ['under_specification', 'missing_distinction'],
  },

  // ── Relational families ────────────────────────────────────────────────
  {
    key: 'cause-effect-reversal',
    label: 'Cause-Effect Reversal',
    description: 'Swapping cause and effect, or inverting dependency direction',
    misconceptionTypes: ['inverted_dependency'],
  },
  {
    key: 'false-analogy',
    label: 'False Analogy',
    description: 'Incorrect mapping between domains or concepts',
    misconceptionTypes: ['spurious_analogy', 'false_equivalence'],
  },
  {
    key: 'vocabulary-conflation',
    label: 'Vocabulary Conflation',
    description: 'Using two terms interchangeably when they differ',
    misconceptionTypes: [
      'conflation',
      'label_fixation',
      'polysemy_blindness',
      'definitional_drift',
      'context_collapse',
      'surface_similarity_bias',
    ],
  },

  // ── Temporal families ──────────────────────────────────────────────────
  {
    key: 'temporal-ordering',
    label: 'Temporal Ordering',
    description: 'Getting the sequence of events, steps, or learning order wrong',
    misconceptionTypes: [
      'anachronistic_ordering',
      'premature_abstraction',
      'delayed_integration',
      'revision_resistance',
    ],
  },

  // ── Metacognitive families ─────────────────────────────────────────────
  {
    key: 'scale-confusion',
    label: 'Scale Confusion',
    description: 'Confusing micro/macro, local/global, or magnitudes',
    misconceptionTypes: ['calibration_failure'],
  },
  {
    key: 'metacognitive',
    label: 'Metacognitive',
    description: "Misconceptions about one's own learning state or strategy",
    misconceptionTypes: ['illusory_mastery', 'strategy_mismatch', 'transfer_blindness'],
  },

  // ── Catch-all ──────────────────────────────────────────────────────────
  {
    key: 'uncategorized',
    label: 'Uncategorized',
    description: 'Misconception does not match a known family',
    misconceptionTypes: ['*'],
  },
] as const;

// ============================================================================
// Lookup helpers
// ============================================================================

/** Index by family key for O(1) lookup */
const FAMILY_BY_KEY = new Map<string, IMisconceptionFamily>(
  MISCONCEPTION_FAMILIES.map((f) => [f.key, f])
);

/** Reverse index: misconceptionType → family */
const FAMILY_BY_TYPE = new Map<string, IMisconceptionFamily>();
let fallbackFamily: IMisconceptionFamily | undefined;
const lastFamily = MISCONCEPTION_FAMILIES.at(-1);

for (const family of MISCONCEPTION_FAMILIES) {
  for (const mt of family.misconceptionTypes) {
    if (mt === '*') {
      fallbackFamily = family;
    } else {
      FAMILY_BY_TYPE.set(mt, family);
    }
  }
}

/**
 * Resolve the family for a given misconception type.
 * Returns the matching family or the catch-all 'uncategorized' family.
 */
export function resolveFamily(misconceptionType: MisconceptionType): IMisconceptionFamily {
  const family = FAMILY_BY_TYPE.get(misconceptionType) ?? fallbackFamily ?? lastFamily;
  if (family === undefined) {
    throw new Error('MISCONCEPTION_FAMILIES must define at least one family');
  }

  return family;
}

/**
 * Look up a family by its key.
 */
export function getFamilyByKey(key: string): IMisconceptionFamily | undefined {
  return FAMILY_BY_KEY.get(key);
}

/**
 * Get all registered family keys.
 */
export function getAllFamilyKeys(): readonly string[] {
  return MISCONCEPTION_FAMILIES.map((f) => f.key);
}
