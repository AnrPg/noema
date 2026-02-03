// =============================================================================
// PREREQUISITE PATH FEED GENERATOR
// =============================================================================
// Phase 5B: Navigation Feeds per Mode (STRUCTURE)
//
// The Prerequisite Path Feed Generator produces suggestions for foundational
// gaps and prerequisite paths based on:
// 1. Category dependency graph (prepares_for edges)
// 2. User's mastery levels across the prerequisite chain
// 3. Mode-specific parameters (strictness, depth, etc.)
// 4. Blocking analysis (what gaps prevent progress)
//
// This is about CURRICULUM NAVIGATION - showing what needs to come first.
// NOT about review scheduling or interval tuning.
// =============================================================================

import { prisma } from "../config/database.js";
import type {
  PrerequisitePathFeed,
  PrerequisiteNode,
  PrerequisitePath,
  PrerequisiteEdge,
  PrerequisiteGap,
  PrerequisiteSuggestion,
  NavigationFeedRequest,
  PrerequisitePathOptions,
  NavigationFeedMetadata,
  NavigationTarget,
  GapSeverity,
  NormalizedValue,
  Timestamp,
} from "@manthanein/shared";
import type {
  CategoryRecord,
  CategoryRelationRecord,
  UserCategoryMasteryRecord,
  NavigationFeedServiceConfig,
} from "./types.js";
import {
  generateFeedId,
  generateSuggestionId,
  DEFAULT_FEED_SERVICE_CONFIG,
} from "./types.js";

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_PREREQUISITE_OPTIONS: Required<PrerequisitePathOptions> = {
  maxDepth: 3,
  strictnessLevel: 0.7,
  foundationStabilityThreshold: 0.8,
  includeTransitive: true,
  gapSensitivity: 0.5,
};

// =============================================================================
// PREREQUISITE PATH FEED GENERATOR CLASS
// =============================================================================

export class PrerequisitePathFeedGenerator {
  private config: NavigationFeedServiceConfig;

  constructor(config: Partial<NavigationFeedServiceConfig> = {}) {
    this.config = { ...DEFAULT_FEED_SERVICE_CONFIG, ...config };
  }

  // ===========================================================================
  // MAIN GENERATION METHOD
  // ===========================================================================

  /**
   * Generate a prerequisite path feed for the target category
   */
  async generate(
    request: NavigationFeedRequest,
    targetCategoryId: string,
    options?: PrerequisitePathOptions,
  ): Promise<PrerequisitePathFeed> {
    const startTime = Date.now();
    const resolvedOptions = this.resolveOptions(request, options);

    // Verify target exists
    const targetCategory = await this.fetchCategory(targetCategoryId);
    if (!targetCategory) {
      return this.createEmptyFeed(request, targetCategoryId, startTime);
    }

    // Build the prerequisite graph (backwards from target)
    // nodeMap returned for potential future use in path reconstruction
    const {
      nodes,
      edges,
      nodeMap: _nodeMap,
    } = await this.buildPrerequisiteGraph(
      request.userId,
      targetCategoryId,
      resolvedOptions,
    );

    // Fetch user mastery for all nodes
    const mastery = await this.fetchUserMastery(
      request.userId,
      nodes.map((n) => n.categoryId),
    );

    // Enrich nodes with mastery and gap status
    const enrichedNodes = this.enrichNodes(nodes, mastery, resolvedOptions);

    // Detect gaps
    const gaps = this.detectGaps(enrichedNodes, edges, resolvedOptions);

    // Compute paths from foundations to target
    const paths = this.computePaths(enrichedNodes, edges, targetCategoryId);

    // Generate suggestions
    const suggestions = this.generateSuggestions(
      enrichedNodes,
      gaps,
      paths,
      resolvedOptions,
      request,
    );

    const generationTimeMs = Date.now() - startTime;
    return {
      id: generateFeedId(),
      type: "prerequisite_path",
      targetCategoryId,
      allNodes: enrichedNodes,
      paths,
      gaps,
      suggestions: suggestions.slice(0, this.config.maxSuggestionsPerFeed),
      dependencyEdges: edges,
      metadata: this.createMetadata(
        request,
        resolvedOptions,
        suggestions.length,
        generationTimeMs,
      ),
    };
  }

