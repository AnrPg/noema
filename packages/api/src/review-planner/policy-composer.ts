// =============================================================================
// POLICY COMPOSER
// =============================================================================
// Composes multiple review policies into a unified ranking system.
// Executes policies in priority order, aggregates scores, and produces
// ranked candidates with full explainability traces.
//
// This component does NOT modify FSRS/HLR scheduler data - it only
// influences the ORDER in which candidates are presented.
// =============================================================================

import type {
  ReviewPolicy,
  ReviewPolicyId,
  LearningModeId,
  SchedulerCandidateOutput,
  PolicyRankedCandidate,
  PolicyExecutionContext,
  PolicyFactorResult,
  RankingFactor,
  PolicyContribution,
  CandidateRanking,
  PolicyExecutionMetadata,
  PolicyExplainabilitySummary,
  PolicyChainId,
} from "@manthanein/shared";

import type {
  PolicyComposerConfig,
  ProcessingCandidate,
  CompositionResult,
  PolicyExecutionInternalResult,
  RegisteredPolicyEntry,
} from "./types.js";

import {
  DEFAULT_COMPOSER_CONFIG,
  generatePolicyChainId,
  normalizeScore,
  calculateUrgencyLevel,
  getRecommendation,
  calculateConfidence,
  now,
} from "./types.js";

// =============================================================================
// POLICY COMPOSER
// =============================================================================

/**
 * PolicyComposer orchestrates the execution of multiple review policies
 * and combines their outputs into a final ranking.
 *
 * Usage:
 * ```ts
 * const composer = new PolicyComposer();
 * composer.registerPolicy(new BaseUrgencyPolicy());
 * composer.registerPolicy(new ModeModifierPolicy());
 *
 * const result = await composer.compose(candidates, context);
 * const topCandidates = result.rankedCandidates.slice(0, 10);
 * ```
 */
export class PolicyComposer {
  private readonly config: PolicyComposerConfig;
  private readonly policies: Map<ReviewPolicyId, RegisteredPolicyEntry> =
    new Map();
  private readonly policyWeights: Map<ReviewPolicyId, number> = new Map();
  private readonly disabledPolicies: Set<ReviewPolicyId> = new Set();

  constructor(config: Partial<PolicyComposerConfig> = {}) {
    this.config = { ...DEFAULT_COMPOSER_CONFIG, ...config };

    // Initialize default weights
    for (const [policyId, weight] of Object.entries(
      this.config.defaultPolicyWeights,
    )) {
      this.policyWeights.set(policyId as ReviewPolicyId, weight);
    }
  }

  // ===========================================================================
  // POLICY REGISTRATION
  // ===========================================================================

  /**
   * Register a policy with the composer.
   */
  registerPolicy(policy: ReviewPolicy, weight?: number): void {
    const entry: RegisteredPolicyEntry = {
      policy,
      weight: weight ?? this.config.defaultPolicyWeights[policy.id] ?? 1.0,
      enabled: true,
      registeredAt: now(),
    };

    this.policies.set(policy.id, entry);
    this.policyWeights.set(policy.id, entry.weight);
  }

  /**
   * Unregister a policy.
   */
  unregisterPolicy(policyId: ReviewPolicyId): boolean {
    const existed = this.policies.delete(policyId);
    this.policyWeights.delete(policyId);
    this.disabledPolicies.delete(policyId);
    return existed;
  }

  /**
   * Enable or disable a policy.
   */
  setPolicyEnabled(policyId: ReviewPolicyId, enabled: boolean): void {
    if (enabled) {
      this.disabledPolicies.delete(policyId);
    } else {
      this.disabledPolicies.add(policyId);
    }
  }

  /**
   * Update the weight for a policy.
   */
  setPolicyWeight(policyId: ReviewPolicyId, weight: number): void {
    this.policyWeights.set(policyId, weight);
    const entry = this.policies.get(policyId);
    if (entry) {
      // Update the registered entry too
      this.policies.set(policyId, { ...entry, weight });
    }
  }

  /**
   * Get all registered policies.
   */
  getRegisteredPolicies(): ReviewPolicyId[] {
    return Array.from(this.policies.keys());
  }

  /**
   * Get current policy weights.
   */
  getPolicyWeights(): Record<string, number> {
    const weights: Record<string, number> = {};
    for (const [id, weight] of this.policyWeights) {
      weights[id] = weight;
    }
    return weights;
  }

  // ===========================================================================
  // MAIN COMPOSITION
  // ===========================================================================

