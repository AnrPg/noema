// =============================================================================
// FACE RESOLUTION ENGINE - CONDITION EVALUATORS
// =============================================================================
// Phase 6B: Built-in condition evaluators for face resolution
//
// Each evaluator handles one type of applicability condition.
// Evaluators are pure functions: (condition, context) => result
// =============================================================================

import type {
  ApplicabilityCondition,
  CategoryCondition,
  RoleCondition,
  ModeCondition,
  DepthCondition,
  IntentCondition,
  LkgcSignalCondition,
  UserPreferenceCondition,
  TemporalCondition,
  CompositeCondition,
  CustomCondition,
  ApplicabilityConditionSet,
  CognitiveDepthLevel,
  LkgcSignalType,
} from "../../types/canonical-card.types";

import type {
  FaceResolutionInput,
  ConditionEvaluationResult,
  ConditionEvaluator,
} from "../../types/face-resolution.types";

import type { NormalizedValue, Confidence } from "../../types/lkgc/foundation";

import type { ExtendedSemanticRole } from "../../types/multi-belonging.types";

// =============================================================================
// HELPER UTILITIES
// =============================================================================

/**
 * Create a successful match result
 */
function matchSuccess(
  expected: string,
  actual: string,
  explanation: string,
  confidence: Confidence = 1.0 as Confidence,
  score: NormalizedValue = 1.0 as NormalizedValue,
): ConditionEvaluationResult {
  return {
    matched: true,
    confidence,
    expected,
    actual,
    explanation,
    score,
  };
}

/**
 * Create a failed match result
 */
function matchFailure(
  expected: string,
  actual: string,
  explanation: string,
): ConditionEvaluationResult {
  return {
    matched: false,
    confidence: 1.0 as Confidence, // We're confident it didn't match
    expected,
    actual,
    explanation,
    score: 0 as NormalizedValue,
  };
}

/**
 * Depth level ordering for comparison
 */
const DEPTH_ORDER: Record<CognitiveDepthLevel, number> = {
  recognition: 0,
  recall: 1,
  understanding: 2,
  application: 3,
  analysis: 4,
  synthesis: 5,
  evaluation: 6,
};

// =============================================================================
// CATEGORY CONDITION EVALUATOR
// =============================================================================

/**
 * Evaluate a category condition
 *
 * Matches when:
 * - categoryIds contains the active category
 * - categoryPattern matches the category name/id
 * - includeDescendants and active category is a descendant
 */
export const evaluateCategoryCondition: ConditionEvaluator = (
  condition: ApplicabilityCondition,
  context: FaceResolutionInput,
): ConditionEvaluationResult => {
  const cat = condition as CategoryCondition;
  const activeCategory = context.categoryLens;

  // No category context - can't match
  if (!activeCategory) {
    return matchFailure(
      `Category in [${cat.categoryIds?.join(", ") || cat.categoryPattern || "any"}]`,
      "No active category",
      "No category lens is active",
    );
  }

  // Check direct category ID match
  if (cat.categoryIds && cat.categoryIds.length > 0) {
    if (cat.categoryIds.includes(activeCategory.categoryId)) {
      return matchSuccess(
        `Category in [${cat.categoryIds.join(", ")}]`,
        activeCategory.categoryId,
        `Active category "${activeCategory.categoryName}" matches directly`,
      );
    }

    // Check descendants if enabled
    if (cat.includeDescendants && activeCategory.ancestorCategoryIds) {
      const matchedAncestor = cat.categoryIds.find((id: string) =>
        activeCategory.ancestorCategoryIds!.includes(id),
      );
      if (matchedAncestor) {
        return matchSuccess(
          `Category in [${cat.categoryIds.join(", ")}] (including descendants)`,
          activeCategory.categoryId,
          `Active category "${activeCategory.categoryName}" is a descendant of "${matchedAncestor}"`,
          0.8 as Confidence, // Slightly lower confidence for descendant match
        );
      }
    }

    return matchFailure(
      `Category in [${cat.categoryIds.join(", ")}]`,
      activeCategory.categoryId,
      `Active category "${activeCategory.categoryName}" is not in the specified list`,
    );
  }

  // Check pattern match (regex or glob)
  if (cat.categoryPattern) {
    try {
      const regex = new RegExp(cat.categoryPattern, "i");
      if (
        regex.test(activeCategory.categoryId) ||
        regex.test(activeCategory.categoryName)
      ) {
        return matchSuccess(
          `Category matches pattern "${cat.categoryPattern}"`,
          activeCategory.categoryName,
          `Active category "${activeCategory.categoryName}" matches pattern`,
        );
      }
    } catch {
      // Invalid regex - treat as literal match
      if (
        activeCategory.categoryId.includes(cat.categoryPattern) ||
        activeCategory.categoryName
          .toLowerCase()
          .includes(cat.categoryPattern.toLowerCase())
      ) {
        return matchSuccess(
          `Category contains "${cat.categoryPattern}"`,
          activeCategory.categoryName,
          `Active category "${activeCategory.categoryName}" contains the pattern`,
        );
      }
    }

    return matchFailure(
      `Category matches pattern "${cat.categoryPattern}"`,
      activeCategory.categoryName,
      `Active category "${activeCategory.categoryName}" does not match the pattern`,
    );
  }

  // No specific criteria - match any category
  return matchSuccess(
    "Any category",
    activeCategory.categoryId,
    `Matched active category "${activeCategory.categoryName}"`,
    0.5 as Confidence, // Lower confidence for wildcard match
  );
};

