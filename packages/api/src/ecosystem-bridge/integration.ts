// =============================================================================
// ECOSYSTEM BRIDGE INTEGRATION
// =============================================================================
// Helper functions to integrate the EcosystemBridge with existing routes.
// Call these after creating/updating/deleting entities in the database.

import { getEcosystemBridge } from "./index.js";

// =============================================================================
// CATEGORY SYNC HELPERS
// =============================================================================

/**
 * Sync a newly created category to LKGC.
 * Call this after prisma.category.create() in category.routes.ts
 */
export async function syncCategoryOnCreate(category: {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  framingQuestion?: string | null;
}): Promise<void> {
  try {
    const bridge = getEcosystemBridge();
    await bridge.syncCategoryToLkgcNode({
      categoryId: category.id,
      userId: category.userId,
      name: category.name,
      description: category.description || undefined,
      framingQuestion: category.framingQuestion || undefined,
    });
  } catch (error) {
    // Log but don't fail - bridge sync is non-critical
    console.error(
      "[EcosystemBridge] Failed to sync category on create:",
      error,
    );
  }
}

/**
 * Sync an updated category to LKGC.
 * Call this after prisma.category.update() in category.routes.ts
 */
export async function syncCategoryOnUpdate(category: {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  framingQuestion?: string | null;
}): Promise<void> {
  try {
    const bridge = getEcosystemBridge();
    await bridge.syncCategoryToLkgcNode({
      categoryId: category.id,
      userId: category.userId,
      name: category.name,
      description: category.description || undefined,
      framingQuestion: category.framingQuestion || undefined,
    });
  } catch (error) {
    console.error(
      "[EcosystemBridge] Failed to sync category on update:",
      error,
    );
  }
}

/**
 * Handle category deletion in LKGC.
 * Call this after prisma.category.delete() in category.routes.ts
 */
export async function syncCategoryOnDelete(
  categoryId: string,
  userId: string,
): Promise<void> {
  try {
    const bridge = getEcosystemBridge();
    await bridge.handleCategoryDeleted(categoryId, userId);
  } catch (error) {
    console.error(
      "[EcosystemBridge] Failed to sync category on delete:",
      error,
    );
  }
}

// =============================================================================
// CATEGORY RELATION SYNC HELPERS
// =============================================================================

/**
 * Sync a newly created category relation to LKGC.
 * Call this after prisma.categoryRelation.create() in category.routes.ts
 */
export async function syncCategoryRelationOnCreate(relation: {
  id: string;
  userId: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  relationType: string;
  strength: number;
  isUserConfirmed: boolean;
  isAutoSuggested: boolean;
}): Promise<void> {
  try {
    const bridge = getEcosystemBridge();
    await bridge.syncCategoryRelationToLkgcEdge({
      categoryRelationId: relation.id,
      userId: relation.userId,
      sourceCategoryId: relation.sourceCategoryId,
      targetCategoryId: relation.targetCategoryId,
      relationType: relation.relationType,
      strength: relation.strength,
      isUserConfirmed: relation.isUserConfirmed,
      isAutoSuggested: relation.isAutoSuggested,
    });
  } catch (error) {
    console.error(
      "[EcosystemBridge] Failed to sync category relation on create:",
      error,
    );
  }
}

/**
 * Sync an updated category relation to LKGC.
 * Call this after prisma.categoryRelation.update() in category.routes.ts
 */
export async function syncCategoryRelationOnUpdate(relation: {
  id: string;
  userId: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  relationType: string;
  strength: number;
  isUserConfirmed: boolean;
  isAutoSuggested: boolean;
}): Promise<void> {
  try {
    const bridge = getEcosystemBridge();
    await bridge.syncCategoryRelationToLkgcEdge({
      categoryRelationId: relation.id,
      userId: relation.userId,
      sourceCategoryId: relation.sourceCategoryId,
      targetCategoryId: relation.targetCategoryId,
      relationType: relation.relationType,
      strength: relation.strength,
      isUserConfirmed: relation.isUserConfirmed,
      isAutoSuggested: relation.isAutoSuggested,
    });
  } catch (error) {
    console.error(
      "[EcosystemBridge] Failed to sync category relation on update:",
      error,
    );
  }
}

// =============================================================================
// PARTICIPATION SYNC HELPERS
// =============================================================================

/**
 * Sync a newly created participation to LKGC.
 * Call this after prisma.cardCategoryParticipation.create() in participation.routes.ts
 */
