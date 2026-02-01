// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
    };
  }
}

/**
 * Verify JWT token and attach user to request
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const decoded = await request.jwtVerify<{ id: string; email: string }>();
    
    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, isActive: true },
    });
    
    if (!user || !user.isActive) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not found or inactive',
      });
    }
    
    request.user = { id: user.id, email: user.email };
  } catch (error) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  try {
    const decoded = await request.jwtVerify<{ id: string; email: string }>();
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, isActive: true },
    });
    
    if (user && user.isActive) {
      request.user = { id: user.id, email: user.email };
    }
  } catch {
    // Token invalid or missing - that's okay for optional auth
  }
}
