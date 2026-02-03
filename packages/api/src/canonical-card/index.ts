// =============================================================================
// CANONICAL CARD MODULE
// =============================================================================
// Phase 6A: Multi-Faceted Cards - Module Exports
// =============================================================================

// Services
export {
  CanonicalCardService,
  getCanonicalCardService,
  type CreateCanonicalCardInput,
  type CreateContentPrimitiveInput,
  type UpdateCanonicalCardInput,
  type ListCanonicalCardsInput,
  type CanonicalCardWithRelations,
} from "./canonical-card.service.js";

export {
  CardFaceService,
  getCardFaceService,
  type CreateCardFaceInput,
  type CreatePrimitiveRefInput,
  type CreateApplicabilityRuleInput,
  type UpdateCardFaceInput,
  type ListCardFacesInput,
  type CardFaceWithRelations,
} from "./card-face.service.js";

// Routes (Fastify plugin)
export {
  canonicalCardRoutes,
  default as canonicalCardRouter,
} from "./routes.js";
