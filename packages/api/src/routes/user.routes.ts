// =============================================================================
// USER ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

// =============================================================================
// SCHEMAS
// =============================================================================

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

const updatePreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  dailyGoal: z.number().int().min(1).max(500).optional(),
  sessionDuration: z.number().int().min(5).max(120).optional(),
  newCardsPerDay: z.number().int().min(0).max(100).optional(),
  maxReviewsPerDay: z.number().int().min(0).max(1000).optional(),
  enableReminders: z.boolean().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  schedulerType: z.enum(['fsrs', 'hlr', 'sm2']).optional(),
  audioEnabled: z.boolean().optional(),
  animationsEnabled: z.boolean().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function userRoutes(app: FastifyInstance) {
  // Get current user profile
  app.get('/me', {
    onRequest: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Get current user profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      include: {
        preferences: true,
        learningStats: true,
        cognitiveProfile: true,
      },
    });
    
    if (!user) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found',
      });
    }
    
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      preferences: user.preferences,
      learningStats: user.learningStats,
      cognitiveProfile: user.cognitiveProfile,
    };
  });
  
  // Update profile
  app.patch('/me', {
    onRequest: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Update user profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = updateProfileSchema.parse(request.body);
    
    const user = await prisma.user.update({
      where: { id: request.user!.id },
      data: body,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
    });
    
    return user;
  });
  
  // Update preferences
  app.patch('/me/preferences', {
    onRequest: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Update user preferences',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = updatePreferencesSchema.parse(request.body);
    
    const preferences = await prisma.userPreferences.update({
      where: { userId: request.user!.id },
      data: body,
    });
    
    return preferences;
  });
  
  // Get learning stats
  app.get('/me/stats', {
    onRequest: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Get user learning statistics',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await prisma.userLearningStats.findUnique({
      where: { userId: request.user!.id },
    });
    
    return stats;
  });
  
  // Get cognitive profile
  app.get('/me/cognitive-profile', {
    onRequest: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Get user cognitive profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = await prisma.cognitiveProfile.findUnique({
      where: { userId: request.user!.id },
    });
    
    return profile;
  });
  
  // Delete account
  app.delete('/me', {
    onRequest: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Delete user account',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    await prisma.user.delete({
      where: { id: request.user!.id },
    });
    
    return { message: 'Account deleted successfully' };
  });
}
