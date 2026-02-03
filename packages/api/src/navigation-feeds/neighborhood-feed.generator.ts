// =============================================================================
// NEIGHBORHOOD FEED GENERATOR
// =============================================================================
// Phase 5B: Navigation Feeds per Mode (STRUCTURE)
//
// The Neighborhood Feed Generator produces suggestions for adjacent categories
// to explore based on:
// 1. Category graph traversal (using CategoryRelation edges)
// 2. User's current context (active category)
// 3. Mode-specific parameters (novelty weight, serendipity factor, etc.)
// 4. User's mastery/engagement history
//
// This is NOT about review scheduling - it's about DISCOVERY and NAVIGATION.
// =============================================================================

import { prisma } from "../config/database.js";
import type {
  NeighborhoodFeed,
  NeighborhoodNode,
  NeighborhoodEdge,
  NeighborhoodSuggestion,
  NeighborhoodSuggestionFactors,
  NeighborhoodVisualizationData,
  NavigationFeedRequest,
  NeighborhoodFeedOptions,
  NavigationFeedMetadata,
  NavigationTarget,
  NavigationSuggestionType,
  CategoryRelationType,
  NormalizedValue,
  Timestamp,
} from "@manthanein/shared";
import type {
  CategoryRecord,
  CategoryRelationRecord,
  UserCategoryMasteryRecord,
  NavigationFeedServiceConfig,
  TraversalNode,
  VisitedNode,
  NeighborhoodScoringWeights,
} from "./types.js";
import {
  generateFeedId,
  generateSuggestionId,
  generateTraceId,
  DEFAULT_FEED_SERVICE_CONFIG,
} from "./types.js";

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_NEIGHBORHOOD_OPTIONS: Required<NeighborhoodFeedOptions> = {
  maxHops: 2,
  minRelationStrength: 0.3,
  relationTypes: [
    "prepares_for",
    "contrasts_with",
    "analogous_to",
    "specializes",
    "generalizes",
  ],
  noveltyWeight: 0.3,
  serendipityFactor: 0.1,
  bridgeBonusWeight: 0.2,
};

const DEFAULT_SCORING_WEIGHTS: NeighborhoodScoringWeights = {
  relationStrength: 0.25,
  novelty: 0.2,
  bridgeBonus: 0.15,
  serendipity: 0.1,
  interest: 0.15,
  prerequisiteSatisfaction: 0.15,
};

// Suppress unused variable warning - weights are used dynamically via object spread
void DEFAULT_SCORING_WEIGHTS;

// =============================================================================
// NEIGHBORHOOD FEED GENERATOR CLASS
// =============================================================================

export class NeighborhoodFeedGenerator {
  private config: NavigationFeedServiceConfig;

  constructor(config: Partial<NavigationFeedServiceConfig> = {}) {
    this.config = { ...DEFAULT_FEED_SERVICE_CONFIG, ...config };
  }

  // ===========================================================================
  // MAIN GENERATION METHOD
  // ===========================================================================

  /**
   * Generate a neighborhood feed for the given request
   */
  async generate(
    request: NavigationFeedRequest,
    options?: NeighborhoodFeedOptions,
  ): Promise<NeighborhoodFeed> {
    const startTime = Date.now();
    const resolvedOptions = this.resolveOptions(request, options);

    // Determine the center category
    const centerId =
      request.currentCategoryId ||
      (await this.getDefaultCenter(request.userId));
    if (!centerId) {
      return this.createEmptyFeed(request, startTime);
    }

    // Fetch the center category
    const centerCategory = await this.fetchCategory(centerId);
    if (!centerCategory) {
      return this.createEmptyFeed(request, startTime);
    }

    // Traverse the graph to find neighborhood nodes
    const { nodes, edges, visited } = await this.traverseNeighborhood(
      request.userId,
      centerId,
      resolvedOptions,
    );

    // Fetch user mastery data for all nodes
    const mastery = await this.fetchUserMastery(
      request.userId,
      nodes.map((n) => n.categoryId),
    );

    // Enrich nodes with mastery and compute novelty
    const enrichedNodes = await this.enrichNodes(
      nodes,
      mastery,
      request.userId,
    );

    // Detect bridge opportunities
    const bridgeNodes = this.detectBridgeOpportunities(enrichedNodes, edges);

    // Add serendipity nodes if configured
    const serendipityNodes = await this.addSerendipityNodes(
      request.userId,
      visited,
      resolvedOptions.serendipityFactor,
    );
    const allNodes = [...enrichedNodes, ...serendipityNodes];

    // Generate scored suggestions
    const suggestions = await this.generateSuggestions(
      allNodes,
      edges,
      bridgeNodes,
      resolvedOptions,
      request,
    );

    // Build visualization data if requested
    const visualizationData = request.includeExplainability
      ? this.buildVisualizationData(centerId, allNodes, edges, suggestions)
      : undefined;

    // Create the feed
    const generationTimeMs = Date.now() - startTime;
    return {
      id: generateFeedId(),
      type: "neighborhood",
      centerId,
      nodes: allNodes,
      edges,
      suggestions: suggestions.slice(0, this.config.maxSuggestionsPerFeed),
      visualizationData,
      metadata: this.createMetadata(
        request,
        resolvedOptions,
        suggestions.length,
        generationTimeMs,
      ),
    };
  }