  /**
   * Compose all registered policies and rank candidates.
   *
   * This is the main entry point for the composition system.
   * It executes each policy in priority order, aggregates their scores,
   * and produces a final ranking with full explainability.
   */
  async compose(
    candidates: readonly SchedulerCandidateOutput[],
    context: PolicyExecutionContext,
  ): Promise<CompositionResult> {
    const startTime = Date.now();
    const chainId = generatePolicyChainId();
    const warnings: string[] = [];

    // 1. Initialize processing candidates
    const processingCandidates =
      this.initializeProcessingCandidates(candidates);

    // 2. Get active policies sorted by priority
    const activePolicies = this.getActivePolicies(
      context.modeRuntimeState.activeModeDefinition.id,
    );

    // 3. Execute each policy
    const policyResults: PolicyExecutionInternalResult[] = [];
    const policyTimings = new Map<ReviewPolicyId, number>();

    for (const entry of activePolicies) {
      const policy = entry.policy;

      // Check if policy can execute
      const validation = policy.canExecute(context);
      if (!validation.canExecute) {
        warnings.push(`Policy ${policy.id} skipped: ${validation.reason}`);
        continue;
      }

      // Execute policy
      const result = await this.executePolicy(
        policy,
        processingCandidates,
        context,
      );
      policyResults.push(result);
      policyTimings.set(policy.id, result.executionTimeMs);

      if (!result.success) {
        warnings.push(`Policy ${policy.id} failed: ${result.error}`);
        if (this.config.fallbackBehavior === "error") {
          throw new Error(`Policy ${policy.id} failed: ${result.error}`);
        }
        continue;
      }

      // Apply factors to processing candidates
      this.applyFactors(processingCandidates, result.factorResult, policy.id);
    }

    // 4. Aggregate scores
    this.aggregateScores(processingCandidates);

    // 5. Normalize scores
    this.normalizeScores(processingCandidates);

    // 6. Build ranked candidates
    const rankedCandidates = this.buildRankedCandidates(
      processingCandidates,
      chainId,
      context,
    );

    // 7. Build metadata
    const metadata = this.buildMetadata(
      chainId,
      context,
      startTime,
      policyResults,
      policyTimings,
      candidates.length,
      rankedCandidates.length,
    );

    // 8. Build explainability summary
    const explainability = this.buildExplainabilitySummary(
      rankedCandidates,
      policyResults,
      context,
    );

    return {
      rankedCandidates,
      metadata,
      explainability,
      warnings,
    };
  }

  // ===========================================================================
  // INTERNAL METHODS
  // ===========================================================================

  /**
   * Initialize processing candidates from scheduler output.
   */
  private initializeProcessingCandidates(
    candidates: readonly SchedulerCandidateOutput[],
  ): ProcessingCandidate[] {
    return candidates.map((candidate) => ({
      cardId: candidate.cardId,
      categoryId: candidate.categoryId,
      original: candidate,
      factors: [],
      policyScores: new Map(),
      totalScore: 0,
    }));
  }

  /**
   * Get active policies for a mode, sorted by composition priority.
   */
  private getActivePolicies(modeId: LearningModeId): RegisteredPolicyEntry[] {
    const entries: RegisteredPolicyEntry[] = [];

    for (const entry of this.policies.values()) {
      // Skip disabled policies
      if (this.disabledPolicies.has(entry.policy.id)) continue;

      // Check if policy applies to this mode
      const applicableModes = entry.policy.applicableModes;
      if (applicableModes.length > 0 && !applicableModes.includes(modeId)) {
        continue;
      }

      entries.push(entry);
    }

    // Sort by composition priority (lower = earlier)
    entries.sort(
      (a, b) => a.policy.compositionPriority - b.policy.compositionPriority,
    );

    return entries;
  }

  /**
   * Execute a single policy with timeout handling.
   */
  private async executePolicy(
    policy: ReviewPolicy,
    candidates: ProcessingCandidate[],
    context: PolicyExecutionContext,
  ): Promise<PolicyExecutionInternalResult> {
    const startTime = Date.now();

    try {
      // Convert processing candidates back to scheduler output for policy
      const schedulerCandidates = candidates.map((c) => c.original);

      // Execute with timeout
      const factorResult = await Promise.race([
        policy.computeFactors(schedulerCandidates, context),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Policy execution timeout")),
            this.config.enableCaching ? 10000 : 5000,
          ),
        ),
      ]);