// =============================================================================
// ROLE CONDITION EVALUATOR
// =============================================================================

/**
 * Evaluate a participation role condition
 *
 * Matches when:
 * - roles contains the card's semantic role in the active context
 * - requireAll is false (default): any role matches
 * - requireAll is true: all specified roles must be present
 */
export const evaluateRoleCondition: ConditionEvaluator = (
  condition: ApplicabilityCondition,
  context: FaceResolutionInput,
): ConditionEvaluationResult => {
  const role = condition as RoleCondition;
  const participation = context.participation;

  // No participation context - can't match
  if (!participation) {
    return matchFailure(
      `Role in [${role.roles.join(", ")}]`,
      "No participation context",
      "Card is not participating in the active category",
    );
  }

  const cardRole = participation.semanticRole;

  // Check role match
  if (role.roles.includes(cardRole as ExtendedSemanticRole)) {
    return matchSuccess(
      `Role in [${role.roles.join(", ")}]`,
      cardRole,
      `Card's role "${cardRole}" matches`,
    );
  }

  return matchFailure(
    `Role in [${role.roles.join(", ")}]`,
    cardRole,
    `Card's role "${cardRole}" is not in the specified roles`,
  );
};

// =============================================================================
// MODE CONDITION EVALUATOR
// =============================================================================

/**
 * Evaluate a learning mode condition
 *
 * Matches when:
 * - modeIds contains the active mode ID
 * - modeTypes contains the active mode's system type
 */
export const evaluateModeCondition: ConditionEvaluator = (
  condition: ApplicabilityCondition,
  context: FaceResolutionInput,
): ConditionEvaluationResult => {
  const mode = condition as ModeCondition;
  const activeMode = context.mode;

  // No mode context - can't match mode-specific rules
  if (!activeMode) {
    return matchFailure(
      `Mode in [${mode.modeIds?.join(", ") || mode.modeTypes?.join(", ") || "any"}]`,
      "No active mode",
      "No learning mode is active",
    );
  }

  // Check mode ID match
  if (mode.modeIds && mode.modeIds.length > 0) {
    if (mode.modeIds.includes(activeMode.modeId)) {
      return matchSuccess(
        `Mode ID in [${mode.modeIds.join(", ")}]`,
        activeMode.modeId,
        `Active mode "${activeMode.modeName}" matches by ID`,
      );
    }
  }

  // Check mode type match
  if (
    mode.modeTypes &&
    mode.modeTypes.length > 0 &&
    activeMode.systemModeType
  ) {
    if (mode.modeTypes.includes(activeMode.systemModeType)) {
      return matchSuccess(
        `Mode type in [${mode.modeTypes.join(", ")}]`,
        activeMode.systemModeType,
        `Active mode "${activeMode.modeName}" is of type "${activeMode.systemModeType}"`,
      );
    }
  }

  // Neither matched
  const expected = mode.modeIds?.length
    ? `Mode ID in [${mode.modeIds.join(", ")}]`
    : mode.modeTypes?.length
      ? `Mode type in [${mode.modeTypes.join(", ")}]`
      : "Any mode";

  const actual = activeMode.systemModeType
    ? `${activeMode.modeName} (${activeMode.systemModeType})`
    : activeMode.modeName;

  return matchFailure(
    expected,
    actual,
    `Active mode "${activeMode.modeName}" does not match the condition`,
  );
};

