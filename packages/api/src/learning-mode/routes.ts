// =============================================================================
// LEARNING MODE API ROUTES
// =============================================================================
// Phase 5A: REST API endpoints for the Mode Framework (Fastify)
//
// Endpoints:
// - GET    /modes                     - List available modes
// - GET    /modes/:modeId             - Get mode definition
// - GET    /modes/runtime             - Get current runtime state
// - POST   /modes/activate            - Activate a mode
// - POST   /modes/deactivate/:id      - Deactivate a mode activation
// - POST   /modes/sessions            - Create a mode session
// - POST   /modes/sessions/:id/end    - End a mode session
// - GET    /modes/preferences         - Get user mode preferences
// - PUT    /modes/preferences         - Update user mode preferences
// - POST   /modes/presets             - Save a parameter preset
// - GET    /modes/presets             - List user's parameter presets
// - PUT    /modes/category-defaults   - Set category mode default
// - GET    /modes/explainability/:id  - Get explainability trace
// - POST   /modes/candidates          - Generate ranked candidates
// =============================================================================

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getModeRuntimeService } from "./index.js";
import type {
  LearningModeId,
  ModeSessionId,
  ReviewCandidateInput,
} from "@manthanein/shared";

// =============================================================================
// REQUEST TYPES
// =============================================================================

interface AuthenticatedRequest {
  user?: { id?: string };
}

interface ActivateModeBody {
  modeId: LearningModeId;
  scope: "global" | "category" | "session";
  categoryId?: string;
  sessionId?: ModeSessionId;
  parameterOverrides?: Record<string, unknown>;
}

interface CreateSessionBody {
  modeId: LearningModeId;
  parameterOverrides?: Record<string, unknown>;
  categoryId?: string;
  timeBudgetMinutes?: number;
}

interface EndSessionBody {
  status?: "completed" | "abandoned";
}

interface RecordReviewBody {
  cardId: string;
}

interface UpdatePreferencesBody {
  defaultModeId?: LearningModeId;
  defaultParameters?: Record<string, unknown>;
  addToFavorites?: LearningModeId;
  removeFromFavorites?: LearningModeId;
}

interface SavePresetBody {
  modeId: LearningModeId;
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  isDefault?: boolean;
}

interface SetCategoryDefaultBody {
  categoryId: string;
  modeId: LearningModeId;
  parameterOverrides?: Record<string, unknown>;
}