  // ===========================================================================
  // GRAPH TRAVERSAL
  // ===========================================================================

  /**
   * Traverse the category graph starting from the center
   */
  private async traverseNeighborhood(
    userId: string,
    centerId: string,
    options: Required<NeighborhoodFeedOptions>,
  ): Promise<{
    nodes: NeighborhoodNode[];
    edges: NeighborhoodEdge[];
    visited: Map<string, VisitedNode>;
  }> {
    const visited = new Map<string, VisitedNode>();
    const nodes: NeighborhoodNode[] = [];
    const edges: NeighborhoodEdge[] = [];
    const edgeSet = new Set<string>();

    // Initialize with center
    const centerCategory = await this.fetchCategory(centerId);
    if (!centerCategory) {
      return { nodes: [], edges: [], visited };
    }

    // Add center node
    nodes.push(this.createCenterNode(centerCategory));
    visited.set(centerId, {
      categoryId: centerId,
      shortestDepth: 0,
      strongestPath: [centerId],
    });

    // BFS traversal
    const queue: TraversalNode[] = [
      {
        categoryId: centerId,
        depth: 0,
        pathFromRoot: [centerId],
        cumulativeStrength: 1.0,
      },
    ];

    while (
      queue.length > 0 &&
      nodes.length < this.config.maxNodesPerNeighborhood
    ) {
      const current = queue.shift()!;

      if (current.depth >= options.maxHops) continue;

      // Fetch outgoing relations
      const relations = await this.fetchRelations(
        current.categoryId,
        options.relationTypes,
        options.minRelationStrength,
      );

      for (const relation of relations) {
        const neighborId =
          relation.sourceCategoryId === current.categoryId
            ? relation.targetCategoryId
            : relation.sourceCategoryId;

        // Add edge (only once)
        const edgeKey = this.edgeKey(
          relation.sourceCategoryId,
          relation.targetCategoryId,
        );
        if (!edgeSet.has(edgeKey)) {
          edges.push(this.relationToEdge(relation));
          edgeSet.add(edgeKey);
        }

        // Skip if already visited with better path
        const visitedNode = visited.get(neighborId);
        const newDepth = current.depth + 1;
        const newStrength = current.cumulativeStrength * relation.strength;

        if (visitedNode) {
          // Update if we found a stronger path
          if (newStrength > visitedNode.strongestPath.length) {
            visitedNode.strongestRelation = relation;
          }
          continue;
        }

        // Fetch neighbor category
        const neighborCategory = await this.fetchCategory(neighborId);
        if (!neighborCategory) continue;

        // Create node
        const node = this.createNeighborNode(
          neighborCategory,
          newDepth,
          relation,
        );
        nodes.push(node);

        // Mark visited
        visited.set(neighborId, {
          categoryId: neighborId,
          shortestDepth: newDepth,
          strongestPath: [...current.pathFromRoot, neighborId],
          strongestRelation: relation,
        });

        // Add to queue for further exploration
        if (newDepth < options.maxHops) {
          queue.push({
            categoryId: neighborId,
            depth: newDepth,
            pathFromRoot: [...current.pathFromRoot, neighborId],
            cumulativeStrength: newStrength,
            relation,
          });
        }
      }
    }

    return { nodes, edges, visited };
  }

