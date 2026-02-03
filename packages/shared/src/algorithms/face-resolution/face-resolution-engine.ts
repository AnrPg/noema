// =============================================================================
// FACE RESOLUTION ENGINE - CORE IMPLEMENTATION
// =============================================================================
// Phase 6B: Face Resolution Engine (Logic Core)
//
// The Face Resolution Engine determines which face to present for a card
// given the context (category lens, participation role, mode, LKGC signals,
// user preferences).
//
// DESIGN PRINCIPLES:
// 1. Declarative, rule-based resolution (not giant if-else)
// 2. Plugin-extensible resolution rules
// 3. Testable in isolation (no side effects)
// 4. Full explainability for every decision
// 5. LLM-agent ready (clean inputs/outputs, explicit interfaces)
//
// NO SCHEDULING. NO UI. NO DECK QUERIES.
// =============================================================================

import type {
  CardFace,
  FaceApplicabilityRule,
  ApplicabilityConditionSet,
} from "../../types/canonical-card.types";
import type {
  NormalizedValue,
  Confidence,
  Duration,
  Timestamp,
} from "../../types/lkgc/foundation";
import type {
  IFaceResolutionEngine,
  FaceResolutionInput,
  FaceResolutionOutput,
  FaceResolutionEngineConfig,
  ResolutionRulePlugin,
  ConditionEvaluator,
  NamedFaceScorer,
  FaceScorer,
  FaceScoringResult,
  CardFaceWithRules,
  ScaffoldingDirectives,
  RenderingDirectives,
  FaceResolutionExplainability,
  FaceResolutionFactor,
  MatchedRuleExplanation,
  UnmatchedRuleExplanation,
  AlternativeFaceExplanation,
  ResolutionContextSnapshot,
  ConditionEvaluationResult,
  ConditionMatchExplanation,
  ConditionFailureExplanation,
  ScoreComponent,
  FaceResolutionTraceId,
  ResolutionRulePluginId,
  FaceResolvedEvent,
} from "../../types/face-resolution.types";
import { DEFAULT_RESOLUTION_CONFIG } from "../../types/face-resolution.types";

import {
  buildDefaultEvaluatorRegistry,
  evaluateConditionSet,
} from "./condition-evaluators";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a unique trace ID
 */
function generateTraceId(): FaceResolutionTraceId {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as FaceResolutionTraceId;
}

/**
 * Generate a unique request ID if not provided
 */
function ensureRequestId(input: FaceResolutionInput): string {
  return (
    input.requestId ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );
}

/**
 * Get current timestamp
 */
function now(): Timestamp {
  return Date.now() as Timestamp;
}

// =============================================================================
// FACE RESOLUTION ENGINE IMPLEMENTATION
// =============================================================================

export class FaceResolutionEngine implements IFaceResolutionEngine {
  private config: FaceResolutionEngineConfig;
  private evaluatorRegistry: Record<string, ConditionEvaluator>;
  private pluginEvaluators: Record<string, Record<string, ConditionEvaluator>>;
  private plugins: Map<ResolutionRulePluginId, ResolutionRulePlugin>;
  private scorers: NamedFaceScorer[];
  private eventListeners: ((event: FaceResolvedEvent) => void)[];

