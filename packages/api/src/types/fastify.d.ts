// =============================================================================
// FASTIFY TYPE AUGMENTATIONS
// =============================================================================

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Client as MinioClient } from 'minio';

declare module 'fastify' {
  interface FastifyRequest {
    prisma: PrismaClient;
    redis: Redis;
    minio: MinioClient;
    user?: {
      id: string;
      email: string;
      role: string;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string;
      email: string;
      role: string;
    };
  }
}