// =============================================================================
// DEPTH CONDITION EVALUATOR
// =============================================================================

/**
 * Evaluate a depth condition
 *
 * Matches when:
 * - targetDepths contains the category's depth goal
 * - depth is between minDepth and maxDepth
 */
export const evaluateDepthCondition: ConditionEvaluator = (
  condition: ApplicabilityCondition,
  context: FaceResolutionInput,
): ConditionEvaluationResult => {
  const depth = condition as DepthCondition;

  // Get target depth from category lens or mode
  const targetDepth =
    context.categoryLens?.depthGoal ||
    context.mode?.depthBias ||
    context.userPreferences?.preferredDepth;

  if (!targetDepth) {
    // No depth context - check if condition is flexible
    if (!depth.targetDepths?.length && !depth.minDepth && !depth.maxDepth) {
      return matchSuccess(
        "Any depth",
        "Unspecified",
        "No depth requirements and no target depth specified",
        0.5 as Confidence,
      );
    }
    return matchFailure(
      `Depth in [${depth.targetDepths?.join(", ") || `${depth.minDepth || "any"} - ${depth.maxDepth || "any"}`}]`,
      "Unspecified",
      "No target depth is specified in the context",
    );
  }

  // Check explicit target depths
  if (depth.targetDepths && depth.targetDepths.length > 0) {
    if (depth.targetDepths.includes(targetDepth)) {
      return matchSuccess(
        `Depth in [${depth.targetDepths.join(", ")}]`,
        targetDepth,
        `Target depth "${targetDepth}" is in the allowed list`,
      );
    }
  }

  // Check depth range
  if (depth.minDepth || depth.maxDepth) {
    const targetOrder = DEPTH_ORDER[targetDepth];
    const minOrder = depth.minDepth ? DEPTH_ORDER[depth.minDepth] : -Infinity;
    const maxOrder = depth.maxDepth ? DEPTH_ORDER[depth.maxDepth] : Infinity;

    if (targetOrder >= minOrder && targetOrder <= maxOrder) {
      return matchSuccess(
        `Depth between ${depth.minDepth || "any"} and ${depth.maxDepth || "any"}`,
        targetDepth,
        `Target depth "${targetDepth}" is within the allowed range`,
      );
    }

    return matchFailure(
      `Depth between ${depth.minDepth || "any"} and ${depth.maxDepth || "any"}`,
      targetDepth,
      `Target depth "${targetDepth}" is outside the allowed range`,
    );
  }

  // Explicit targets didn't match
  return matchFailure(
    `Depth in [${depth.targetDepths?.join(", ") || "unspecified"}]`,
    targetDepth,
    `Target depth "${targetDepth}" is not in the allowed list`,
  );
};

// =============================================================================
// INTENT CONDITION EVALUATOR
// =============================================================================

/**
 * Evaluate a category intent condition
 *
 * Matches when:
 * - intents contains the category's learning intent
 */
export const evaluateIntentCondition: ConditionEvaluator = (
  condition: ApplicabilityCondition,
  context: FaceResolutionInput,
): ConditionEvaluationResult => {
  const intent = condition as IntentCondition;
  const categoryIntent = context.categoryLens?.learningIntent;

  if (!categoryIntent) {
    return matchFailure(
      `Intent in [${intent.intents.join(", ")}]`,
      "Unspecified",
      "No learning intent specified for the active category",
    );
  }

  if (intent.intents.includes(categoryIntent)) {
    return matchSuccess(
      `Intent in [${intent.intents.join(", ")}]`,
      categoryIntent,
      `Category intent "${categoryIntent}" matches`,
    );
  }

  return matchFailure(
    `Intent in [${intent.intents.join(", ")}]`,
    categoryIntent,
    `Category intent "${categoryIntent}" is not in the allowed list`,
  );
};

// =============================================================================
// LKGC SIGNAL CONDITION EVALUATOR
// =============================================================================

/**
 * Evaluate an LKGC signal condition
 *
 * Matches when:
 * - The specified signal meets the threshold condition
 */