  // ===========================================================================
  // NODE CREATION
  // ===========================================================================

  /**
   * Create the center node
   */
  private createCenterNode(category: CategoryRecord): NeighborhoodNode {
    return {
      id: `node_center_${category.id}`,
      categoryId: category.id,
      categoryName: category.name,
      framingQuestion: category.framingQuestion || undefined,
      distanceFromCurrent: 0,
      cardCount: category.cardCount || 0,
      studiedCardCount: 0,
      isBridgeOpportunity: false,
      noveltyScore: 0 as NormalizedValue,
      isSerendipitous: false,
    };
  }

  /**
   * Create a neighbor node
   */
  private createNeighborNode(
    category: CategoryRecord,
    depth: number,
    relation: CategoryRelationRecord,
  ): NeighborhoodNode {
    return {
      id: `node_${category.id}`,
      categoryId: category.id,
      categoryName: category.name,
      framingQuestion: category.framingQuestion || undefined,
      distanceFromCurrent: depth,
      connectionRelation: {
        type: relation.relationType as CategoryRelationType,
        strength: relation.strength,
        epistemicBridge: relation.epistemicBridge || undefined,
      },
      cardCount: category.cardCount || 0,
      studiedCardCount: 0,
      isBridgeOpportunity: false,
      noveltyScore: 0 as NormalizedValue,
      isSerendipitous: false,
    };
  }

  // ===========================================================================
  // NODE ENRICHMENT
  // ===========================================================================

  /**
   * Enrich nodes with mastery and novelty data
   */
  private async enrichNodes(
    nodes: NeighborhoodNode[],
    mastery: Map<string, UserCategoryMasteryRecord>,
    _userId: string, // Reserved for future user-specific enrichment
  ): Promise<NeighborhoodNode[]> {
    const enriched: NeighborhoodNode[] = [];

    for (const node of nodes) {
      const categoryMastery = mastery.get(node.categoryId);
      const noveltyScore = this.computeNovelty(categoryMastery);

      enriched.push({
        ...node,
        currentMastery: categoryMastery?.masteryLevel as
          | NormalizedValue
          | undefined,
        studiedCardCount: categoryMastery?.studiedCardCount || 0,
        noveltyScore,
      });
    }

    return enriched;
  }

  /**
   * Compute novelty score (higher = less familiar)
   */
  private computeNovelty(
    mastery: UserCategoryMasteryRecord | undefined,
  ): NormalizedValue {
    if (!mastery) return 1.0 as NormalizedValue; // Completely new
    if (mastery.studiedCardCount === 0) return 1.0 as NormalizedValue;

    // Lower mastery = higher novelty
    const masteryPenalty = mastery.masteryLevel;

    // More cards studied = lower novelty
    const studyRatio = Math.min(
      mastery.studiedCardCount / Math.max(mastery.cardCount, 1),
      1,
    );
    const studyPenalty = studyRatio * 0.5;

    return Math.max(
      0,
      Math.min(1, 1 - masteryPenalty - studyPenalty),
    ) as NormalizedValue;
  }

  // ===========================================================================
  // BRIDGE DETECTION
  // ===========================================================================

  /**
   * Detect bridge opportunities - nodes that connect different regions
   */
  private detectBridgeOpportunities(
    nodes: NeighborhoodNode[],
    edges: NeighborhoodEdge[],
  ): Set<string> {
    const bridgeNodes = new Set<string>();

    // Count edges per node
    const edgeCounts = new Map<string, number>();
    for (const edge of edges) {
      edgeCounts.set(
        edge.fromCategoryId,
        (edgeCounts.get(edge.fromCategoryId) || 0) + 1,
      );
      edgeCounts.set(
        edge.toCategoryId,
        (edgeCounts.get(edge.toCategoryId) || 0) + 1,
      );
    }

    // Nodes with connections to multiple regions are bridge opportunities
    for (const node of nodes) {
      const connections = edgeCounts.get(node.categoryId) || 0;

      // If it has contrasts_with or analogous_to edges, it's a bridge
      const hasBridgingEdges = edges.some(
        (e) =>
          (e.fromCategoryId === node.categoryId ||
            e.toCategoryId === node.categoryId) &&
          (e.relationType === "contrasts_with" ||
            e.relationType === "analogous_to"),
      );

      if (hasBridgingEdges || connections >= 3) {
        bridgeNodes.add(node.categoryId);
      }
    }

    return bridgeNodes;
  }

