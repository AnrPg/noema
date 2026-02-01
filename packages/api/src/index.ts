// =============================================================================
// MANTHANEIN API SERVER
// =============================================================================
// Fastify-based REST + GraphQL API server

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
import { uploadRoutes } from "./routes/upload.routes.js";

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
