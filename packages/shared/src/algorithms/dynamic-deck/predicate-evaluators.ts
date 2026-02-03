// =============================================================================
// PREDICATE EVALUATORS - Query building blocks
// =============================================================================
// Phase 6C: Dynamic Decks as Query Views
//
// These are the atomic evaluation functions for deck query predicates.
// Each evaluator:
// - Takes a card and context
// - Returns whether the card matches + explanation
// - Is pure and side-effect free
// - Supports explainability
// =============================================================================

import type {
  // Core types
  BaseDeckQuery,
  CardState,
  NumericRange,
  IntegerRange,
  TemporalWindow,
  LkgcPredicate,
  LkgcSignalType,
  ComparisonOperator,
  GraphPredicate,
  DirectRelationPredicate,
  TransitiveReachabilityPredicate,
  NeighborhoodPredicate,
  PathExistsPredicate,
  SubgraphContainmentPredicate,
  CustomDeckPredicate,
  PredicateEvaluationResult,
  PredicateEvaluationContext,
  CardLkgcSignals,
  GraphReader,
  LkgcReader,
  PredicateId,
} from "../../types/dynamic-deck.types";
import type { CanonicalCardId } from "../../types/canonical-card.types";
import type { CategoryId, SemanticRole } from "../../types/ecosystem.types";
import type {
  ExtendedSemanticRole,
  ProvenanceType,
  ParticipationId,
} from "../../types/multi-belonging.types";
import type {
  NodeId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "../../types/lkgc/foundation";
import type { NodeType } from "../../types/lkgc/nodes";
import type { EdgeType, EdgeDirection } from "../../types/lkgc/edges";

// =============================================================================
// CARD DATA INTERFACE - What we need to evaluate predicates
// =============================================================================

/**
 * Card data needed for predicate evaluation
 * This abstracts away the data source (database, cache, etc.)
 */
export interface CardEvaluationData {
  readonly cardId: CanonicalCardId;

  // Basic card info
  readonly cardType: string;
  readonly state: CardState;
  readonly tags: readonly string[];
  readonly isSuspended: boolean;
  readonly isLeech: boolean;

  // Numeric properties
  readonly difficulty: number;
  readonly stability: number;
  readonly mastery: number;
  readonly reviewCount: number;
  readonly lapseCount: number;
  readonly retrievability: number;

  // Temporal
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly lastReviewedAt?: Timestamp;
  readonly dueAt?: Timestamp;

  // Participations
  readonly participations: readonly CardParticipationData[];
}

/**
 * Participation data for a card
 */
export interface CardParticipationData {
  readonly participationId: ParticipationId;
  readonly categoryId: CategoryId;
  readonly semanticRole: ExtendedSemanticRole;
  readonly isPrimary: boolean;
  readonly provenanceType: ProvenanceType;
  readonly contextMastery: number;
}

/**
 * Category data needed for subcategory checks
 */
export interface CategoryHierarchyData {
  readonly categoryId: CategoryId;
  readonly parentId?: CategoryId;
  readonly path: readonly CategoryId[];
  readonly isArchived: boolean;
}

// =============================================================================
// EVALUATION CONTEXT - All data needed for evaluation
// =============================================================================

/**
 * Complete context for evaluating predicates against a card
 */
export interface FullEvaluationContext {
  readonly card: CardEvaluationData;
  readonly timestamp: Timestamp;
  readonly categoryHierarchy: ReadonlyMap<CategoryId, CategoryHierarchyData>;
  readonly graphReader: GraphReader;
  readonly lkgcReader: LkgcReader;
}

// =============================================================================
// PREDICATE MATCH RESULT
// =============================================================================

/**
 * Result of a single predicate evaluation
 */
export interface PredicateMatchResult {
  /** Whether the predicate matched */
  readonly matched: boolean;

  /** Confidence in the match (1.0 for deterministic predicates) */
  readonly confidence: Confidence;

  /** Human-readable explanation */
  readonly explanation: string;

  /** The predicate that was evaluated */
  readonly predicateId?: PredicateId;

  /** Actual value that was compared */
  readonly actualValue?: unknown;

  /** Expected value/range from the predicate */
  readonly expectedValue?: unknown;
}

/**
 * Helper to create a match result
 */
export function createMatchResult(
  matched: boolean,
  explanation: string,
  options?: {
    confidence?: Confidence;
    predicateId?: PredicateId;
    actualValue?: unknown;
    expectedValue?: unknown;
  },
): PredicateMatchResult {
  return {
    matched,
    confidence: options?.confidence ?? (1.0 as Confidence),
    explanation,
    predicateId: options?.predicateId,
    actualValue: options?.actualValue,
    expectedValue: options?.expectedValue,
  };
}

// =============================================================================
// CATEGORY FILTERS
// =============================================================================

/**
 * Evaluate category inclusion filters
 */
export function evaluateCategoryFilter(
  card: CardEvaluationData,
  includeCategoryIds: readonly CategoryId[] | undefined,
  excludeCategoryIds: readonly CategoryId[] | undefined,
  includeSubcategories: boolean,
  excludeSubcategories: boolean,
  categoryHierarchy: ReadonlyMap<CategoryId, CategoryHierarchyData>,
): PredicateMatchResult {
  // Get all categories the card participates in
  const cardCategoryIds = new Set(card.participations.map((p) => p.categoryId));

  // Build effective include set (with subcategories if needed)
  let effectiveIncludeIds: Set<CategoryId> | null = null;
  if (includeCategoryIds && includeCategoryIds.length > 0) {
    effectiveIncludeIds = new Set(includeCategoryIds);

    if (includeSubcategories) {
      // Add all descendants
      for (const catId of includeCategoryIds) {
        const descendants = getDescendants(catId, categoryHierarchy);
        descendants.forEach((d) => effectiveIncludeIds!.add(d));
      }
    }
  }

  // Build effective exclude set (with subcategories if needed)
  const effectiveExcludeIds = new Set(excludeCategoryIds ?? []);
  if (excludeSubcategories && excludeCategoryIds) {
    for (const catId of excludeCategoryIds) {
      const descendants = getDescendants(catId, categoryHierarchy);
      descendants.forEach((d) => effectiveExcludeIds.add(d));
    }
  }

  // Check if card is in any excluded category
  for (const catId of cardCategoryIds) {
    if (effectiveExcludeIds.has(catId)) {
      return createMatchResult(false, `Card is in excluded category ${catId}`, {
        actualValue: catId,
        expectedValue: { notIn: [...effectiveExcludeIds] },
      });
    }
  }

  // Check if card is in any included category
  if (effectiveIncludeIds !== null) {
    const matchingCategories = [...cardCategoryIds].filter((catId) =>
      effectiveIncludeIds!.has(catId),
    );

    if (matchingCategories.length === 0) {
      return createMatchResult(false, `Card is not in any included category`, {
        actualValue: [...cardCategoryIds],
        expectedValue: [...effectiveIncludeIds],
      });
    }

    return createMatchResult(
      true,
      `Card is in category ${matchingCategories[0]}${matchingCategories.length > 1 ? ` (and ${matchingCategories.length - 1} more)` : ""}`,
      {
        actualValue: matchingCategories,
        expectedValue: [...effectiveIncludeIds],
      },
    );
  }

  return createMatchResult(
    true,
    "No category filter applied (all categories allowed)",
  );
}

/**
 * Get all descendants of a category
 */
function getDescendants(
  categoryId: CategoryId,
  hierarchy: ReadonlyMap<CategoryId, CategoryHierarchyData>,
): CategoryId[] {
  const descendants: CategoryId[] = [];

  for (const [catId, data] of hierarchy) {
    if (data.path.includes(categoryId) && catId !== categoryId) {
      descendants.push(catId);
    }
  }

  return descendants;
}

// =============================================================================
// SEMANTIC ROLE FILTERS
// =============================================================================

/**
 * Evaluate semantic role filter
 */
export function evaluateSemanticRoleFilter(
  card: CardEvaluationData,
  requiredRoles: readonly ExtendedSemanticRole[] | undefined,
  categoryId?: CategoryId,
): PredicateMatchResult {
  if (!requiredRoles || requiredRoles.length === 0) {
    return createMatchResult(true, "No semantic role filter applied");
  }

  const relevantParticipations = categoryId
    ? card.participations.filter((p) => p.categoryId === categoryId)
    : card.participations;

  const matchingRoles = relevantParticipations
    .filter((p) => requiredRoles.includes(p.semanticRole))
    .map((p) => p.semanticRole);

  if (matchingRoles.length > 0) {
    return createMatchResult(
      true,
      `Card has role ${matchingRoles[0]}${categoryId ? ` in category ${categoryId}` : ""}`,
      { actualValue: matchingRoles, expectedValue: requiredRoles },
    );
  }

  return createMatchResult(
    false,
    `Card does not have any of the required roles: ${requiredRoles.join(", ")}`,
    {
      actualValue: relevantParticipations.map((p) => p.semanticRole),
      expectedValue: requiredRoles,
    },
  );
}

// =============================================================================
// TAG FILTERS
// =============================================================================

/**
 * Evaluate tag filters
 */
export function evaluateTagFilter(
  card: CardEvaluationData,
  includeTagsAny: readonly string[] | undefined,
  includeTagsAll: readonly string[] | undefined,
  excludeTags: readonly string[] | undefined,
): PredicateMatchResult {
  const cardTags = new Set(card.tags);

  // Check exclude tags first
  if (excludeTags && excludeTags.length > 0) {
    const excludedTag = excludeTags.find((t) => cardTags.has(t));
    if (excludedTag) {
      return createMatchResult(false, `Card has excluded tag: ${excludedTag}`, {
        actualValue: excludedTag,
        expectedValue: { notIn: excludeTags },
      });
    }
  }

  // Check include all tags
  if (includeTagsAll && includeTagsAll.length > 0) {
    const missingTags = includeTagsAll.filter((t) => !cardTags.has(t));
    if (missingTags.length > 0) {
      return createMatchResult(
        false,
        `Card is missing required tags: ${missingTags.join(", ")}`,
        { actualValue: [...cardTags], expectedValue: includeTagsAll },
      );
    }
  }

  // Check include any tags
  if (includeTagsAny && includeTagsAny.length > 0) {
    const matchingTag = includeTagsAny.find((t) => cardTags.has(t));
    if (!matchingTag) {
      return createMatchResult(
        false,
        `Card does not have any of the required tags: ${includeTagsAny.join(", ")}`,
        { actualValue: [...cardTags], expectedValue: includeTagsAny },
      );
    }
    return createMatchResult(true, `Card has matching tag: ${matchingTag}`, {
      actualValue: matchingTag,
      expectedValue: includeTagsAny,
    });
  }

  return createMatchResult(true, "Tag filters passed");
}

// =============================================================================
// STATE FILTERS
// =============================================================================

/**
 * Evaluate card state filter
 */
export function evaluateStateFilter(
  card: CardEvaluationData,
  allowedStates: readonly CardState[] | undefined,
): PredicateMatchResult {
  if (!allowedStates || allowedStates.length === 0) {
    return createMatchResult(true, "No state filter applied");
  }

  if (allowedStates.includes(card.state)) {
    return createMatchResult(true, `Card is in allowed state: ${card.state}`, {
      actualValue: card.state,
      expectedValue: allowedStates,
    });
  }

  return createMatchResult(
    false,
    `Card state ${card.state} not in allowed states: ${allowedStates.join(", ")}`,
    { actualValue: card.state, expectedValue: allowedStates },
  );
}

/**
 * Evaluate card type filter
 */
export function evaluateCardTypeFilter(
  card: CardEvaluationData,
  allowedTypes: readonly string[] | undefined,
): PredicateMatchResult {
  if (!allowedTypes || allowedTypes.length === 0) {
    return createMatchResult(true, "No card type filter applied");
  }

  if (allowedTypes.includes(card.cardType)) {
    return createMatchResult(
      true,
      `Card is of allowed type: ${card.cardType}`,
      { actualValue: card.cardType, expectedValue: allowedTypes },
    );
  }

  return createMatchResult(
    false,
    `Card type ${card.cardType} not in allowed types: ${allowedTypes.join(", ")}`,
    { actualValue: card.cardType, expectedValue: allowedTypes },
  );
}

/**
 * Evaluate due status filter
 */
export function evaluateDueFilter(
  card: CardEvaluationData,
  isDueRequired: boolean | undefined,
  timestamp: Timestamp,
): PredicateMatchResult {
  if (isDueRequired === undefined) {
    return createMatchResult(true, "No due filter applied");
  }

  const isDue = card.dueAt !== undefined && card.dueAt <= timestamp;

  if (isDueRequired === isDue) {
    return createMatchResult(
      true,
      isDue ? "Card is due for review" : "Card is not yet due",
      { actualValue: isDue, expectedValue: isDueRequired },
    );
  }

  return createMatchResult(
    false,
    isDueRequired ? "Card is not yet due" : "Card is already due",
    { actualValue: isDue, expectedValue: isDueRequired },
  );
}

/**
 * Evaluate suspended filter
 */
export function evaluateSuspendedFilter(
  card: CardEvaluationData,
  isSuspendedRequired: boolean | undefined,
): PredicateMatchResult {
  if (isSuspendedRequired === undefined) {
    return createMatchResult(true, "No suspended filter applied");
  }

  if (isSuspendedRequired === card.isSuspended) {
    return createMatchResult(
      true,
      card.isSuspended ? "Card is suspended" : "Card is not suspended",
      { actualValue: card.isSuspended, expectedValue: isSuspendedRequired },
    );
  }

  return createMatchResult(
    false,
    isSuspendedRequired ? "Card is not suspended" : "Card is suspended",
    { actualValue: card.isSuspended, expectedValue: isSuspendedRequired },
  );
}

/**
 * Evaluate leech filter
 */
export function evaluateLeechFilter(
  card: CardEvaluationData,
  isLeechRequired: boolean | undefined,
): PredicateMatchResult {
  if (isLeechRequired === undefined) {
    return createMatchResult(true, "No leech filter applied");
  }

  if (isLeechRequired === card.isLeech) {
    return createMatchResult(
      true,
      card.isLeech ? "Card is a leech" : "Card is not a leech",
      { actualValue: card.isLeech, expectedValue: isLeechRequired },
    );
  }

  return createMatchResult(
    false,
    isLeechRequired ? "Card is not a leech" : "Card is a leech",
    { actualValue: card.isLeech, expectedValue: isLeechRequired },
  );
}

// =============================================================================
// NUMERIC RANGE FILTERS
// =============================================================================

/**
 * Generic numeric range evaluation
 */
export function evaluateNumericRange(
  value: number,
  range: NumericRange | undefined,
  fieldName: string,
): PredicateMatchResult {
  if (!range || (range.min === undefined && range.max === undefined)) {
    return createMatchResult(true, `No ${fieldName} filter applied`);
  }

  const minOk = range.min === undefined || value >= range.min;
  const maxOk = range.max === undefined || value <= range.max;

  if (minOk && maxOk) {
    return createMatchResult(
      true,
      `${fieldName} ${value.toFixed(3)} is within range [${range.min ?? "-∞"}, ${range.max ?? "∞"}]`,
      { actualValue: value, expectedValue: range },
    );
  }

  if (!minOk) {
    return createMatchResult(
      false,
      `${fieldName} ${value.toFixed(3)} is below minimum ${range.min}`,
      { actualValue: value, expectedValue: range },
    );
  }

  return createMatchResult(
    false,
    `${fieldName} ${value.toFixed(3)} is above maximum ${range.max}`,
    { actualValue: value, expectedValue: range },
  );
}

/**
 * Integer range evaluation
 */
export function evaluateIntegerRange(
  value: number,
  range: IntegerRange | undefined,
  fieldName: string,
): PredicateMatchResult {
  if (!range || (range.min === undefined && range.max === undefined)) {
    return createMatchResult(true, `No ${fieldName} filter applied`);
  }

  const minOk = range.min === undefined || value >= range.min;
  const maxOk = range.max === undefined || value <= range.max;

  if (minOk && maxOk) {
    return createMatchResult(
      true,
      `${fieldName} ${value} is within range [${range.min ?? "-∞"}, ${range.max ?? "∞"}]`,
      { actualValue: value, expectedValue: range },
    );
  }

  if (!minOk) {
    return createMatchResult(
      false,
      `${fieldName} ${value} is below minimum ${range.min}`,
      { actualValue: value, expectedValue: range },
    );
  }

  return createMatchResult(
    false,
    `${fieldName} ${value} is above maximum ${range.max}`,
    { actualValue: value, expectedValue: range },
  );
}

// =============================================================================
// TEMPORAL FILTERS
// =============================================================================

/**
 * Evaluate temporal window filter
 */
export function evaluateTemporalWindow(
  timestamp: Timestamp | undefined,
  window: TemporalWindow | undefined,
  currentTimestamp: Timestamp,
  fieldName: string,
): PredicateMatchResult {
  if (!window) {
    return createMatchResult(true, `No ${fieldName} filter applied`);
  }

  if (timestamp === undefined) {
    return createMatchResult(false, `${fieldName} is not set`, {
      actualValue: undefined,
      expectedValue: window,
    });
  }

  // Check withinMs (relative)
  if (window.withinMs !== undefined) {
    const elapsed = currentTimestamp - timestamp;
    if (elapsed > window.withinMs) {
      return createMatchResult(
        false,
        `${fieldName} is ${elapsed}ms ago, exceeds ${window.withinMs}ms window`,
        { actualValue: elapsed, expectedValue: { withinMs: window.withinMs } },
      );
    }
  }

  // Check after (absolute)
  if (window.after !== undefined && timestamp < window.after) {
    return createMatchResult(
      false,
      `${fieldName} is before required timestamp`,
      { actualValue: timestamp, expectedValue: { after: window.after } },
    );
  }

  // Check before (absolute)
  if (window.before !== undefined && timestamp > window.before) {
    return createMatchResult(
      false,
      `${fieldName} is after required timestamp`,
      { actualValue: timestamp, expectedValue: { before: window.before } },
    );
  }

  return createMatchResult(true, `${fieldName} is within temporal window`, {
    actualValue: timestamp,
    expectedValue: window,
  });
}

/**
 * Evaluate "not reviewed for" duration
 */
export function evaluateNotReviewedFor(
  lastReviewedAt: Timestamp | undefined,
  minDuration: Duration | undefined,
  currentTimestamp: Timestamp,
): PredicateMatchResult {
  if (minDuration === undefined) {
    return createMatchResult(true, "No 'not reviewed for' filter applied");
  }

  // Never reviewed = always passes
  if (lastReviewedAt === undefined) {
    return createMatchResult(true, "Card has never been reviewed", {
      actualValue: "never",
      expectedValue: { notReviewedFor: minDuration },
    });
  }

  const elapsed = currentTimestamp - lastReviewedAt;
  if (elapsed >= minDuration) {
    return createMatchResult(
      true,
      `Card not reviewed for ${elapsed}ms (required: ${minDuration}ms)`,
      { actualValue: elapsed, expectedValue: minDuration },
    );
  }

  return createMatchResult(
    false,
    `Card was reviewed ${elapsed}ms ago, less than required ${minDuration}ms`,
    { actualValue: elapsed, expectedValue: minDuration },
  );
}

// =============================================================================
// LKGC SIGNAL PREDICATES
// =============================================================================

/**
 * Evaluate an LKGC signal predicate
 */
export async function evaluateLkgcPredicate(
  card: CardEvaluationData,
  predicate: LkgcPredicate,
  lkgcReader: LkgcReader,
): Promise<PredicateMatchResult> {
  const signalValue = await lkgcReader.getSignal(
    card.cardId,
    predicate.signalType,
    predicate.categoryId,
  );

  const matches = compareValues(
    signalValue,
    predicate.operator,
    predicate.threshold,
  );

  const operatorStr = getOperatorString(predicate.operator);
  return createMatchResult(
    matches,
    matches
      ? `LKGC ${predicate.signalType} (${signalValue.toFixed(3)}) ${operatorStr} ${predicate.threshold}`
      : `LKGC ${predicate.signalType} (${signalValue.toFixed(3)}) does not satisfy ${operatorStr} ${predicate.threshold}`,
    {
      predicateId: predicate.predicateId,
      actualValue: signalValue,
      expectedValue: {
        operator: predicate.operator,
        threshold: predicate.threshold,
      },
    },
  );
}

/**
 * Compare values using the specified operator
 */
function compareValues(
  actual: number,
  operator: ComparisonOperator,
  expected: number | readonly number[],
): boolean {
  switch (operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return actual > (expected as number);
    case "gte":
      return actual >= (expected as number);
    case "lt":
      return actual < (expected as number);
    case "lte":
      return actual <= (expected as number);
    case "in":
      return (expected as readonly number[]).includes(actual);
    case "nin":
      return !(expected as readonly number[]).includes(actual);
    default:
      return false;
  }
}

/**
 * Get human-readable operator string
 */
function getOperatorString(operator: ComparisonOperator): string {
  switch (operator) {
    case "eq":
      return "=";
    case "neq":
      return "≠";
    case "gt":
      return ">";
    case "gte":
      return "≥";
    case "lt":
      return "<";
    case "lte":
      return "≤";
    case "in":
      return "in";
    case "nin":
      return "not in";
    default:
      return operator;
  }
}

// =============================================================================
// GRAPH PREDICATES
// =============================================================================

/**
 * Evaluate a graph predicate
 */
export async function evaluateGraphPredicate(
  cardNodeId: NodeId,
  predicate: GraphPredicate,
  graphReader: GraphReader,
): Promise<PredicateMatchResult> {
  switch (predicate.predicateType) {
    case "direct_relation":
      return evaluateDirectRelationPredicate(
        cardNodeId,
        predicate,
        graphReader,
      );
    case "transitive_reachability":
      return evaluateTransitiveReachabilityPredicate(
        cardNodeId,
        predicate,
        graphReader,
      );
    case "neighborhood":
      return evaluateNeighborhoodPredicate(cardNodeId, predicate, graphReader);
    case "path_exists":
      return evaluatePathExistsPredicate(cardNodeId, predicate, graphReader);
    case "subgraph_containment":
      return evaluateSubgraphContainmentPredicate(
        cardNodeId,
        predicate,
        graphReader,
      );
    default:
      return createMatchResult(
        false,
        `Unknown graph predicate type: ${(predicate as GraphPredicate).predicateType}`,
      );
  }
}

/**
 * Evaluate direct relation predicate
 */
async function evaluateDirectRelationPredicate(
  cardNodeId: NodeId,
  predicate: DirectRelationPredicate,
  graphReader: GraphReader,
): Promise<PredicateMatchResult> {
  const edges = await graphReader.getEdges(
    cardNodeId,
    predicate.direction,
    predicate.edgeTypes,
  );

  // Filter by target if specified
  let matchingEdges = edges;

  if (predicate.targetNodeId) {
    matchingEdges = matchingEdges.filter((e) => {
      const targetId =
        predicate.direction === "outgoing" ? e.targetId : e.sourceId;
      return targetId === predicate.targetNodeId;
    });
  }

  if (predicate.targetNodeType) {
    const targetNodes = await Promise.all(
      matchingEdges.map(async (e) => {
        const targetId =
          predicate.direction === "outgoing" ? e.targetId : e.sourceId;
        return graphReader.getNode(targetId);
      }),
    );

    matchingEdges = matchingEdges.filter((_, i) => {
      const node = targetNodes[i];
      return node && node.nodeType === predicate.targetNodeType;
    });
  }

  if (predicate.minWeight !== undefined) {
    matchingEdges = matchingEdges.filter(
      (e) => e.weight >= predicate.minWeight!,
    );
  }

  if (predicate.minConfidence !== undefined) {
    matchingEdges = matchingEdges.filter(
      (e) => e.confidence >= predicate.minConfidence!,
    );
  }

  if (matchingEdges.length > 0) {
    return createMatchResult(
      true,
      `Card has ${matchingEdges.length} matching ${predicate.direction} edge(s) of type ${predicate.edgeTypes.join("/")}`,
      {
        predicateId: predicate.predicateId,
        actualValue: matchingEdges.length,
        expectedValue: predicate,
      },
    );
  }

  return createMatchResult(
    false,
    `Card has no matching ${predicate.direction} edges of type ${predicate.edgeTypes.join("/")}`,
    {
      predicateId: predicate.predicateId,
      actualValue: 0,
      expectedValue: predicate,
    },
  );
}

/**
 * Evaluate transitive reachability predicate
 */
async function evaluateTransitiveReachabilityPredicate(
  cardNodeId: NodeId,
  predicate: TransitiveReachabilityPredicate,
  graphReader: GraphReader,
): Promise<PredicateMatchResult> {
  const reachableNodes = await graphReader.traverse(predicate.fromNodeId, {
    edgeTypes: predicate.edgeTypes,
    direction: predicate.direction,
    maxDepth: predicate.maxDepth,
    minWeight: predicate.minWeight,
  });

  const isReachable = reachableNodes.includes(cardNodeId);

  return createMatchResult(
    isReachable,
    isReachable
      ? `Card is reachable from ${predicate.fromNodeId} within ${predicate.maxDepth} hops`
      : `Card is not reachable from ${predicate.fromNodeId} within ${predicate.maxDepth} hops`,
    {
      predicateId: predicate.predicateId,
      actualValue: isReachable,
      expectedValue: {
        reachableFrom: predicate.fromNodeId,
        maxDepth: predicate.maxDepth,
      },
    },
  );
}

/**
 * Evaluate neighborhood predicate
 */
async function evaluateNeighborhoodPredicate(
  cardNodeId: NodeId,
  predicate: NeighborhoodPredicate,
  graphReader: GraphReader,
): Promise<PredicateMatchResult> {
  const edges = await graphReader.getEdges(
    cardNodeId,
    predicate.direction,
    predicate.edgeTypes,
  );

  // Get unique neighbor IDs
  const neighborIds = new Set(
    edges.map((e) =>
      predicate.direction === "outgoing" ? e.targetId : e.sourceId,
    ),
  );

  // Filter by node type if specified
  let neighborCount = neighborIds.size;
  if (predicate.neighborNodeTypes && predicate.neighborNodeTypes.length > 0) {
    const neighbors = await Promise.all(
      [...neighborIds].map((id) => graphReader.getNode(id)),
    );
    neighborCount = neighbors.filter(
      (n) => n && predicate.neighborNodeTypes!.includes(n.nodeType as NodeType),
    ).length;
  }

  const minOk =
    predicate.minNeighbors === undefined ||
    neighborCount >= predicate.minNeighbors;
  const maxOk =
    predicate.maxNeighbors === undefined ||
    neighborCount <= predicate.maxNeighbors;

  if (minOk && maxOk) {
    return createMatchResult(
      true,
      `Card has ${neighborCount} ${predicate.direction} neighbors (within range)`,
      {
        predicateId: predicate.predicateId,
        actualValue: neighborCount,
        expectedValue: {
          min: predicate.minNeighbors,
          max: predicate.maxNeighbors,
        },
      },
    );
  }

  return createMatchResult(
    false,
    `Card has ${neighborCount} ${predicate.direction} neighbors (outside range [${predicate.minNeighbors ?? 0}, ${predicate.maxNeighbors ?? "∞"}])`,
    {
      predicateId: predicate.predicateId,
      actualValue: neighborCount,
      expectedValue: {
        min: predicate.minNeighbors,
        max: predicate.maxNeighbors,
      },
    },
  );
}

/**
 * Evaluate path exists predicate
 */
async function evaluatePathExistsPredicate(
  cardNodeId: NodeId,
  predicate: PathExistsPredicate,
  graphReader: GraphReader,
): Promise<PredicateMatchResult> {
  const pathExists = await graphReader.pathExists(
    cardNodeId,
    predicate.targetNodeId,
    {
      allowedEdgeTypes: predicate.allowedEdgeTypes,
      direction: predicate.direction,
      maxPathLength: predicate.maxPathLength,
    },
  );

  return createMatchResult(
    pathExists,
    pathExists
      ? `Path exists from card to ${predicate.targetNodeId} (max length ${predicate.maxPathLength})`
      : `No path exists from card to ${predicate.targetNodeId} within ${predicate.maxPathLength} hops`,
    {
      predicateId: predicate.predicateId,
      actualValue: pathExists,
      expectedValue: {
        targetNodeId: predicate.targetNodeId,
        maxPathLength: predicate.maxPathLength,
      },
    },
  );
}

/**
 * Evaluate subgraph containment predicate
 */
async function evaluateSubgraphContainmentPredicate(
  cardNodeId: NodeId,
  predicate: SubgraphContainmentPredicate,
  graphReader: GraphReader,
): Promise<PredicateMatchResult> {
  const subgraphNodes = await graphReader.traverse(predicate.subgraphRootId, {
    edgeTypes: predicate.subgraphEdgeTypes,
    direction: predicate.direction,
    maxDepth: predicate.maxDepth ?? 10,
  });

  const isInSubgraph = subgraphNodes.includes(cardNodeId);

  return createMatchResult(
    isInSubgraph,
    isInSubgraph
      ? `Card is in subgraph rooted at ${predicate.subgraphRootId}`
      : `Card is not in subgraph rooted at ${predicate.subgraphRootId}`,
    {
      predicateId: predicate.predicateId,
      actualValue: isInSubgraph,
      expectedValue: { subgraphRootId: predicate.subgraphRootId },
    },
  );
}

// =============================================================================
// FULL BASE QUERY EVALUATION
// =============================================================================

/**
 * Evaluate all predicates in a base query
 */
export async function evaluateBaseQuery(
  query: BaseDeckQuery,
  context: FullEvaluationContext,
): Promise<{
  matches: boolean;
  results: PredicateMatchResult[];
  failedAt?: string;
}> {
  const results: PredicateMatchResult[] = [];
  const card = context.card;

  // Category filter
  const categoryResult = evaluateCategoryFilter(
    card,
    query.includeCategoryIds,
    query.excludeCategoryIds,
    query.includeSubcategories,
    query.excludeSubcategories,
    context.categoryHierarchy,
  );
  results.push(categoryResult);
  if (!categoryResult.matched) {
    return { matches: false, results, failedAt: "category" };
  }

  // Semantic role filter
  const roleResult = evaluateSemanticRoleFilter(card, query.semanticRoles);
  results.push(roleResult);
  if (!roleResult.matched) {
    return { matches: false, results, failedAt: "semanticRole" };
  }

  // Tag filter
  const tagResult = evaluateTagFilter(
    card,
    query.includeTagsAny,
    query.includeTagsAll,
    query.excludeTags,
  );
  results.push(tagResult);
  if (!tagResult.matched) {
    return { matches: false, results, failedAt: "tags" };
  }

  // State filter
  const stateResult = evaluateStateFilter(card, query.cardStates);
  results.push(stateResult);
  if (!stateResult.matched) {
    return { matches: false, results, failedAt: "state" };
  }

  // Card type filter
  const typeResult = evaluateCardTypeFilter(card, query.cardTypes);
  results.push(typeResult);
  if (!typeResult.matched) {
    return { matches: false, results, failedAt: "cardType" };
  }

  // Due filter
  const dueResult = evaluateDueFilter(card, query.isDue, context.timestamp);
  results.push(dueResult);
  if (!dueResult.matched) {
    return { matches: false, results, failedAt: "isDue" };
  }

  // Suspended filter
  const suspendedResult = evaluateSuspendedFilter(card, query.isSuspended);
  results.push(suspendedResult);
  if (!suspendedResult.matched) {
    return { matches: false, results, failedAt: "isSuspended" };
  }

  // Leech filter
  const leechResult = evaluateLeechFilter(card, query.isLeech);
  results.push(leechResult);
  if (!leechResult.matched) {
    return { matches: false, results, failedAt: "isLeech" };
  }

  // Numeric range filters
  const difficultyResult = evaluateNumericRange(
    card.difficulty,
    query.difficultyRange,
    "Difficulty",
  );
  results.push(difficultyResult);
  if (!difficultyResult.matched) {
    return { matches: false, results, failedAt: "difficulty" };
  }

  const stabilityResult = evaluateNumericRange(
    card.stability,
    query.stabilityRange,
    "Stability",
  );
  results.push(stabilityResult);
  if (!stabilityResult.matched) {
    return { matches: false, results, failedAt: "stability" };
  }

  const masteryResult = evaluateNumericRange(
    card.mastery,
    query.masteryRange,
    "Mastery",
  );
  results.push(masteryResult);
  if (!masteryResult.matched) {
    return { matches: false, results, failedAt: "mastery" };
  }

  const reviewCountResult = evaluateIntegerRange(
    card.reviewCount,
    query.reviewCountRange,
    "Review count",
  );
  results.push(reviewCountResult);
  if (!reviewCountResult.matched) {
    return { matches: false, results, failedAt: "reviewCount" };
  }

  const lapseCountResult = evaluateIntegerRange(
    card.lapseCount,
    query.lapseCountRange,
    "Lapse count",
  );
  results.push(lapseCountResult);
  if (!lapseCountResult.matched) {
    return { matches: false, results, failedAt: "lapseCount" };
  }

  // Temporal filters
  const createdResult = evaluateTemporalWindow(
    card.createdAt,
    query.createdWithin,
    context.timestamp,
    "Created",
  );
  results.push(createdResult);
  if (!createdResult.matched) {
    return { matches: false, results, failedAt: "createdWithin" };
  }

  const lastReviewedResult = evaluateTemporalWindow(
    card.lastReviewedAt,
    query.lastReviewedWithin,
    context.timestamp,
    "Last reviewed",
  );
  results.push(lastReviewedResult);
  if (!lastReviewedResult.matched) {
    return { matches: false, results, failedAt: "lastReviewedWithin" };
  }

  const dueWithinResult = evaluateTemporalWindow(
    card.dueAt,
    query.dueWithin,
    context.timestamp,
    "Due date",
  );
  results.push(dueWithinResult);
  if (!dueWithinResult.matched) {
    return { matches: false, results, failedAt: "dueWithin" };
  }

  const notReviewedResult = evaluateNotReviewedFor(
    card.lastReviewedAt,
    query.notReviewedFor,
    context.timestamp,
  );
  results.push(notReviewedResult);
  if (!notReviewedResult.matched) {
    return { matches: false, results, failedAt: "notReviewedFor" };
  }

  // LKGC predicates
  if (query.lkgcPredicates) {
    for (const predicate of query.lkgcPredicates) {
      const lkgcResult = await evaluateLkgcPredicate(
        card,
        predicate,
        context.lkgcReader,
      );
      results.push(lkgcResult);
      if (!lkgcResult.matched) {
        return {
          matches: false,
          results,
          failedAt: `lkgc:${predicate.signalType}`,
        };
      }
    }
  }

  // Graph predicates
  if (query.graphPredicates) {
    const cardNodeId = card.cardId as unknown as NodeId;
    for (const predicate of query.graphPredicates) {
      const graphResult = await evaluateGraphPredicate(
        cardNodeId,
        predicate,
        context.graphReader,
      );
      results.push(graphResult);
      if (!graphResult.matched) {
        return {
          matches: false,
          results,
          failedAt: `graph:${predicate.predicateType}`,
        };
      }
    }
  }

  // Custom predicates (evaluated via plugin system - placeholder for now)
  if (query.customPredicates) {
    for (const predicate of query.customPredicates) {
      // Custom predicates would be evaluated via the plugin registry
      // For now, we return a placeholder result
      results.push(
        createMatchResult(
          true,
          `Custom predicate ${predicate.predicateType} evaluation deferred to plugin`,
          { predicateId: predicate.predicateId },
        ),
      );
    }
  }

  return { matches: true, results };
}
