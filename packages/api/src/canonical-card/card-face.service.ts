// =============================================================================
// CARD FACE SERVICE
// =============================================================================
// Phase 6A: Multi-Faceted Cards - Face Management
//
// Service for managing card faces - context-sensitive overlays that determine
// how a canonical card's content is presented. Aligned with Prisma schema.
// =============================================================================

import { prisma } from "../config/database.js";
import {
  Prisma,
  CardFace,
  FaceApplicabilityRule,
  FacePrimitiveRef,
} from "@prisma/client";

// =============================================================================
// TYPES
// =============================================================================

export interface CreateCardFaceInput {
  canonicalCardId: string;
  name: string;
  description?: string;
  faceType: string;
  depthLevel?: string;

  // Question presentation
  questionStrategy?: string;
  questionOverrideContent?: Prisma.InputJsonValue;
  questionWrapperPrefix?: string;
  questionWrapperSuffix?: string;
  questionLayoutOverride?: Prisma.InputJsonValue;
  questionEmphasisHints?: Prisma.InputJsonValue;

  // Answer presentation
  answerStrategy?: string;
  answerOverrideContent?: Prisma.InputJsonValue;
  answerWrapperPrefix?: string;
  answerWrapperSuffix?: string;
  answerLayoutOverride?: Prisma.InputJsonValue;
  answerEmphasisHints?: Prisma.InputJsonValue;

  // Scaffolding
  scaffoldingLevel?: number;
  scaffoldingHints?: Prisma.InputJsonValue;
  scaffoldingAutoReveal?: boolean;
  scaffoldingPartialTemplates?: string[];

  // Expected output
  expectedOutputType?: string;
  evaluationCriteriaType?: string;
  evaluationCriteria?: Prisma.InputJsonValue;

  // Priority & mastery
  priority?: number;
  globalContributionWeight?: number;
  crossFaceTransferRules?: Prisma.InputJsonValue;
  canEstablishMastery?: boolean;
  minReviewsForTransfer?: number;

  // Provenance
  sourceType?: string;
  sourceCreatedBy?: string;
  sourceAiModel?: string;
  sourceAiPromptHash?: string;
  sourcePluginId?: string;

  // Status
  isDefault?: boolean;

  // Primitive references
  primitiveRefs?: CreatePrimitiveRefInput[];

  // Applicability rules
  applicabilityRules?: CreateApplicabilityRuleInput[];
}

export interface CreatePrimitiveRefInput {
  primitiveId: string;
  refType: string; // "question" | "answer"
  displayOrder?: number;
  transformType?: string;
  transformConfig?: Prisma.InputJsonValue;
}

export interface CreateApplicabilityRuleInput {
  description: string;
  ruleType: string;
  conditionOperator?: string;
  conditions: Prisma.InputJsonValue;
  conditionNegated?: boolean;
  priority?: number;
  source?: string;
  confidence?: number;
}

