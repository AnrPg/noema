// =============================================================================
// CANONICAL CARD SERVICE
// =============================================================================
// Phase 6A: Multi-Faceted Cards
//
// Service for managing canonical cards - the single source of truth for card
// content and scheduling state. Aligned with Prisma schema.
// =============================================================================

import { prisma } from "../config/database.js";
import { Prisma, CanonicalCard, ContentPrimitive } from "@prisma/client";

// =============================================================================
// TYPES
// =============================================================================

export interface CreateCanonicalCardInput {
  structuralType?: string;
  tags?: string[];
  notes?: string;
  sourceType?: string;
  sourcePluginId?: string;
  sourceImportId?: string;
  sourceOriginalId?: string;
  sourceUrl?: string;
  sourceCreatedBy?: string;
  sourceAiModel?: string;
  sourceAiPromptHash?: string;
  defaultLayoutArrangement?: string;
  defaultLayoutPrimitiveOrder?: string[];
  defaultLayoutCustomSpec?: Prisma.InputJsonValue;
  contentPrimitives?: CreateContentPrimitiveInput[];
}

export interface CreateContentPrimitiveInput {
  type: string; // text, markdown, latex, code, image, audio, cloze_region, formula, etc.
  content: Prisma.InputJsonValue;
  displayOrder?: number;
  label?: string;
  altText?: string;
  sourcePluginId?: string;
}

export interface UpdateCanonicalCardInput {
  structuralType?: string;
  tags?: string[];
  notes?: string;
  defaultLayoutArrangement?: string;
  defaultLayoutPrimitiveOrder?: string[];
  defaultLayoutCustomSpec?: Prisma.InputJsonValue;
  isArchived?: boolean;
  isSuspended?: boolean;
  suspendReason?: string;
}

export interface ListCanonicalCardsInput {
  userId: string;
  structuralTypes?: string[];
  tags?: string[];
  schedulingStates?: string[];
  isArchived?: boolean;
  isSuspended?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: "createdAt" | "updatedAt" | "nextReviewDate";
  orderDirection?: "asc" | "desc";
}