      return {
        policyId: policy.id,
        factorResult,
        executionTimeMs: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      return {
        policyId: policy.id,
        factorResult: {
          factorsByCandidateId: new Map(),
          metadata: {
            executionTimeMs: Date.now() - startTime,
            candidatesProcessed: 0,
            factorsGenerated: 0,
          },
        },
        executionTimeMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Apply factors from a policy result to processing candidates.
   */
  private applyFactors(
    candidates: ProcessingCandidate[],
    factorResult: PolicyFactorResult,
    policyId: ReviewPolicyId,
  ): void {
    const weight = this.policyWeights.get(policyId) ?? 1.0;

    for (const candidate of candidates) {
      const factors = factorResult.factorsByCandidateId.get(candidate.cardId);
      if (!factors) continue;

      // Add factors to candidate
      candidate.factors.push(...factors);

      // Calculate policy score for this candidate
      const policyScore = factors.reduce((sum, f) => sum + f.contribution, 0);
      candidate.policyScores.set(policyId, policyScore * weight);
    }
  }

  /**
   * Aggregate scores from all policies using the configured strategy.
   */
  private aggregateScores(candidates: ProcessingCandidate[]): void {
    for (const candidate of candidates) {
      const scores = Array.from(candidate.policyScores.values());

      if (scores.length === 0) {
        candidate.totalScore = 0;
        continue;
      }

      switch (this.config.aggregationStrategy) {
        case "weighted_sum":
          candidate.totalScore = scores.reduce((sum, s) => sum + s, 0);
          break;

        case "weighted_product": {
          // Filter out non-positive scores for product
          const positiveScores = scores.filter((s) => s > 0);
          candidate.totalScore =
            positiveScores.length > 0
              ? positiveScores.reduce((prod, s) => prod * s, 1)
              : 0;
          break;
        }

        case "max":
          candidate.totalScore = Math.max(...scores);
          break;

        case "min":
          candidate.totalScore = Math.min(...scores);
          break;

        case "harmonic_mean": {
          const nonZeroScores = scores.filter((s) => s > 0);
          if (nonZeroScores.length === 0) {
            candidate.totalScore = 0;
          } else {
            const sumReciprocals = nonZeroScores.reduce(
              (sum, s) => sum + 1 / s,
              0,
            );
            candidate.totalScore = nonZeroScores.length / sumReciprocals;
          }
          break;
        }

        case "geometric_mean": {
          const positiveScores = scores.filter((s) => s > 0);
          if (positiveScores.length === 0) {
            candidate.totalScore = 0;
          } else {
            const product = positiveScores.reduce((prod, s) => prod * s, 1);
            candidate.totalScore = Math.pow(product, 1 / positiveScores.length);
          }
          break;
        }

        default:
          candidate.totalScore = scores.reduce((sum, s) => sum + s, 0);
      }
    }
  }

  /**
   * Normalize scores using the configured strategy.
   */
  private normalizeScores(candidates: ProcessingCandidate[]): void {
    if (candidates.length === 0) return;

    const scores = candidates.map((c) => c.totalScore);

    switch (this.config.normalizationStrategy) {
      case "none":
        // No normalization
        break;

      case "linear": {
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        if (max > min) {
          for (const candidate of candidates) {
            candidate.totalScore = (candidate.totalScore - min) / (max - min);
          }
        }
        break;
      }

      case "softmax": {
        const maxScore = Math.max(...scores);
        const expScores = scores.map((s) => Math.exp(s - maxScore)); // Subtract max for numerical stability
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        for (let i = 0; i < candidates.length; i++) {
          candidates[i].totalScore = expScores[i] / sumExp;
        }
        break;
      }

      case "rank": {
        // Sort indices by score
        const indices = scores.map((_, i) => i);
        indices.sort((a, b) => scores[b] - scores[a]);
        // Assign rank-based scores (1/(rank+1))
        for (let rank = 0; rank < indices.length; rank++) {
          candidates[indices[rank]].totalScore = 1 / (rank + 1);
        }
        break;
      }

      case "z_score": {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance =
          scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) /
          scores.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0) {
          for (const candidate of candidates) {
            candidate.totalScore = (candidate.totalScore - mean) / stdDev;
            // Convert z-score to 0-1 range using sigmoid-like transformation
            candidate.totalScore = 1 / (1 + Math.exp(-candidate.totalScore));
          }
        }
        break;
      }
    }
  }