export interface UpdateCardFaceInput {
  name?: string;
  description?: string;
  faceType?: string;
  depthLevel?: string;
  questionStrategy?: string;
  questionOverrideContent?: Prisma.InputJsonValue;
  questionWrapperPrefix?: string;
  questionWrapperSuffix?: string;
  answerStrategy?: string;
  answerOverrideContent?: Prisma.InputJsonValue;
  answerWrapperPrefix?: string;
  answerWrapperSuffix?: string;
  scaffoldingLevel?: number;
  scaffoldingHints?: Prisma.InputJsonValue;
  expectedOutputType?: string;
  evaluationCriteriaType?: string;
  evaluationCriteria?: Prisma.InputJsonValue;
  priority?: number;
  globalContributionWeight?: number;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface ListCardFacesInput {
  canonicalCardId: string;
  faceTypes?: string[];
  depthLevels?: string[];
  includeInactive?: boolean;
}

export interface CardFaceWithRelations extends CardFace {
  primitiveRefs: FacePrimitiveRef[];
  applicabilityRules: FaceApplicabilityRule[];
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class CardFaceService {
  /**
   * Create a new card face
   */
  async create(
    userId: string,
    input: CreateCardFaceInput,
  ): Promise<{
    success: boolean;
    face?: CardFaceWithRelations;
    error?: string;
  }> {
    try {
      // Verify card exists and belongs to user
      const card = await prisma.canonicalCard.findUnique({
        where: { id: input.canonicalCardId },
        include: { faces: true },
      });

      if (!card) {
        return { success: false, error: "Canonical card not found" };
      }
      if (card.userId !== userId) {
        return { success: false, error: "Unauthorized" };
      }

      // Determine if this should be default
      const isDefault = input.isDefault ?? card.faces.length === 0;

      const face = await prisma.$transaction(async (tx) => {
        // If setting as default, unset others
        if (isDefault) {
          await tx.cardFace.updateMany({
            where: { canonicalCardId: input.canonicalCardId, isDefault: true },
            data: { isDefault: false },
          });
        }

        // Create face
        const newFace = await tx.cardFace.create({
          data: {
            canonicalCardId: input.canonicalCardId,
            name: input.name,
            description: input.description,
            faceType: input.faceType,
            depthLevel: input.depthLevel ?? "recall",
            questionStrategy: input.questionStrategy ?? "reference_all",
            questionOverrideContent:
              input.questionOverrideContent ?? Prisma.DbNull,
            questionWrapperPrefix: input.questionWrapperPrefix,
            questionWrapperSuffix: input.questionWrapperSuffix,
            questionLayoutOverride:
              input.questionLayoutOverride ?? Prisma.DbNull,
            questionEmphasisHints: input.questionEmphasisHints ?? Prisma.DbNull,
            answerStrategy: input.answerStrategy ?? "reference_all",
            answerOverrideContent: input.answerOverrideContent ?? Prisma.DbNull,
            answerWrapperPrefix: input.answerWrapperPrefix,
            answerWrapperSuffix: input.answerWrapperSuffix,
            answerLayoutOverride: input.answerLayoutOverride ?? Prisma.DbNull,
            answerEmphasisHints: input.answerEmphasisHints ?? Prisma.DbNull,
            scaffoldingLevel: input.scaffoldingLevel ?? 0,
            scaffoldingHints: input.scaffoldingHints ?? Prisma.DbNull,
            scaffoldingAutoReveal: input.scaffoldingAutoReveal ?? false,
            scaffoldingPartialTemplates:
              input.scaffoldingPartialTemplates ?? [],
            expectedOutputType: input.expectedOutputType ?? "binary",
            evaluationCriteriaType: input.evaluationCriteriaType,
            evaluationCriteria: input.evaluationCriteria ?? Prisma.DbNull,
            priority: input.priority ?? 50,
            globalContributionWeight: input.globalContributionWeight ?? 1.0,
            crossFaceTransferRules:
              input.crossFaceTransferRules ?? Prisma.DbNull,
            canEstablishMastery: input.canEstablishMastery ?? true,
            minReviewsForTransfer: input.minReviewsForTransfer ?? 1,
            sourceType: input.sourceType ?? "manual",
            sourceCreatedBy: input.sourceCreatedBy ?? "user",
            sourceAiModel: input.sourceAiModel,
            sourceAiPromptHash: input.sourceAiPromptHash,
            sourcePluginId: input.sourcePluginId,
            isDefault,
            isActive: true,
          },
        });

        // Create primitive refs
        if (input.primitiveRefs?.length) {
          for (let i = 0; i < input.primitiveRefs.length; i++) {
            const ref = input.primitiveRefs[i];
            await tx.facePrimitiveRef.create({
              data: {
                faceId: newFace.id,
                primitiveId: ref.primitiveId,
                refType: ref.refType,
                displayOrder: ref.displayOrder ?? i,
                transformType: ref.transformType ?? "none",
                transformConfig: ref.transformConfig ?? Prisma.DbNull,
              },
            });
          }
        }

        // Create applicability rules
        if (input.applicabilityRules?.length) {
          for (let i = 0; i < input.applicabilityRules.length; i++) {
            const rule = input.applicabilityRules[i];
            await tx.faceApplicabilityRule.create({
              data: {
                faceId: newFace.id,
                description: rule.description,
                ruleType: rule.ruleType,
                conditionOperator: rule.conditionOperator ?? "and",
                conditions: rule.conditions,
                conditionNegated: rule.conditionNegated ?? false,
                priority: rule.priority ?? i,
                source: rule.source ?? "manual",
                confidence: rule.confidence,
              },
            });
          }
        }

        // Update canonical card default face
        if (isDefault) {
          await tx.canonicalCard.update({
            where: { id: input.canonicalCardId },
            data: { defaultFaceId: newFace.id },
          });
        }

        // Emit event
        await tx.canonicalCardEvent.create({
          data: {
            canonicalCardId: input.canonicalCardId,
            userId,
            eventType: "face_created",
            eventData: {
              faceId: newFace.id,
              faceType: newFace.faceType,
              isDefault,
            },
          },
        });

        // Return with relations
        return tx.cardFace.findUnique({
          where: { id: newFace.id },
          include: {
            primitiveRefs: { orderBy: { displayOrder: "asc" } },
            applicabilityRules: { orderBy: { priority: "asc" } },
          },
        });
      });

      return { success: true, face: face as CardFaceWithRelations };
    } catch (error) {
      console.error("Failed to create card face:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get a card face by ID
   */
  async getById(
    faceId: string,
  ): Promise<{
    success: boolean;
    face?: CardFaceWithRelations;
    error?: string;
  }> {
    try {
      const face = await prisma.cardFace.findUnique({
        where: { id: faceId },
        include: {
          primitiveRefs: { orderBy: { displayOrder: "asc" } },
          applicabilityRules: { orderBy: { priority: "asc" } },
        },
      });

      if (!face) {
        return { success: false, error: "Face not found" };
      }

      return { success: true, face: face as CardFaceWithRelations };
    } catch (error) {
      console.error("Failed to get card face:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * List faces for a canonical card
   */
  async list(
    input: ListCardFacesInput,
  ): Promise<{
    success: boolean;
    faces?: CardFaceWithRelations[];
    error?: string;
  }> {
    try {
      const where: Prisma.CardFaceWhereInput = {
        canonicalCardId: input.canonicalCardId,
      };

      if (input.faceTypes?.length) {
        where.faceType = { in: input.faceTypes };
      }
      if (input.depthLevels?.length) {
        where.depthLevel = { in: input.depthLevels };
      }
      if (!input.includeInactive) {
        where.isActive = true;
      }

      const faces = await prisma.cardFace.findMany({
        where,
        orderBy: [
          { isDefault: "desc" },
          { priority: "desc" },
          { createdAt: "asc" },
        ],
        include: {
          primitiveRefs: { orderBy: { displayOrder: "asc" } },
          applicabilityRules: { orderBy: { priority: "asc" } },
        },
      });

      return { success: true, faces: faces as CardFaceWithRelations[] };
    } catch (error) {
      console.error("Failed to list card faces:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get the default face for a canonical card
   */
  async getDefault(
    canonicalCardId: string,
  ): Promise<{
    success: boolean;
    face?: CardFaceWithRelations;
    error?: string;
  }> {
    try {
      const face = await prisma.cardFace.findFirst({
        where: { canonicalCardId, isDefault: true },
        include: {
          primitiveRefs: { orderBy: { displayOrder: "asc" } },
          applicabilityRules: { orderBy: { priority: "asc" } },
        },
      });

      if (!face) {
        return { success: false, error: "No default face found" };
      }

      return { success: true, face: face as CardFaceWithRelations };
    } catch (error) {
      console.error("Failed to get default face:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update a card face
   */
  async update(
    userId: string,
    faceId: string,
    input: UpdateCardFaceInput,
  ): Promise<{
    success: boolean;
    face?: CardFaceWithRelations;
    error?: string;
  }> {
    try {
      const existing = await prisma.cardFace.findUnique({
        where: { id: faceId },
        include: { canonicalCard: true },
      });

      if (!existing) {
        return { success: false, error: "Face not found" };
      }
      if (existing.canonicalCard.userId !== userId) {
        return { success: false, error: "Unauthorized" };
      }

      const face = await prisma.$transaction(async (tx) => {
        // Handle default change
        if (input.isDefault === true && !existing.isDefault) {
          await tx.cardFace.updateMany({
            where: {
              canonicalCardId: existing.canonicalCardId,
              isDefault: true,
            },
            data: { isDefault: false },
          });
          await tx.canonicalCard.update({
            where: { id: existing.canonicalCardId },
            data: { defaultFaceId: faceId },
          });
        }

        const updated = await tx.cardFace.update({
          where: { id: faceId },
          data: {
            name: input.name,
            description: input.description,
            faceType: input.faceType,
            depthLevel: input.depthLevel,
            questionStrategy: input.questionStrategy,
            questionOverrideContent: input.questionOverrideContent,
            questionWrapperPrefix: input.questionWrapperPrefix,
            questionWrapperSuffix: input.questionWrapperSuffix,
            answerStrategy: input.answerStrategy,
            answerOverrideContent: input.answerOverrideContent,
            answerWrapperPrefix: input.answerWrapperPrefix,
            answerWrapperSuffix: input.answerWrapperSuffix,
            scaffoldingLevel: input.scaffoldingLevel,
            scaffoldingHints: input.scaffoldingHints,
            expectedOutputType: input.expectedOutputType,
            evaluationCriteriaType: input.evaluationCriteriaType,
            evaluationCriteria: input.evaluationCriteria,
            priority: input.priority,
            globalContributionWeight: input.globalContributionWeight,
            isActive: input.isActive,
            isDefault: input.isDefault,
          },
          include: {
            primitiveRefs: { orderBy: { displayOrder: "asc" } },
            applicabilityRules: { orderBy: { priority: "asc" } },
          },
        });

        await tx.canonicalCardEvent.create({
          data: {
            canonicalCardId: existing.canonicalCardId,
            userId,
            eventType: "face_updated",
            eventData: { faceId, changedFields: Object.keys(input) },
          },
        });

        return updated;
      });

      return { success: true, face: face as CardFaceWithRelations };
    } catch (error) {
      console.error("Failed to update card face:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Deactivate a face (soft delete)
   */
  async deactivate(
    userId: string,
    faceId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.update(userId, faceId, { isActive: false });
    return { success: result.success, error: result.error };
  }

  /**
   * Delete a face permanently
   */
  async delete(
    userId: string,
    faceId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const face = await prisma.cardFace.findUnique({
        where: { id: faceId },
        include: { canonicalCard: true },
      });

      if (!face) {
        return { success: false, error: "Face not found" };
      }
      if (face.canonicalCard.userId !== userId) {
        return { success: false, error: "Unauthorized" };
      }
      if (face.isDefault) {
        return { success: false, error: "Cannot delete default face" };
      }

      await prisma.cardFace.delete({ where: { id: faceId } });
      return { success: true };
    } catch (error) {
      console.error("Failed to delete card face:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Add an applicability rule to a face
   */
  async addApplicabilityRule(
    userId: string,
    faceId: string,
    input: CreateApplicabilityRuleInput,
  ): Promise<{
    success: boolean;
    rule?: FaceApplicabilityRule;
    error?: string;
  }> {
    try {
      const face = await prisma.cardFace.findUnique({
        where: { id: faceId },
        include: { canonicalCard: true, applicabilityRules: true },
      });

      if (!face) {
        return { success: false, error: "Face not found" };
      }
      if (face.canonicalCard.userId !== userId) {
        return { success: false, error: "Unauthorized" };
      }

      const rule = await prisma.faceApplicabilityRule.create({
        data: {
          faceId,
          description: input.description,
          ruleType: input.ruleType,
          conditionOperator: input.conditionOperator ?? "and",
          conditions: input.conditions,
          conditionNegated: input.conditionNegated ?? false,
          priority: input.priority ?? face.applicabilityRules.length,
          source: input.source ?? "manual",
          confidence: input.confidence,
        },
      });

      return { success: true, rule };
    } catch (error) {
      console.error("Failed to add applicability rule:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Remove an applicability rule
   */
  async removeApplicabilityRule(
    userId: string,
    ruleId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const rule = await prisma.faceApplicabilityRule.findUnique({
        where: { id: ruleId },
        include: { face: { include: { canonicalCard: true } } },
      });

      if (!rule) {
        return { success: false, error: "Rule not found" };
      }
      if (rule.face.canonicalCard.userId !== userId) {
        return { success: false, error: "Unauthorized" };
      }

      await prisma.faceApplicabilityRule.delete({ where: { id: ruleId } });
      return { success: true };
    } catch (error) {
      console.error("Failed to remove applicability rule:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Record face performance
   */
  async recordPerformance(
    faceId: string,
    userId: string,
    input: {
      isCorrect: boolean;
      responseTimeMs: number;
      confidenceRating?: number;
      contextCategoryId?: string;
      contextModeId?: string;
    },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const face = await prisma.cardFace.findUnique({
        where: { id: faceId },
      });

      if (!face) {
        return { success: false, error: "Face not found" };
      }

      await prisma.$transaction(async (tx) => {
        // Create performance record
        await tx.facePerformanceRecord.create({
          data: {
            faceId,
            canonicalCardId: face.canonicalCardId,
            userId,
            isCorrect: input.isCorrect,
            responseTimeMs: input.responseTimeMs,
            confidenceRating: input.confidenceRating,
            contextCategoryId: input.contextCategoryId,
            contextModeId: input.contextModeId,
          },
        });

        // Update face performance snapshot
        const newTimesShown = face.timesShown + 1;
        const newTimesCorrect = face.timesCorrect + (input.isCorrect ? 1 : 0);
        const newSuccessRate = newTimesCorrect / newTimesShown;
        const newAvgResponseTime = Math.round(
          (face.faceAvgResponseTimeMs * face.timesShown +
            input.responseTimeMs) /
            newTimesShown,
        );

        await tx.cardFace.update({
          where: { id: faceId },
          data: {
            timesShown: newTimesShown,
            timesCorrect: newTimesCorrect,
            successRate: newSuccessRate,
            faceAvgResponseTimeMs: newAvgResponseTime,
            lastShownAt: new Date(),
          },
        });

        // Emit event
        await tx.canonicalCardEvent.create({
          data: {
            canonicalCardId: face.canonicalCardId,
            userId,
            eventType: "face_reviewed",
            eventData: {
              faceId,
              isCorrect: input.isCorrect,
              responseTimeMs: input.responseTimeMs,
              contextCategoryId: input.contextCategoryId,
              contextModeId: input.contextModeId,
            },
          },
        });
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to record face performance:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: CardFaceService | null = null;

export function getCardFaceService(): CardFaceService {
  if (!instance) {
    instance = new CardFaceService();
  }
  return instance;
}
