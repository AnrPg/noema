// =============================================================================
// MANTHANEIN API SERVER
// =============================================================================
// Fastify-based REST + GraphQL API server

import "dotenv/config";

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import mercurius from "mercurius";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/database.js";
import { redis } from "./config/redis.js";
import { minio } from "./config/storage.js";

// Routes
import { authRoutes } from "./routes/auth.routes.js";
import { userRoutes } from "./routes/user.routes.js";
import { deckRoutes } from "./routes/deck.routes.js";
import { cardRoutes } from "./routes/card.routes.js";
import { reviewRoutes } from "./routes/review.routes.js";
import { studyRoutes } from "./routes/study.routes.js";
import { gamificationRoutes } from "./routes/gamification.routes.js";
import { pluginRoutes } from "./routes/plugin.routes.js";
import { uploadRoutes } from "./routes/upload.routes";
import { categoryRoutes } from "./routes/category.routes";
import { learningFlowRoutes } from "./routes/learning-flow.routes";
import { annotationRoutes } from "./routes/annotation.routes";
import { emphasisRoutes } from "./routes/emphasis.routes";
import { multiContextRoutes } from "./routes/multi-context.routes";
import { syncRoutes } from "./routes/sync.routes";
import { aiAugmentationRoutes } from "./routes/ai-augmentation.routes";
import { refactorRoutes } from "./routes/refactor.routes";
import participationRoutes from "./routes/participation.routes";
import synthesisRoutes from "./routes/synthesis.routes";
import bridgeCardRoutes from "./routes/bridge-card.routes";
import ecosystemBridgeRoutes from "./ecosystem-bridge/routes";

// GraphQL
import { schema } from "./graphql/schema.js";
import { resolvers } from "./graphql/resolvers/index.js";

// =============================================================================
// SERVER SETUP
// =============================================================================

