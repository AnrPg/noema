// =============================================================================
// ECOSYSTEM BRIDGE SERVICE
// =============================================================================
// Bidirectional sync between Ecosystem (Categories as Lenses) and LKGC
// (Local Knowledge Graph Core).
//
// Responsibilities:
// 1. Map Category → LKGC concept node (on create/update)
// 2. Map CategoryRelation → LKGC edge (prepares_for → prerequisite_of, etc.)
// 3. Map CardCategoryParticipation → LKGC example_of edge
// 4. Emit context reviews to LKGC EventLog
// 5. Project LKGC MasteryState → Ecosystem contextMasteryScore
// 6. Provide ActiveLensContext to LKGC DecisionEngine
// =============================================================================

import { prisma } from "../config/database.js";
import type { Prisma } from "@prisma/client";
import type {
  SyncResult,
  BatchSyncResult,
  CategorySyncInput,
  CategoryRelationSyncInput,
  ParticipationSyncInput,
  ContextReviewInput,
  BridgeStatistics,
  DecisionEngineContextInput,
  DecisionEngineContextOutput,
  MasteryProjectionInput,
  MasteryProjectionOutput,
  EcosystemBridgeHooks,
} from "./types.js";
import { generateMappingId, generateSyncEventId } from "./id-generator.js";

// =============================================================================
// LOCAL TYPE DEFINITIONS (to avoid build order issues with @manthanein/shared)
// =============================================================================

type CategoryRelationType =
  | "conceptual_contains"
  | "prepares_for"
  | "contrasts_with"
  | "analogous_to"
  | "specializes"
  | "generalizes";

type EdgeType = string;
type Confidence = number;
type Timestamp = number;

interface ActiveLensContext {
  activeCategoryId?: string;
  activeConceptNodeId?: string;
  activeCategoryName?: string;
  filterToActiveCategory: boolean;
  emphasisMultiplier: number;
  deEmphasisMultiplier: number;
}

interface EcosystemBridgeConfig {
  enableEcosystemToLkgc: boolean;
  enableLkgcToEcosystem: boolean;
  enableRealtimeReviewEvents: boolean;
  enableMasteryProjection: boolean;
  enableDecisionEngineContext: boolean;
  confidenceLevels?: Partial<typeof ECOSYSTEM_SYNC_CONFIDENCE>;
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
}

const CATEGORY_RELATION_TO_LKGC_EDGE: Record<CategoryRelationType, EdgeType> = {
  prepares_for: "prerequisite_of",
  contrasts_with: "contrasts_with",
  analogous_to: "analogous_to",
  specializes: "part_of",
  generalizes: "part_of",
  conceptual_contains: "part_of",
};

const ECOSYSTEM_SYNC_CONFIDENCE = {
  categoryRelation: 0.85 as Confidence,
  categoryRelationConfirmed: 0.9 as Confidence,
  categoryRelationSuggested: 0.7 as Confidence,
  cardParticipation: 0.75 as Confidence,
  cardParticipationPrimary: 0.85 as Confidence,
  categoryToConceptNode: 0.95 as Confidence,
} as const;

const DEFAULT_BRIDGE_CONFIG: EcosystemBridgeConfig = {
  enableEcosystemToLkgc: true,
  enableLkgcToEcosystem: true,
  enableRealtimeReviewEvents: true,
  enableMasteryProjection: true,
  enableDecisionEngineContext: true,
  batchSize: 100,
  maxRetries: 3,
  retryDelayMs: 1000,
};

const DEFAULT_ACTIVE_LENS_CONTEXT: ActiveLensContext = {
  filterToActiveCategory: false,
  emphasisMultiplier: 1.0,
  deEmphasisMultiplier: 1.0,
};

// =============================================================================
// BRIDGE SERVICE CLASS
// =============================================================================

export class EcosystemBridgeService {
  private config: EcosystemBridgeConfig;
  private hooks: EcosystemBridgeHooks;

