// =============================================================================
// LEARNING MODE RUNTIME SERVICE
// =============================================================================
// Phase 5A: Mode Framework & Runtime
//
// The Mode Runtime is the central service for managing learning modes.
// It handles:
// 1. Mode activation and deactivation
// 2. Mode resolution (global → category → session)
// 3. Parameter merging and validation
// 4. Generating ranked candidate lists (with placeholders for Phase 5B)
// 5. Explainability trace creation and management
// 6. Session lifecycle management
//
// This service does NOT implement mode-specific behavior directly.
// Instead, it provides a framework that policies can hook into.
// =============================================================================

import { prisma } from "../config/database.js";
import {
  Prisma,
  LearningModeDefinition as DbLearningModeDefinition,
  ModeActivation as DbModeActivation,
  ModeSession as DbModeSession,
} from "@prisma/client";
import type {
  LearningModeId,
  ModeSessionId,
  ExplainabilityTraceId,
  ModePluginId,
  ModeDefinition,
  ModeActivation,
  ModeRuntimeState,
  ModeScopeContext,
  LkgcSignalSnapshot,
  LkgcSignalType,
  LkgcSignalValue,
  RankedCandidateList,
  ReviewCandidate,
  NavigationSuggestion,
  NewCardRecommendation,
  SynthesisOpportunity,
  MetacognitivePrompt,
  ExplainabilityTrace,
  ExplainabilityFactor,
  ModePolicyContext,
  ReviewCandidateInput,
  UserModePreferences,
  NormalizedValue,
  Timestamp,
  Duration,
  UserId,
  CategoryId,
  CanonicalCardId,
} from "@manthanein/shared";
import {
  createLearningModeId,
  createModeSessionId,
  createModeActivationId,
  createReviewCandidateId,
  generateModeSessionId,
  createExplainabilityTraceId,
  generateExplainabilityTraceId,
  createModePluginId,
  asMutable,
} from "@manthanein/shared";
import {
  getAllBuiltInModes,
  isSystemModeId,
  extractSystemType,
  getBuiltInModeByType,
} from "./built-in-modes.js";
import type {
  ActivateModeInput,
  ActivateModeResult,
  CreateModeSessionInput,
  EndModeSessionInput,
  GetModeRuntimeInput,
  GenerateRankedCandidatesInput,
  GenerateRankedCandidatesResult,
  CreateExplainabilityTraceInput,
  SaveParameterPresetInput,
  UpdateModePreferencesInput,
  SetCategoryModeDefaultInput,
  UpdateCategorySchedulingInput,
  ModeRuntimeHooks,
  ModeRuntimeConfig,
  ResolvedMode,
  ModeResolutionOptions,
} from "./types.js";

import { DEFAULT_MODE_RUNTIME_CONFIG } from "./types.js";

// =============================================================================
// ID GENERATION
// =============================================================================

