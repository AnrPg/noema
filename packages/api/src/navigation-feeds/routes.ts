// =============================================================================
// NAVIGATION FEEDS ROUTES
// =============================================================================
// Phase 5B: Navigation Feeds per Mode (STRUCTURE)
//
// Fastify plugin for navigation feed endpoints.
// These endpoints provide mode-aware navigation suggestions.
// =============================================================================

import { FastifyInstance, FastifyRequest } from "fastify";
import type {
  NavigationFeedRequest,
  NeighborhoodFeedOptions,
  PrerequisitePathOptions,
  CoverageFeedOptions,
  ConstellationChallengeOptions,
  Timestamp,
  UserId,
  CardId,
  ViewLens,
  CategoryRelationType,
} from "@manthanein/shared";
import { getNavigationFeedService } from "./navigation-feed.service.js";

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

interface FeedRequestBody {
  userId?: string;
  modeId?: string;
  currentCategoryId?: string;
  currentCardId?: string;
  viewLens?: string;
  modeParameters?: Record<string, unknown>;
  maxSuggestionsPerType?: number;
  includeExplainability?: boolean;
  // Endpoint-specific
  targetCategoryId?: string;
  maxHops?: number;
  minRelationStrength?: number;
  relationTypes?: string[];
  noveltyWeight?: number;
  serendipityFactor?: number;
  bridgeBonusWeight?: number;
  maxDepth?: number;
  strictnessLevel?: number;
  foundationStabilityThreshold?: number;
  includeTransitive?: boolean;
  gapSensitivity?: number;
  targetCategoryIds?: string[];
  coverageGoal?: number;
  breadthVsDepthSlider?: number;
  coveredMasteryThreshold?: number;
  coverageWindowDays?: number;
  criticalContentWeight?: number;
  minParticipations?: number;
  minDivergence?: number;
  bridgeTypes?: string[];
  challengeDifficulty?: number;
  allowedEdgeTypes?: string[];
  maxConnectionHops?: number;
}

interface FeedQuerystring {
  userId?: string;
  modeId?: string;
  currentCategoryId?: string;
  currentCardId?: string;
  viewLens?: string;
  maxSuggestionsPerType?: string;
  includeExplainability?: string;
  maxHops?: string;
  noveltyWeight?: string;
  serendipityFactor?: string;
  maxDepth?: string;
  strictnessLevel?: string;
  targetCategoryIds?: string;
  coverageGoal?: string;
  breadthVsDepthSlider?: string;
  minParticipations?: string;
  minDivergence?: string;
  challengeDifficulty?: string;
}

interface PrerequisiteParams {
  targetCategoryId: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build NavigationFeedRequest from Fastify request
 */
function buildFeedRequest(
  request: FastifyRequest<{
    Body?: FeedRequestBody;
    Querystring?: FeedQuerystring;
  }>,
  overrides?: Partial<NavigationFeedRequest>,
): NavigationFeedRequest {
  const body = (request.body || {}) as FeedRequestBody;
  const query = (request.query || {}) as FeedQuerystring;

  const userId = (body.userId || query.userId || "default-user") as UserId;
  const modeId = body.modeId || query.modeId || "system:exploration";
  const currentCardId = (body.currentCardId || query.currentCardId) as
    | CardId
    | undefined;
  const viewLens = (body.viewLens || query.viewLens) as ViewLens | undefined;

  return {
    userId,
    modeId,
    currentCategoryId: body.currentCategoryId || query.currentCategoryId,
    currentCardId,
    viewLens,
    modeParameters: body.modeParameters || {},
    maxSuggestionsPerType:
      body.maxSuggestionsPerType ||
      (query.maxSuggestionsPerType
        ? parseInt(query.maxSuggestionsPerType)
        : undefined),
    includeExplainability:
      body.includeExplainability === true ||
      query.includeExplainability === "true",
    requestedAt: Date.now() as Timestamp,
    ...overrides,
  };
}

// =============================================================================
// PLUGIN DEFINITION
// =============================================================================

export async function navigationFeedRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // ===========================================================================
  // UNIFIED FEED ENDPOINTS
  // ===========================================================================