interface GenerateCandidatesBody {
  categoryId?: string;
  sessionId?: ModeSessionId;
  availableCandidates: readonly ReviewCandidateInput[];
  timeBudget?: number;
  maxResults?: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract user ID from request
 */
function getUserId(request: FastifyRequest): string {
  // Try authenticated user first
  const reqWithUser = request as FastifyRequest & AuthenticatedRequest;
  if (reqWithUser.user?.id) {
    return reqWithUser.user.id;
  }

  // Fall back to header (for development)
  const headerUserId = request.headers["x-user-id"];
  if (typeof headerUserId === "string") {
    return headerUserId;
  }

  return "anonymous";
}

/**
 * Standard API response wrapper
 */
function apiResponse<T>(success: boolean, data?: T, error?: string) {
  return { success, data, error };
}

// =============================================================================
// ROUTE SCHEMAS
// =============================================================================

const activateModeSchema = {
  body: {
    type: "object",
    required: ["modeId", "scope"],
    properties: {
      modeId: { type: "string" },
      scope: { type: "string", enum: ["global", "category", "session"] },
      categoryId: { type: "string" },
      sessionId: { type: "string" },
      parameterOverrides: { type: "object" },
    },
  },
};

const createSessionSchema = {
  body: {
    type: "object",
    required: ["modeId"],
    properties: {
      modeId: { type: "string" },
      parameterOverrides: { type: "object" },
      categoryId: { type: "string" },
      timeBudgetMinutes: { type: "number", minimum: 1 },
    },
  },
};

const updatePreferencesSchema = {
  body: {
    type: "object",
    properties: {
      defaultModeId: { type: "string" },
      defaultParameters: { type: "object" },
      addToFavorites: { type: "string" },
      removeFromFavorites: { type: "string" },
    },
  },
};

const savePresetSchema = {
  body: {
    type: "object",
    required: ["modeId", "name", "parameters"],
    properties: {
      modeId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      parameters: { type: "object" },
      isDefault: { type: "boolean" },
    },
  },
};

const setCategoryDefaultSchema = {
  body: {
    type: "object",
    required: ["categoryId", "modeId"],
    properties: {
      categoryId: { type: "string" },
      modeId: { type: "string" },
      parameterOverrides: { type: "object" },
    },
  },
};

const generateCandidatesSchema = {
  body: {
    type: "object",
    required: ["availableCandidates"],
    properties: {
      categoryId: { type: "string" },
      sessionId: { type: "string" },
      availableCandidates: { type: "array" },
      timeBudget: { type: "number" },
      maxResults: { type: "number" },
    },
  },
};

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

/**
 * Register learning mode routes on a Fastify instance.
 */
export async function learningModeRoutes(app: FastifyInstance): Promise<void> {
  const getService = () => getModeRuntimeService();

  // ===========================================================================
  // MODE DEFINITION ENDPOINTS
  // ===========================================================================

  /**
   * GET /modes
   * List all available modes for the user
   */
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const service = getService();

    const modes = await service.getAvailableModes(userId);

    return apiResponse(true, {
      modes,
      count: modes.length,
    });
  });

  /**
   * GET /modes/health
   * Health check for the mode service
   */
  app.get("/health", async () => {
    const service = getService();
    const modes = await service.getAvailableModes("health-check");

    return apiResponse(true, {
      status: "healthy",
      availableModeCount: modes.length,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /modes/runtime
   * Get the current mode runtime state
   */
  app.get("/runtime", async (request, reply) => {
    const userId = getUserId(request);
    const { categoryId, sessionId } = request.query as {
      categoryId?: string;
      sessionId?: string;
    };

    const service = getService();
    const runtimeState = await service.getModeRuntimeState({
      userId,
      categoryId,
      sessionId,
    });

    if (!runtimeState) {
      reply.status(404);
      return apiResponse(
        false,
        undefined,
        "Could not resolve mode runtime state",
      );
    }

    return apiResponse(true, runtimeState);
  });

  /**
   * GET /modes/preferences
   * Get user's mode preferences
   */
  app.get("/preferences", async (request) => {
    const userId = getUserId(request);
    const service = getService();

    const preferences = await service.getUserModePreferences(userId);

    return apiResponse(true, preferences);
  });

  /**
   * GET /modes/explainability/:traceId
   * Get an explainability trace
   */
  app.get<{ Params: { traceId: string } }>(
    "/explainability/:traceId",
    async (request, reply) => {
      const userId = getUserId(request);
      const { traceId } = request.params;

      const service = getService();
      const trace = await service.getExplainabilityTrace(traceId, userId);

      if (!trace) {
        reply.status(404);
        return apiResponse(
          false,
          undefined,
          "Explainability trace not found or expired",
        );
      }

      return apiResponse(true, trace);
    },
  );

  /**
   * GET /modes/:modeId
   * Get a specific mode definition
   */
  app.get<{ Params: { modeId: string } }>(
    "/:modeId",
    async (request, reply) => {
      const { modeId } = request.params;
      const service = getService();

      const mode = await service.getModeDefinition(modeId);

      if (!mode) {
        reply.status(404);
        return apiResponse(false, undefined, "Mode not found");
      }

      return apiResponse(true, mode);
    },
  );

  // ===========================================================================
  // MODE ACTIVATION ENDPOINTS
  // ===========================================================================

  /**
   * POST /modes/activate
   * Activate a mode at a given scope
   */
  app.post<{ Body: ActivateModeBody }>(
    "/activate",
    { schema: activateModeSchema },
    async (request, reply) => {
      const userId = getUserId(request);
      const { modeId, scope, categoryId, sessionId, parameterOverrides } =
        request.body;

      const service = getService();
      const result = await service.activateMode({
        userId,
        modeId,
        scope,
        categoryId,
        sessionId,
        parameterOverrides,
      });

      if (!result.success) {
        reply.status(400);
        return apiResponse(false, undefined, result.error);
      }

      return apiResponse(true, {
        activation: result.activation,
        previousActivation: result.previousActivation,
      });
    },
  );

  /**
   * POST /modes/deactivate/:activationId
   * Deactivate a mode activation
   */
  app.post<{ Params: { activationId: string } }>(
    "/deactivate/:activationId",
    async (request, reply) => {
      const userId = getUserId(request);
      const { activationId } = request.params;

      const service = getService();
      const result = await service.deactivateMode(userId, activationId);

      if (!result.success) {
        reply.status(400);
        return apiResponse(false, undefined, result.error);
      }

      return apiResponse(true, { message: "Mode deactivated successfully" });
    },
  );

  // ===========================================================================
  // SESSION ENDPOINTS
  // ===========================================================================

  /**
   * POST /modes/sessions
   * Create a new mode session
   */
  app.post<{ Body: CreateSessionBody }>(
    "/sessions",
    { schema: createSessionSchema },
    async (request, reply) => {
      const userId = getUserId(request);
      const { modeId, parameterOverrides, categoryId, timeBudgetMinutes } =
        request.body;

      const service = getService();
      const result = await service.createModeSession({
        userId,
        modeId,
        parameterOverrides,
        categoryId,
        timeBudgetMinutes,
      });

      if (!result.success) {
        reply.status(400);
        return apiResponse(false, undefined, result.error);
      }

      return apiResponse(true, { session: result.session });
    },
  );

  /**
   * POST /modes/sessions/:sessionId/end
   * End a mode session
   */
  app.post<{ Params: { sessionId: string }; Body: EndSessionBody }>(
    "/sessions/:sessionId/end",
    async (request, reply) => {
      const userId = getUserId(request);
      const { sessionId } = request.params;
      const { status } = request.body || {};

      const service = getService();
      const result = await service.endModeSession({
        userId,
        sessionId,
        status,
      });

      if (!result.success) {
        reply.status(400);
        return apiResponse(false, undefined, result.error);
      }

      return apiResponse(true, { message: "Session ended successfully" });
    },
  );

  /**
   * POST /modes/sessions/:sessionId/review
   * Record a card review in a session
   */
  app.post<{ Params: { sessionId: string }; Body: RecordReviewBody }>(
    "/sessions/:sessionId/review",
    async (request, reply) => {
      const userId = getUserId(request);
      const { sessionId } = request.params;
      const { cardId } = request.body;

      if (!cardId) {
        reply.status(400);
        return apiResponse(false, undefined, "cardId is required");
      }

      const service = getService();
      await service.recordSessionReview(userId, sessionId, cardId);

      return apiResponse(true, { message: "Review recorded" });
    },
  );

  // ===========================================================================
  // PREFERENCES ENDPOINTS
  // ===========================================================================

  /**
   * PUT /modes/preferences
   * Update user's mode preferences
   */
  app.put<{ Body: UpdatePreferencesBody }>(
    "/preferences",
    { schema: updatePreferencesSchema },
    async (request, reply) => {
      const userId = getUserId(request);
      const {
        defaultModeId,
        defaultParameters,
        addToFavorites,
        removeFromFavorites,
      } = request.body;

      const service = getService();
      const result = await service.updateModePreferences({
        userId,
        defaultModeId,
        defaultParameters,
        addToFavorites,
        removeFromFavorites,
      });

      if (!result.success) {
        reply.status(400);
        return apiResponse(false, undefined, result.error);
      }

      return apiResponse(true, { message: "Preferences updated successfully" });
    },
  );

  // ===========================================================================
  // PRESET ENDPOINTS
  // ===========================================================================

  /**
   * POST /modes/presets
   * Save a parameter preset
   */
  app.post<{ Body: SavePresetBody }>(
    "/presets",
    { schema: savePresetSchema },
    async (request, reply) => {
      const userId = getUserId(request);
      const { modeId, name, description, parameters, isDefault } = request.body;

      const service = getService();
      const result = await service.saveParameterPreset({
        userId,
        modeId,
        name,
        description,
        parameters,
        isDefault,
      });

      if (!result.success) {
        reply.status(400);
        return apiResponse(false, undefined, result.error);
      }

      return apiResponse(true, { presetId: result.presetId });
    },
  );

  // ===========================================================================
  // CATEGORY DEFAULT ENDPOINTS
  // ===========================================================================

  /**
   * PUT /modes/category-defaults
   * Set a category's default mode
   */
  app.put<{ Body: SetCategoryDefaultBody }>(
    "/category-defaults",
    { schema: setCategoryDefaultSchema },
    async (request, reply) => {
      const userId = getUserId(request);
      const { categoryId, modeId, parameterOverrides } = request.body;

      const service = getService();
      const result = await service.setCategoryModeDefault({
        userId,
        categoryId,
        modeId,
        parameterOverrides,
      });

      if (!result.success) {
        reply.status(400);
        return apiResponse(false, undefined, result.error);
      }

      return apiResponse(true, {
        message: "Category default set successfully",
      });
    },
  );

  // ===========================================================================
  // CANDIDATE GENERATION ENDPOINTS
  // ===========================================================================

  /**
   * POST /modes/candidates
   * Generate ranked candidates based on active mode
   */
  app.post<{ Body: GenerateCandidatesBody }>(
    "/candidates",
    { schema: generateCandidatesSchema },
    async (request, reply) => {
      const userId = getUserId(request);
      const {
        categoryId,
        sessionId,
        availableCandidates,
        timeBudget,
        maxResults,
      } = request.body;

      const service = getService();

      // First get the runtime state
      const runtimeState = await service.getModeRuntimeState({
        userId,
        categoryId,
        sessionId,
      });

      if (!runtimeState) {
        reply.status(404);
        return apiResponse(
          false,
          undefined,
          "Could not resolve mode runtime state",
        );
      }

      // Generate ranked candidates
      const result = await service.generateRankedCandidates({
        userId,
        modeRuntimeState: runtimeState,
        availableCandidates,
        timeBudget,
        categoryFilter: categoryId,
        maxResults,
      });

      if (!result.success) {
        reply.status(500);
        return apiResponse(false, undefined, result.error);
      }

      return apiResponse(true, {
        rankedList: result.rankedList,
        generationTimeMs: result.generationTimeMs,
      });
    },
  );
}

// =============================================================================
// FASTIFY PLUGIN EXPORT
// =============================================================================

/**
 * Fastify plugin for learning mode routes
 */
export default async function learningModePlugin(
  app: FastifyInstance,
): Promise<void> {
  await learningModeRoutes(app);
}

// Export for compatibility
export { learningModeRoutes as routes };