  /**
   * Build final ranked candidates with full metadata.
   */
  private buildRankedCandidates(
    candidates: ProcessingCandidate[],
    chainId: PolicyChainId,
    context: PolicyExecutionContext,
  ): PolicyRankedCandidate[] {
    // Sort by total score descending
    const sorted = [...candidates].sort((a, b) => b.totalScore - a.totalScore);

    // Find min/max for normalization
    const scores = sorted.map((c) => c.totalScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    return sorted.map((candidate, index) => {
      const position = index + 1;
      const normalizedPriority = normalizeScore(
        candidate.totalScore,
        minScore,
        maxScore,
      );

      // Determine if there are blocking prerequisites
      const hasBlockingPrerequisites =
        candidate.original.categoryMetadata?.hasUnmetPrerequisites ?? false;

      const urgencyLevel = calculateUrgencyLevel(
        normalizedPriority,
        hasBlockingPrerequisites,
      );
      const recommendation = getRecommendation(
        urgencyLevel,
        context.modeRuntimeState.activeModeDefinition.id,
      );

      // Calculate confidence
      const hasLkgcSignals =
        Object.keys(candidate.original.lkgcSignals).length > 0;
      const hasCategoryMetadata = !!candidate.original.categoryMetadata;
      const confidence = calculateConfidence(
        candidate.factors.length,
        hasLkgcSignals,
        hasCategoryMetadata,
      );

      // Build ranking
      const ranking: CandidateRanking = {
        priorityScore: candidate.totalScore,
        normalizedPriority,
        position,
        urgencyLevel,
        recommendation,
        confidence,
      };

      // Build policy contributions
      const policyContributions: PolicyContribution[] = [];
      for (const [policyId, score] of candidate.policyScores) {
        const entry = this.policies.get(policyId);
        if (!entry) continue;

        const factorIds = candidate.factors
          .filter(
            (f) =>
              f.source === entry.policy.type ||
              this.factorBelongsToPolicy(f, policyId),
          )
          .map((f) => f.id);

        policyContributions.push({
          policyId,
          policyName: entry.policy.name,
          weight: entry.weight,
          contribution: score,
          factorIds,
        });
      }

      return {
        cardId: candidate.cardId,
        participationId: candidate.original.participationId,
        categoryId: candidate.categoryId,
        schedulerData: candidate.original.schedulerData,
        ranking,
        factors: candidate.factors,
        policyContributions,
        processedAt: now(),
        policyChainId: chainId,
      };
    });
  }

  /**
   * Check if a factor belongs to a specific policy.
   */
  private factorBelongsToPolicy(
    factor: RankingFactor,
    policyId: ReviewPolicyId,
  ): boolean {
    // Simple heuristic based on policy ID patterns
    if (policyId.includes("base_urgency") && factor.source === "scheduler")
      return true;
    if (policyId.includes("mode_modifier") && factor.source === "mode_policy")
      return true;
    if (policyId.includes("category_hook") && factor.source === "category_hook")
      return true;
    if (policyId.includes("lkgc_signal") && factor.source === "lkgc_signal")
      return true;
    if (policyId.includes("structural") && factor.source === "structural")
      return true;
    return false;
  }

  /**
   * Build execution metadata.
   */
  private buildMetadata(
    chainId: PolicyChainId,
    context: PolicyExecutionContext,
    startTime: number,
    policyResults: PolicyExecutionInternalResult[],
    policyTimings: Map<ReviewPolicyId, number>,
    totalCandidates: number,
    includedCandidates: number,
  ): PolicyExecutionMetadata {
    return {
      policyChainId: chainId,
      modeId: context.modeRuntimeState.activeModeDefinition.id,
      executedAt: now(),
      totalExecutionTimeMs: Date.now() - startTime,
      policiesExecuted: policyResults.filter((r) => r.success).length,
      candidatesProcessed: totalCandidates,
      candidatesIncluded: includedCandidates,
      candidatesExcluded: totalCandidates - includedCandidates,
      policyTimings,
    };
  }

  /**
   * Build explainability summary.
   */
  private buildExplainabilitySummary(
    candidates: PolicyRankedCandidate[],
    policyResults: PolicyExecutionInternalResult[],
    context: PolicyExecutionContext,
  ): PolicyExplainabilitySummary {
    // Collect all factors
    const allFactors = candidates.flatMap((c) => c.factors);

    // Group factors by name and calculate averages
    const factorStats = new Map<string, { total: number; count: number }>();
    for (const factor of allFactors) {
      const existing = factorStats.get(factor.name) ?? { total: 0, count: 0 };
      existing.total += factor.contribution;
      existing.count++;
      factorStats.set(factor.name, existing);
    }

    // Sort by average contribution
    const topFactors = Array.from(factorStats.entries())
      .map(([name, stats]) => ({
        factorName: name,
        averageContribution: stats.total / stats.count,
        affectedCandidates: stats.count,
      }))
      .sort(
        (a, b) =>
          Math.abs(b.averageContribution) - Math.abs(a.averageContribution),
      )
      .slice(0, 5);

    // Generate descriptions
    const modeId = context.modeRuntimeState.activeModeDefinition.id;
    const modeInfluence = this.describeModeInfluence(modeId);
    const categoryHookInfluence =
      this.describeCategoryHookInfluence(allFactors);
    const lkgcInfluence = this.describeLkgcInfluence(allFactors);

    // Generate recommendations
    const userRecommendations = this.generateRecommendations(
      candidates,
      context,
    );

    return {
      strategyDescription: `Ranking computed using ${this.config.aggregationStrategy} aggregation with ${this.config.normalizationStrategy} normalization. ${policyResults.filter((r) => r.success).length} policies contributed to the ranking.`,
      topFactors,
      modeInfluence,
      categoryHookInfluence,
      lkgcInfluence,
      userRecommendations,
    };
  }

  /**
   * Describe mode influence on ranking.
   */
  private describeModeInfluence(modeId: LearningModeId): string {
    const modeDescriptions: Record<string, string> = {
      "system:exploration":
        "Exploration mode reduces urgency pressure and encourages novel content discovery.",
      "system:exam_oriented":
        "Exam mode prioritizes coverage breadth and deadline-based urgency.",
      "system:goal_driven":
        "Goal-driven mode emphasizes prerequisites and structured learning paths.",
      "system:synthesis":
        "Synthesis mode encourages connections between concepts and cross-domain learning.",
    };

    return (
      modeDescriptions[modeId] ??
      "Standard mode balances urgency with learning objectives."
    );
  }

  /**
   * Describe category hook influence.
   */
  private describeCategoryHookInfluence(factors: RankingFactor[]): string {
    const categoryFactors = factors.filter((f) => f.source === "category_hook");
    if (categoryFactors.length === 0) {
      return "No category-specific adjustments were applied.";
    }

    const avgContribution =
      categoryFactors.reduce((sum, f) => sum + f.contribution, 0) /
      categoryFactors.length;

    if (avgContribution > 0.1) {
      return "Category metadata significantly boosted priority for difficult or strategic categories.";
    } else if (avgContribution < -0.1) {
      return "Category metadata reduced priority for well-mastered or low-priority categories.";
    }
    return "Category metadata had moderate influence on candidate ranking.";
  }

  /**
   * Describe LKGC signal influence.
   */
  private describeLkgcInfluence(factors: RankingFactor[]): string {
    const lkgcFactors = factors.filter((f) => f.source === "lkgc_signal");
    if (lkgcFactors.length === 0) {
      return "No LKGC signals were used in ranking.";
    }

    const signalTypes = new Set(
      lkgcFactors.map((f) => f.lkgcSignal).filter(Boolean),
    );
    return `LKGC signals (${Array.from(signalTypes).join(", ")}) influenced ranking based on metacognitive state.`;
  }

  /**
   * Generate user-facing recommendations.
   */
  private generateRecommendations(
    candidates: PolicyRankedCandidate[],
    context: PolicyExecutionContext,
  ): string[] {
    const recommendations: string[] = [];

    // Check for critical urgency items
    const criticalCount = candidates.filter(
      (c) => c.ranking.urgencyLevel === "critical",
    ).length;
    if (criticalCount > 0) {
      recommendations.push(
        `${criticalCount} card(s) are at critical urgency - prioritize reviewing these to prevent forgetting.`,
      );
    }

    // Check for blocked items
    const blockedCount = candidates.filter(
      (c) => c.ranking.urgencyLevel === "blocked",
    ).length;
    if (blockedCount > 0) {
      recommendations.push(
        `${blockedCount} card(s) are blocked by prerequisites - consider reviewing foundational material first.`,
      );
    }

    // Check time budget
    if (context.timeBudget) {
      const estimatedCardsPerMinute = 2; // Rough estimate
      const budgetMinutes = context.timeBudget / (1000 * 60);
      const recommendedCards = Math.floor(
        budgetMinutes * estimatedCardsPerMinute,
      );
      recommendations.push(
        `Based on your ${budgetMinutes} minute time budget, we recommend reviewing approximately ${recommendedCards} cards.`,
      );
    }

    // Default recommendation
    if (recommendations.length === 0) {
      recommendations.push(
        "Review the top-ranked cards to maintain optimal memory retention.",
      );
    }

    return recommendations;
  }
}
