// =============================================================================
// AUTHENTICATION ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database.js";
import { redis } from "../config/redis.js";
import { env } from "../config/env.js";

// =============================================================================
// SCHEMAS
// =============================================================================

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  displayName: z.string().min(2).max(50),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(100),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  return bcrypt.compare(password, stored);
}

function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

// =============================================================================
// ROUTES
// =============================================================================

export async function authRoutes(app: FastifyInstance) {
  // ==========================================================================
  // REGISTER
  // ==========================================================================
  app.post(
    "/register",
    {
      schema: {
        tags: ["Auth"],
        summary: "Register a new user",
        body: {
          type: "object",
          required: ["email", "password", "displayName"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            displayName: { type: "string", minLength: 2 },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  displayName: { type: "string" },
                },
              },
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = registerSchema.parse(request.body);

      // Check if email already exists
      const existing = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existing) {
        return reply.status(409).send({
          error: "Conflict",
          message: "Email already registered",
        });
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          email: body.email,
          passwordHash: await hashPassword(body.password),
          displayName: body.displayName,
          preferences: { create: {} },
          learningStats: { create: {} },
          cognitiveProfile: { create: {} },
          streaks: {
            create: {
              streakType: "daily",
              lastActivityDate: new Date(),
            },
          },
        },
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      });

      // Generate tokens
      const accessToken = app.jwt.sign(
        { id: user.id, email: user.email },
        { expiresIn: env.JWT_EXPIRY },
      );

      const refreshToken = generateRefreshToken();

      // Store refresh token in Redis
      await redis.setex(
        `refresh:${refreshToken}`,
        30 * 24 * 60 * 60, // 30 days
        user.id,
      );

      return reply.status(201).send({
        user,
        accessToken,
        refreshToken,
      });
    },
  );

  // ==========================================================================
  // LOGIN
  // ==========================================================================
  app.post(
    "/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Login with email and password",
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  displayName: { type: "string" },
                  avatarUrl: { type: "string", nullable: true },
                },
              },
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = loginSchema.parse(request.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: body.email },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          passwordHash: true,
          isActive: true,
        },
      });

      if (!user || !user.passwordHash) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Invalid email or password",
        });
      }

      if (!user.isActive) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Account is deactivated",
        });
      }

      // Verify password
      if (!(await verifyPassword(body.password, user.passwordHash))) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Invalid email or password",
        });
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const accessToken = app.jwt.sign(
        { id: user.id, email: user.email },
        { expiresIn: env.JWT_EXPIRY },
      );

      const refreshToken = generateRefreshToken();

      // Store refresh token
      await redis.setex(`refresh:${refreshToken}`, 30 * 24 * 60 * 60, user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        accessToken,
        refreshToken,
      };
    },
  );

  // ==========================================================================
  // REFRESH TOKEN
  // ==========================================================================
  app.post(
    "/refresh",
    {
      schema: {
        tags: ["Auth"],
        summary: "Refresh access token",
        body: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = refreshSchema.parse(request.body);

      // Get user ID from Redis
      const userId = await redis.get(`refresh:${body.refreshToken}`);

      if (!userId) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Invalid or expired refresh token",
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, isActive: true },
      });

      if (!user || !user.isActive) {
        // Delete invalid token
        await redis.del(`refresh:${body.refreshToken}`);
        return reply.status(401).send({
          error: "Unauthorized",
          message: "User not found or inactive",
        });
      }

      // Delete old refresh token
      await redis.del(`refresh:${body.refreshToken}`);

      // Generate new tokens
      const accessToken = app.jwt.sign(
        { id: user.id, email: user.email },
        { expiresIn: env.JWT_EXPIRY },
      );

      const refreshToken = generateRefreshToken();

      // Store new refresh token
      await redis.setex(`refresh:${refreshToken}`, 30 * 24 * 60 * 60, user.id);

      return { accessToken, refreshToken };
    },
  );

  // ==========================================================================
  // LOGOUT
  // ==========================================================================
  app.post(
    "/logout",
    {
      schema: {
        tags: ["Auth"],
        summary: "Logout and invalidate tokens",
        body: {
          type: "object",
          properties: {
            refreshToken: { type: "string" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { refreshToken?: string };

      if (body.refreshToken) {
        await redis.del(`refresh:${body.refreshToken}`);
      }

      return { message: "Logged out successfully" };
    },
  );

  // ==========================================================================
  // FORGOT PASSWORD
  // ==========================================================================
  app.post(
    "/forgot-password",
    {
      schema: {
        tags: ["Auth"],
        summary: "Request password reset email",
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = forgotPasswordSchema.parse(request.body);

      // Always return success to prevent email enumeration
      const user = await prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true },
      });

      if (user) {
        // Generate reset token
        const resetToken = randomBytes(32).toString("hex");

        // Store in Redis (1 hour expiry)
        await redis.setex(`reset:${resetToken}`, 60 * 60, user.id);

        // TODO: Send email with reset link
        // For now, log the token in development
        if (env.NODE_ENV === "development") {
          console.log(`Password reset token for ${body.email}: ${resetToken}`);
        }
      }

      return {
        message:
          "If an account with that email exists, a password reset link has been sent.",
      };
    },
  );

  // ==========================================================================
  // RESET PASSWORD
  // ==========================================================================
  app.post(
    "/reset-password",
    {
      schema: {
        tags: ["Auth"],
        summary: "Reset password with token",
        body: {
          type: "object",
          required: ["token", "password"],
          properties: {
            token: { type: "string" },
            password: { type: "string", minLength: 8 },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = resetPasswordSchema.parse(request.body);

      // Get user ID from Redis
      const userId = await redis.get(`reset:${body.token}`);

      if (!userId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid or expired reset token",
        });
      }

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(body.password) },
      });

      // Delete reset token
      await redis.del(`reset:${body.token}`);

      // Invalidate all refresh tokens for this user
      const keys = await redis.keys("refresh:*");
      for (const key of keys) {
        const uid = await redis.get(key);
        if (uid === userId) {
          await redis.del(key);
        }
      }

      return { message: "Password reset successfully" };
    },
  );
}