async function buildServer() {
  const app = Fastify({
    logger: logger,
    trustProxy: true,
  });

  // ==========================================================================
  // PLUGINS
  // ==========================================================================

  // Security
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === "production",
  });

  // CORS
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    redis: redis,
  });

  // JWT authentication
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRY,
    },
  });

  // File uploads
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
      files: 10,
    },
  });

  // Sensible defaults
  await app.register(sensible);

  // ==========================================================================
  // API DOCUMENTATION
  // ==========================================================================

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Manthanein API",
        description:
          "API for the Manthanein spaced repetition learning platform",
        version: "1.0.0",
      },
      servers: [
        {
          url: env.API_URL,
          description:
            env.NODE_ENV === "production" ? "Production" : "Development",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: "Auth", description: "Authentication endpoints" },
        { name: "Users", description: "User management" },
        { name: "Decks", description: "Deck management" },
        { name: "Cards", description: "Card management" },
        { name: "Reviews", description: "Card review and scheduling" },
        { name: "Study", description: "Study sessions" },
        { name: "Gamification", description: "XP, achievements, and progress" },
        { name: "Plugins", description: "Plugin management" },
        { name: "Uploads", description: "File uploads and parsing" },
        { name: "Categories", description: "Knowledge ecosystem categories" },
        {
          name: "Learning Flow",
          description: "Learning modes and dynamic decks",
        },
        {
          name: "Annotations",
          description: "Contextual annotations (marginalia)",
        },
        { name: "Emphasis", description: "Differential emphasis rules" },
        {
          name: "Multi-Context",
          description: "Multi-context awareness and metacognition",
        },
        { name: "Sync", description: "Offline-first synchronization" },
        {
          name: "AI Augmentation",
          description: "AI-powered learning enhancements",
        },
        {
          name: "Refactoring",
          description:
            "Structural refactoring - split, merge, re-parent operations",
        },
        {
          name: "Participation",
          description:
            "Multi-belonging participation management - cards in multiple categories",
        },
        {
          name: "Synthesis",
          description:
            "Anti-fragmentation synthesis engine - prompts, responses, notes, divergence analysis",
        },
        {
          name: "Bridge Cards",
          description: "Bridge cards for connecting concepts across contexts",
        },
        {
          name: "Ecosystem Bridge",
          description:
            "Bidirectional sync between Ecosystem (Categories as Lenses) and LKGC (Local Knowledge Graph Core)",
        },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });

  // ==========================================================================
  // GRAPHQL
  // ==========================================================================

  await app.register(mercurius, {
    schema,
    resolvers: resolvers as any,
    graphiql: env.NODE_ENV !== "production",
    context: (request) => ({
      prisma,
      redis,
      user: request.user,
      app, // Pass app for JWT signing in auth mutations
    }),
  });

  // ==========================================================================
  // DECORATORS
  // ==========================================================================

  // Add prisma to request
  app.decorateRequest("prisma", null);
  app.addHook("onRequest", async (request) => {
    request.prisma = prisma;
  });

  // Add redis to request
  app.decorateRequest("redis", null);
  app.addHook("onRequest", async (request) => {
    request.redis = redis;
  });

  // Add minio to request
  app.decorateRequest("minio", null);
  app.addHook("onRequest", async (request) => {
    request.minio = minio;
  });

  // ==========================================================================
  // ROUTES
  // ==========================================================================

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  }));

  // API routes
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(deckRoutes, { prefix: "/api/v1/decks" });
  await app.register(cardRoutes, { prefix: "/api/v1/cards" });
  await app.register(reviewRoutes, { prefix: "/api/v1/reviews" });
  await app.register(studyRoutes, { prefix: "/api/v1/study" });
  await app.register(gamificationRoutes, { prefix: "/api/v1/gamification" });
  await app.register(pluginRoutes, { prefix: "/api/v1/plugins" });
  await app.register(uploadRoutes, { prefix: "/api/v1/uploads" });
  await app.register(categoryRoutes, { prefix: "/api/v1/categories" });
  await app.register(learningFlowRoutes, { prefix: "/api/v1/learning" });
  await app.register(annotationRoutes, { prefix: "/api/v1/annotations" });
  await app.register(emphasisRoutes, { prefix: "/api/v1/emphasis" });
  await app.register(multiContextRoutes, { prefix: "/api/v1/multi-context" });
  await app.register(syncRoutes, { prefix: "/api/v1/sync" });
  await app.register(aiAugmentationRoutes, { prefix: "/api/v1/ai" });
  await app.register(refactorRoutes, { prefix: "/api/v1/refactor" });
  await app.register(participationRoutes, { prefix: "/api/v1/participations" });
  await app.register(synthesisRoutes, { prefix: "/api/v1/synthesis" });
  await app.register(bridgeCardRoutes, { prefix: "/api/v1/bridge-cards" });
  await app.register(ecosystemBridgeRoutes, { prefix: "/api/v1" });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);

    // Validation errors
    if (error.validation) {
      return reply.status(400).send({
        error: "Validation Error",
        message: error.message,
        details: error.validation,
      });
    }

    // JWT errors
    if (error.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER") {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Missing authorization token",
      });
    }

    // Default error
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: error.name || "Internal Server Error",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : error.message,
    });
  });

  return app;
}

// =============================================================================
// STARTUP
// =============================================================================

async function start() {
  try {
    const app = await buildServer();

    // Start server
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🧠 Manthanein API Server                                 ║
║                                                            ║
║   REST API:    http://${env.HOST}:${env.PORT}/api/v1             ║
║   GraphQL:     http://${env.HOST}:${env.PORT}/graphql            ║
║   Docs:        http://${env.HOST}:${env.PORT}/docs               ║
║   Health:      http://${env.HOST}:${env.PORT}/health             ║
║                                                            ║
║   Environment: ${env.NODE_ENV.padEnd(40)}║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

// Start the server
start();

export { buildServer };
