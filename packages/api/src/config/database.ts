// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

// Create Prisma client with logging
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['warn', 'error'],
});

// Test connection on startup
prisma.$connect()
  .then(() => {
    console.log('✅ Database connected');
  })
  .catch((error) => {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  });

export type PrismaClientType = typeof prisma;