  // ===========================================================================
  // GRAPH BUILDING
  // ===========================================================================

  /**
   * Build the prerequisite graph backwards from the target
   */
  private async buildPrerequisiteGraph(
    userId: string,
    targetId: string,
    options: Required<PrerequisitePathOptions>,
  ): Promise<{
    nodes: PrerequisiteNode[];
    edges: PrerequisiteEdge[];
    nodeMap: Map<string, PrerequisiteNode>;
  }> {
    const nodes: PrerequisiteNode[] = [];
    const edges: PrerequisiteEdge[] = [];
    const nodeMap = new Map<string, PrerequisiteNode>();
    const visited = new Set<string>();

    // BFS backwards from target
    const queue: { categoryId: string; depth: number }[] = [
      { categoryId: targetId, depth: 0 },
    ];

    while (
      queue.length > 0 &&
      nodes.length < this.config.maxNodesPerNeighborhood
    ) {
      const { categoryId, depth } = queue.shift()!;

      if (visited.has(categoryId)) continue;
      if (depth > options.maxDepth) continue;

      visited.add(categoryId);

      // Fetch category
      const category = await this.fetchCategory(categoryId);
      if (!category) continue;

      // Create node
      const node = this.createNode(category, depth);
      nodes.push(node);
      nodeMap.set(categoryId, node);

      // Fetch prerequisites (what prepares_for this category)
      const prereqRelations = await this.fetchPrerequisites(categoryId);

      for (const relation of prereqRelations) {
        // Add edge (using source as "from" since source prepares_for target)
        edges.push({
          fromCategoryId: relation.sourceCategoryId,
          toCategoryId: relation.targetCategoryId,
          dependencyStrength: relation.strength as NormalizedValue,
          dependencyType:
            relation.strength >= 0.8
              ? "hard"
              : relation.strength >= 0.5
                ? "soft"
                : "recommended",
          isSatisfied: false, // Will be updated after mastery enrichment
        });

        // Add prerequisite to queue
        if (
          !visited.has(relation.sourceCategoryId) &&
          (options.includeTransitive || depth === 0)
        ) {
          queue.push({
            categoryId: relation.sourceCategoryId,
            depth: depth + 1,
          });
        }
      }
    }

    return { nodes, edges, nodeMap };
  }

  /**
   * Create a prerequisite node
   */
  private createNode(
    category: CategoryRecord,
    depth: number,
  ): PrerequisiteNode {
    return {
      id: `prereq_${category.id}`,
      categoryId: category.id,
      categoryName: category.name,
      depth,
      isGap: false,
      mastery: 0 as NormalizedValue,
      stability: 0 as NormalizedValue,
      isBlocking: false,
      cardCount: category.cardCount || 0,
      masteredCardCount: 0,
      estimatedTimeMinutes: this.estimateTime(category.cardCount || 0),
    };
  }

  /**
   * Estimate time to complete a category (rough heuristic)
   */
  private estimateTime(cardCount: number): number {
    // Assume ~2 minutes per card for initial learning
    return Math.ceil(cardCount * 2);
  }

  // ===========================================================================
  // NODE ENRICHMENT
  // ===========================================================================

  /**
   * Enrich nodes with mastery data and detect gaps
   */
  private enrichNodes(
    nodes: PrerequisiteNode[],
    mastery: Map<string, UserCategoryMasteryRecord>,
    options: Required<PrerequisitePathOptions>,
  ): PrerequisiteNode[] {
    return nodes.map((node) => {
      const categoryMastery = mastery.get(node.categoryId);
      const masteryLevel = (categoryMastery?.masteryLevel ||
        0) as NormalizedValue;
      const studiedCards = categoryMastery?.studiedCardCount || 0;

      // Compute stability (how stable/reliable is this knowledge)
      const stability = this.computeStability(categoryMastery);

      // Determine if this is a gap
      const isGap = masteryLevel < options.foundationStabilityThreshold;

      // Determine if this is blocking (gap with dependents)
      const isBlocking = isGap && node.depth > 0;

      return {
        ...node,
        mastery: masteryLevel,
        stability,
        masteredCardCount: studiedCards,
        isGap,
        isBlocking,
      };
    });
  }