export const evaluateLkgcSignalCondition: ConditionEvaluator = (
  condition: ApplicabilityCondition,
  context: FaceResolutionInput,
): ConditionEvaluationResult => {
  const lkgc = condition as LkgcSignalCondition;
  const signals = context.lkgcSignals;

  if (!signals) {
    return matchFailure(
      `${lkgc.signal} ${lkgc.operator} ${lkgc.threshold}`,
      "No LKGC signals",
      "LKGC signals are not available in this context",
    );
  }

  // Get the signal value from context
  let signalValue: NormalizedValue | undefined;

  // Check named signal properties first
  switch (lkgc.signal) {
    case "confidence":
      signalValue = signals.confidence;
      break;
    case "stability":
      signalValue = signals.stability;
      break;
    case "volatility":
      signalValue = signals.volatility;
      break;
    case "interference":
      signalValue = signals.interference;
      break;
    case "coherence":
      signalValue = signals.coherence;
      break;
    case "recency":
      signalValue = signals.recency;
      break;
    case "contextual_strength":
      signalValue = signals.contextualStrength;
      break;
    default:
      // Check raw signals map
      signalValue = signals.rawSignals?.[lkgc.signal as LkgcSignalType];
  }

  if (signalValue === undefined) {
    return matchFailure(
      `${lkgc.signal} ${lkgc.operator} ${lkgc.threshold}`,
      "Signal unavailable",
      `LKGC signal "${lkgc.signal}" is not available`,
    );
  }

  // Evaluate the condition
  let matched = false;
  const threshold = lkgc.threshold;
  const upper = lkgc.upperThreshold;

  switch (lkgc.operator) {
    case "gt":
      matched = signalValue > threshold;
      break;
    case "lt":
      matched = signalValue < threshold;
      break;
    case "eq":
      matched = Math.abs(signalValue - threshold) < 0.001;
      break;
    case "gte":
      matched = signalValue >= threshold;
      break;
    case "lte":
      matched = signalValue <= threshold;
      break;
    case "between":
      matched =
        upper !== undefined && signalValue >= threshold && signalValue <= upper;
      break;
  }

  const expectedStr =
    lkgc.operator === "between"
      ? `${lkgc.signal} between ${threshold} and ${upper}`
      : `${lkgc.signal} ${lkgc.operator} ${threshold}`;

  if (matched) {
    return matchSuccess(
      expectedStr,
      signalValue.toFixed(3),
      `LKGC signal "${lkgc.signal}" (${signalValue.toFixed(3)}) meets condition`,
    );
  }

  return matchFailure(
    expectedStr,
    signalValue.toFixed(3),
    `LKGC signal "${lkgc.signal}" (${signalValue.toFixed(3)}) does not meet condition`,
  );
};

// =============================================================================
// USER PREFERENCE CONDITION EVALUATOR
// =============================================================================

/**
 * Evaluate a user preference condition
 */
export const evaluateUserPreferenceCondition: ConditionEvaluator = (
  condition: ApplicabilityCondition,
  context: FaceResolutionInput,
): ConditionEvaluationResult => {
  const pref = condition as UserPreferenceCondition;
  const userPrefs = context.userPreferences;

  if (!userPrefs) {
    return matchFailure(
      `User preference "${pref.preferenceKey}" ${pref.operator} ${JSON.stringify(pref.value)}`,
      "No preferences",
      "User preferences are not available",
    );
  }

  // Get the preference value
  let prefValue: unknown;

  // Check named preferences first
  switch (pref.preferenceKey) {
    case "preferredDepth":
      prefValue = userPrefs.preferredDepth;
      break;
    case "preferredFaceTypes":
      prefValue = userPrefs.preferredFaceTypes;
      break;
    case "scaffoldingPreference":
      prefValue = userPrefs.scaffoldingPreference;
      break;
    case "timePreference":
      prefValue = userPrefs.timePreference;
      break;
    default:
      prefValue = userPrefs.customPreferences?.[pref.preferenceKey];
  }

  if (prefValue === undefined) {
    return matchFailure(
      `User preference "${pref.preferenceKey}"`,
      "Unset",
      `User preference "${pref.preferenceKey}" is not set`,
    );
  }

  // Evaluate based on operator
  let matched = false;

  switch (pref.operator) {
    case "eq":
      matched = prefValue === pref.value;
      break;
    case "in":
      matched = Array.isArray(pref.value) && pref.value.includes(prefValue);
      break;
    case "not_in":
      matched = Array.isArray(pref.value) && !pref.value.includes(prefValue);
      break;
    case "contains":
      if (Array.isArray(prefValue)) {
        matched = prefValue.includes(pref.value);
      } else if (typeof prefValue === "string") {
        matched = prefValue.includes(String(pref.value));
      }
      break;
  }

  const expectedStr = `${pref.preferenceKey} ${pref.operator} ${JSON.stringify(pref.value)}`;
  const actualStr = JSON.stringify(prefValue);

  if (matched) {
    return matchSuccess(
      expectedStr,
      actualStr,
      `User preference "${pref.preferenceKey}" matches condition`,
    );
  }

  return matchFailure(
    expectedStr,
    actualStr,
    `User preference "${pref.preferenceKey}" does not match condition`,
  );
};

