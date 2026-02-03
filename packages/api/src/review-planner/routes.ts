// =============================================================================
// REVIEW PLANNER ROUTES
// =============================================================================
// Fastify routes for the policy-based review planner API.
// Provides endpoints for ranking candidates, explaining decisions,
// and configuring the planner.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type {
  UserId,
  CardId,
  CategoryId,
  LearningModeId,
  Duration,
  ReviewPlannerRequest,
  ReviewPlannerResponse,
  PolicyRankedCandidate,
} from "@manthanein/shared";

import {
  getReviewPlannerService,
  ReviewPlannerService,
} from "./review-planner.service.js";

import type {
  RankRequestBody,
  ExplainRequestBody,
  ApiResponse,
} from "./types.js";

import { now } from "./types.js";

// =============================================================================
// ROUTE SCHEMAS
// =============================================================================

const rankRequestSchema = {
  type: "object",
  required: ["modeId"],
  properties: {
    modeId: { type: "string" },
    categoryFilter: { type: "string" },
    maxCandidates: { type: "number", minimum: 1, maximum: 500 },
    timeBudgetMinutes: { type: "number", minimum: 1, maximum: 120 },
    includeExplainability: { type: "boolean" },
    modeParameterOverrides: { type: "object" },
  },
};

const explainRequestSchema = {
  type: "object",
  required: ["cardId", "modeId"],
  properties: {
    cardId: { type: "string" },
    modeId: { type: "string" },
  },
};

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * Register review planner routes on a Fastify instance.
 */