  /**
   * Compute knowledge stability
   */
  private computeStability(
    mastery: UserCategoryMasteryRecord | undefined,
  ): NormalizedValue {
    if (!mastery) return 0 as NormalizedValue;

    // Stability based on mastery and study coverage
    const masteryContribution = mastery.masteryLevel * 0.6;
    const coverageRatio = Math.min(
      mastery.studiedCardCount / Math.max(mastery.cardCount, 1),
      1,
    );
    const coverageContribution = coverageRatio * 0.4;

    return Math.min(
      1,
      masteryContribution + coverageContribution,
    ) as NormalizedValue;
  }

  // ===========================================================================
  // GAP DETECTION
  // ===========================================================================

  /**
   * Detect gaps in the prerequisite chain
   */
  private detectGaps(
    nodes: PrerequisiteNode[],
    edges: PrerequisiteEdge[],
    options: Required<PrerequisitePathOptions>,
  ): PrerequisiteGap[] {
    const gaps: PrerequisiteGap[] = [];

    // Build dependency map (what depends on what)
    const dependents = new Map<string, string[]>();
    for (const edge of edges) {
      if (!dependents.has(edge.fromCategoryId)) {
        dependents.set(edge.fromCategoryId, []);
      }
      dependents.get(edge.fromCategoryId)!.push(edge.toCategoryId);
    }

    // Find gaps
    for (const node of nodes) {
      if (!node.isGap) continue;

      const blockingTargets = dependents.get(node.categoryId) || [];
      const severity = this.computeGapSeverity(node, blockingTargets, options);
      const priority = this.computeGapPriority(
        node,
        severity,
        blockingTargets.length,
      );

      gaps.push({
        id: `gap_${node.categoryId}`,
        categoryId: node.categoryId,
        categoryName: node.categoryName,
        currentMastery: node.mastery,
        requiredMastery:
          options.foundationStabilityThreshold as NormalizedValue,
        severity,
        blockingTargets: blockingTargets,
        estimatedRemediationMinutes: this.estimateRemediationTime(
          node,
          options,
        ),
        priority: priority as NormalizedValue,
        reason: this.generateGapReason(node, severity, blockingTargets),
      });
    }

    // Sort by priority
    return gaps.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Compute gap severity
   */
  private computeGapSeverity(
    node: PrerequisiteNode,
    blockingTargets: string[],
    options: Required<PrerequisitePathOptions>,
  ): GapSeverity {
    const masteryDeficit = options.foundationStabilityThreshold - node.mastery;
    const blockingCount = blockingTargets.length;

    if (blockingCount >= 3 || (masteryDeficit > 0.5 && blockingCount >= 1)) {
      return "critical";
    }
    if (blockingCount >= 2 || masteryDeficit > 0.4) {
      return "significant";
    }
    if (blockingCount >= 1 || masteryDeficit > 0.2) {
      return "moderate";
    }
    return "minor";
  }

  /**
   * Compute gap priority for ordering
   */
  private computeGapPriority(
    node: PrerequisiteNode,
    severity: GapSeverity,
    blockingCount: number,
  ): number {
    const severityScores: Record<GapSeverity, number> = {
      critical: 1.0,
      significant: 0.75,
      moderate: 0.5,
      minor: 0.25,
    };
    const severityScore = severityScores[severity];

    // Deeper gaps (foundations) are more important to fix
    const depthBonus = Math.min(node.depth / 5, 0.3);

    // More blocking targets = higher priority
    const blockingBonus = Math.min(blockingCount / 5, 0.2);

    return Math.min(1, severityScore + depthBonus + blockingBonus);
  }

  /**
   * Estimate time to remediate a gap
   */
  private estimateRemediationTime(
    node: PrerequisiteNode,
    options: Required<PrerequisitePathOptions>,
  ): number {
    const masteryDeficit = options.foundationStabilityThreshold - node.mastery;
    const cardsToMaster = Math.ceil(node.cardCount * masteryDeficit);
    return cardsToMaster * 2; // ~2 minutes per card
  }

  /**
   * Generate human-readable gap reason
   */
  private generateGapReason(
    node: PrerequisiteNode,
    severity: GapSeverity,
    blockingTargets: string[],
  ): string {
    const masteryPercent = Math.round(node.mastery * 100);

    if (blockingTargets.length === 0) {
      return `"${node.categoryName}" has ${masteryPercent}% mastery - below the foundation threshold`;
    }

    if (severity === "critical") {
      return `Critical gap: "${node.categoryName}" (${masteryPercent}% mastery) blocks ${blockingTargets.length} other areas`;
    }

    return `"${node.categoryName}" (${masteryPercent}% mastery) is a prerequisite that needs strengthening`;
  }

  // ===========================================================================
  // PATH COMPUTATION
  // ===========================================================================

  /**
   * Compute paths from foundations to target
   */
  private computePaths(
    nodes: PrerequisiteNode[],
    edges: PrerequisiteEdge[],
    targetId: string,
  ): PrerequisitePath[] {
    const paths: PrerequisitePath[] = [];
    const nodeMap = new Map(nodes.map((n) => [n.categoryId, n]));

    // Find foundation nodes (nodes with no prerequisites)
    const hasPrerequisite = new Set(edges.map((e) => e.toCategoryId));
    const foundations = nodes.filter(
      (n) => !hasPrerequisite.has(n.categoryId) && n.categoryId !== targetId,
    );

    // Build adjacency list (prereq → dependent)
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjacency.has(edge.fromCategoryId)) {
        adjacency.set(edge.fromCategoryId, []);
      }
      adjacency.get(edge.fromCategoryId)!.push(edge.toCategoryId);
    }