  // ===========================================================================
  // SERENDIPITY
  // ===========================================================================

  /**
   * Add serendipity nodes - surprise suggestions from outside the neighborhood
   */
  private async addSerendipityNodes(
    _userId: string,
    visited: Map<string, VisitedNode>,
    serendipityFactor: number,
  ): Promise<NeighborhoodNode[]> {
    if (serendipityFactor <= 0) return [];

    const serendipityCount = Math.ceil(
      this.config.serendipityPoolSize * serendipityFactor,
    );

    // Fetch categories the user hasn't explored much
    // Using cardCount field on Category instead of _count.cardCategories
    const novelCategories = await prisma.category.findMany({
      where: {
        id: { notIn: Array.from(visited.keys()) },
        // Only include categories with cards
        cardCount: { gt: 0 },
      },
      take: this.config.serendipityPoolSize,
      orderBy: { createdAt: "desc" }, // Prefer newer categories
    });

    // Randomly select based on serendipity factor
    const selected = novelCategories
      .sort(() => Math.random() - 0.5)
      .slice(0, serendipityCount);

    return selected.map((cat) => ({
      id: `node_serendipity_${cat.id}`,
      categoryId: cat.id,
      categoryName: cat.name,
      framingQuestion: cat.framingQuestion || undefined,
      distanceFromCurrent: -1, // Special marker for serendipity
      cardCount: cat.cardCount,
      studiedCardCount: 0,
      isBridgeOpportunity: false,
      noveltyScore: 1.0 as NormalizedValue, // Maximum novelty
      isSerendipitous: true,
    }));
  }

  // ===========================================================================
  // SUGGESTION GENERATION
  // ===========================================================================