  /**
   * POST /navigation-feeds/unified
   * Generate a unified navigation feed based on active mode
   */
  fastify.post<{ Body: FeedRequestBody }>(
    "/unified",
    async (request, reply) => {
      try {
        const feedRequest = buildFeedRequest(request);
        const service = getNavigationFeedService();
        const result = await service.generateUnifiedFeed(feedRequest);

        if (result.success && result.feed) {
          return reply.send({
            success: true,
            data: result.feed,
            generationTimeMs: result.generationTimeMs,
          });
        } else {
          return reply.status(400).send({
            success: false,
            error: result.error || "Failed to generate unified feed",
          });
        }
      } catch (error) {
        fastify.log.error({ err: error }, "Error generating unified feed");
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  /**
   * GET /navigation-feeds/unified
   * Generate a unified navigation feed (GET version for simple queries)
   */
  fastify.get<{ Querystring: FeedQuerystring }>(
    "/unified",
    async (request, reply) => {
      try {
        const feedRequest = buildFeedRequest(request);
        const service = getNavigationFeedService();
        const result = await service.generateUnifiedFeed(feedRequest);

        if (result.success && result.feed) {
          return reply.send({
            success: true,
            data: result.feed,
            generationTimeMs: result.generationTimeMs,
          });
        } else {
          return reply.status(400).send({
            success: false,
            error: result.error || "Failed to generate unified feed",
          });
        }
      } catch (error) {
        fastify.log.error({ err: error }, "Error generating unified feed");
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  // ===========================================================================
  // NEIGHBORHOOD FEED ENDPOINTS
  // ===========================================================================

  /**
   * POST /navigation-feeds/neighborhood
   * Generate a neighborhood navigation feed
   */
  fastify.post<{ Body: FeedRequestBody }>(
    "/neighborhood",
    async (request, reply) => {
      try {
        const feedRequest = buildFeedRequest(request);
        const body = (request.body || {}) as FeedRequestBody;
        const options: NeighborhoodFeedOptions = {
          maxHops: body.maxHops,
          minRelationStrength: body.minRelationStrength,
          relationTypes:
            body.relationTypes as NeighborhoodFeedOptions["relationTypes"],
          noveltyWeight: body.noveltyWeight,
          serendipityFactor: body.serendipityFactor,
          bridgeBonusWeight: body.bridgeBonusWeight,
        };

        const service = getNavigationFeedService();
        const feed = await service.generateNeighborhoodFeed(
          feedRequest,
          options,
        );

        return reply.send({
          success: true,
          data: feed,
        });
      } catch (error) {
        fastify.log.error({ err: error }, "Error generating neighborhood feed");
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  /**
   * GET /navigation-feeds/neighborhood
   * Generate a neighborhood feed (GET version)
   */
  fastify.get<{ Querystring: FeedQuerystring }>(
    "/neighborhood",
    async (request, reply) => {
      try {
        const feedRequest = buildFeedRequest(request);
        const query = (request.query || {}) as FeedQuerystring;
        const options: NeighborhoodFeedOptions = {
          maxHops: query.maxHops ? parseInt(query.maxHops) : undefined,
          noveltyWeight: query.noveltyWeight
            ? parseFloat(query.noveltyWeight)
            : undefined,
          serendipityFactor: query.serendipityFactor
            ? parseFloat(query.serendipityFactor)
            : undefined,
        };

        const service = getNavigationFeedService();
        const feed = await service.generateNeighborhoodFeed(
          feedRequest,
          options,
        );

        return reply.send({
          success: true,
          data: feed,
        });
      } catch (error) {
        fastify.log.error({ err: error }, "Error generating neighborhood feed");
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  // ===========================================================================
  // PREREQUISITE PATH FEED ENDPOINTS
  // ===========================================================================

  /**
   * POST /navigation-feeds/prerequisites
   * Generate a prerequisite path feed for a target category
   */
  fastify.post<{ Body: FeedRequestBody }>(
    "/prerequisites",
    async (request, reply) => {
      try {
        const body = (request.body || {}) as FeedRequestBody;
        const targetCategoryId = body.targetCategoryId;
        if (!targetCategoryId) {
          return reply.status(400).send({
            success: false,
            error: "targetCategoryId is required",
          });
        }

        const feedRequest = buildFeedRequest(request);
        const options: PrerequisitePathOptions = {
          maxDepth: body.maxDepth,
          strictnessLevel: body.strictnessLevel,
          foundationStabilityThreshold: body.foundationStabilityThreshold,
          includeTransitive: body.includeTransitive,
          gapSensitivity: body.gapSensitivity,
        };

        const service = getNavigationFeedService();
        const feed = await service.generatePrerequisitePathFeed(
          feedRequest,
          targetCategoryId,
          options,
        );

        return reply.send({
          success: true,
          data: feed,
        });
      } catch (error) {
        fastify.log.error(
          { err: error },
          "Error generating prerequisite path feed",
        );
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  /**
   * GET /navigation-feeds/prerequisites/:targetCategoryId
   * Generate a prerequisite path feed for a target category (GET version)
   */
  fastify.get<{ Params: PrerequisiteParams; Querystring: FeedQuerystring }>(
    "/prerequisites/:targetCategoryId",
    async (request, reply) => {
      try {
        const targetCategoryId = request.params.targetCategoryId;
        const feedRequest = buildFeedRequest(request);
        const query = (request.query || {}) as FeedQuerystring;
        const options: PrerequisitePathOptions = {
          maxDepth: query.maxDepth ? parseInt(query.maxDepth) : undefined,
          strictnessLevel: query.strictnessLevel
            ? parseFloat(query.strictnessLevel)
            : undefined,
        };

        const service = getNavigationFeedService();
        const feed = await service.generatePrerequisitePathFeed(
          feedRequest,
          targetCategoryId,
          options,
        );

        return reply.send({
          success: true,
          data: feed,
        });
      } catch (error) {
        fastify.log.error(
          { err: error },
          "Error generating prerequisite path feed",
        );
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  // ===========================================================================
  // COVERAGE FEED ENDPOINTS
  // ===========================================================================

  /**
   * POST /navigation-feeds/coverage
   * Generate a coverage feed
   */
  fastify.post<{ Body: FeedRequestBody }>(
    "/coverage",
    async (request, reply) => {
      try {
        const feedRequest = buildFeedRequest(request);
        const body = (request.body || {}) as FeedRequestBody;
        const options: CoverageFeedOptions = {
          targetCategoryIds: body.targetCategoryIds,
          coverageGoal: body.coverageGoal,
          breadthVsDepthSlider: body.breadthVsDepthSlider,
          coveredMasteryThreshold: body.coveredMasteryThreshold,
          coverageWindowDays: body.coverageWindowDays,
          criticalContentWeight: body.criticalContentWeight,
        };

        const service = getNavigationFeedService();
        const feed = await service.generateCoverageFeed(feedRequest, options);

        return reply.send({
          success: true,
          data: feed,
        });
      } catch (error) {
        fastify.log.error({ err: error }, "Error generating coverage feed");
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  /**
   * GET /navigation-feeds/coverage
   * Generate a coverage feed (GET version)
   */
  fastify.get<{ Querystring: FeedQuerystring }>(
    "/coverage",
    async (request, reply) => {
      try {
        const feedRequest = buildFeedRequest(request);
        const query = (request.query || {}) as FeedQuerystring;
        const targetCategoryIds = query.targetCategoryIds
          ? query.targetCategoryIds.split(",")
          : undefined;
        const options: CoverageFeedOptions = {
          targetCategoryIds,
          coverageGoal: query.coverageGoal
            ? parseFloat(query.coverageGoal)
            : undefined,
          breadthVsDepthSlider: query.breadthVsDepthSlider
            ? parseFloat(query.breadthVsDepthSlider)
            : undefined,
        };

        const service = getNavigationFeedService();
        const feed = await service.generateCoverageFeed(feedRequest, options);

        return reply.send({
          success: true,
          data: feed,
        });
      } catch (error) {
        fastify.log.error({ err: error }, "Error generating coverage feed");
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  // ===========================================================================
  // CONSTELLATION CHALLENGE FEED ENDPOINTS
  // ===========================================================================

  /**
   * POST /navigation-feeds/constellations
   * Generate a constellation challenge feed
   */
  fastify.post<{ Body: FeedRequestBody }>(
    "/constellations",
    async (request, reply) => {
      try {
        const feedRequest = buildFeedRequest(request);
        const body = (request.body || {}) as FeedRequestBody;
        const options: ConstellationChallengeOptions = {
          minParticipations: body.minParticipations,
          minDivergence: body.minDivergence,
          bridgeTypes:
            body.bridgeTypes as ConstellationChallengeOptions["bridgeTypes"],
          challengeDifficulty: body.challengeDifficulty,
          allowedEdgeTypes: body.allowedEdgeTypes as
            | CategoryRelationType[]
            | undefined,
          maxConnectionHops: body.maxConnectionHops,
        };

        const service = getNavigationFeedService();
        const feed = await service.generateConstellationChallengeFeed(
          feedRequest,
          options,
        );

        return reply.send({
          success: true,
          data: feed,
        });
      } catch (error) {
        fastify.log.error(
          { err: error },
          "Error generating constellation challenge feed",
        );
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  /**
   * GET /navigation-feeds/constellations
   * Generate a constellation challenge feed (GET version)
   */
  fastify.get<{ Querystring: FeedQuerystring }>(
    "/constellations",
    async (request, reply) => {
      try {
        const feedRequest = buildFeedRequest(request);
        const query = (request.query || {}) as FeedQuerystring;
        const options: ConstellationChallengeOptions = {
          minParticipations: query.minParticipations
            ? parseInt(query.minParticipations)
            : undefined,
          minDivergence: query.minDivergence
            ? parseFloat(query.minDivergence)
            : undefined,
          challengeDifficulty: query.challengeDifficulty
            ? parseFloat(query.challengeDifficulty)
            : undefined,
        };

        const service = getNavigationFeedService();
        const feed = await service.generateConstellationChallengeFeed(
          feedRequest,
          options,
        );

        return reply.send({
          success: true,
          data: feed,
        });
      } catch (error) {
        fastify.log.error(
          { err: error },
          "Error generating constellation challenge feed",
        );
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  // ===========================================================================
  // CACHE MANAGEMENT ENDPOINTS
  // ===========================================================================

  /**
   * POST /navigation-feeds/cache/clear
   * Clear navigation feed cache (for a user or all)
   */
  fastify.post<{ Body: { userId?: string } }>(
    "/cache/clear",
    async (request, reply) => {
      try {
        const service = getNavigationFeedService();
        const userId = request.body?.userId;

        if (userId) {
          service.clearUserCache(userId);
          return reply.send({
            success: true,
            message: `Cache cleared for user ${userId}`,
          });
        } else {
          service.clearCache();
          return reply.send({
            success: true,
            message: "All cache cleared",
          });
        }
      } catch (error) {
        fastify.log.error({ err: error }, "Error clearing cache");
        return reply.status(500).send({
          success: false,
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );
}

export default navigationFeedRoutes;