  constructor(
    config: Partial<EcosystemBridgeConfig> = {},
    hooks: EcosystemBridgeHooks = {},
  ) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
    this.hooks = hooks;
  }

  // ===========================================================================
  // 1. CATEGORY → LKGC CONCEPT NODE MAPPING
  // ===========================================================================

  /**
   * Sync a category to LKGC as a concept node.
   * Creates a mapping record and emits a sync event.
   */
  async syncCategoryToLkgcNode(
    input: CategorySyncInput,
  ): Promise<SyncResult<{ mappingId: string; lkgcNodeId: string }>> {
    if (!this.config.enableEcosystemToLkgc) {
      return { success: false, error: "Ecosystem → LKGC sync is disabled" };
    }

    const timestamp = Date.now() as Timestamp;
    const mappingId = generateMappingId();
    const syncEventId = generateSyncEventId();

    try {
      // Check if mapping already exists
      const existingMapping = await prisma.ecosystemLkgcMapping.findFirst({
        where: {
          userId: input.userId,
          sourceType: "category",
          sourceId: input.categoryId,
          status: "active",
        },
      });

      if (existingMapping) {
        // Update existing mapping
        await prisma.ecosystemLkgcMapping.update({
          where: { id: existingMapping.id },
          data: {
            lastSyncedAt: new Date(),
            metadata: {
              name: input.name,
              description: input.description,
              framingQuestion: input.framingQuestion,
            },
          },
        });

        await this.recordSyncEvent({
          id: syncEventId,
          eventType: "category_updated",
          userId: input.userId,
          sourceType: "category",
          sourceId: input.categoryId,
          targetType: "lkgc_node",
          targetId: existingMapping.targetId,
          mappingId: existingMapping.id,
          success: true,
          timestamp,
        });

        return {
          success: true,
          data: {
            mappingId: existingMapping.id,
            lkgcNodeId: existingMapping.targetId,
          },
          syncEventId,
        };
      }

      // Create new mapping
      // Note: The actual LKGC node creation would happen in LKGC layer
      // For now, we use category ID as placeholder for LKGC node ID
      const lkgcNodeId = `lkgc_concept_${input.categoryId}`;

      await prisma.ecosystemLkgcMapping.create({
        data: {
          id: mappingId,
          userId: input.userId,
          sourceType: "category",
          sourceId: input.categoryId,
          targetType: "lkgc_node",
          targetId: lkgcNodeId,
          direction: "ecosystem_to_lkgc",
          status: "active",
          confidence: ECOSYSTEM_SYNC_CONFIDENCE.categoryToConceptNode,
          metadata: {
            name: input.name,
            description: input.description,
            framingQuestion: input.framingQuestion,
          },
          lastSyncedAt: new Date(),
        },
      });

      await this.recordSyncEvent({
        id: syncEventId,
        eventType: "category_created",
        userId: input.userId,
        sourceType: "category",
        sourceId: input.categoryId,
        targetType: "lkgc_node",
        targetId: lkgcNodeId,
        mappingId,
        success: true,
        timestamp,
      });

      // Call hook if registered
      if (this.hooks.onCategoryCreated) {
        await this.hooks.onCategoryCreated(input);
      }

      return {
        success: true,
        data: { mappingId, lkgcNodeId },
        mappingId,
        syncEventId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await this.recordSyncEvent({
        id: syncEventId,
        eventType: "category_created",
        userId: input.userId,
        sourceType: "category",
        sourceId: input.categoryId,
        targetType: "lkgc_node",
        targetId: "",
        success: false,
        errorMessage,
        timestamp,
      });

      return { success: false, error: errorMessage, syncEventId };
    }
  }

  /**
   * Handle category deletion - mark mapping as orphaned
   */
  async handleCategoryDeleted(
    categoryId: string,
    userId: string,
  ): Promise<SyncResult<void>> {
    const timestamp = Date.now() as Timestamp;
    const syncEventId = generateSyncEventId();

    try {
      const mapping = await prisma.ecosystemLkgcMapping.findFirst({
        where: {
          userId,
          sourceType: "category",
          sourceId: categoryId,
          status: "active",
        },
      });

      if (mapping) {
        await prisma.ecosystemLkgcMapping.update({
          where: { id: mapping.id },
          data: { status: "orphaned", lastSyncedAt: new Date() },
        });

        await this.recordSyncEvent({
          id: syncEventId,
          eventType: "category_deleted",
          userId,
          sourceType: "category",
          sourceId: categoryId,
          targetType: "lkgc_node",
          targetId: mapping.targetId,
          mappingId: mapping.id,
          success: true,
          timestamp,
        });

        if (this.hooks.onCategoryDeleted) {
          await this.hooks.onCategoryDeleted(categoryId, userId);
        }
      }

      return { success: true, syncEventId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage, syncEventId };
    }
  }

  // ===========================================================================
  // 2. CATEGORY RELATION → LKGC EDGE MAPPING
  // ===========================================================================

  /**
   * Sync a category relation to LKGC as an edge.
   * Maps relation types according to semantic equivalence.
   */
  async syncCategoryRelationToLkgcEdge(
    input: CategoryRelationSyncInput,
  ): Promise<SyncResult<{ mappingId: string; lkgcEdgeId: string }>> {
    if (!this.config.enableEcosystemToLkgc) {
      return { success: false, error: "Ecosystem → LKGC sync is disabled" };
    }

    const timestamp = Date.now() as Timestamp;
    const mappingId = generateMappingId();
    const syncEventId = generateSyncEventId();

    try {
      // Determine LKGC edge type and direction
      const relationType = input.relationType as CategoryRelationType;
      const lkgcEdgeType =
        CATEGORY_RELATION_TO_LKGC_EDGE[relationType] || "mentions";

      // Handle direction reversal for generalizes
      const directionReversed = relationType === "generalizes";
      const effectiveSourceCategoryId = directionReversed
        ? input.targetCategoryId
        : input.sourceCategoryId;
      const effectiveTargetCategoryId = directionReversed
        ? input.sourceCategoryId
        : input.targetCategoryId;

      // Get LKGC node IDs for source and target categories
      const sourceMapping = await this.getCategoryMapping(
        input.userId,
        effectiveSourceCategoryId,
      );
      const targetMapping = await this.getCategoryMapping(
        input.userId,
        effectiveTargetCategoryId,
      );

      if (!sourceMapping || !targetMapping) {
        // Create category mappings first if they don't exist
        const sourceCategory = await prisma.category.findUnique({
          where: { id: effectiveSourceCategoryId },
        });
        const targetCategory = await prisma.category.findUnique({
          where: { id: effectiveTargetCategoryId },
        });

        if (sourceCategory && !sourceMapping) {
          await this.syncCategoryToLkgcNode({
            categoryId: sourceCategory.id,
            userId: input.userId,
            name: sourceCategory.name,
            description: sourceCategory.description || undefined,
            framingQuestion: sourceCategory.framingQuestion || undefined,
          });
        }

        if (targetCategory && !targetMapping) {
          await this.syncCategoryToLkgcNode({
            categoryId: targetCategory.id,
            userId: input.userId,
            name: targetCategory.name,
            description: targetCategory.description || undefined,
            framingQuestion: targetCategory.framingQuestion || undefined,
          });
        }
      }

      // Determine confidence based on whether user confirmed
      const confidence = input.isAutoSuggested
        ? ECOSYSTEM_SYNC_CONFIDENCE.categoryRelationSuggested
        : input.isUserConfirmed
          ? ECOSYSTEM_SYNC_CONFIDENCE.categoryRelationConfirmed
          : ECOSYSTEM_SYNC_CONFIDENCE.categoryRelation;

      // Check for existing mapping
      const existingMapping = await prisma.ecosystemLkgcMapping.findFirst({
        where: {
          userId: input.userId,
          sourceType: "category_relation",
          sourceId: input.categoryRelationId,
          status: "active",
        },
      });

      const lkgcEdgeId = `lkgc_edge_${input.categoryRelationId}`;

      if (existingMapping) {
        await prisma.ecosystemLkgcMapping.update({
          where: { id: existingMapping.id },
          data: {
            confidence,
            lastSyncedAt: new Date(),
            metadata: {
              originalRelationType: relationType,
              mappedEdgeType: lkgcEdgeType,
              directionReversed,
              strength: input.strength,
            },
          },
        });

        await this.recordSyncEvent({
          id: syncEventId,
          eventType: "category_relation_updated",
          userId: input.userId,
          sourceType: "category_relation",
          sourceId: input.categoryRelationId,
          targetType: "lkgc_edge",
          targetId: existingMapping.targetId,
          mappingId: existingMapping.id,
          success: true,
          timestamp,
        });

        return {
          success: true,
          data: {
            mappingId: existingMapping.id,
            lkgcEdgeId: existingMapping.targetId,
          },
          syncEventId,
        };
      }

      // Create new mapping
      await prisma.ecosystemLkgcMapping.create({
        data: {
          id: mappingId,
          userId: input.userId,
          sourceType: "category_relation",
          sourceId: input.categoryRelationId,
          targetType: "lkgc_edge",
          targetId: lkgcEdgeId,
          direction: "ecosystem_to_lkgc",
          status: "active",
          confidence,
          metadata: {
            originalRelationType: relationType,
            mappedEdgeType: lkgcEdgeType,
            directionReversed,
            sourceCategoryId: input.sourceCategoryId,
            targetCategoryId: input.targetCategoryId,
            strength: input.strength,
          },
          lastSyncedAt: new Date(),
        },
      });

      await this.recordSyncEvent({
        id: syncEventId,
        eventType: "category_relation_created",
        userId: input.userId,
        sourceType: "category_relation",
        sourceId: input.categoryRelationId,
        targetType: "lkgc_edge",
        targetId: lkgcEdgeId,
        mappingId,
        success: true,
        timestamp,
      });

      if (this.hooks.onCategoryRelationCreated) {
        await this.hooks.onCategoryRelationCreated(input);
      }

      return {
        success: true,
        data: { mappingId, lkgcEdgeId },
        mappingId,
        syncEventId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await this.recordSyncEvent({
        id: syncEventId,
        eventType: "category_relation_created",
        userId: input.userId,
        sourceType: "category_relation",
        sourceId: input.categoryRelationId,
        targetType: "lkgc_edge",
        targetId: "",
        success: false,
        errorMessage,
        timestamp,
      });

      return { success: false, error: errorMessage, syncEventId };
    }
  }

  // ===========================================================================
  // 3. CARD CATEGORY PARTICIPATION → LKGC EDGE MAPPING
  // ===========================================================================

  /**
   * Sync a card category participation to LKGC as an example_of edge.
   */
  async syncParticipationToLkgcEdge(
    input: ParticipationSyncInput,
  ): Promise<SyncResult<{ mappingId: string; lkgcEdgeId: string }>> {
    if (!this.config.enableEcosystemToLkgc) {
      return { success: false, error: "Ecosystem → LKGC sync is disabled" };
    }

    const timestamp = Date.now() as Timestamp;
    const mappingId = generateMappingId();
    const syncEventId = generateSyncEventId();

    try {
      // Ensure category is mapped to LKGC
      let categoryMapping = await this.getCategoryMapping(
        input.userId,
        input.categoryId,
      );
      if (!categoryMapping) {
        const category = await prisma.category.findUnique({
          where: { id: input.categoryId },
        });
        if (category) {
          const result = await this.syncCategoryToLkgcNode({
            categoryId: category.id,
            userId: input.userId,
            name: category.name,
            description: category.description || undefined,
          });
          if (result.success && result.data) {
            categoryMapping = {
              targetId: result.data.lkgcNodeId,
            };
          }
        }
      }

      // Determine confidence
      const confidence = input.isPrimary
        ? ECOSYSTEM_SYNC_CONFIDENCE.cardParticipationPrimary
        : ECOSYSTEM_SYNC_CONFIDENCE.cardParticipation;

      // Check for existing mapping
      const existingMapping = await prisma.ecosystemLkgcMapping.findFirst({
        where: {
          userId: input.userId,
          sourceType: "participation",
          sourceId: input.participationId,
          status: "active",
        },
      });

      const lkgcEdgeId = `lkgc_edge_participation_${input.participationId}`;
      const lkgcCardNodeId = `lkgc_card_${input.cardId}`;

      if (existingMapping) {
        await prisma.ecosystemLkgcMapping.update({
          where: { id: existingMapping.id },
          data: {
            confidence,
            lastSyncedAt: new Date(),
            metadata: {
              cardId: input.cardId,
              categoryId: input.categoryId,
              semanticRole: input.semanticRole,
              isPrimary: input.isPrimary,
              mappedEdgeType: "example_of",
            },
          },
        });

        await this.recordSyncEvent({
          id: syncEventId,
          eventType: "participation_updated",
          userId: input.userId,
          sourceType: "participation",
          sourceId: input.participationId,
          targetType: "lkgc_edge",
          targetId: existingMapping.targetId,
          mappingId: existingMapping.id,
          success: true,
          timestamp,
        });

        return {
          success: true,
          data: {
            mappingId: existingMapping.id,
            lkgcEdgeId: existingMapping.targetId,
          },
          syncEventId,
        };
      }

      // Create new mapping
      await prisma.ecosystemLkgcMapping.create({
        data: {
          id: mappingId,
          userId: input.userId,
          sourceType: "participation",
          sourceId: input.participationId,
          targetType: "lkgc_edge",
          targetId: lkgcEdgeId,
          direction: "ecosystem_to_lkgc",
          status: "active",
          confidence,
          metadata: {
            cardId: input.cardId,
            categoryId: input.categoryId,
            lkgcCardNodeId,
            lkgcConceptNodeId: categoryMapping?.targetId,
            semanticRole: input.semanticRole,
            isPrimary: input.isPrimary,
            mappedEdgeType: "example_of",
          },
          lastSyncedAt: new Date(),
        },
      });

      await this.recordSyncEvent({
        id: syncEventId,
        eventType: "participation_created",
        userId: input.userId,
        sourceType: "participation",
        sourceId: input.participationId,
        targetType: "lkgc_edge",
        targetId: lkgcEdgeId,
        mappingId,
        success: true,
        timestamp,
      });

      if (this.hooks.onParticipationCreated) {
        await this.hooks.onParticipationCreated(input);
      }

      return {
        success: true,
        data: { mappingId, lkgcEdgeId },
        mappingId,
        syncEventId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await this.recordSyncEvent({
        id: syncEventId,
        eventType: "participation_created",
        userId: input.userId,
        sourceType: "participation",
        sourceId: input.participationId,
        targetType: "lkgc_edge",
        targetId: "",
        success: false,
        errorMessage,
        timestamp,
      });

      return { success: false, error: errorMessage, syncEventId };
    }
  }

  // ===========================================================================
  // 4. CONTEXT REVIEWS → LKGC EVENT LOG
  // ===========================================================================

  /**
   * Emit a context-aware review event to LKGC EventLog.
   * Called immediately after each review (real-time).
   */
  async emitContextReviewEvent(
    input: ContextReviewInput,
  ): Promise<SyncResult<{ syncEventId: string }>> {
    if (!this.config.enableRealtimeReviewEvents) {
      return { success: false, error: "Real-time review events are disabled" };
    }

    const timestamp = Date.now() as Timestamp;
    const syncEventId = generateSyncEventId();

    try {
      // Get LKGC mappings for card and category
      const categoryMapping = await this.getCategoryMapping(
        input.userId,
        input.categoryId,
      );

      // Record the context review event
      // Note: Actual LKGC event emission would happen in LKGC layer
      await prisma.ecosystemSyncEvent.create({
        data: {
          id: syncEventId,
          eventType: "context_review_recorded",
          userId: input.userId,
          sourceType: "review",
          sourceId: `review_${input.cardId}_${timestamp}`,
          targetType: "lkgc_event",
          targetId: `lkgc_review_event_${syncEventId}`,
          success: true,
          metadata: {
            cardId: input.cardId,
            categoryId: input.categoryId,
            lkgcConceptNodeId: categoryMapping?.targetId,
            rating: input.rating,
            responseTimeMs: input.responseTimeMs,
            contextSuccessRate: input.contextSuccessRate,
            contextMasteryScore: input.contextMasteryScore,
            reviewCountInContext: input.reviewCountInContext,
          },
          timestamp: new Date(timestamp),
        },
      });

      if (this.hooks.onContextReview) {
        await this.hooks.onContextReview(input);
      }

      return {
        success: true,
        data: { syncEventId },
        syncEventId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await prisma.ecosystemSyncEvent.create({
        data: {
          id: syncEventId,
          eventType: "context_review_recorded",
          userId: input.userId,
          sourceType: "review",
          sourceId: `review_${input.cardId}_${timestamp}`,
          targetType: "lkgc_event",
          targetId: "",
          success: false,
          errorMessage,
          timestamp: new Date(timestamp),
        },
      });

      return { success: false, error: errorMessage, syncEventId };
    }
  }

  // ===========================================================================
  // 5. LKGC MASTERY STATE → ECOSYSTEM CONTEXT MASTERY SCORE
  // ===========================================================================

  /**
   * Project LKGC MasteryState to Ecosystem contextMasteryScore.
   * Called after each review to keep metrics in sync.
   */
  async projectMasteryToParticipation(
    input: MasteryProjectionInput,
  ): Promise<MasteryProjectionOutput> {
    if (!this.config.enableMasteryProjection) {
      return {
        participationId: input.participationId,
        projectedContextMasteryScore: 0,
        projectedContextSuccessRate: 0,
        confidence: 0 as Confidence,
      };
    }

    const timestamp = Date.now() as Timestamp;
    const syncEventId = generateSyncEventId();

    try {
      // Get current participation metrics
      const participation = await prisma.cardCategoryParticipation.findUnique({
        where: { id: input.participationId },
        select: {
          contextMasteryScore: true,
          contextSuccessRate: true,
          reviewCountInContext: true,
        },
      });

      if (!participation) {
        return {
          participationId: input.participationId,
          projectedContextMasteryScore: 0,
          projectedContextSuccessRate: 0,
          confidence: 0 as Confidence,
        };
      }

      // Note: In a full implementation, we would query LKGC's MasteryStateStore
      // For now, we use the Ecosystem metrics as the projection
      // This is where LKGC → Ecosystem sync would happen

      const projectedMasteryScore = participation.contextMasteryScore;
      const projectedSuccessRate = participation.contextSuccessRate;

      // Record sync event
      await prisma.ecosystemSyncEvent.create({
        data: {
          id: syncEventId,
          eventType: "mastery_projected",
          userId: input.userId,
          sourceType: "lkgc_node",
          sourceId: `lkgc_card_${input.cardId}`,
          targetType: "participation",
          targetId: input.participationId,
          success: true,
          metadata: {
            projectedContextMasteryScore: projectedMasteryScore,
            projectedContextSuccessRate: projectedSuccessRate,
          },
          timestamp: new Date(timestamp),
        },
      });

      return {
        participationId: input.participationId,
        projectedContextMasteryScore: projectedMasteryScore,
        projectedContextSuccessRate: projectedSuccessRate,
        confidence: 0.85 as Confidence,
      };
    } catch (error) {
      return {
        participationId: input.participationId,
        projectedContextMasteryScore: 0,
        projectedContextSuccessRate: 0,
        confidence: 0 as Confidence,
      };
    }
  }

  // ===========================================================================
  // 6. DECISION ENGINE CONTEXT AWARENESS
  // ===========================================================================

  /**
   * Build ActiveLensContext for LKGC DecisionEngine.
   * Provides category context for context-aware scheduling.
   */
  async buildDecisionEngineContext(
    input: DecisionEngineContextInput,
  ): Promise<DecisionEngineContextOutput> {
    if (!this.config.enableDecisionEngineContext || !input.activeCategoryId) {
      return {
        context: DEFAULT_ACTIVE_LENS_CONTEXT,
      };
    }

    try {
      // Get category details
      const category = await prisma.category.findUnique({
        where: { id: input.activeCategoryId },
        select: {
          id: true,
          name: true,
          cardParticipations: {
            select: { cardId: true },
          },
        },
      });

      if (!category) {
        return { context: DEFAULT_ACTIVE_LENS_CONTEXT };
      }

      // Get LKGC node ID for this category
      const categoryMapping = await this.getCategoryMapping(
        input.userId,
        input.activeCategoryId,
      );

      const context: ActiveLensContext = {
        activeCategoryId: input.activeCategoryId,
        activeConceptNodeId: categoryMapping?.targetId,
        activeCategoryName: category.name,
        filterToActiveCategory: input.filterToActiveCategory ?? false,
        emphasisMultiplier: input.emphasisMultiplier ?? 1.5,
        deEmphasisMultiplier: input.deEmphasisMultiplier ?? 0.5,
      };

      return {
        context,
        categoryNodeId: categoryMapping?.targetId,
        participatingCardIds: category.cardParticipations.map((p) => p.cardId),
      };
    } catch (error) {
      return { context: DEFAULT_ACTIVE_LENS_CONTEXT };
    }
  }

  // ===========================================================================
  // BATCH SYNC OPERATIONS
  // ===========================================================================

  /**
   * Sync all categories for a user to LKGC
   */
  async syncAllCategories(
    userId: string,
  ): Promise<BatchSyncResult<{ categoryId: string; lkgcNodeId: string }>> {
    const categories = await prisma.category.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        framingQuestion: true,
      },
    });

    const results: SyncResult<{ categoryId: string; lkgcNodeId: string }>[] =
      [];
    const errors: string[] = [];

    for (const category of categories) {
      const result = await this.syncCategoryToLkgcNode({
        categoryId: category.id,
        userId,
        name: category.name,
        description: category.description || undefined,
        framingQuestion: category.framingQuestion || undefined,
      });

      if (result.success && result.data) {
        results.push({
          success: true,
          data: {
            categoryId: category.id,
            lkgcNodeId: result.data.lkgcNodeId,
          },
        });
      } else {
        results.push({ success: false, error: result.error });
        errors.push(result.error || "Unknown error");
      }
    }

    return {
      success: errors.length === 0,
      results,
      totalProcessed: categories.length,
      successCount: results.filter((r) => r.success).length,
      errorCount: errors.length,
      errors,
    };
  }

  /**
   * Sync all category relations for a user to LKGC
   */
  async syncAllCategoryRelations(
    userId: string,
  ): Promise<BatchSyncResult<{ relationId: string; lkgcEdgeId: string }>> {
    const relations = await prisma.categoryRelation.findMany({
      where: { userId },
    });

    const results: SyncResult<{ relationId: string; lkgcEdgeId: string }>[] =
      [];
    const errors: string[] = [];

    for (const relation of relations) {
      const result = await this.syncCategoryRelationToLkgcEdge({
        categoryRelationId: relation.id,
        userId,
        sourceCategoryId: relation.sourceCategoryId,
        targetCategoryId: relation.targetCategoryId,
        relationType: relation.relationType,
        strength: relation.strength,
        isUserConfirmed: relation.isUserConfirmed,
        isAutoSuggested: relation.isAutoSuggested,
      });

      if (result.success && result.data) {
        results.push({
          success: true,
          data: {
            relationId: relation.id,
            lkgcEdgeId: result.data.lkgcEdgeId,
          },
        });
      } else {
        results.push({ success: false, error: result.error });
        errors.push(result.error || "Unknown error");
      }
    }

    return {
      success: errors.length === 0,
      results,
      totalProcessed: relations.length,
      successCount: results.filter((r) => r.success).length,
      errorCount: errors.length,
      errors,
    };
  }

  /**
   * Sync all participations for a user to LKGC
   */
  async syncAllParticipations(
    userId: string,
  ): Promise<BatchSyncResult<{ participationId: string; lkgcEdgeId: string }>> {
    // Get participations through categories the user owns
    const participations = await prisma.cardCategoryParticipation.findMany({
      where: {
        category: { userId },
      },
      select: {
        id: true,
        cardId: true,
        categoryId: true,
        semanticRole: true,
        isPrimary: true,
        category: {
          select: { userId: true },
        },
      },
    });

    const results: SyncResult<{
      participationId: string;
      lkgcEdgeId: string;
    }>[] = [];
    const errors: string[] = [];

    for (const participation of participations) {
      const result = await this.syncParticipationToLkgcEdge({
        participationId: participation.id,
        userId: participation.category.userId,
        cardId: participation.cardId,
        categoryId: participation.categoryId,
        semanticRole: participation.semanticRole,
        isPrimary: participation.isPrimary,
      });

      if (result.success && result.data) {
        results.push({
          success: true,
          data: {
            participationId: participation.id,
            lkgcEdgeId: result.data.lkgcEdgeId,
          },
        });
      } else {
        results.push({ success: false, error: result.error });
        errors.push(result.error || "Unknown error");
      }
    }

    return {
      success: errors.length === 0,
      results,
      totalProcessed: participations.length,
      successCount: results.filter((r) => r.success).length,
      errorCount: errors.length,
      errors,
    };
  }

  // ===========================================================================
  // STATISTICS & QUERIES
  // ===========================================================================

  /**
   * Get bridge statistics for a user
   */
  async getStatistics(userId: string): Promise<BridgeStatistics> {
    const [
      categoryMappings,
      relationMappings,
      participationMappings,
      syncEvents,
      recentSyncEvents,
    ] = await Promise.all([
      prisma.ecosystemLkgcMapping.groupBy({
        by: ["status"],
        where: { userId, sourceType: "category" },
        _count: true,
      }),
      prisma.ecosystemLkgcMapping.findMany({
        where: { userId, sourceType: "category_relation", status: "active" },
        select: { metadata: true },
      }),
      prisma.ecosystemLkgcMapping.groupBy({
        by: ["status"],
        where: { userId, sourceType: "participation" },
        _count: true,
      }),
      prisma.ecosystemSyncEvent.count({ where: { userId } }),
      prisma.ecosystemSyncEvent.findMany({
        where: {
          userId,
          timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { success: true },
      }),
    ]);

    // Count relation mappings by type
    const relationsByType: Record<string, number> = {};
    for (const mapping of relationMappings) {
      const metadata = mapping.metadata as {
        originalRelationType?: string;
      } | null;
      const relType = metadata?.originalRelationType || "unknown";
      relationsByType[relType] = (relationsByType[relType] || 0) + 1;
    }

    // Count primary participations
    const primaryParticipations = await prisma.ecosystemLkgcMapping.count({
      where: {
        userId,
        sourceType: "participation",
        status: "active",
        metadata: { path: ["isPrimary"], equals: true },
      },
    });

    const categoryStats = {
      total: categoryMappings.reduce((sum, g) => sum + g._count, 0),
      active: categoryMappings.find((g) => g.status === "active")?._count || 0,
      pending:
        categoryMappings.find((g) => g.status === "pending")?._count || 0,
      orphaned:
        categoryMappings.find((g) => g.status === "orphaned")?._count || 0,
    };

    const participationStats = {
      total: participationMappings.reduce((sum, g) => sum + g._count, 0),
      active:
        participationMappings.find((g) => g.status === "active")?._count || 0,
      primaryCount: primaryParticipations,
    };

    const successfulRecent = recentSyncEvents.filter((e) => e.success).length;
    const successRate =
      recentSyncEvents.length > 0
        ? successfulRecent / recentSyncEvents.length
        : 1;

    const lastSync = await prisma.ecosystemLkgcMapping.findFirst({
      where: { userId },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    });

    return {
      userId,
      categoryMappings: categoryStats,
      relationMappings: {
        total: relationMappings.length,
        active: relationMappings.length,
        byRelationType: relationsByType,
      },
      participationMappings: participationStats,
      syncEvents: {
        total: syncEvents,
        last24Hours: recentSyncEvents.length,
        successRate,
      },
      lastSyncAt: lastSync?.lastSyncedAt || undefined,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private async getCategoryMapping(
    userId: string,
    categoryId: string,
  ): Promise<{ targetId: string } | null> {
    return prisma.ecosystemLkgcMapping.findFirst({
      where: {
        userId,
        sourceType: "category",
        sourceId: categoryId,
        status: "active",
      },
      select: { targetId: true },
    });
  }

  private async recordSyncEvent(event: {
    id: string;
    eventType: string;
    userId: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    mappingId?: string;
    success: boolean;
    errorMessage?: string;
    timestamp: Timestamp;
    metadata?: Prisma.JsonValue;
  }): Promise<void> {
    await prisma.ecosystemSyncEvent.create({
      data: {
        id: event.id,
        eventType: event.eventType,
        userId: event.userId,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        targetType: event.targetType,
        targetId: event.targetId,
        mappingId: event.mappingId,
        success: event.success,
        errorMessage: event.errorMessage,
        metadata: event.metadata ?? undefined,
        timestamp: new Date(event.timestamp),
      },
    });
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let bridgeInstance: EcosystemBridgeService | null = null;

export function getEcosystemBridge(
  config?: Partial<EcosystemBridgeConfig>,
  hooks?: EcosystemBridgeHooks,
): EcosystemBridgeService {
  if (!bridgeInstance) {
    bridgeInstance = new EcosystemBridgeService(config, hooks);
  }
  return bridgeInstance;
}

export function resetEcosystemBridge(): void {
  bridgeInstance = null;
}