function _generateId(): string {
  return `mode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function _generateSessionId(): ModeSessionId {
  return generateModeSessionId();
}

function _generateTraceId(): ExplainabilityTraceId {
  return generateExplainabilityTraceId();
}

// =============================================================================
// MODE RUNTIME SERVICE CLASS
// =============================================================================

export class ModeRuntimeService {
  private config: ModeRuntimeConfig;
  private hooks: ModeRuntimeHooks;
  private runtimeCache: Map<
    string,
    { state: ModeRuntimeState; expiresAt: number }
  >;

  constructor(
    config: Partial<ModeRuntimeConfig> = {},
    hooks: ModeRuntimeHooks = {},
  ) {
    this.config = { ...DEFAULT_MODE_RUNTIME_CONFIG, ...config };
    this.hooks = hooks;
    this.runtimeCache = new Map();
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize the service - seed built-in modes if needed
   */
  async initialize(): Promise<void> {
    if (this.config.seedBuiltInModes) {
      await this.seedBuiltInModes();
    }
  }

  /**
   * Seed built-in mode definitions into the database
   */
  async seedBuiltInModes(): Promise<void> {
    const builtInModes = getAllBuiltInModes();

    for (const mode of builtInModes) {
      const existing = await prisma.learningModeDefinition.findFirst({
        where: {
          systemType: mode.systemType,
          source: "system",
        },
      });

      if (!existing) {
        await prisma.learningModeDefinition.create({
          data: {
            id: mode.id,
            name: mode.name,
            description: mode.description,
            tagline: mode.tagline,
            icon: mode.icon,
            systemType: mode.systemType,
            source: mode.source,
            version: mode.version,
            parameterSchema:
              mode.parameterSchema as unknown as Prisma.JsonObject,
            defaultParameters:
              mode.defaultParameters as unknown as Prisma.JsonObject,
            affectedPolicies:
              mode.affectedPolicies as unknown as Prisma.JsonObject,
            consumedLkgcSignals: mode.consumedLkgcSignals
              ? asMutable(mode.consumedLkgcSignals as readonly string[])
              : undefined,
            amplifiedLkgcSignals: mode.amplifiedLkgcSignals
              ? asMutable(mode.amplifiedLkgcSignals as readonly string[])
              : undefined,
            uiEmphasis: mode.uiEmphasis as unknown as Prisma.JsonObject,
            suggestedViewLens: mode.suggestedViewLens,
            colorTheme: mode.colorTheme
              ? (mode.colorTheme as unknown as Prisma.InputJsonObject)
              : Prisma.DbNull,
            enabledByDefault: mode.enabledByDefault,
            supportsCategoryDefault: mode.supportsCategoryDefault,
            supportsSessionOverride: mode.supportsSessionOverride,
            requiredCapabilities: mode.requiredCapabilities
              ? asMutable(mode.requiredCapabilities as readonly string[])
              : undefined,
          },
        });
      }
    }
  }

  // ===========================================================================
  // MODE DEFINITION RETRIEVAL
  // ===========================================================================

  /**
   * Get a mode definition by ID
   * First checks database, then falls back to built-in modes
   */
  async getModeDefinition(
    modeId: LearningModeId,
  ): Promise<ModeDefinition | null> {
    // Check if it's a system mode
    if (isSystemModeId(modeId)) {
      const systemType = extractSystemType(modeId);
      if (systemType) {
        return getBuiltInModeByType(systemType) || null;
      }
    }

    // Look up in database
    const dbMode = await prisma.learningModeDefinition.findUnique({
      where: { id: modeId },
    });

    if (!dbMode) return null;

    return this.dbModeToDefinition(dbMode);
  }

  /**
   * Get all available mode definitions for a user
   */
  async getAvailableModes(_userId: string): Promise<ModeDefinition[]> {
    const dbModes = await prisma.learningModeDefinition.findMany({
      where: {
        enabledByDefault: true,
      },
    });

    // Start with built-in modes
    const modes: ModeDefinition[] = getAllBuiltInModes();

    // Add any plugin-defined modes from database
    for (const dbMode of dbModes) {
      if (dbMode.source !== "system") {
        modes.push(this.dbModeToDefinition(dbMode));
      }
    }

    return modes;
  }

  // ===========================================================================
  // MODE ACTIVATION
  // ===========================================================================

  /**
   * Activate a mode at a given scope
   */
  async activateMode(input: ActivateModeInput): Promise<ActivateModeResult> {
    // Call beforeActivation hook if provided
    if (this.hooks.beforeActivation) {
      const shouldProceed = await this.hooks.beforeActivation(input);
      if (!shouldProceed) {
        return { success: false, error: "Activation blocked by hook" };
      }
    }

    // Validate the mode exists
    const modeDefinition = await this.getModeDefinition(input.modeId);
    if (!modeDefinition) {
      return { success: false, error: `Mode not found: ${input.modeId}` };
    }

    // Validate scope-specific requirements
    if (input.scope === "category" && !input.categoryId) {
      return {
        success: false,
        error: "Category ID required for category scope",
      };
    }
    if (input.scope === "session" && !input.sessionId) {
      return { success: false, error: "Session ID required for session scope" };
    }
    if (input.scope === "category" && !modeDefinition.supportsCategoryDefault) {
      return {
        success: false,
        error: "Mode does not support category defaults",
      };
    }
    if (input.scope === "session" && !modeDefinition.supportsSessionOverride) {
      return {
        success: false,
        error: "Mode does not support session overrides",
      };
    }

    // Deactivate previous activation at this scope
    const previousActivation = await prisma.modeActivation.findFirst({
      where: {
        userId: input.userId,
        scope: input.scope,
        categoryId: input.scope === "category" ? input.categoryId : undefined,
        sessionId: input.scope === "session" ? input.sessionId : undefined,
        isActive: true,
      },
    });

    if (previousActivation) {
      await prisma.modeActivation.update({
        where: { id: previousActivation.id },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
        },
      });
    }

    // Create new activation
    const newActivation = await prisma.modeActivation.create({
      data: {
        userId: input.userId,
        modeId: input.modeId,
        scope: input.scope,
        categoryId: input.categoryId,
        sessionId: input.sessionId,
        parameterOverrides: (input.parameterOverrides ||
          {}) as Prisma.JsonObject,
        isActive: true,
        priority: this.getScopePriority(input.scope),
      },
    });

    const activation = this.dbActivationToModeActivation(newActivation);

    // Call afterActivation hook if provided
    if (this.hooks.afterActivation) {
      await this.hooks.afterActivation(activation);
    }

    // Invalidate runtime cache
    this.invalidateRuntimeCache(input.userId);

    return {
      success: true,
      activation,
      previousActivation: previousActivation
        ? this.dbActivationToModeActivation(previousActivation)
        : undefined,
    };
  }

  /**
   * Deactivate a mode activation
   */
  async deactivateMode(
    userId: string,
    activationId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const activation = await prisma.modeActivation.findFirst({
      where: {
        id: activationId,
        userId,
        isActive: true,
      },
    });

    if (!activation) {
      return { success: false, error: "Activation not found" };
    }

    await prisma.modeActivation.update({
      where: { id: activationId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
      },
    });

    this.invalidateRuntimeCache(userId);
    return { success: true };
  }

  // ===========================================================================
  // MODE RESOLUTION
  // ===========================================================================

  /**
   * Resolve the active mode for a given context
   * Priority: session > category > global
   */
  async resolveActiveMode(
    userId: string,
    categoryId?: string,
    sessionId?: ModeSessionId,
    options: ModeResolutionOptions = {
      respectCategoryDefaults: true,
      respectSessionOverrides: true,
      fallbackToGlobal: true,
    },
  ): Promise<ResolvedMode | null> {
    const resolutionPath: string[] = [];

    // 1. Check session override
    if (options.respectSessionOverrides && sessionId) {
      const sessionActivation = await prisma.modeActivation.findFirst({
        where: {
          userId,
          scope: "session",
          sessionId,
          isActive: true,
        },
      });

      if (sessionActivation) {
        const mode = await this.getModeDefinition(
          createLearningModeId(sessionActivation.modeId),
        );
        if (mode) {
          resolutionPath.push(`session:${sessionId}`);
          return {
            mode,
            activation: this.dbActivationToModeActivation(sessionActivation),
            resolvedParameters: this.mergeParameters(
              mode.defaultParameters,
              sessionActivation.parameterOverrides as Record<string, unknown>,
            ),
            scope: "session",
            resolutionPath,
          };
        }
      }
    }

    // 2. Check category default
    if (options.respectCategoryDefaults && categoryId) {
      const categoryDefault = await prisma.categoryModeDefault.findUnique({
        where: {
          userId_categoryId: { userId, categoryId },
        },
      });

      if (categoryDefault) {
        const mode = await this.getModeDefinition(
          createLearningModeId(categoryDefault.modeId),
        );
        if (mode) {
          resolutionPath.push(`category:${categoryId}`);
          return {
            mode,
            activation: {
              id: createModeActivationId(categoryDefault.id),
              userId: userId as UserId,
              modeId: createLearningModeId(categoryDefault.modeId),
              scope: "category",
              categoryId: categoryId as CategoryId,
              parameterOverrides: categoryDefault.parameterOverrides as Record<
                string,
                unknown
              >,
              isActive: true,
              activatedAt: categoryDefault.createdAt.getTime() as Timestamp,
              priority: this.getScopePriority("category"),
            },
            resolvedParameters: this.mergeParameters(
              mode.defaultParameters,
              categoryDefault.parameterOverrides as Record<string, unknown>,
            ),
            scope: "category",
            resolutionPath,
          };
        }
      }
    }

    // 3. Check global default
    if (options.fallbackToGlobal) {
      const globalActivation = await prisma.modeActivation.findFirst({
        where: {
          userId,
          scope: "global",
          isActive: true,
        },
      });

      if (globalActivation) {
        const mode = await this.getModeDefinition(
          createLearningModeId(globalActivation.modeId),
        );
        if (mode) {
          resolutionPath.push("global");
          return {
            mode,
            activation: this.dbActivationToModeActivation(globalActivation),
            resolvedParameters: this.mergeParameters(
              mode.defaultParameters,
              globalActivation.parameterOverrides as Record<string, unknown>,
            ),
            scope: "global",
            resolutionPath,
          };
        }
      }

      // Check user preferences for default mode
      const userPrefs = await prisma.userModePreference.findUnique({
        where: { userId },
      });

      if (userPrefs) {
        const mode = await this.getModeDefinition(
          createLearningModeId(userPrefs.defaultModeId),
        );
        if (mode) {
          resolutionPath.push("user_preference");
          return {
            mode,
            activation: {
              id: createModeActivationId(`pref_${userId}`),
              userId: userId as UserId,
              modeId: createLearningModeId(userPrefs.defaultModeId),
              scope: "global",
              parameterOverrides: userPrefs.defaultParameters as Record<
                string,
                unknown
              >,
              isActive: true,
              activatedAt: userPrefs.updatedAt.getTime() as Timestamp,
              priority: 0,
            },
            resolvedParameters: this.mergeParameters(
              mode.defaultParameters,
              userPrefs.defaultParameters as Record<string, unknown>,
            ),
            scope: "global",
            resolutionPath,
          };
        }
      }
    }

    // 4. Fall back to default Exploration mode
    const defaultMode = getBuiltInModeByType("exploration");
    if (defaultMode) {
      resolutionPath.push("system_default");
      return {
        mode: defaultMode,
        activation: {
          id: createModeActivationId("system_default"),
          userId: userId as UserId,
          modeId: defaultMode.id,
          scope: "global",
          parameterOverrides: {},
          isActive: true,
          activatedAt: Date.now() as Timestamp,
          priority: -1,
        },
        resolvedParameters: { ...defaultMode.defaultParameters },
        scope: "global",
        resolutionPath,
      };
    }

    return null;
  }

  // ===========================================================================
  // MODE RUNTIME STATE
  // ===========================================================================

  /**
   * Get the current mode runtime state
   */
  async getModeRuntimeState(
    input: GetModeRuntimeInput,
  ): Promise<ModeRuntimeState | null> {
    // Check cache first
    const cacheKey = this.getRuntimeCacheKey(input);
    if (this.config.enableRuntimeCaching) {
      const cached = this.runtimeCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.state;
      }
    }

    // Resolve active mode
    const resolved = await this.resolveActiveMode(
      input.userId,
      input.categoryId,
      input.sessionId,
    );

    if (!resolved) return null;

    // Build scope context
    const scopeContext = await this.buildScopeContext(
      input.userId,
      resolved.scope,
      input.categoryId,
      input.sessionId,
    );

    // Get LKGC signal snapshot
    const lkgcSnapshot = await this.getLkgcSignalSnapshot(input.userId);

    const runtimeState: ModeRuntimeState = {
      modeId: resolved.mode.id,
      definition: resolved.mode,
      activation: resolved.activation,
      scopeContext,
      lkgcSnapshot,
      // Convenience aliases
      activeModeDefinition: resolved.mode,
      resolvedParameters: resolved.resolvedParameters,
      activeLkgcSignals:
        lkgcSnapshot.signals instanceof Map
          ? (lkgcSnapshot.signals as ReadonlyMap<
              LkgcSignalType,
              LkgcSignalValue
            >)
          : (new Map(Object.entries(lkgcSnapshot.signals || {})) as ReadonlyMap<
              LkgcSignalType,
              LkgcSignalValue
            >),
    };

    // Cache the result
    if (this.config.enableRuntimeCaching) {
      this.runtimeCache.set(cacheKey, {
        state: runtimeState,
        expiresAt: Date.now() + this.config.runtimeCacheTtlMs,
      });
    }

    return runtimeState;
  }

  // ===========================================================================
  // RANKED CANDIDATE GENERATION (Placeholder for Phase 5B)
  // ===========================================================================

  /**
   * Generate ranked candidates based on active mode
   * This is a PLACEHOLDER that returns a basic structure.
   * Full implementation in Phase 5B.
   */
  async generateRankedCandidates(
    input: GenerateRankedCandidatesInput,
  ): Promise<GenerateRankedCandidatesResult> {
    const startTime = Date.now();

    // Call beforeCandidateGeneration hook if provided
    let processedInput = input;
    if (this.hooks.beforeCandidateGeneration) {
      processedInput = await this.hooks.beforeCandidateGeneration(input);
    }

    // Create explainability trace for the list
    const traceId = await this.createExplainabilityTraceForList(
      processedInput.userId,
      input.modeRuntimeState,
    );

    // === PLACEHOLDER: Basic candidate ranking ===
    // Phase 5B will implement mode-specific policies
    const reviewCandidates = await this.basicCandidateRanking(
      processedInput.availableCandidates,
      processedInput.modeRuntimeState,
      processedInput.maxResults || this.config.maxRankedCandidates,
    );

    // === PLACEHOLDER: Empty navigation suggestions ===
    // Phase 5B will implement navigation policy
    const navigationSuggestions: readonly NavigationSuggestion[] = [];

    // === PLACEHOLDER: Empty new card recommendations ===
    const newCardRecommendations: readonly NewCardRecommendation[] = [];

    // === PLACEHOLDER: Empty synthesis opportunities ===
    const synthesisOpportunities: readonly SynthesisOpportunity[] = [];

    // === PLACEHOLDER: Empty metacognitive prompts ===
    const metacognitivePrompts: readonly MetacognitivePrompt[] = [];

    let rankedList: RankedCandidateList = {
      reviewCandidates,
      navigationSuggestions,
      newCardRecommendations,
      synthesisOpportunities,
      metacognitivePrompts,
      listExplainabilityTraceId: traceId,
      sourceModeId: input.modeRuntimeState.activeModeDefinition.id,
      parametersUsed: input.modeRuntimeState.resolvedParameters,
      generatedAt: Date.now() as Timestamp,
      ttlMs: this.config.defaultExplainabilityTtlMs as Duration,
    };

    // Call afterCandidateGeneration hook if provided
    if (this.hooks.afterCandidateGeneration) {
      rankedList = await this.hooks.afterCandidateGeneration(
        rankedList,
        this.buildPolicyContext(input.modeRuntimeState, input.userId),
      );
    }

    return {
      success: true,
      rankedList,
      generationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Basic candidate ranking (placeholder)
   * Returns candidates sorted by urgency with mode-based adjustments
   */
  private async basicCandidateRanking(
    candidates: readonly ReviewCandidateInput[],
    runtimeState: ModeRuntimeState,
    maxResults: number,
  ): Promise<readonly ReviewCandidate[]> {
    const modeType = runtimeState.activeModeDefinition.systemType;

    // Score each candidate
    const scored = candidates.map((candidate) => {
      // Safely get retrievability, default to 0.5 if not available
      const retrievability = candidate.schedulingData?.retrievability ?? 0.5;
      let urgency = (1 - retrievability) as NormalizedValue;
      let modeModifier = 0 as NormalizedValue;

      // Apply basic mode-specific adjustments
      switch (modeType) {
        case "exploration":
          // Reduce urgency pressure
          urgency = (urgency * 0.5) as NormalizedValue;
          // Boost new cards
          if (candidate.schedulingData?.state === "new") {
            modeModifier = 0.3 as NormalizedValue;
          }
          break;

        case "goal_driven":
          // Keep urgency, no modification
          break;

        case "exam_oriented":
          // Increase urgency for at-risk items
          if ((candidate.schedulingData?.retrievability ?? 1) < 0.7) {
            modeModifier = 0.4 as NormalizedValue;
          }
          break;

        case "synthesis":
          // Boost items with cross-context participation
          // (This is a placeholder - real logic needs participation data)
          break;
      }

      const finalScore = (urgency + modeModifier) as NormalizedValue;

      return {
        id: createReviewCandidateId(`rc_${candidate.cardId}`),
        cardId: candidate.cardId,
        faceId: candidate.faceId,
        categoryId: candidate.categoryId,
        participationId: candidate.participationId,
        scheduledFor: candidate.scheduledFor,
        urgency,
        priorityScore: finalScore,
        scoring: {
          baseScore: urgency,
          urgencyBonus: 0 as NormalizedValue,
          modeModifier,
          finalScore,
          urgency,
          factors: [],
        },
        modeBoost: modeModifier,
      } satisfies ReviewCandidate;
    });

    // Sort by final score and limit
    return scored
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, maxResults);
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Create a new mode session
   */
  async createModeSession(
    input: CreateModeSessionInput,
  ): Promise<{ success: boolean; session?: DbModeSession; error?: string }> {
    const mode = await this.getModeDefinition(input.modeId);
    if (!mode) {
      return { success: false, error: "Mode not found" };
    }
    if (!mode.supportsSessionOverride) {
      return { success: false, error: "Mode does not support sessions" };
    }

    const session = await prisma.modeSession.create({
      data: {
        userId: input.userId,
        modeId: input.modeId,
        parameterOverrides: (input.parameterOverrides ||
          {}) as Prisma.JsonObject,
        categoryId: input.categoryId,
        timeBudgetMinutes: input.timeBudgetMinutes,
        status: "active",
      },
    });

    // Automatically activate the mode for this session
    await this.activateMode({
      userId: input.userId,
      modeId: input.modeId,
      scope: "session",
      sessionId: createModeSessionId(session.id),
      parameterOverrides: input.parameterOverrides,
    });

    return { success: true, session };
  }

  /**
   * End a mode session
   */
  async endModeSession(
    input: EndModeSessionInput,
  ): Promise<{ success: boolean; error?: string }> {
    const session = await prisma.modeSession.findFirst({
      where: {
        id: input.sessionId,
        userId: input.userId,
        status: "active",
      },
    });

    if (!session) {
      return { success: false, error: "Session not found or already ended" };
    }

    await prisma.modeSession.update({
      where: { id: input.sessionId },
      data: {
        status: input.status || "completed",
        endedAt: new Date(),
      },
    });

    // Deactivate the session mode activation
    await prisma.modeActivation.updateMany({
      where: {
        userId: input.userId,
        sessionId: input.sessionId,
        isActive: true,
      },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
      },
    });

    this.invalidateRuntimeCache(input.userId);
    return { success: true };
  }

  /**
   * Record a card as reviewed in the current session
   */
  async recordSessionReview(
    userId: string,
    sessionId: ModeSessionId,
    cardId: string,
  ): Promise<void> {
    const session = await prisma.modeSession.findFirst({
      where: { id: sessionId, userId, status: "active" },
    });

    if (session) {
      await prisma.modeSession.update({
        where: { id: sessionId },
        data: {
          reviewedCardIds: {
            push: cardId,
          },
        },
      });
    }
  }

  // ===========================================================================
  // EXPLAINABILITY
  // ===========================================================================

  /**
   * Create an explainability trace
   */
  async createExplainabilityTrace(
    input: CreateExplainabilityTraceInput,
  ): Promise<{ success: boolean; traceId?: string; error?: string }> {
    const ttlMs = input.ttlMs || this.config.defaultExplainabilityTtlMs;
    const expiresAt = new Date(Date.now() + ttlMs);

    const trace = await prisma.explainabilityTrace.create({
      data: {
        userId: input.userId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        modeId: input.modeId,
        parametersUsed: input.parametersUsed as Prisma.JsonObject,
        factors: input.factors as unknown as Prisma.JsonArray,
        summary: input.summary,
        detailedExplanation: input.detailedExplanation,
        suggestedActions: (input.suggestedActions ||
          []) as unknown as Prisma.JsonArray,
        ttlMs,
        expiresAt,
      },
    });

    return { success: true, traceId: trace.id };
  }

  /**
   * Get an explainability trace by ID
   */
  async getExplainabilityTrace(
    traceId: string,
    userId: string,
  ): Promise<ExplainabilityTrace | null> {
    const trace = await prisma.explainabilityTrace.findFirst({
      where: {
        id: traceId,
        userId,
        expiresAt: { gt: new Date() },
      },
    });

    if (!trace) return null;

    return {
      id: createExplainabilityTraceId(trace.id),
      subject: {
        type: trace.subjectType as "card" | "list" | "navigation" | "session",
        [trace.subjectType === "card" ? "cardId" : `${trace.subjectType}Id`]:
          trace.subjectId,
      } as ExplainabilityTrace["subject"],
      modeId: createLearningModeId(trace.modeId),
      parametersUsed: trace.parametersUsed as Record<string, unknown>,
      factors: trace.factors as unknown as readonly ExplainabilityFactor[],
      summary: trace.summary,
      detailedExplanation: trace.detailedExplanation || "",
      suggestedActions:
        trace.suggestedActions as unknown as ExplainabilityTrace["suggestedActions"],
      createdAt: trace.createdAt.getTime() as Timestamp,
      ttlMs: trace.ttlMs as Duration,
    };
  }

  /**
   * Create an explainability trace for a ranked list
   */
  private async createExplainabilityTraceForList(
    userId: string,
    runtimeState: ModeRuntimeState,
  ): Promise<ExplainabilityTraceId> {
    const result = await this.createExplainabilityTrace({
      userId,
      subjectType: "review_candidate",
      subjectId: "ranked_list",
      modeId: runtimeState.activeModeDefinition.id,
      parametersUsed: runtimeState.resolvedParameters,
      factors: [
        {
          id: "mode_selection",
          name: "Active Mode",
          description: `Using ${runtimeState.activeModeDefinition.name} mode`,
          weight: 1.0,
          value: 1.0,
          contribution: 1.0,
          modeSpecific: true,
          visualHint: "neutral",
        },
      ],
      summary: `Ranked using ${runtimeState.activeModeDefinition.name} mode at ${runtimeState.activation.scope} scope`,
    });

    return result.traceId
      ? createExplainabilityTraceId(result.traceId)
      : _generateTraceId();
  }

  // ===========================================================================
  // USER PREFERENCES
  // ===========================================================================

  /**
   * Get user's mode preferences
   */
  async getUserModePreferences(
    userId: string,
  ): Promise<UserModePreferences | null> {
    const prefs = await prisma.userModePreference.findUnique({
      where: { userId },
    });

    if (!prefs) return null;

    const defaultModeId = createLearningModeId(prefs.defaultModeId);

    return {
      userId: prefs.userId as UserId,
      defaultMode: defaultModeId,
      defaultModeId,
      categoryDefaults: new Map(), // Fetched separately if needed
      savedPresets: [], // Fetched separately if needed
      parameterPresets: [], // Alias
      recentModes: (prefs.recentModeIds as string[]).map((id) =>
        createLearningModeId(id),
      ),
      favoriteModes: (prefs.favoriteModeIds as string[]).map((id) =>
        createLearningModeId(id),
      ),
      lastUpdated: prefs.updatedAt.getTime() as Timestamp,
      updatedAt: prefs.updatedAt.getTime() as Timestamp,
    };
  }

  /**
   * Update user's mode preferences
   */
  async updateModePreferences(
    input: UpdateModePreferencesInput,
  ): Promise<{ success: boolean; error?: string }> {
    const existingPrefs = await prisma.userModePreference.findUnique({
      where: { userId: input.userId },
    });

    const updateData: Prisma.UserModePreferenceUpdateInput = {};

    if (input.defaultModeId) {
      const mode = await this.getModeDefinition(input.defaultModeId);
      if (!mode) {
        return { success: false, error: "Mode not found" };
      }
      updateData.defaultMode = { connect: { id: input.defaultModeId } };
    }

    if (input.defaultParameters) {
      updateData.defaultParameters =
        input.defaultParameters as Prisma.JsonObject;
    }

    if (!existingPrefs) {
      // Create new preferences
      const defaultModeId = input.defaultModeId || "system:exploration";
      await prisma.userModePreference.create({
        data: {
          userId: input.userId,
          defaultModeId,
          defaultParameters: (input.defaultParameters ||
            {}) as Prisma.JsonObject,
          recentModeIds: [],
          favoriteModeIds: input.addToFavorites ? [input.addToFavorites] : [],
        },
      });
    } else {
      // Update favorites
      let favoriteModeIds = [...existingPrefs.favoriteModeIds];
      if (
        input.addToFavorites &&
        !favoriteModeIds.includes(input.addToFavorites)
      ) {
        favoriteModeIds.push(input.addToFavorites);
      }
      if (input.removeFromFavorites) {
        favoriteModeIds = favoriteModeIds.filter(
          (id) => id !== input.removeFromFavorites,
        );
      }
      updateData.favoriteModeIds = favoriteModeIds;

      await prisma.userModePreference.update({
        where: { userId: input.userId },
        data: updateData,
      });
    }

    this.invalidateRuntimeCache(input.userId);
    return { success: true };
  }

  /**
   * Set category mode default
   */
  async setCategoryModeDefault(
    input: SetCategoryModeDefaultInput,
  ): Promise<{ success: boolean; error?: string }> {
    const mode = await this.getModeDefinition(input.modeId);
    if (!mode) {
      return { success: false, error: "Mode not found" };
    }
    if (!mode.supportsCategoryDefault) {
      return {
        success: false,
        error: "Mode does not support category defaults",
      };
    }

    await prisma.categoryModeDefault.upsert({
      where: {
        userId_categoryId: {
          userId: input.userId,
          categoryId: input.categoryId,
        },
      },
      create: {
        userId: input.userId,
        categoryId: input.categoryId,
        modeId: input.modeId,
        parameterOverrides: (input.parameterOverrides ||
          {}) as Prisma.JsonObject,
      },
      update: {
        modeId: input.modeId,
        parameterOverrides: (input.parameterOverrides ||
          {}) as Prisma.JsonObject,
      },
    });

    this.invalidateRuntimeCache(input.userId);
    return { success: true };
  }

  /**
   * Save a parameter preset
   */
  async saveParameterPreset(
    input: SaveParameterPresetInput,
  ): Promise<{ success: boolean; presetId?: string; error?: string }> {
    const mode = await this.getModeDefinition(input.modeId);
    if (!mode) {
      return { success: false, error: "Mode not found" };
    }

    // TODO: Validate parameters against schema

    const preset = await prisma.modeParameterPreset.upsert({
      where: {
        userId_modeId_name: {
          userId: input.userId,
          modeId: input.modeId,
          name: input.name,
        },
      },
      create: {
        userId: input.userId,
        modeId: input.modeId,
        name: input.name,
        description: input.description,
        parameters: input.parameters as Prisma.JsonObject,
        isDefault: input.isDefault || false,
      },
      update: {
        description: input.description,
        parameters: input.parameters as Prisma.JsonObject,
        isDefault: input.isDefault,
      },
    });

    return { success: true, presetId: preset.id };
  }

  // ===========================================================================
  // CATEGORY SCHEDULING METADATA
  // ===========================================================================

  /**
   * Update category scheduling metadata
   */
  async updateCategorySchedulingMetadata(
    input: UpdateCategorySchedulingInput,
  ): Promise<{ success: boolean; error?: string }> {
    const updateData: Prisma.CategorySchedulingMetadataUpdateInput = {};

    if (input.difficultyMultiplier !== undefined) {
      updateData.difficultyMultiplier = input.difficultyMultiplier;
    }
    if (input.targetStability !== undefined) {
      updateData.targetStability = input.targetStability;
    }
    if (input.decayModel !== undefined) {
      updateData.decayModel = input.decayModel;
    }
    if (input.customDecayParams !== undefined) {
      updateData.customDecayParams =
        input.customDecayParams as Prisma.JsonObject;
    }
    if (input.interferenceGroupIds !== undefined) {
      updateData.interferenceGroupIds = input.interferenceGroupIds;
    }
    if (input.interferenceSpacingHours !== undefined) {
      updateData.interferenceSpacingHours = input.interferenceSpacingHours;
    }
    if (input.targetMasteryDate !== undefined) {
      updateData.targetMasteryDate = input.targetMasteryDate;
    }
    if (input.targetMasteryLevel !== undefined) {
      updateData.targetMasteryLevel = input.targetMasteryLevel;
    }
    if (input.dailyAllocation !== undefined) {
      updateData.dailyAllocation = input.dailyAllocation;
    }
    if (input.modeOverrides !== undefined) {
      updateData.modeOverrides = input.modeOverrides as Prisma.JsonObject;
    }

    await prisma.categorySchedulingMetadata.upsert({
      where: {
        userId_categoryId: {
          userId: input.userId,
          categoryId: input.categoryId,
        },
      },
      create: {
        userId: input.userId,
        categoryId: input.categoryId,
        ...updateData,
      } as Prisma.CategorySchedulingMetadataCreateInput,
      update: updateData,
    });

    return { success: true };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Get priority for a scope (higher priority wins)
   */
  private getScopePriority(scope: "global" | "category" | "session"): number {
    switch (scope) {
      case "session":
        return 100;
      case "category":
        return 50;
      case "global":
        return 0;
    }
  }

  /**
   * Merge default parameters with overrides
   */
  private mergeParameters(
    defaults: Record<string, unknown>,
    overrides: Record<string, unknown>,
  ): Record<string, unknown> {
    return { ...defaults, ...overrides };
  }

  /**
   * Build scope context
   */
  private async buildScopeContext(
    userId: string,
    scope: "global" | "category" | "session",
    categoryId?: string,
    sessionId?: ModeSessionId,
  ): Promise<ModeScopeContext> {
    const now = Date.now() as Timestamp;

    // Build category context if needed
    let categoryContext: ModeScopeContext["categoryContext"] | undefined;
    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { name: true, cardCount: true },
      });

      if (category) {
        // Get due and new counts using Card model
        // Note: This uses legacy Card model, may need update for CanonicalCard
        const dueCount = await prisma.card.count({
          where: {
            deckId: categoryId,
            nextReviewDate: { lte: new Date() },
          },
        });

        const newCount = await prisma.card.count({
          where: {
            deckId: categoryId,
            state: "new",
          },
        });

        categoryContext = {
          categoryName: category.name,
          cardCount: category.cardCount,
          dueCount,
          newCount,
        };
      }
    }

    // Build session context if needed
    let sessionContext: ModeScopeContext["sessionContext"] | undefined;
    if (sessionId) {
      const session = await prisma.modeSession.findUnique({
        where: { id: sessionId },
      });

      if (session) {
        sessionContext = {
          startedAt: session.startedAt.getTime() as Timestamp,
          cardsReviewed: session.reviewedCardIds.length,
          timeSpentMinutes: Math.floor(session.activeTimeSeconds / 60),
        };
      }
    }

    // Return the complete immutable context
    return {
      scope,
      categoryId: categoryId as CategoryId | undefined,
      sessionId,
      startedAt: now,
      categoryContext,
      sessionContext,
    };
  }

  /**
   * Get LKGC signal snapshot (placeholder)
   */
  private async getLkgcSignalSnapshot(
    userId: string,
  ): Promise<LkgcSignalSnapshot> {
    // If hook is provided, use it
    if (this.hooks.getLkgcSignals) {
      return this.hooks.getLkgcSignals(userId);
    }

    // Otherwise return empty placeholder
    // Full implementation requires LKGC integration
    return {
      timestamp: Date.now() as Timestamp,
      signals: {} as Partial<Record<LkgcSignalType, LkgcSignalValue>>,
      snapshotAt: Date.now() as Timestamp,
      userContext: {
        userId: userId as UserId,
        overallMastery: 0.5 as NormalizedValue,
        activeStreakDays: 0,
        recentReviewCount: 0,
      },
    };
  }

  /**
   * Build policy context
   */
  private buildPolicyContext(
    runtimeState: ModeRuntimeState,
    userId: string,
  ): ModePolicyContext {
    return {
      modeRuntime: runtimeState,
      userId: userId as UserId,
      currentTime: Date.now() as Timestamp,
      cardsReviewedThisSession: 0,
      categoryFocus: runtimeState.scopeContext.categoryId,
    };
  }

  /**
   * Convert database mode to ModeDefinition
   */
  private dbModeToDefinition(dbMode: DbLearningModeDefinition): ModeDefinition {
    return {
      id: createLearningModeId(dbMode.id),
      name: dbMode.name,
      description: dbMode.description,
      tagline: dbMode.tagline || "",
      icon: dbMode.icon,
      systemType: dbMode.systemType as ModeDefinition["systemType"],
      source: dbMode.source as "system" | "plugin" | "user_custom",
      pluginId: dbMode.pluginId
        ? createModePluginId(dbMode.pluginId)
        : undefined,
      version: dbMode.version,
      parameterSchema:
        dbMode.parameterSchema as unknown as ModeDefinition["parameterSchema"],
      defaultParameters: dbMode.defaultParameters as Record<string, unknown>,
      affectedPolicies:
        dbMode.affectedPolicies as unknown as ModeDefinition["affectedPolicies"],
      consumedLkgcSignals:
        dbMode.consumedLkgcSignals as unknown as ModeDefinition["consumedLkgcSignals"],
      amplifiedLkgcSignals:
        dbMode.amplifiedLkgcSignals as unknown as ModeDefinition["amplifiedLkgcSignals"],
      uiEmphasis: dbMode.uiEmphasis as unknown as ModeDefinition["uiEmphasis"],
      suggestedViewLens:
        dbMode.suggestedViewLens as unknown as ModeDefinition["suggestedViewLens"],
      colorTheme: dbMode.colorTheme as unknown as ModeDefinition["colorTheme"],
      enabledByDefault: dbMode.enabledByDefault,
      supportsCategoryDefault: dbMode.supportsCategoryDefault,
      supportsSessionOverride: dbMode.supportsSessionOverride,
      requiredCapabilities:
        dbMode.requiredCapabilities as unknown as ModeDefinition["requiredCapabilities"],
      createdAt: dbMode.createdAt.getTime() as Timestamp,
      updatedAt: dbMode.updatedAt.getTime() as Timestamp,
    };
  }

  /**
   * Convert database activation to ModeActivation
   */
  private dbActivationToModeActivation(
    dbActivation: DbModeActivation,
  ): ModeActivation {
    return {
      id: createModeActivationId(dbActivation.id),
      userId: dbActivation.userId as UserId,
      modeId: createLearningModeId(dbActivation.modeId),
      scope: dbActivation.scope as "global" | "category" | "session",
      categoryId: (dbActivation.categoryId ?? undefined) as
        | CategoryId
        | undefined,
      sessionId: dbActivation.sessionId
        ? createModeSessionId(dbActivation.sessionId)
        : undefined,
      parameterOverrides: dbActivation.parameterOverrides as Record<
        string,
        unknown
      >,
      isActive: dbActivation.isActive,
      activatedAt: dbActivation.activatedAt.getTime() as Timestamp,
      deactivatedAt: dbActivation.deactivatedAt?.getTime() as
        | Timestamp
        | undefined,
      priority: dbActivation.priority,
    };
  }

  /**
   * Get runtime cache key
   */
  private getRuntimeCacheKey(input: GetModeRuntimeInput): string {
    return `${input.userId}:${input.categoryId || ""}:${input.sessionId || ""}`;
  }

  /**
   * Invalidate runtime cache for a user
   */
  private invalidateRuntimeCache(userId: string): void {
    for (const key of this.runtimeCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.runtimeCache.delete(key);
      }
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let _instance: ModeRuntimeService | null = null;

/**
 * Get the singleton Mode Runtime service instance
 */
export function getModeRuntimeService(): ModeRuntimeService {
  if (!_instance) {
    _instance = new ModeRuntimeService();
  }
  return _instance;
}

/**
 * Initialize the Mode Runtime service with custom configuration
 */
export function initializeModeRuntimeService(
  config?: Partial<ModeRuntimeConfig>,
  hooks?: ModeRuntimeHooks,
): ModeRuntimeService {
  _instance = new ModeRuntimeService(config, hooks);
  return _instance;
}