export async function syncParticipationOnCreate(participation: {
  id: string;
  cardId: string;
  categoryId: string;
  semanticRole: string;
  isPrimary: boolean;
  category: { userId: string };
}): Promise<void> {
  try {
    const bridge = getEcosystemBridge();
    await bridge.syncParticipationToLkgcEdge({
      participationId: participation.id,
      userId: participation.category.userId,
      cardId: participation.cardId,
      categoryId: participation.categoryId,
      semanticRole: participation.semanticRole,
      isPrimary: participation.isPrimary,
    });
  } catch (error) {
    console.error(
      "[EcosystemBridge] Failed to sync participation on create:",
      error,
    );
  }
}

/**
 * Sync an updated participation to LKGC.
 * Call this after prisma.cardCategoryParticipation.update() in participation.routes.ts
 */
export async function syncParticipationOnUpdate(participation: {
  id: string;
  cardId: string;
  categoryId: string;
  semanticRole: string;
  isPrimary: boolean;
  category: { userId: string };
}): Promise<void> {
  try {
    const bridge = getEcosystemBridge();
    await bridge.syncParticipationToLkgcEdge({
      participationId: participation.id,
      userId: participation.category.userId,
      cardId: participation.cardId,
      categoryId: participation.categoryId,
      semanticRole: participation.semanticRole,
      isPrimary: participation.isPrimary,
    });
  } catch (error) {
    console.error(
      "[EcosystemBridge] Failed to sync participation on update:",
      error,
    );
  }
}

// =============================================================================
// CONTEXT REVIEW SYNC HELPERS
// =============================================================================

/**
 * Emit a context-aware review event to LKGC.
 * Call this after recording a review with categoryId in review.routes.ts
 */
export async function emitContextReviewOnSubmit(reviewData: {
  cardId: string;
  categoryId: string;
  userId: string;
  rating: number;
  responseTimeMs: number;
  contextSuccessRate: number;
  contextMasteryScore: number;
  reviewCountInContext: number;
}): Promise<void> {
  try {
    const bridge = getEcosystemBridge();
    await bridge.emitContextReviewEvent(reviewData);
  } catch (error) {
    console.error(
      "[EcosystemBridge] Failed to emit context review event:",
      error,
    );
  }
}

// =============================================================================
// MASTERY PROJECTION HELPERS
// =============================================================================

/**
 * Project LKGC mastery to participation after a review.
 * Call this after updating participation metrics in review.routes.ts
 */
export async function projectMasteryAfterReview(data: {
  participationId: string;
  cardId: string;
  categoryId: string;
  userId: string;
}): Promise<{ projectedScore: number; projectedSuccessRate: number } | null> {
  try {
    const bridge = getEcosystemBridge();
    const result = await bridge.projectMasteryToParticipation(data);
    return {
      projectedScore: result.projectedContextMasteryScore,
      projectedSuccessRate: result.projectedContextSuccessRate,
    };
  } catch (error) {
    console.error(
      "[EcosystemBridge] Failed to project mastery after review:",
      error,
    );
    return null;
  }
}

// =============================================================================
// DECISION ENGINE CONTEXT HELPERS
// =============================================================================

/**
 * Build active lens context for decision engine.
 * Call this when building review queue with category filter.
 */
export async function buildActiveLensContext(data: {
  userId: string;
  activeCategoryId?: string;
  filterToActiveCategory?: boolean;
  emphasisMultiplier?: number;
  deEmphasisMultiplier?: number;
}): Promise<{
  categoryNodeId?: string;
  participatingCardIds?: string[];
  context: {
    activeCategoryId?: string | null;
    activeCategoryName?: string | null;
    filterToActiveCategory: boolean;
    emphasisMultiplier: number;
    deEmphasisMultiplier: number;
  };
} | null> {
  try {
    const bridge = getEcosystemBridge();
    const result = await bridge.buildDecisionEngineContext(data);
    return {
      categoryNodeId: result.categoryNodeId,
      participatingCardIds: result.participatingCardIds,
      context: {
        activeCategoryId: result.context.activeCategoryId,
        activeCategoryName: result.context.activeCategoryName ?? undefined,
        filterToActiveCategory: result.context.filterToActiveCategory,
        emphasisMultiplier: result.context.emphasisMultiplier,
        deEmphasisMultiplier: result.context.deEmphasisMultiplier,
      },
    };
  } catch (error) {
    console.error(
      "[EcosystemBridge] Failed to build active lens context:",
      error,
    );
    return null;
  }
}