    // DFS from each foundation to target
    for (const foundation of foundations) {
      const foundPaths = this.findPaths(
        foundation.categoryId,
        targetId,
        adjacency,
        nodeMap,
        [],
      );
      paths.push(...foundPaths);
    }

    // If no foundation paths found, create path from immediate prerequisites
    if (paths.length === 0) {
      const immediatePrereqs = edges
        .filter((e) => e.toCategoryId === targetId)
        .map((e) => nodeMap.get(e.fromCategoryId))
        .filter((n): n is PrerequisiteNode => n !== undefined);

      if (immediatePrereqs.length > 0) {
        const targetNode = nodeMap.get(targetId);
        const pathNodes = targetNode
          ? [...immediatePrereqs, targetNode]
          : immediatePrereqs;

        paths.push(this.createPath(pathNodes));
      }
    }

    // Sort paths by criticality (paths with more gaps first)
    return paths.sort(
      (a, b) => b.gapCount - a.gapCount || (a.isCritical ? -1 : 1),
    );
  }

  /**
   * Find all paths from source to target using DFS
   */
  private findPaths(
    currentId: string,
    targetId: string,
    adjacency: Map<string, string[]>,
    nodeMap: Map<string, PrerequisiteNode>,
    currentPath: PrerequisiteNode[],
  ): PrerequisitePath[] {
    const currentNode = nodeMap.get(currentId);
    if (!currentNode) return [];

    const newPath = [...currentPath, currentNode];

    // Reached target
    if (currentId === targetId) {
      return [this.createPath(newPath)];
    }

    // Prevent infinite loops
    if (currentPath.length > this.config.maxPrerequisiteDepth) {
      return [];
    }

    // Explore neighbors
    const neighbors = adjacency.get(currentId) || [];
    const paths: PrerequisitePath[] = [];

    for (const neighborId of neighbors) {
      // Prevent cycles
      if (currentPath.some((n) => n.categoryId === neighborId)) continue;

      const neighborPaths = this.findPaths(
        neighborId,
        targetId,
        adjacency,
        nodeMap,
        newPath,
      );
      paths.push(...neighborPaths);
    }

    return paths;
  }

  /**
   * Create a path from a sequence of nodes
   */
  private createPath(nodes: PrerequisiteNode[]): PrerequisitePath {
    const gapCount = nodes.filter((n) => n.isGap).length;
    const totalCards = nodes.reduce((sum, n) => sum + n.cardCount, 0);
    const masteredCards = nodes.reduce(
      (sum, n) => sum + n.masteredCardCount,
      0,
    );
    const completion = totalCards > 0 ? masteredCards / totalCards : 0;

    // Path is critical if it has multiple gaps or blocks the target
    const isCritical = gapCount >= 2 || nodes.some((n) => n.isBlocking);

    const estimatedTime = nodes
      .filter((n) => n.isGap)
      .reduce((sum, n) => sum + (n.estimatedTimeMinutes || 0), 0);

    return {
      id: `path_${nodes.map((n) => n.categoryId.slice(-4)).join("_")}`,
      nodes,
      gapCount,
      completion: completion as NormalizedValue,
      isCritical,
      estimatedTotalTimeMinutes: estimatedTime,
    };
  }

  // ===========================================================================
  // SUGGESTION GENERATION
  // ===========================================================================

  /**
   * Generate suggestions from gaps and paths
   */
  private generateSuggestions(
    nodes: PrerequisiteNode[],
    gaps: PrerequisiteGap[],
    paths: PrerequisitePath[],
    options: Required<PrerequisitePathOptions>,
    request: NavigationFeedRequest,
  ): PrerequisiteSuggestion[] {
    const suggestions: PrerequisiteSuggestion[] = [];
    const addedCategories = new Set<string>();

    // First, add gap-based suggestions
    for (const gap of gaps) {
      if (addedCategories.has(gap.categoryId)) continue;
      addedCategories.add(gap.categoryId);

      const node = nodes.find((n) => n.categoryId === gap.categoryId);
      if (!node) continue;

      // Determine if this is strictly required based on strictness level
      const isRequired =
        gap.severity === "critical" || options.strictnessLevel >= 0.8;

      suggestions.push({
        id: generateSuggestionId(),
        type: "prerequisite",
        target: {
          type: "category",
          categoryId: gap.categoryId,
        } as NavigationTarget,
        node,
        gap,
        priority: gap.priority,
        reason: gap.reason,
        isRequired,
        unlocks: gap.blockingTargets,
        explainabilityTraceId: request.includeExplainability
          ? `trace_prereq_${gap.categoryId}`
          : undefined,
      });
    }

    // Then, add critical path nodes not yet suggested
    for (const path of paths.filter((p) => p.isCritical)) {
      for (const node of path.nodes) {
        if (addedCategories.has(node.categoryId)) continue;
        if (!node.isGap && node.mastery >= options.foundationStabilityThreshold)
          continue;

        addedCategories.add(node.categoryId);

        suggestions.push({
          id: generateSuggestionId(),
          type: "goal_progress",
          target: {
            type: "category",
            categoryId: node.categoryId,
          } as NavigationTarget,
          node,
          priority: (0.5 + (1 - node.mastery) * 0.3) as NormalizedValue,
          reason: `Part of the critical path to your goal`,
          isRequired: false,
          unlocks: [],
          explainabilityTraceId: request.includeExplainability
            ? `trace_path_${node.categoryId}`
            : undefined,
        });
      }
    }

    // Sort by priority
    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  // ===========================================================================
  // DATABASE QUERIES
  // ===========================================================================

  /**
   * Fetch a category by ID
   */
  private async fetchCategory(
    categoryId: string,
  ): Promise<CategoryRecord | null> {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) return null;

    return {
      id: category.id,
      name: category.name,
      framingQuestion: category.framingQuestion,
      depth: category.depth,
      path: category.path,
      cardCount: category.cardCount, // Use the direct cardCount field
    };
  }

  /**
   * Fetch prerequisites for a category
   * Note: prepares_for relation where target is this category = source prepares_for target
   */
  private async fetchPrerequisites(
    categoryId: string,
  ): Promise<CategoryRelationRecord[]> {
    const relations = await prisma.categoryRelation.findMany({
      where: {
        targetCategoryId: categoryId, // This category is the target
        relationType: "prepares_for",
      },
    });

    return relations.map((r) => ({
      id: r.id,
      sourceCategoryId: r.sourceCategoryId,
      targetCategoryId: r.targetCategoryId,
      relationType: r.relationType,
      strength: r.strength,
      epistemicBridge: r.epistemicBridge,
      isDirectional: r.isDirectional,
    }));
  }

  /**
   * Fetch user mastery for categories
   * Note: Since there's no dedicated userCategoryProgress model, we calculate
   * mastery from CardCategoryParticipation records and Category.masteryScore
   */
  private async fetchUserMastery(
    userId: string,
    categoryIds: string[],
  ): Promise<Map<string, UserCategoryMasteryRecord>> {
    // Get categories with their stats
    const categories = await prisma.category.findMany({
      where: {
        id: { in: categoryIds },
        userId, // User's categories
      },
      select: {
        id: true,
        cardCount: true,
        masteryScore: true,
        lastStudiedAt: true,
      },
    });

    // Get participation counts for studied cards
    const participationCounts = await prisma.cardCategoryParticipation.groupBy({
      by: ["categoryId"],
      where: {
        categoryId: { in: categoryIds },
        card: { userId }, // Filter by card's userId
        contextMastery: { gt: 0 }, // At least some mastery indicates studying
      },
      _count: { _all: true },
      _avg: { contextMastery: true },
    });

    const participationMap = new Map(
      participationCounts.map((p) => [
        p.categoryId,
        { count: p._count._all, avgMastery: p._avg?.contextMastery || 0 },
      ]),
    );

    const map = new Map<string, UserCategoryMasteryRecord>();
    for (const category of categories) {
      const participation = participationMap.get(category.id);
      map.set(category.id, {
        userId,
        categoryId: category.id,
        masteryLevel: participation?.avgMastery || category.masteryScore,
        cardCount: category.cardCount,
        studiedCardCount: participation?.count || 0,
        lastActivityAt: category.lastStudiedAt,
      });
    }

    return map;
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Resolve options with defaults and mode parameters
   */
  private resolveOptions(
    request: NavigationFeedRequest,
    options?: PrerequisitePathOptions,
  ): Required<PrerequisitePathOptions> {
    const modeParams = request.modeParameters || {};
    return {
      maxDepth:
        options?.maxDepth ??
        (modeParams.prerequisite_depth as number) ??
        DEFAULT_PREREQUISITE_OPTIONS.maxDepth,
      strictnessLevel:
        options?.strictnessLevel ??
        (modeParams.strictness_level as number) ??
        DEFAULT_PREREQUISITE_OPTIONS.strictnessLevel,
      foundationStabilityThreshold:
        options?.foundationStabilityThreshold ??
        (modeParams.foundation_stability_threshold as number) ??
        DEFAULT_PREREQUISITE_OPTIONS.foundationStabilityThreshold,
      includeTransitive:
        options?.includeTransitive ??
        DEFAULT_PREREQUISITE_OPTIONS.includeTransitive,
      gapSensitivity:
        options?.gapSensitivity ??
        (modeParams.gap_alert_sensitivity as number) ??
        DEFAULT_PREREQUISITE_OPTIONS.gapSensitivity,
    };
  }

  /**
   * Create empty feed
   */
  private createEmptyFeed(
    request: NavigationFeedRequest,
    targetCategoryId: string,
    startTime: number,
  ): PrerequisitePathFeed {
    const generationTimeMs = Date.now() - startTime;
    return {
      id: generateFeedId(),
      type: "prerequisite_path",
      targetCategoryId,
      allNodes: [],
      paths: [],
      gaps: [],
      suggestions: [],
      dependencyEdges: [],
      metadata: this.createMetadata(
        request,
        DEFAULT_PREREQUISITE_OPTIONS,
        0,
        generationTimeMs,
      ),
    };
  }

  /**
   * Create feed metadata
   */
  private createMetadata(
    request: NavigationFeedRequest,
    options: Required<PrerequisitePathOptions>,
    suggestionCount: number,
    generationTimeMs: number,
  ): NavigationFeedMetadata {
    return {
      modeId: request.modeId,
      parametersUsed: options as Record<string, unknown>,
      generatedAt: Date.now() as Timestamp,
      ttlMs: this.config.cacheTtlMs,
      suggestionCount,
      generationTimeMs,
    };
  }
}