// =============================================================================
// TEMPORAL CONDITION EVALUATOR
// =============================================================================

/**
 * Evaluate a temporal condition
 */
export const evaluateTemporalCondition: ConditionEvaluator = (
  condition: ApplicabilityCondition,
  context: FaceResolutionInput,
): ConditionEvaluationResult => {
  const temporal = condition as TemporalCondition;
  const timeCtx = context.temporalContext;

  if (!timeCtx) {
    return matchFailure(
      "Temporal condition",
      "No temporal context",
      "Temporal context is not available",
    );
  }

  const constraint = temporal.timeConstraint;
  let matched = false;
  let expected = "";
  let actual = "";

  switch (constraint.type) {
    case "time_of_day": {
      const allowedTimes = constraint.config.times as string[] | undefined;
      expected = `Time of day in [${allowedTimes?.join(", ") || "any"}]`;
      actual = timeCtx.timeOfDay;
      matched = !allowedTimes || allowedTimes.includes(timeCtx.timeOfDay);
      break;
    }
    case "day_of_week": {
      const allowedDays = constraint.config.days as number[] | undefined;
      expected = `Day of week in [${allowedDays?.join(", ") || "any"}]`;
      actual = String(timeCtx.dayOfWeek);
      matched = !allowedDays || allowedDays.includes(timeCtx.dayOfWeek);
      break;
    }
    case "date_range": {
      const startDate = constraint.config.startDate as number | undefined;
      const endDate = constraint.config.endDate as number | undefined;
      expected = `Date between ${startDate || "any"} and ${endDate || "any"}`;
      actual = String(timeCtx.currentDate);
      const currentMs = timeCtx.currentDate;
      matched =
        (!startDate || currentMs >= startDate) &&
        (!endDate || currentMs <= endDate);
      break;
    }
    case "relative": {
      // Handle relative time constraints (e.g., "within first 5 minutes of session")
      const maxSessionDuration = constraint.config.maxSessionDurationMs as
        | number
        | undefined;
      const minSessionDuration = constraint.config.minSessionDurationMs as
        | number
        | undefined;
      expected = `Session duration ${minSessionDuration ? `>= ${minSessionDuration}ms` : ""} ${maxSessionDuration ? `<= ${maxSessionDuration}ms` : ""}`;
      actual = timeCtx.sessionDuration
        ? `${timeCtx.sessionDuration}ms`
        : "unknown";

      if (timeCtx.sessionDuration !== undefined) {
        matched =
          (!minSessionDuration ||
            timeCtx.sessionDuration >= minSessionDuration) &&
          (!maxSessionDuration ||
            timeCtx.sessionDuration <= maxSessionDuration);
      }
      break;
    }
    default:
      return matchFailure(
        "Unknown temporal constraint",
        constraint.type,
        `Unknown temporal constraint type: ${constraint.type}`,
      );
  }

  if (matched) {
    return matchSuccess(
      expected,
      actual,
      `Temporal condition met: ${expected}`,
    );
  }

  return matchFailure(expected, actual, `Temporal condition not met`);
};

// =============================================================================
// COMPOSITE CONDITION EVALUATOR
// =============================================================================

/**
 * Evaluate a composite (nested) condition
 *
 * This evaluator handles AND/OR composition of conditions.
 * It delegates to the appropriate evaluator for each sub-condition.
 */