  constructor(config: Partial<FaceResolutionEngineConfig> = {}) {
    this.config = { ...DEFAULT_RESOLUTION_CONFIG, ...config };
    this.evaluatorRegistry = buildDefaultEvaluatorRegistry();
    this.pluginEvaluators = {};
    this.plugins = new Map();
    this.scorers = [];
    this.eventListeners = [];
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Resolve which face to show for a card given the context
   */
  async resolve(input: FaceResolutionInput): Promise<FaceResolutionOutput> {
    const startTime = performance.now();
    const requestId = ensureRequestId(input) as any;

    try {
      const output = await this.doResolve(input, requestId);

      // Emit event
      this.emitEvent({
        type: "face_resolved",
        timestamp: now(),
        requestId,
        userId: input.userId,
        canonicalCardId: input.canonicalCardId,
        selectedFaceId: output.selectedFaceId,
        isDefaultFace: output.isDefaultFace,
        confidence: output.confidence,
        resolutionTimeMs: output.resolutionTimeMs,
        contextSummary: output.explainability.resolutionContext,
      });

      return output;
    } catch (error) {
      // Create a fallback output using the default face
      const defaultFace = input.availableFaces.find(
        (f) => f.face.id === input.defaultFaceId,
      )?.face;
      if (!defaultFace) {
        throw new Error(
          `No default face found for card ${input.canonicalCardId}`,
        );
      }

      const resolutionTimeMs = performance.now() - startTime;

      return this.createFallbackOutput(
        requestId,
        defaultFace,
        input,
        resolutionTimeMs,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  /**
   * Resolve multiple cards in batch
   */
  async resolveBatch(
    inputs: readonly FaceResolutionInput[],
  ): Promise<readonly FaceResolutionOutput[]> {
    // For now, resolve sequentially. Future optimization: parallel resolution
    const results: FaceResolutionOutput[] = [];
    for (const input of inputs) {
      results.push(await this.resolve(input));
    }
    return results;
  }

  /**
   * Preview resolution without emitting events
   */
  async preview(input: FaceResolutionInput): Promise<FaceResolutionOutput> {
    const startTime = performance.now();
    const requestId = ensureRequestId(input) as any;

    try {
      return await this.doResolve(input, requestId);
    } catch (error) {
      const defaultFace = input.availableFaces.find(
        (f) => f.face.id === input.defaultFaceId,
      )?.face;
      if (!defaultFace) {
        throw new Error(
          `No default face found for card ${input.canonicalCardId}`,
        );
      }

      const resolutionTimeMs = performance.now() - startTime;

      return this.createFallbackOutput(
        requestId,
        defaultFace,
        input,
        resolutionTimeMs,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  /**
   * Register a plugin
   */
  registerPlugin(plugin: ResolutionRulePlugin): void {
    this.plugins.set(plugin.pluginId, plugin);

    // Initialize plugin evaluator namespace
    if (!this.pluginEvaluators[plugin.pluginId as string]) {
      this.pluginEvaluators[plugin.pluginId as string] = {};
    }
  }

  /**
   * Register a condition evaluator
   */
  registerConditionEvaluator(
    conditionType: string,
    evaluator: ConditionEvaluator,
    pluginId?: ResolutionRulePluginId,
  ): void {
    if (pluginId) {
      if (!this.pluginEvaluators[pluginId as string]) {
        this.pluginEvaluators[pluginId as string] = {};
      }
      this.pluginEvaluators[pluginId as string][conditionType] = evaluator;
    } else {
      this.evaluatorRegistry[conditionType] = evaluator;
    }
  }

  /**
   * Register a face scorer
   */
  registerFaceScorer(scorer: NamedFaceScorer): void {
    this.scorers.push(scorer);
  }

  /**
   * Get engine configuration
   */
  getConfig(): FaceResolutionEngineConfig {
    return { ...this.config };
  }

  /**
   * Update engine configuration
   */
  updateConfig(config: Partial<FaceResolutionEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get registered plugins
   */
  getRegisteredPlugins(): readonly ResolutionRulePlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Add event listener
   */
  addEventListener(listener: (event: FaceResolvedEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: FaceResolvedEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index >= 0) {
      this.eventListeners.splice(index, 1);
    }
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Core resolution logic
   */
  private async doResolve(
    input: FaceResolutionInput,
    requestId: any,
  ): Promise<FaceResolutionOutput> {
    const startTime = performance.now();

    // Check for forced face
    if (input.options?.forceFaceId) {
      const forcedFace = input.availableFaces.find(
        (f) => f.face.id === input.options!.forceFaceId,
      );
      if (forcedFace) {
        return this.createOutput(
          requestId,
          forcedFace.face,
          false,
          input,
          performance.now() - startTime,
          0,
          input.availableFaces.length,
          1.0 as Confidence,
          [this.createForcedFaceExplanation(forcedFace)],
          [],
        );
      }
    }

    // Filter faces based on exclusion list
    let candidateFaces = input.availableFaces;
    if (input.options?.excludeFaceIds?.length) {
      candidateFaces = candidateFaces.filter(
        (f) => !input.options!.excludeFaceIds!.includes(f.face.id),
      );
    }

    // Evaluate rules for each face
    const evaluationResults = await this.evaluateAllFaces(
      candidateFaces,
      input,
    );

    // Score faces
    const scoredFaces = this.scoreFaces(evaluationResults, input);

    // Select the best face
    const selectedFace = this.selectBestFace(scoredFaces, input);
    const isDefaultFace = selectedFace.faceId === input.defaultFaceId;

    // Get the actual face object
    const selectedFaceWithRules = candidateFaces.find(
      (f) => f.face.id === selectedFace.faceId,
    );
    if (!selectedFaceWithRules) {
      throw new Error(
        `Selected face ${selectedFace.faceId} not found in candidates`,
      );
    }

    // Build explanation
    const matchedRules = evaluationResults
      .filter((r) => r.faceId === selectedFace.faceId && r.matched)
      .map((r) => r.ruleExplanation!);

    const unmatchedRules = evaluationResults
      .filter((r) => r.faceId === selectedFace.faceId && !r.matched)
      .map((r) => r.ruleExplanation as any)
      .filter(Boolean);

    const resolutionTimeMs = performance.now() - startTime;
    const rulesEvaluated = evaluationResults.length;

    return this.createOutput(
      requestId,
      selectedFaceWithRules.face,
      isDefaultFace,
      input,
      resolutionTimeMs,
      rulesEvaluated,
      candidateFaces.length,
      selectedFace.score as unknown as Confidence,
      matchedRules,
      unmatchedRules,
      scoredFaces
        .filter((sf) => sf.faceId !== selectedFace.faceId)
        .map((sf) => ({
          faceId: sf.faceId,
          faceName:
            candidateFaces.find((f) => f.face.id === sf.faceId)?.face.name ||
            "Unknown",
          reason:
            sf.score < selectedFace.score
              ? `Lower score (${sf.score.toFixed(3)} vs ${selectedFace.score.toFixed(3)})`
              : "Tie-breaker favored selected face",
          score: sf.score,
          matchedRuleCount: evaluationResults.filter(
            (r) => r.faceId === sf.faceId && r.matched,
          ).length,
          failedRuleCount: evaluationResults.filter(
            (r) => r.faceId === sf.faceId && !r.matched,
          ).length,
        })),
    );
  }

  /**
   * Evaluate rules for all candidate faces
   */
  private async evaluateAllFaces(
    faces: readonly CardFaceWithRules[],
    input: FaceResolutionInput,
  ): Promise<RuleEvaluationResult[]> {
    const results: RuleEvaluationResult[] = [];

    for (const faceWithRules of faces) {
      // If face has no rules, it's a wildcard match with low priority
      if (!faceWithRules.rules.length) {
        results.push({
          faceId: faceWithRules.face.id,
          ruleId: undefined,
          matched: true,
          confidence: 0.1 as Confidence,
          score: 0.1 as NormalizedValue,
          ruleExplanation: {
            rule: {
              id: "implicit_default" as any,
              description: "No rules defined - implicit match",
              type: "composite" as any,
              conditions: { operator: "and", conditions: [] },
              priority: 0,
              isActive: true,
              source: "manual",
            },
            matchedConditions: [],
            contributionScore: 0.1 as NormalizedValue,
            summary: "Face has no rules - matches by default with low priority",
          },
        });
        continue;
      }

      // Evaluate each rule for this face
      for (const rule of faceWithRules.rules) {
        if (!rule.isActive) continue;

        const result = this.evaluateRule(rule, input);
        results.push({
          faceId: faceWithRules.face.id,
          ruleId: rule.id,
          matched: result.matched,
          confidence: result.confidence,
          score: result.score,
          ruleExplanation: result.matched
            ? {
                rule,
                matchedConditions: result.matchedConditions,
                contributionScore: result.score,
                summary: result.summary,
              }
            : undefined,
          failedExplanation: !result.matched
            ? {
                rule,
                failedConditions: result.failedConditions,
                summary: result.summary,
              }
            : undefined,
        });
      }
    }

    return results;
  }

  /**
   * Evaluate a single rule
   */
  private evaluateRule(
    rule: FaceApplicabilityRule,
    input: FaceResolutionInput,
  ): RuleEvaluationFullResult {
    const conditions = rule.conditions as ApplicabilityConditionSet;

    // Build merged evaluator registry with plugins
    const mergedRegistry = { ...this.evaluatorRegistry };
    for (const [_pluginId, evaluators] of Object.entries(
      this.pluginEvaluators,
    )) {
      Object.assign(mergedRegistry, evaluators);
    }

    // Evaluate the condition set
    const setResult = evaluateConditionSet(conditions, input, mergedRegistry);

    // Build detailed condition results
    const matchedConditions: ConditionMatchExplanation[] = [];
    const failedConditions: ConditionFailureExplanation[] = [];

    // For detailed tracking, evaluate each condition individually
    for (const condition of conditions.conditions) {
      const evaluator = mergedRegistry[condition.type];
      if (!evaluator) {
        failedConditions.push({
          condition,
          expected: `Evaluator for ${condition.type}`,
          actual: "Not found",
          reason: `No evaluator registered for condition type: ${condition.type}`,
        });
        continue;
      }

      const condResult = evaluator(condition, input);
      if (condResult.matched) {
        matchedConditions.push({
          condition,
          expected: condResult.expected,
          actual: condResult.actual,
          description: condResult.explanation,
        });
      } else {
        failedConditions.push({
          condition,
          expected: condResult.expected,
          actual: condResult.actual,
          reason: condResult.explanation,
        });
      }
    }

    return {
      matched: setResult.matched,
      confidence: setResult.confidence,
      score: setResult.matched
        ? this.computeRuleScore(rule, setResult)
        : (0 as NormalizedValue),
      matchedConditions,
      failedConditions,
      summary: setResult.explanation,
    };
  }

  /**
   * Compute score for a matched rule
   */
  private computeRuleScore(
    rule: FaceApplicabilityRule,
    result: ConditionEvaluationResult,
  ): NormalizedValue {
    // Base score from rule priority (normalized to 0-1 assuming priority is 0-100)
    const priorityScore = Math.min(1, Math.max(0, (rule.priority || 50) / 100));

    // Confidence score from condition evaluation
    const confidenceScore = result.confidence;

    // Combined score (weighted average)
    const score = (priorityScore * 0.4 + confidenceScore * 0.6) * result.score;

    return score as NormalizedValue;
  }

  /**
   * Score all faces based on their rule evaluations
   */
  private scoreFaces(
    evaluations: RuleEvaluationResult[],
    input: FaceResolutionInput,
  ): FaceScoringResult[] {
    // Group evaluations by face
    const faceEvaluations = new Map<string, RuleEvaluationResult[]>();
    for (const evaluation of evaluations) {
      const faceId = evaluation.faceId as string;
      if (!faceEvaluations.has(faceId)) {
        faceEvaluations.set(faceId, []);
      }
      faceEvaluations.get(faceId)!.push(evaluation);
    }

    // Score each face
    const results: FaceScoringResult[] = [];
    for (const [faceId, evals] of faceEvaluations) {
      const matchedEvals = evals.filter((e) => e.matched);

      // Base score: sum of matched rule scores
      let baseScore = matchedEvals.reduce((sum, e) => sum + e.score, 0);

      // Normalize by number of rules (to not favor faces with many rules)
      if (matchedEvals.length > 0) {
        baseScore = baseScore / matchedEvals.length;
      }

      // Boost for default face (small bonus)
      const isDefault = faceId === input.defaultFaceId;
      const defaultBoost = isDefault ? 0.05 : 0;

      // Build score breakdown
      const scoreBreakdown: ScoreComponent[] = [
        {
          source: "rule_matches",
          weight: 0.8 as NormalizedValue,
          rawScore: baseScore as NormalizedValue,
          weightedScore: (baseScore * 0.8) as NormalizedValue,
          description: `${matchedEvals.length} rules matched`,
        },
        {
          source: "default_face_bonus",
          weight: 0.1 as NormalizedValue,
          rawScore: (isDefault ? 0.5 : 0) as NormalizedValue,
          weightedScore: defaultBoost as NormalizedValue,
          description: isDefault ? "Default face bonus" : "Not default face",
        },
      ];

      // Apply additional scorers from plugins
      for (const namedScorer of this.scorers) {
        const faceWithRules = input.availableFaces.find(
          (f) => f.face.id === faceId,
        );
        if (faceWithRules) {
          const scorerResult = namedScorer.scorer(
            faceWithRules,
            matchedEvals.map((e) => e.ruleExplanation!.rule),
            input,
          );
          scoreBreakdown.push(
            ...scorerResult.scoreBreakdown.map((c) => ({
              ...c,
              source: `${namedScorer.name}:${c.source}`,
              weightedScore: (c.rawScore *
                namedScorer.weight) as NormalizedValue,
            })),
          );
        }
      }

      // Compute final score
      const finalScore = Math.min(
        1,
        Math.max(
          0,
          scoreBreakdown.reduce((sum, c) => sum + c.weightedScore, 0),
        ),
      );

      results.push({
        faceId: faceId as any,
        score: finalScore as NormalizedValue,
        scoreBreakdown,
        explanation: `Score ${finalScore.toFixed(3)} from ${matchedEvals.length} matched rules`,
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Select the best face from scored candidates
   */
  private selectBestFace(
    scoredFaces: FaceScoringResult[],
    input: FaceResolutionInput,
  ): FaceScoringResult {
    if (scoredFaces.length === 0) {
      // No faces scored - return default
      return {
        faceId: input.defaultFaceId,
        score: 0.1 as NormalizedValue,
        scoreBreakdown: [
          {
            source: "fallback",
            weight: 1 as NormalizedValue,
            rawScore: 0.1 as NormalizedValue,
            weightedScore: 0.1 as NormalizedValue,
            description: "No faces matched - using default",
          },
        ],
        explanation: "Fallback to default face",
      };
    }

    // Return highest scored face
    // If tied, the first one wins (which will be the one with higher priority rules)
    return scoredFaces[0];
  }

  /**
   * Create the full resolution output
   */
  private createOutput(
    requestId: any,
    face: CardFace,
    isDefaultFace: boolean,
    input: FaceResolutionInput,
    resolutionTimeMs: number,
    rulesEvaluated: number,
    facesConsidered: number,
    confidence: Confidence,
    matchedRules: MatchedRuleExplanation[],
    unmatchedRules: UnmatchedRuleExplanation[],
    alternatives: AlternativeFaceExplanation[] = [],
  ): FaceResolutionOutput {
    // Build scaffolding directives
    const scaffoldingDirectives = this.computeScaffoldingDirectives(
      face,
      input,
    );

    // Build rendering directives
    const renderingDirectives = this.computeRenderingDirectives(face, input);

    // Build explainability
    const explainability = this.buildExplainability(
      face,
      isDefaultFace,
      input,
      matchedRules,
      unmatchedRules,
      alternatives,
    );

    return {
      requestId,
      resolvedAt: now(),
      selectedFace: face,
      selectedFaceId: face.id,
      isDefaultFace,
      scaffoldingDirectives,
      renderingDirectives,
      explainability,
      confidence,
      resolutionTimeMs,
      rulesEvaluated,
      facesConsidered,
    };
  }

  /**
   * Create fallback output when resolution fails
   */
  private createFallbackOutput(
    requestId: any,
    defaultFace: CardFace,
    input: FaceResolutionInput,
    resolutionTimeMs: number,
    errorMessage: string,
  ): FaceResolutionOutput {
    return this.createOutput(
      requestId,
      defaultFace,
      true,
      input,
      resolutionTimeMs,
      0,
      input.availableFaces.length,
      0.1 as Confidence,
      [],
      [],
      [
        {
          faceId: defaultFace.id,
          faceName: defaultFace.name,
          reason: `Fallback due to error: ${errorMessage}`,
          score: 0 as NormalizedValue,
          matchedRuleCount: 0,
          failedRuleCount: 0,
        },
      ],
    );
  }

  /**
   * Compute scaffolding directives based on face and context
   */
  private computeScaffoldingDirectives(
    face: CardFace,
    input: FaceResolutionInput,
  ): ScaffoldingDirectives {
    const baseScaffolding = face.scaffolding;
    let effectiveLevel = baseScaffolding?.level ?? 0;
    let levelAdjustmentReason: string | undefined;

    // Adjust based on LKGC signals
    const signals = input.lkgcSignals;
    if (signals) {
      const adjustments = this.config.scaffoldingAdjustments;

      // Increase scaffolding for high volatility
      if (
        signals.volatility !== undefined &&
        signals.volatility > adjustments.volatilityThreshold
      ) {
        effectiveLevel += adjustments.volatilityScaffoldingBoost;
        levelAdjustmentReason = `Increased due to high volatility (${signals.volatility.toFixed(2)})`;
      }

      // Increase scaffolding for low confidence
      if (
        signals.confidence !== undefined &&
        signals.confidence < adjustments.lowConfidenceThreshold
      ) {
        effectiveLevel += adjustments.lowConfidenceScaffoldingBoost;
        levelAdjustmentReason = levelAdjustmentReason
          ? `${levelAdjustmentReason}; low confidence (${signals.confidence.toFixed(2)})`
          : `Increased due to low confidence (${signals.confidence.toFixed(2)})`;
      }

      // Decrease scaffolding for high mastery
      if (
        input.participation?.contextMastery !== undefined &&
        input.participation.contextMastery > adjustments.highMasteryThreshold
      ) {
        effectiveLevel = Math.max(
          0,
          effectiveLevel - adjustments.highMasteryScaffoldingReduction,
        );
        levelAdjustmentReason = levelAdjustmentReason
          ? `${levelAdjustmentReason}; reduced for high mastery`
          : `Reduced due to high mastery (${input.participation.contextMastery.toFixed(2)})`;
      }
    }

    // Adjust based on user preferences
    if (input.userPreferences?.scaffoldingPreference !== undefined) {
      const prefAdjustment = Math.round(
        (input.userPreferences.scaffoldingPreference - 0.5) * 4,
      );
      effectiveLevel = Math.max(0, effectiveLevel + prefAdjustment);
      if (prefAdjustment !== 0) {
        levelAdjustmentReason = levelAdjustmentReason
          ? `${levelAdjustmentReason}; user preference (${input.userPreferences.scaffoldingPreference.toFixed(2)})`
          : `Adjusted for user preference (${input.userPreferences.scaffoldingPreference.toFixed(2)})`;
      }
    }

    return {
      effectiveLevel,
      levelAdjustmentReason,
      preRevealedHints: [],
      additionalHints: [],
      activePartialTemplates: baseScaffolding?.partialTemplates ?? [],
      autoRevealOnStruggle: baseScaffolding?.autoRevealOnStruggle ?? false,
      autoRevealDelayMs: this.config.scaffoldingAdjustments
        .forgettingRiskAutoRevealEnabled
        ? this.config.scaffoldingAdjustments.forgettingRiskAutoRevealDelayMs
        : undefined,
    };
  }

  /**
   * Compute rendering directives based on face and context
   */
  private computeRenderingDirectives(
    face: CardFace,
    input: FaceResolutionInput,
  ): RenderingDirectives {
    const directives: RenderingDirectives = {
      showContextIndicators:
        this.config.defaultRenderingDirectives.showContextIndicators ?? true,
      contextIndicators: [],
    };

    // Add context indicators
    const indicators: Array<{
      type: "category" | "mode" | "role" | "lkgc" | "custom";
      label: string;
      value?: string;
      icon?: string;
      color?: string;
      tooltip?: string;
    }> = [];

    // Category indicator
    if (input.categoryLens) {
      indicators.push({
        type: "category",
        label: "Category",
        value: input.categoryLens.categoryName,
        tooltip: input.categoryLens.framingQuestion,
      });
    }

    // Mode indicator
    if (input.mode) {
      indicators.push({
        type: "mode",
        label: "Mode",
        value: input.mode.modeName,
        icon:
          input.mode.systemModeType === "exploration"
            ? "🔍"
            : input.mode.systemModeType === "goal_driven"
              ? "🎯"
              : input.mode.systemModeType === "exam_oriented"
                ? "📝"
                : input.mode.systemModeType === "synthesis"
                  ? "🔗"
                  : "📚",
      });
    }

    // Role indicator
    if (input.participation) {
      indicators.push({
        type: "role",
        label: "Role",
        value: String(input.participation.semanticRole),
      });
    }

    // LKGC signal indicators (only for significant signals)
    if (input.lkgcSignals) {
      if (
        input.lkgcSignals.volatility !== undefined &&
        input.lkgcSignals.volatility > 0.7
      ) {
        indicators.push({
          type: "lkgc",
          label: "Volatile",
          value: `${Math.round(input.lkgcSignals.volatility * 100)}%`,
          icon: "⚡",
          color: "#f59e0b",
          tooltip: "High performance variability",
        });
      }
      if (
        input.lkgcSignals.forgettingRisk !== undefined &&
        input.lkgcSignals.forgettingRisk > 0.6
      ) {
        indicators.push({
          type: "lkgc",
          label: "At risk",
          value: `${Math.round(input.lkgcSignals.forgettingRisk * 100)}%`,
          icon: "⚠️",
          color: "#ef4444",
          tooltip: "Higher risk of forgetting",
        });
      }
    }

    (directives as any).contextIndicators = indicators;

    // Time pressure indicator from mode
    if (input.mode?.pressureLevel !== undefined) {
      (directives as any).timePressureLevel = input.mode.pressureLevel;
    }

    return directives;
  }

  /**
   * Build the full explainability payload
   */
  private buildExplainability(
    face: CardFace,
    isDefaultFace: boolean,
    input: FaceResolutionInput,
    matchedRules: MatchedRuleExplanation[],
    unmatchedRules: UnmatchedRuleExplanation[],
    alternatives: AlternativeFaceExplanation[],
  ): FaceResolutionExplainability {
    // Build contributing factors
    const factors: FaceResolutionFactor[] = [];

    // Category factor
    if (input.categoryLens) {
      const categoryMatches = matchedRules.some((r) =>
        r.matchedConditions.some((c) => c.condition.type === "category"),
      );
      factors.push({
        type: "category_match",
        description: `Category: ${input.categoryLens.categoryName}`,
        weight: categoryMatches
          ? (0.8 as NormalizedValue)
          : (0.2 as NormalizedValue),
        actualValue: input.categoryLens.categoryId,
        matched: categoryMatches,
        icon: "📁",
      });
    }

    // Role factor
    if (input.participation) {
      const roleMatches = matchedRules.some((r) =>
        r.matchedConditions.some((c) => c.condition.type === "role"),
      );
      factors.push({
        type: "role_match",
        description: `Role: ${input.participation.semanticRole}`,
        weight: roleMatches
          ? (0.7 as NormalizedValue)
          : (0.2 as NormalizedValue),
        actualValue: input.participation.semanticRole,
        matched: roleMatches,
        icon: "🏷️",
      });
    }

    // Mode factor
    if (input.mode) {
      const modeMatches = matchedRules.some((r) =>
        r.matchedConditions.some((c) => c.condition.type === "mode"),
      );
      factors.push({
        type: "mode_match",
        description: `Mode: ${input.mode.modeName}`,
        weight: modeMatches
          ? (0.7 as NormalizedValue)
          : (0.2 as NormalizedValue),
        actualValue: input.mode.modeId,
        matched: modeMatches,
        icon: "🎮",
      });
    }

    // Depth factor
    if (input.categoryLens?.depthGoal || input.mode?.depthBias) {
      const targetDepth =
        input.categoryLens?.depthGoal || input.mode?.depthBias;
      const depthMatches = matchedRules.some((r) =>
        r.matchedConditions.some((c) => c.condition.type === "depth"),
      );
      factors.push({
        type: "depth_match",
        description: `Depth: ${targetDepth}`,
        weight: depthMatches
          ? (0.6 as NormalizedValue)
          : (0.2 as NormalizedValue),
        actualValue: targetDepth,
        matched: depthMatches,
        icon: "📊",
      });
    }

    // Default fallback factor
    if (isDefaultFace && matchedRules.length === 0) {
      factors.push({
        type: "default_fallback",
        description: "No specific rules matched - using default face",
        weight: 0.1 as NormalizedValue,
        matched: true,
        icon: "🔄",
      });
    }

    // Build summary
    const summary = this.buildSummary(
      face,
      isDefaultFace,
      matchedRules,
      factors,
    );
    const detailedExplanation = this.buildDetailedExplanation(
      face,
      input,
      factors,
      matchedRules,
    );

    // Build resolution context snapshot
    const resolutionContext: ResolutionContextSnapshot = {
      categoryId: input.categoryLens?.categoryId,
      categoryName: input.categoryLens?.categoryName,
      semanticRole: input.participation?.semanticRole
        ? String(input.participation.semanticRole)
        : undefined,
      modeId: input.mode?.modeId,
      modeName: input.mode?.modeName,
      depthGoal: input.categoryLens?.depthGoal,
      learningIntent: input.categoryLens?.learningIntent,
      lkgcSignalsSummary: input.lkgcSignals
        ? `confidence=${input.lkgcSignals.confidence?.toFixed(2) ?? "?"}, volatility=${input.lkgcSignals.volatility?.toFixed(2) ?? "?"}`
        : undefined,
      userPreferencesSummary: input.userPreferences?.preferredDepth
        ? `depth=${input.userPreferences.preferredDepth}`
        : undefined,
      temporalSummary: input.temporalContext
        ? `${input.temporalContext.timeOfDay}, day ${input.temporalContext.dayOfWeek}`
        : undefined,
    };

    return {
      traceId: generateTraceId(),
      summary,
      detailedExplanation,
      contributingFactors: factors,
      matchedRules,
      unmatchedRules,
      alternatives,
      resolutionContext,
    };
  }

  /**
   * Build a human-readable summary
   */
  private buildSummary(
    face: CardFace,
    isDefaultFace: boolean,
    matchedRules: MatchedRuleExplanation[],
    factors: FaceResolutionFactor[],
  ): string {
    if (isDefaultFace && matchedRules.length === 0) {
      return `Showing default face "${face.name}" because no context-specific rules matched.`;
    }

    const matchedFactorTypes = factors
      .filter((f) => f.matched)
      .map((f) => f.type.replace("_match", "").replace("_", " "));

    if (matchedFactorTypes.length > 0) {
      return `Showing "${face.name}" because it matches: ${matchedFactorTypes.join(", ")}.`;
    }

    return `Showing "${face.name}" based on ${matchedRules.length} matching rule(s).`;
  }

  /**
   * Build a detailed human-readable explanation
   */
  private buildDetailedExplanation(
    face: CardFace,
    input: FaceResolutionInput,
    factors: FaceResolutionFactor[],
    matchedRules: MatchedRuleExplanation[],
  ): string {
    const lines: string[] = [];

    lines.push(
      `Selected face: "${face.name}" (${face.faceType}, ${face.depthLevel} depth)`,
    );
    lines.push("");

    if (input.categoryLens) {
      lines.push(`📁 Category: ${input.categoryLens.categoryName}`);
      if (input.categoryLens.framingQuestion) {
        lines.push(
          `   Framing question: "${input.categoryLens.framingQuestion}"`,
        );
      }
    }

    if (input.participation) {
      lines.push(`🏷️ Role: ${input.participation.semanticRole}`);
      lines.push(
        `   Context mastery: ${(input.participation.contextMastery * 100).toFixed(0)}%`,
      );
    }

    if (input.mode) {
      lines.push(`🎮 Mode: ${input.mode.modeName}`);
    }

    if (matchedRules.length > 0) {
      lines.push("");
      lines.push("Matching rules:");
      for (const rule of matchedRules) {
        lines.push(
          `  ✓ ${rule.rule.description} (priority: ${rule.rule.priority})`,
        );
      }
    }

    return lines.join("\n");
  }

  /**
   * Create explanation for a forced face
   */
  private createForcedFaceExplanation(
    faceWithRules: CardFaceWithRules,
  ): MatchedRuleExplanation {
    return {
      rule: {
        id: "forced_selection" as any,
        description: "Face was explicitly requested",
        type: "composite" as any,
        conditions: { operator: "and", conditions: [] },
        priority: 999,
        isActive: true,
        source: "manual",
      },
      matchedConditions: [],
      contributionScore: 1.0 as NormalizedValue,
      summary: `Face "${faceWithRules.face.name}" was explicitly selected via options.forceFaceId`,
    };
  }

  /**
   * Emit an event to listeners
   */
  private emitEvent(event: FaceResolvedEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Event listener error:", error);
      }
    }
  }
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface RuleEvaluationResult {
  faceId: any;
  ruleId: any;
  matched: boolean;
  confidence: Confidence;
  score: NormalizedValue;
  ruleExplanation?: MatchedRuleExplanation;
  failedExplanation?: UnmatchedRuleExplanation;
}

interface RuleEvaluationFullResult {
  matched: boolean;
  confidence: Confidence;
  score: NormalizedValue;
  matchedConditions: ConditionMatchExplanation[];
  failedConditions: ConditionFailureExplanation[];
  summary: string;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new Face Resolution Engine instance
 */
export function createFaceResolutionEngine(
  config?: Partial<FaceResolutionEngineConfig>,
): FaceResolutionEngine {
  return new FaceResolutionEngine(config);
}

// =============================================================================
// INPUT BUILDER
// =============================================================================

/**
 * Mutable version of FaceResolutionInput for the builder
 */
type MutableFaceResolutionInput = {
  -readonly [K in keyof FaceResolutionInput]: FaceResolutionInput[K];
};

/**
 * Builder for creating FaceResolutionInput instances
 */
export class FaceResolutionInputBuilder {
  private input: Partial<MutableFaceResolutionInput> = {};

  constructor(userId: string) {
    (this.input as MutableFaceResolutionInput).userId = userId as any;
    (this.input as MutableFaceResolutionInput).timestamp = now();
    (this.input as MutableFaceResolutionInput).requestId =
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as any;
  }

  forCard(cardId: string): this {
    (this.input as MutableFaceResolutionInput).canonicalCardId = cardId as any;
    return this;
  }

  withFaces(faces: readonly CardFaceWithRules[]): this {
    (this.input as MutableFaceResolutionInput).availableFaces = faces;
    return this;
  }

  withDefaultFace(faceId: string): this {
    (this.input as MutableFaceResolutionInput).defaultFaceId = faceId as any;
    return this;
  }

  inCategory(context: FaceResolutionInput["categoryLens"]): this {
    (this.input as MutableFaceResolutionInput).categoryLens = context;
    return this;
  }

  withParticipation(context: FaceResolutionInput["participation"]): this {
    (this.input as MutableFaceResolutionInput).participation = context;
    return this;
  }

  inMode(context: FaceResolutionInput["mode"]): this {
    (this.input as MutableFaceResolutionInput).mode = context;
    return this;
  }

  withLkgcSignals(signals: FaceResolutionInput["lkgcSignals"]): this {
    (this.input as MutableFaceResolutionInput).lkgcSignals = signals;
    return this;
  }

  withUserPreferences(prefs: FaceResolutionInput["userPreferences"]): this {
    (this.input as MutableFaceResolutionInput).userPreferences = prefs;
    return this;
  }

  withTemporalContext(temporal: FaceResolutionInput["temporalContext"]): this {
    (this.input as MutableFaceResolutionInput).temporalContext = temporal;
    return this;
  }

  withOptions(options: FaceResolutionInput["options"]): this {
    (this.input as MutableFaceResolutionInput).options = options;
    return this;
  }

  build(): FaceResolutionInput {
    if (!this.input.canonicalCardId) {
      throw new Error("canonicalCardId is required");
    }
    if (!this.input.availableFaces || this.input.availableFaces.length === 0) {
      throw new Error("availableFaces must have at least one face");
    }
    if (!this.input.defaultFaceId) {
      throw new Error("defaultFaceId is required");
    }

    return this.input as FaceResolutionInput;
  }
}

/**
 * Create a new input builder
 */
export function buildResolutionInput(
  userId: string,
): FaceResolutionInputBuilder {
  return new FaceResolutionInputBuilder(userId);
}