export interface CanonicalCardWithRelations extends CanonicalCard {
  contentPrimitives: ContentPrimitive[];
  faces: { id: string; isDefault: boolean; name: string }[];
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class CanonicalCardService {
  /**
   * Create a new canonical card with content primitives
   */
  async create(
    userId: string,
    input: CreateCanonicalCardInput,
  ): Promise<{
    success: boolean;
    card?: CanonicalCardWithRelations;
    error?: string;
  }> {
    try {
      const card = await prisma.$transaction(async (tx) => {
        // Create the canonical card
        const newCard = await tx.canonicalCard.create({
          data: {
            userId,
            structuralType: input.structuralType ?? "single_primitive",
            tags: input.tags ?? [],
            notes: input.notes,
            sourceType: input.sourceType ?? "manual",
            sourcePluginId: input.sourcePluginId,
            sourceImportId: input.sourceImportId,
            sourceOriginalId: input.sourceOriginalId,
            sourceUrl: input.sourceUrl,
            sourceCreatedBy: input.sourceCreatedBy ?? "user",
            sourceAiModel: input.sourceAiModel,
            sourceAiPromptHash: input.sourceAiPromptHash,
            defaultLayoutArrangement:
              input.defaultLayoutArrangement ?? "sequential",
            defaultLayoutPrimitiveOrder:
              input.defaultLayoutPrimitiveOrder ?? [],
            defaultLayoutCustomSpec:
              input.defaultLayoutCustomSpec ?? Prisma.DbNull,
          },
        });

        // Create content primitives if provided
        if (input.contentPrimitives && input.contentPrimitives.length > 0) {
          const primitiveIds: string[] = [];

          for (let i = 0; i < input.contentPrimitives.length; i++) {
            const p = input.contentPrimitives[i];
            const primitive = await tx.contentPrimitive.create({
              data: {
                canonicalCardId: newCard.id,
                type: p.type,
                content: p.content,
                displayOrder: p.displayOrder ?? i,
                label: p.label,
                altText: p.altText,
                sourcePluginId: p.sourcePluginId,
              },
            });
            primitiveIds.push(primitive.id);
          }

          // Update layout order if not specified
          if (
            !input.defaultLayoutPrimitiveOrder ||
            input.defaultLayoutPrimitiveOrder.length === 0
          ) {
            await tx.canonicalCard.update({
              where: { id: newCard.id },
              data: { defaultLayoutPrimitiveOrder: primitiveIds },
            });
          }
        }

        // Emit creation event
        await tx.canonicalCardEvent.create({
          data: {
            canonicalCardId: newCard.id,
            userId,
            eventType: "card_created",
            eventData: {
              structuralType: newCard.structuralType,
              primitiveCount: input.contentPrimitives?.length ?? 0,
            },
          },
        });

        // Return with relations
        return tx.canonicalCard.findUnique({
          where: { id: newCard.id },
          include: {
            contentPrimitives: { orderBy: { displayOrder: "asc" } },
            faces: { select: { id: true, isDefault: true, name: true } },
          },
        });
      });

      return { success: true, card: card as CanonicalCardWithRelations };
    } catch (error) {
      console.error("Failed to create canonical card:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get a canonical card by ID
   */
  async getById(
    cardId: string,
  ): Promise<{
    success: boolean;
    card?: CanonicalCardWithRelations;
    error?: string;
  }> {
    try {
      const card = await prisma.canonicalCard.findUnique({
        where: { id: cardId },
        include: {
          contentPrimitives: { orderBy: { displayOrder: "asc" } },
          faces: { select: { id: true, isDefault: true, name: true } },
        },
      });

      if (!card) {
        return { success: false, error: "Card not found" };
      }

      return { success: true, card: card as CanonicalCardWithRelations };
    } catch (error) {
      console.error("Failed to get canonical card:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * List canonical cards with filters
   */
  async list(
    input: ListCanonicalCardsInput,
  ): Promise<{
    success: boolean;
    cards?: CanonicalCardWithRelations[];
    total?: number;
    error?: string;
  }> {
    try {
      const where: Prisma.CanonicalCardWhereInput = {
        userId: input.userId,
      };

      if (input.structuralTypes?.length) {
        where.structuralType = { in: input.structuralTypes };
      }
      if (input.tags?.length) {
        where.tags = { hasSome: input.tags };
      }
      if (input.schedulingStates?.length) {
        where.schedulingState = { in: input.schedulingStates };
      }
      if (input.isArchived !== undefined) {
        where.isArchived = input.isArchived;
      }
      if (input.isSuspended !== undefined) {
        where.isSuspended = input.isSuspended;
      }

      const orderBy: Prisma.CanonicalCardOrderByWithRelationInput = {};
      if (input.orderBy) {
        orderBy[input.orderBy] = input.orderDirection ?? "desc";
      } else {
        orderBy.createdAt = "desc";
      }

      const [cards, total] = await Promise.all([
        prisma.canonicalCard.findMany({
          where,
          orderBy,
          take: input.limit ?? 50,
          skip: input.offset ?? 0,
          include: {
            contentPrimitives: { orderBy: { displayOrder: "asc" } },
            faces: { select: { id: true, isDefault: true, name: true } },
          },
        }),
        prisma.canonicalCard.count({ where }),
      ]);

      return {
        success: true,
        cards: cards as CanonicalCardWithRelations[],
        total,
      };
    } catch (error) {
      console.error("Failed to list canonical cards:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update a canonical card
   */
  async update(
    userId: string,
    cardId: string,
    input: UpdateCanonicalCardInput,
  ): Promise<{
    success: boolean;
    card?: CanonicalCardWithRelations;
    error?: string;
  }> {
    try {
      const existing = await prisma.canonicalCard.findUnique({
        where: { id: cardId },
      });

      if (!existing) {
        return { success: false, error: "Card not found" };
      }
      if (existing.userId !== userId) {
        return { success: false, error: "Unauthorized" };
      }

      const card = await prisma.$transaction(async (tx) => {
        const updated = await tx.canonicalCard.update({
          where: { id: cardId },
          data: {
            structuralType: input.structuralType,
            tags: input.tags,
            notes: input.notes,
            defaultLayoutArrangement: input.defaultLayoutArrangement,
            defaultLayoutPrimitiveOrder: input.defaultLayoutPrimitiveOrder,
            defaultLayoutCustomSpec: input.defaultLayoutCustomSpec,
            isArchived: input.isArchived,
            isSuspended: input.isSuspended,
            suspendReason: input.suspendReason,
            version: { increment: 1 },
          },
          include: {
            contentPrimitives: { orderBy: { displayOrder: "asc" } },
            faces: { select: { id: true, isDefault: true, name: true } },
          },
        });

        await tx.canonicalCardEvent.create({
          data: {
            canonicalCardId: cardId,
            userId,
            eventType: "card_updated",
            eventData: { changedFields: Object.keys(input) },
          },
        });

        return updated;
      });

      return { success: true, card: card as CanonicalCardWithRelations };
    } catch (error) {
      console.error("Failed to update canonical card:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Archive a canonical card (soft delete)
   */
  async archive(
    userId: string,
    cardId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.update(userId, cardId, { isArchived: true });
    return { success: result.success, error: result.error };
  }

  /**
   * Delete a canonical card permanently
   */
  async delete(
    userId: string,
    cardId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const card = await prisma.canonicalCard.findUnique({
        where: { id: cardId },
      });

      if (!card) {
        return { success: false, error: "Card not found" };
      }
      if (card.userId !== userId) {
        return { success: false, error: "Unauthorized" };
      }

      await prisma.canonicalCard.delete({ where: { id: cardId } });
      return { success: true };
    } catch (error) {
      console.error("Failed to delete canonical card:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Add a content primitive to a card
   */
  async addPrimitive(
    cardId: string,
    input: CreateContentPrimitiveInput,
    position?: number,
  ): Promise<{
    success: boolean;
    primitive?: ContentPrimitive;
    error?: string;
  }> {
    try {
      const card = await prisma.canonicalCard.findUnique({
        where: { id: cardId },
        include: { contentPrimitives: true },
      });

      if (!card) {
        return { success: false, error: "Card not found" };
      }

      const displayOrder = position ?? card.contentPrimitives.length;

      const primitive = await prisma.$transaction(async (tx) => {
        // Shift existing primitives if inserting in middle
        if (
          position !== undefined &&
          position < card.contentPrimitives.length
        ) {
          await tx.contentPrimitive.updateMany({
            where: {
              canonicalCardId: cardId,
              displayOrder: { gte: position },
            },
            data: { displayOrder: { increment: 1 } },
          });
        }

        const newPrimitive = await tx.contentPrimitive.create({
          data: {
            canonicalCardId: cardId,
            type: input.type,
            content: input.content,
            displayOrder,
            label: input.label,
            altText: input.altText,
            sourcePluginId: input.sourcePluginId,
          },
        });

        // Update card version
        await tx.canonicalCard.update({
          where: { id: cardId },
          data: { version: { increment: 1 } },
        });

        return newPrimitive;
      });

      return { success: true, primitive };
    } catch (error) {
      console.error("Failed to add content primitive:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Remove a content primitive from a card
   */
  async removePrimitive(
    cardId: string,
    primitiveId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const primitive = await prisma.contentPrimitive.findFirst({
        where: { id: primitiveId, canonicalCardId: cardId },
      });

      if (!primitive) {
        return { success: false, error: "Primitive not found" };
      }

      await prisma.$transaction(async (tx) => {
        await tx.contentPrimitive.delete({ where: { id: primitiveId } });

        // Shift remaining primitives
        await tx.contentPrimitive.updateMany({
          where: {
            canonicalCardId: cardId,
            displayOrder: { gt: primitive.displayOrder },
          },
          data: { displayOrder: { decrement: 1 } },
        });

        await tx.canonicalCard.update({
          where: { id: cardId },
          data: { version: { increment: 1 } },
        });
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to remove content primitive:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update scheduling state (called by scheduler after reviews)
   */
  async updateSchedulingState(
    cardId: string,
    state: {
      schedulingState?: string;
      stability?: number;
      difficulty?: number;
      elapsedDays?: number;
      scheduledDays?: number;
      reps?: number;
      lapses?: number;
      lastReviewDate?: Date;
      nextReviewDate?: Date;
      halfLife?: number;
      thetaVector?: number[];
    },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await prisma.canonicalCard.update({
        where: { id: cardId },
        data: {
          schedulingState: state.schedulingState,
          stability: state.stability,
          difficulty: state.difficulty,
          elapsedDays: state.elapsedDays,
          scheduledDays: state.scheduledDays,
          reps: state.reps,
          lapses: state.lapses,
          lastReviewDate: state.lastReviewDate,
          nextReviewDate: state.nextReviewDate,
          halfLife: state.halfLife,
          thetaVector: state.thetaVector,
        },
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to update scheduling state:", error);
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

let instance: CanonicalCardService | null = null;

export function getCanonicalCardService(): CanonicalCardService {
  if (!instance) {
    instance = new CanonicalCardService();
  }
  return instance;
}