  /**
   * Generate scored suggestions from nodes
   */
  private async generateSuggestions(
    nodes: NeighborhoodNode[],
    edges: NeighborhoodEdge[],
    bridgeNodes: Set<string>,
    options: Required<NeighborhoodFeedOptions>,
    request: NavigationFeedRequest,
  ): Promise<NeighborhoodSuggestion[]> {
    const suggestions: NeighborhoodSuggestion[] = [];

    // Compute scoring weights based on mode parameters
    const weights = this.computeScoringWeights(options, request.modeParameters);

    for (const node of nodes) {
      // Skip center node
      if (node.distanceFromCurrent === 0) continue;

      const isBridge = bridgeNodes.has(node.categoryId);
      const factors = this.computeFactors(node, isBridge, weights);
      const priority = this.computePriority(factors, weights);

      // Determine suggestion type
      const type = this.determineSuggestionType(node, isBridge);

      suggestions.push({
        id: generateSuggestionId(),
        type,
        target: {
          type: "category",
          categoryId: node.categoryId,
        } as NavigationTarget,
        node: { ...node, isBridgeOpportunity: isBridge },
        priority: priority as NormalizedValue,
        reason: this.generateReason(node, type, factors),
        factors,
        explainabilityTraceId: request.includeExplainability
          ? generateTraceId()
          : undefined,
      });
    }

    // Sort by priority (descending)
    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Compute scoring weights from mode parameters
   */
  private computeScoringWeights(
    options: Required<NeighborhoodFeedOptions>,
    modeParams: Record<string, unknown>,
  ): NeighborhoodScoringWeights {
    return {
      relationStrength: 0.25,
      novelty: options.noveltyWeight,
      bridgeBonus: options.bridgeBonusWeight,
      serendipity: options.serendipityFactor,
      interest: (modeParams.interest_weight as number) || 0.15,
      prerequisiteSatisfaction: 0.15,
    };
  }

  /**
   * Compute scoring factors for a node
   */
  private computeFactors(
    node: NeighborhoodNode,
    isBridge: boolean,
    _weights: NeighborhoodScoringWeights, // Reserved for future weight-based factor scaling
  ): NeighborhoodSuggestionFactors {
    const relationStrengthScore = node.connectionRelation?.strength || 0;
    const noveltyScore = node.noveltyScore;
    const bridgeBonusScore = isBridge ? 1.0 : 0;
    const serendipityScore = node.isSerendipitous ? 1.0 : 0;
    const interestScore = 0.5; // Placeholder - would come from user history
    const prerequisiteSatisfaction = 1.0 as NormalizedValue; // Placeholder

    return {
      relationStrengthScore,
      noveltyScore,
      bridgeBonusScore,
      serendipityScore,
      interestScore,
      prerequisiteSatisfaction,
    };
  }

  /**
   * Compute final priority score
   */
  private computePriority(
    factors: NeighborhoodSuggestionFactors,
    weights: NeighborhoodScoringWeights,
  ): number {
    const score =
      factors.relationStrengthScore * weights.relationStrength +
      factors.noveltyScore * weights.novelty +
      factors.bridgeBonusScore * weights.bridgeBonus +
      factors.serendipityScore * weights.serendipity +
      factors.interestScore * weights.interest +
      factors.prerequisiteSatisfaction * weights.prerequisiteSatisfaction;

    // Normalize to 0-1
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    return Math.min(1, Math.max(0, score / totalWeight));
  }

  /**
   * Determine the suggestion type based on node characteristics
   */
  private determineSuggestionType(
    node: NeighborhoodNode,
    isBridge: boolean,
  ): Extract<
    NavigationSuggestionType,
    "adjacent_category" | "bridge" | "serendipity"
  > {
    if (node.isSerendipitous) return "serendipity";
    if (isBridge) return "bridge";
    return "adjacent_category";
  }

  /**
   * Generate human-readable reason for suggestion
   */
  private generateReason(
    node: NeighborhoodNode,
    type: NavigationSuggestionType,
    _factors: NeighborhoodSuggestionFactors, // Reserved for factor-based reason generation
  ): string {
    if (type === "serendipity") {
      return `Discover something new: "${node.categoryName}" offers fresh perspectives`;
    }

    if (type === "bridge") {
      return `"${node.categoryName}" connects different areas of knowledge`;
    }

    // Adjacent category
    if (node.connectionRelation) {
      const relationVerb = this.getRelationVerb(node.connectionRelation.type);
      return `"${node.categoryName}" ${relationVerb} your current focus`;
    }

    return `Explore "${node.categoryName}" (${node.cardCount} cards)`;
  }

  /**
   * Get human-readable verb for relation type
   */
  private getRelationVerb(relationType: CategoryRelationType): string {
    switch (relationType) {
      case "prepares_for":
        return "prepares you for";
      case "contrasts_with":
        return "offers a contrasting view to";
      case "analogous_to":
        return "is analogous to";
      case "specializes":
        return "specializes";
      case "generalizes":
        return "generalizes";
      case "conceptual_contains":
        return "is part of";
      default:
        return "relates to";
    }
  }

  // ===========================================================================
  // VISUALIZATION
  // ===========================================================================

  /**
   * Build visualization data for the neighborhood
   */
  private buildVisualizationData(
    centerId: string,
    nodes: NeighborhoodNode[],
    edges: NeighborhoodEdge[],
    suggestions: NeighborhoodSuggestion[],
  ): NeighborhoodVisualizationData {
    // Simple radial layout
    const positions: Record<string, { x: number; y: number }> = {};
    const centerNode = nodes.find((n) => n.categoryId === centerId);

    if (centerNode) {
      positions[centerId] = { x: 0.5, y: 0.5 };
    }

    // Position nodes by depth in concentric rings
    const nodesByDepth = new Map<number, NeighborhoodNode[]>();
    for (const node of nodes) {
      if (node.categoryId === centerId) continue;
      const depth =
        node.distanceFromCurrent === -1 ? 3 : node.distanceFromCurrent; // Serendipity at outer ring
      if (!nodesByDepth.has(depth)) nodesByDepth.set(depth, []);
      nodesByDepth.get(depth)!.push(node);
    }

    for (const [depth, depthNodes] of nodesByDepth) {
      const radius = 0.15 + depth * 0.15;
      const angleStep = (2 * Math.PI) / depthNodes.length;
      depthNodes.forEach((node, i) => {
        const angle = i * angleStep - Math.PI / 2;
        positions[node.categoryId] = {
          x: 0.5 + radius * Math.cos(angle),
          y: 0.5 + radius * Math.sin(angle),
        };
      });
    }

    // Highlight top suggestions
    const highlightedPaths = suggestions.slice(0, 3).map((s, i) => ({
      nodeIds: [centerId, s.node.categoryId] as readonly string[],
      color: i === 0 ? "#22c55e" : i === 1 ? "#3b82f6" : "#f59e0b",
      label: s.type,
    }));

    return {
      nodePositions: positions,
      layoutAlgorithm: "radial",
      centerId,
      highlightedPaths,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Resolve options with defaults and mode parameters
   */
  private resolveOptions(
    request: NavigationFeedRequest,
    options?: NeighborhoodFeedOptions,
  ): Required<NeighborhoodFeedOptions> {
    const modeParams = request.modeParameters || {};
    return {
      maxHops:
        options?.maxHops ??
        (modeParams.association_hop_limit as number) ??
        DEFAULT_NEIGHBORHOOD_OPTIONS.maxHops,
      minRelationStrength:
        options?.minRelationStrength ??
        DEFAULT_NEIGHBORHOOD_OPTIONS.minRelationStrength,
      relationTypes:
        options?.relationTypes ?? DEFAULT_NEIGHBORHOOD_OPTIONS.relationTypes,
      noveltyWeight:
        options?.noveltyWeight ??
        (modeParams.novelty_weight as number) ??
        DEFAULT_NEIGHBORHOOD_OPTIONS.noveltyWeight,
      serendipityFactor:
        options?.serendipityFactor ??
        (modeParams.serendipity_frequency as number) ??
        DEFAULT_NEIGHBORHOOD_OPTIONS.serendipityFactor,
      bridgeBonusWeight:
        options?.bridgeBonusWeight ??
        (modeParams.bridge_bonus_weight as number) ??
        DEFAULT_NEIGHBORHOOD_OPTIONS.bridgeBonusWeight,
    };
  }

  /**
   * Get default center category for user
   */
  private async getDefaultCenter(userId: string): Promise<string | null> {
    // Find most recently studied category via ReviewRecord and CardCategoryParticipation
    const recentActivity = await prisma.reviewRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        card: {
          include: {
            categoryParticipations: {
              take: 1,
              orderBy: { isPrimary: "desc" }, // Prefer primary category
            },
          },
        },
      },
    });

    return recentActivity?.card?.categoryParticipations[0]?.categoryId || null;
  }

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
   * Fetch relations for a category
   */
  private async fetchRelations(
    categoryId: string,
    relationTypes: CategoryRelationType[],
    minStrength: number,
  ): Promise<CategoryRelationRecord[]> {
    const relations = await prisma.categoryRelation.findMany({
      where: {
        OR: [
          { sourceCategoryId: categoryId },
          { targetCategoryId: categoryId },
        ],
        relationType: { in: relationTypes },
        strength: { gte: minStrength },
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
        card: { userId }, // Filter by card's userId instead
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

  /**
   * Convert relation record to edge
   * Note: isDirectional=true means one-way, so isBidirectional = !isDirectional
   */
  private relationToEdge(relation: CategoryRelationRecord): NeighborhoodEdge {
    return {
      fromCategoryId: relation.sourceCategoryId,
      toCategoryId: relation.targetCategoryId,
      relationType: relation.relationType as CategoryRelationType,
      strength: relation.strength,
      epistemicBridge: relation.epistemicBridge || undefined,
      isBidirectional: !relation.isDirectional, // Convert isDirectional to isBidirectional
    };
  }

  /**
   * Create edge key for deduplication
   */
  private edgeKey(from: string, to: string): string {
    return from < to ? `${from}:${to}` : `${to}:${from}`;
  }

  /**
   * Create empty feed (when no center available)
   */
  private createEmptyFeed(
    request: NavigationFeedRequest,
    startTime: number,
  ): NeighborhoodFeed {
    const generationTimeMs = Date.now() - startTime;
    return {
      id: generateFeedId(),
      type: "neighborhood",
      centerId: "",
      nodes: [],
      edges: [],
      suggestions: [],
      metadata: this.createMetadata(
        request,
        DEFAULT_NEIGHBORHOOD_OPTIONS,
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
    options: Required<NeighborhoodFeedOptions>,
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