export async function reviewPlannerRoutes(
  app: FastifyInstance,
  options: { prisma: PrismaClient },
): Promise<void> {
  const { prisma } = options;

  // Get service instance
  const getService = (): ReviewPlannerService => {
    return getReviewPlannerService(prisma);
  };

  // Helper to extract user ID from request
  const getUserId = (request: FastifyRequest): UserId => {
    // Try authenticated user first
    // The user property is added by auth middleware
    const reqWithUser = request as FastifyRequest & { user?: { id?: string } };
    if (reqWithUser.user?.id) {
      return reqWithUser.user.id as UserId;
    }

    // Fall back to header (for development)
    const headerUserId = request.headers["x-user-id"];
    if (typeof headerUserId === "string") {
      return headerUserId as UserId;
    }

    throw new Error("User ID not found in request");
  };

  // ===========================================================================
  // RANKING ENDPOINTS
  // ===========================================================================

  /**
   * POST /review-planner/rank
   *
   * Rank review candidates using the policy composition system.
   */
  app.post<{
    Body: RankRequestBody;
  }>(
    "/rank",
    {
      schema: {
        description: "Rank review candidates using policy composition",
        tags: ["review-planner"],
        body: rankRequestSchema,
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object" },
              timestamp: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply): Promise<ApiResponse<ReviewPlannerResponse>> => {
      try {
        const userId = getUserId(request);
        const service = getService();

        const plannerRequest: ReviewPlannerRequest = {
          userId,
          modeId: request.body.modeId as LearningModeId,
          categoryFilter: request.body.categoryFilter as CategoryId | undefined,
          maxCandidates: request.body.maxCandidates,
          timeBudget: request.body.timeBudgetMinutes
            ? ((request.body.timeBudgetMinutes * 60 * 1000) as Duration)
            : undefined,
          includeExplainability: request.body.includeExplainability ?? true,
          modeParameterOverrides: request.body.modeParameterOverrides,
          requestedAt: now(),
        };

        const response = await service.planReview(plannerRequest);

        return {
          success: true,
          data: response,
          timestamp: Date.now(),
        };
      } catch (error) {
        request.log.error({ err: error }, "Failed to rank candidates");
        reply.status(500);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        };
      }
    },
  );

  /**
   * POST /review-planner/top
   *
   * Get the top N candidates for immediate study.
   */
  app.post<{
    Body: RankRequestBody & { count?: number };
  }>(
    "/top",
    {
      schema: {
        description: "Get top N review candidates",
        tags: ["review-planner"],
        body: {
          ...rankRequestSchema,
          properties: {
            ...rankRequestSchema.properties,
            count: { type: "number", minimum: 1, maximum: 100, default: 10 },
          },
        },
      },
    },
    async (
      request,
      reply,
    ): Promise<
      ApiResponse<{
        candidates: PolicyRankedCandidate[];
        count: number;
      }>
    > => {
      try {
        const userId = getUserId(request);
        const service = getService();
        const count = request.body.count ?? 10;

        const plannerRequest: ReviewPlannerRequest = {
          userId,
          modeId: request.body.modeId as LearningModeId,
          categoryFilter: request.body.categoryFilter as CategoryId | undefined,
          maxCandidates: request.body.maxCandidates,
          timeBudget: request.body.timeBudgetMinutes
            ? ((request.body.timeBudgetMinutes * 60 * 1000) as Duration)
            : undefined,
          includeExplainability: false, // Don't need full explainability for top
          modeParameterOverrides: request.body.modeParameterOverrides,
          requestedAt: now(),
        };

        const candidates = await service.getTopCandidates(
          plannerRequest,
          count,
        );

        return {
          success: true,
          data: {
            candidates,
            count: candidates.length,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        request.log.error({ err: error }, "Failed to get top candidates");
        reply.status(500);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        };
      }
    },
  );

  // ===========================================================================
  // EXPLAINABILITY ENDPOINTS
  // ===========================================================================

  /**
   * POST /review-planner/explain
   *
   * Explain why a specific card received its ranking.
   */
  app.post<{
    Body: ExplainRequestBody;
  }>(
    "/explain",
    {
      schema: {
        description: "Explain ranking for a specific card",
        tags: ["review-planner"],
        body: explainRequestSchema,
      },
    },
    async (
      request,
      reply,
    ): Promise<
      ApiResponse<{
        card: PolicyRankedCandidate | null;
        rank: number;
        totalCandidates: number;
        explanation: string[];
      }>
    > => {
      try {
        const userId = getUserId(request);
        const service = getService();

        const plannerRequest: ReviewPlannerRequest = {
          userId,
          modeId: request.body.modeId as LearningModeId,
          includeExplainability: true,
          requestedAt: now(),
        };

        const result = await service.explainCardRanking(
          plannerRequest,
          request.body.cardId as CardId,
        );

        return {
          success: true,
          data: result,
          timestamp: Date.now(),
        };
      } catch (error) {
        request.log.error({ err: error }, "Failed to explain card ranking");
        reply.status(500);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        };
      }
    },
  );

  // ===========================================================================
  // CONFIGURATION ENDPOINTS
  // ===========================================================================

  /**
   * GET /review-planner/policies
   *
   * Get all registered policies.
   */
  app.get(
    "/policies",
    {
      schema: {
        description: "Get all registered policies",
        tags: ["review-planner"],
      },
    },
    async (
      request,
      reply,
    ): Promise<
      ApiResponse<{
        policies: string[];
        weights: Record<string, number>;
      }>
    > => {
      try {
        const service = getService();
        const policies = service.getRegisteredPolicies();

        return {
          success: true,
          data: {
            policies: policies.map(String),
            weights: {}, // Would need to expose weights from composer
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        request.log.error({ err: error }, "Failed to get policies");
        reply.status(500);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        };
      }
    },
  );

  /**
   * POST /review-planner/cache/clear
   *
   * Clear the planner cache.
   */
  app.post(
    "/cache/clear",
    {
      schema: {
        description: "Clear the planner cache",
        tags: ["review-planner"],
      },
    },
    async (request, reply): Promise<ApiResponse<{ message: string }>> => {
      try {
        const service = getService();
        service.clearCache();

        return {
          success: true,
          data: { message: "Cache cleared successfully" },
          timestamp: Date.now(),
        };
      } catch (error) {
        request.log.error({ err: error }, "Failed to clear cache");
        reply.status(500);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        };
      }
    },
  );

  // ===========================================================================
  // HEALTH ENDPOINT
  // ===========================================================================

  /**
   * GET /review-planner/health
   *
   * Health check for the review planner.
   */
  app.get(
    "/health",
    {
      schema: {
        description: "Health check",
        tags: ["review-planner"],
      },
    },
    async (): Promise<
      ApiResponse<{
        status: string;
        registeredPolicies: number;
      }>
    > => {
      try {
        const service = getService();
        const policies = service.getRegisteredPolicies();

        return {
          success: true,
          data: {
            status: "healthy",
            registeredPolicies: policies.length,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        };
      }
    },
  );
}

// =============================================================================
// FASTIFY PLUGIN
// =============================================================================

/**
 * Register review planner routes as a Fastify plugin.
 */
export default async function reviewPlannerPlugin(
  app: FastifyInstance,
  options: { prisma: PrismaClient; prefix?: string },
): Promise<void> {
  const prefix = options.prefix ?? "/review-planner";

  app.register(
    async (instance) => {
      await reviewPlannerRoutes(instance, { prisma: options.prisma });
    },
    { prefix },
  );
}

// Export for convenience
export { reviewPlannerRoutes as routes };