export function createCompositeEvaluator(
  evaluatorRegistry: Record<string, ConditionEvaluator>,
): ConditionEvaluator {
  const evaluateConditionSet = (
    conditionSet: ApplicabilityConditionSet,
    context: FaceResolutionInput,
  ): ConditionEvaluationResult => {
    const results: ConditionEvaluationResult[] = [];

    for (const condition of conditionSet.conditions) {
      const evaluator = evaluatorRegistry[condition.type];
      if (!evaluator) {
        results.push(
          matchFailure(
            `Condition type: ${condition.type}`,
            "Unknown",
            `No evaluator registered for condition type: ${condition.type}`,
          ),
        );
        continue;
      }

      const result = evaluator(condition, context);
      results.push(result);

      // Short-circuit for efficiency
      if (conditionSet.operator === "and" && !result.matched) {
        // For AND, one failure means the whole set fails
        break;
      }
      if (conditionSet.operator === "or" && result.matched) {
        // For OR, one success means the whole set succeeds
        break;
      }
    }

    // Compute final result
    let matched: boolean;
    if (conditionSet.operator === "and") {
      matched = results.every((r) => r.matched);
    } else {
      matched = results.some((r) => r.matched);
    }

    // Apply negation
    if (conditionSet.negated) {
      matched = !matched;
    }

    // Compute average confidence and score
    const avgConfidence =
      results.length > 0
        ? ((results.reduce((sum, r) => sum + r.confidence, 0) /
            results.length) as Confidence)
        : (1.0 as Confidence);

    const avgScore =
      results.length > 0
        ? ((results.reduce((sum, r) => sum + r.score, 0) /
            results.length) as NormalizedValue)
        : (0 as NormalizedValue);

    const operator = conditionSet.negated
      ? `NOT(${conditionSet.operator.toUpperCase()})`
      : conditionSet.operator.toUpperCase();

    return {
      matched,
      confidence: avgConfidence,
      expected: `${operator} of ${conditionSet.conditions.length} conditions`,
      actual: `${results.filter((r) => r.matched).length}/${results.length} matched`,
      explanation: matched
        ? `Composite condition (${operator}) satisfied`
        : `Composite condition (${operator}) not satisfied`,
      score: matched ? avgScore : (0 as NormalizedValue),
    };
  };

  return (
    condition: ApplicabilityCondition,
    context: FaceResolutionInput,
  ): ConditionEvaluationResult => {
    const composite = condition as CompositeCondition;
    return evaluateConditionSet(composite.conditionSet, context);
  };
}

// =============================================================================
// CUSTOM CONDITION EVALUATOR (PLACEHOLDER)
// =============================================================================

/**
 * Default custom condition evaluator
 *
 * Returns a failure - custom conditions must be handled by plugins.
 */
export const evaluateCustomCondition: ConditionEvaluator = (
  condition: ApplicabilityCondition,
  _context: FaceResolutionInput,
): ConditionEvaluationResult => {
  const custom = condition as CustomCondition;
  return matchFailure(
    `Custom condition: ${custom.conditionType}`,
    "Not implemented",
    `Custom condition "${custom.conditionType}" from plugin "${custom.pluginId}" requires plugin to be registered`,
  );
};

// =============================================================================
// EVALUATOR REGISTRY BUILDER
// =============================================================================

/**
 * Build the default evaluator registry with all built-in evaluators
 */
export function buildDefaultEvaluatorRegistry(): Record<
  string,
  ConditionEvaluator
> {
  const registry: Record<string, ConditionEvaluator> = {
    category: evaluateCategoryCondition,
    role: evaluateRoleCondition,
    mode: evaluateModeCondition,
    depth: evaluateDepthCondition,
    intent: evaluateIntentCondition,
    lkgc_signal: evaluateLkgcSignalCondition,
    user_preference: evaluateUserPreferenceCondition,
    temporal: evaluateTemporalCondition,
    custom: evaluateCustomCondition,
  };

  // Add composite evaluator with access to all other evaluators
  registry.composite = createCompositeEvaluator(registry);

  return registry;
}

/**
 * Evaluate a condition set (AND/OR composition)
 */
export function evaluateConditionSet(
  conditionSet: ApplicabilityConditionSet,
  context: FaceResolutionInput,
  evaluatorRegistry: Record<string, ConditionEvaluator>,
): ConditionEvaluationResult {
  const compositeEvaluator = createCompositeEvaluator(evaluatorRegistry);

  // Create a synthetic composite condition
  const syntheticComposite: CompositeCondition = {
    type: "composite",
    conditionSet,
  };

  return compositeEvaluator(syntheticComposite, context);
}
