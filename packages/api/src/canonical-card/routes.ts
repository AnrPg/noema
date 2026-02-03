// =============================================================================
// CANONICAL CARD API ROUTES
// =============================================================================
// Phase 6A: Multi-Faceted Cards - Fastify Routes
// =============================================================================

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getCanonicalCardService } from "./canonical-card.service.js";
import { getCardFaceService } from "./card-face.service.js";
import { authenticate } from "../middleware/auth.js";

const cardService = getCanonicalCardService();
const faceService = getCardFaceService();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const CreatePrimitiveSchema = z.object({
  type: z.string(), // text, markdown, latex, code, image, audio, etc.
  content: z.record(z.any()),
  displayOrder: z.number().optional(),
  label: z.string().optional(),
  altText: z.string().optional(),
  sourcePluginId: z.string().optional(),
});

const CreateCanonicalCardSchema = z.object({
  structuralType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  sourceType: z.string().optional(),
  sourcePluginId: z.string().optional(),
  sourceCreatedBy: z.string().optional(),
  sourceAiModel: z.string().optional(),
  defaultLayoutArrangement: z.string().optional(),
  defaultLayoutPrimitiveOrder: z.array(z.string()).optional(),
  contentPrimitives: z.array(CreatePrimitiveSchema).optional(),
});

const UpdateCanonicalCardSchema = z.object({
  structuralType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  defaultLayoutArrangement: z.string().optional(),
  defaultLayoutPrimitiveOrder: z.array(z.string()).optional(),
  isArchived: z.boolean().optional(),
  isSuspended: z.boolean().optional(),
  suspendReason: z.string().optional(),
});

const ListCardsQuerySchema = z.object({
  structuralTypes: z.string().optional(),
  tags: z.string().optional(),
  schedulingStates: z.string().optional(),
  isArchived: z.enum(["true", "false"]).optional(),
  isSuspended: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  orderBy: z.enum(["createdAt", "updatedAt", "nextReviewDate"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
});

const PrimitiveRefSchema = z.object({
  primitiveId: z.string(),
  refType: z.enum(["question", "answer"]),
  displayOrder: z.number().optional(),
  transformType: z.string().optional(),
  transformConfig: z.any().optional(),
});

const ApplicabilityRuleSchema = z.object({
  description: z.string(),
  ruleType: z.string(),
  conditionOperator: z.enum(["and", "or"]).optional(),
  conditions: z.record(z.any()), // Required JSON object
  conditionNegated: z.boolean().optional(),
  priority: z.number().optional(),
  source: z.string().optional(),
  confidence: z.number().optional(),
});

const CreateCardFaceSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  faceType: z.string(),
  depthLevel: z.string().optional(),
  questionStrategy: z.string().optional(),
  questionOverrideContent: z.any().optional(),
  questionWrapperPrefix: z.string().optional(),
  questionWrapperSuffix: z.string().optional(),
  answerStrategy: z.string().optional(),
  answerOverrideContent: z.any().optional(),
  answerWrapperPrefix: z.string().optional(),
  answerWrapperSuffix: z.string().optional(),
  scaffoldingLevel: z.number().optional(),
  scaffoldingHints: z.any().optional(),
  expectedOutputType: z.string().optional(),
  evaluationCriteriaType: z.string().optional(),
  evaluationCriteria: z.any().optional(),
  priority: z.number().optional(),
  globalContributionWeight: z.number().optional(),
  sourceType: z.string().optional(),
  sourceCreatedBy: z.string().optional(),
  sourceAiModel: z.string().optional(),
  isDefault: z.boolean().optional(),
  primitiveRefs: z.array(PrimitiveRefSchema).optional(),
  applicabilityRules: z.array(ApplicabilityRuleSchema).optional(),
});

const UpdateCardFaceSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  faceType: z.string().optional(),
  depthLevel: z.string().optional(),
  questionStrategy: z.string().optional(),
  answerStrategy: z.string().optional(),
  scaffoldingLevel: z.number().optional(),
  expectedOutputType: z.string().optional(),
  priority: z.number().optional(),
  globalContributionWeight: z.number().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const ListFacesQuerySchema = z.object({
  faceTypes: z.string().optional(),
  depthLevels: z.string().optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
});

const RecordPerformanceSchema = z.object({
  isCorrect: z.boolean(),
  responseTimeMs: z.number().min(0),
  confidenceRating: z.number().min(0).max(1).optional(),
  contextCategoryId: z.string().optional(),
  contextModeId: z.string().optional(),
});

const AddPrimitiveSchema = z.object({
  primitive: CreatePrimitiveSchema,
  position: z.number().int().min(0).optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function canonicalCardRoutes(app: FastifyInstance) {
  // ===========================================================================
  // CANONICAL CARD ROUTES
  // ===========================================================================

  // Create canonical card
  app.post(
    "/",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "Create a canonical card" },
    },
    async (request, reply) => {
      try {
        const body = CreateCanonicalCardSchema.parse(request.body);
        const result = await cardService.create(request.user!.id, body);
        return result.success
          ? reply.status(201).send(result)
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // List canonical cards
  app.get(
    "/",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "List canonical cards" },
    },
    async (request, reply) => {
      try {
        const query = ListCardsQuerySchema.parse(request.query);
        const result = await cardService.list({
          userId: request.user!.id,
          structuralTypes: query.structuralTypes?.split(","),
          tags: query.tags?.split(","),
          schedulingStates: query.schedulingStates?.split(","),
          isArchived:
            query.isArchived === "true"
              ? true
              : query.isArchived === "false"
                ? false
                : undefined,
          isSuspended:
            query.isSuspended === "true"
              ? true
              : query.isSuspended === "false"
                ? false
                : undefined,
          limit: query.limit,
          offset: query.offset,
          orderBy: query.orderBy,
          orderDirection: query.orderDirection,
        });
        return reply.send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // Get canonical card by ID
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "Get a canonical card" },
    },
    async (request, reply) => {
      try {
        const result = await cardService.getById(request.params.id);
        return result.success
          ? reply.send(result)
          : reply.status(404).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // Update canonical card
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "Update a canonical card" },
    },
    async (request, reply) => {
      try {
        const body = UpdateCanonicalCardSchema.parse(request.body);
        const result = await cardService.update(
          request.user!.id,
          request.params.id,
          body,
        );
        return result.success
          ? reply.send(result)
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // Delete canonical card
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "Delete a canonical card" },
    },
    async (request, reply) => {
      try {
        const result = await cardService.delete(
          request.user!.id,
          request.params.id,
        );
        return result.success
          ? reply.status(204).send()
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // Archive canonical card
  app.post<{ Params: { id: string } }>(
    "/:id/archive",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Canonical Cards"],
        summary: "Archive a canonical card",
      },
    },
    async (request, reply) => {
      try {
        const result = await cardService.archive(
          request.user!.id,
          request.params.id,
        );
        return result.success
          ? reply.send(result)
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // ===========================================================================
  // CONTENT PRIMITIVE ROUTES
  // ===========================================================================

  // Add primitive to card
  app.post<{ Params: { id: string } }>(
    "/:id/primitives",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Canonical Cards"],
        summary: "Add a primitive to a card",
      },
    },
    async (request, reply) => {
      try {
        const body = AddPrimitiveSchema.parse(request.body);
        const result = await cardService.addPrimitive(
          request.params.id,
          body.primitive,
          body.position,
        );
        return result.success
          ? reply.status(201).send(result)
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // Remove primitive from card
  app.delete<{ Params: { id: string; primitiveId: string } }>(
    "/:id/primitives/:primitiveId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Canonical Cards"],
        summary: "Remove a primitive from a card",
      },
    },
    async (request, reply) => {
      try {
        const result = await cardService.removePrimitive(
          request.params.id,
          request.params.primitiveId,
        );
        return result.success
          ? reply.status(204).send()
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // ===========================================================================
  // CARD FACE ROUTES
  // ===========================================================================

  // Create face for a card
  app.post<{ Params: { id: string } }>(
    "/:id/faces",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Canonical Cards"],
        summary: "Create a face for a card",
      },
    },
    async (request, reply) => {
      try {
        const body = CreateCardFaceSchema.parse(request.body);
        const result = await faceService.create(request.user!.id, {
          canonicalCardId: request.params.id,
          ...body,
        });
        return result.success
          ? reply.status(201).send(result)
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // List faces for a card
  app.get<{ Params: { id: string } }>(
    "/:id/faces",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "List faces for a card" },
    },
    async (request, reply) => {
      try {
        const query = ListFacesQuerySchema.parse(request.query);
        const result = await faceService.list({
          canonicalCardId: request.params.id,
          faceTypes: query.faceTypes?.split(","),
          depthLevels: query.depthLevels?.split(","),
          includeInactive: query.includeInactive === "true",
        });
        return reply.send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // Get face by ID
  app.get<{ Params: { faceId: string } }>(
    "/faces/:faceId",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "Get a face by ID" },
    },
    async (request, reply) => {
      try {
        const result = await faceService.getById(request.params.faceId);
        return result.success
          ? reply.send(result)
          : reply.status(404).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // Update face
  app.patch<{ Params: { faceId: string } }>(
    "/faces/:faceId",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "Update a face" },
    },
    async (request, reply) => {
      try {
        const body = UpdateCardFaceSchema.parse(request.body);
        const result = await faceService.update(
          request.user!.id,
          request.params.faceId,
          body,
        );
        return result.success
          ? reply.send(result)
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // Delete face
  app.delete<{ Params: { faceId: string } }>(
    "/faces/:faceId",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "Delete a face" },
    },
    async (request, reply) => {
      try {
        const result = await faceService.delete(
          request.user!.id,
          request.params.faceId,
        );
        return result.success
          ? reply.status(204).send()
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // ===========================================================================
  // APPLICABILITY RULE ROUTES
  // ===========================================================================

  // Add rule to face
  app.post<{ Params: { faceId: string } }>(
    "/faces/:faceId/rules",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Canonical Cards"],
        summary: "Add an applicability rule",
      },
    },
    async (request, reply) => {
      try {
        const body = ApplicabilityRuleSchema.parse(request.body);
        const result = await faceService.addApplicabilityRule(
          request.user!.id,
          request.params.faceId,
          body,
        );
        return result.success
          ? reply.status(201).send(result)
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // Remove rule
  app.delete<{ Params: { faceId: string; ruleId: string } }>(
    "/faces/:faceId/rules/:ruleId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Canonical Cards"],
        summary: "Remove an applicability rule",
      },
    },
    async (request, reply) => {
      try {
        const result = await faceService.removeApplicabilityRule(
          request.user!.id,
          request.params.ruleId,
        );
        return result.success
          ? reply.status(204).send()
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );

  // ===========================================================================
  // PERFORMANCE ROUTES
  // ===========================================================================

  // Record face performance
  app.post<{ Params: { faceId: string } }>(
    "/faces/:faceId/performance",
    {
      onRequest: [authenticate],
      schema: { tags: ["Canonical Cards"], summary: "Record face performance" },
    },
    async (request, reply) => {
      try {
        const body = RecordPerformanceSchema.parse(request.body);
        const result = await faceService.recordPerformance(
          request.params.faceId,
          request.user!.id,
          body,
        );
        return result.success
          ? reply.status(201).send(result)
          : reply.status(400).send(result);
      } catch (error) {
        app.log.error(error);
        return reply
          .status(500)
          .send({ success: false, error: "Internal server error" });
      }
    },
  );
}

export default canonicalCardRoutes;
