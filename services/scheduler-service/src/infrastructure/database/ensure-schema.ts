import type pino from 'pino';
import type { PrismaClient } from '../../../generated/prisma/index.js';

export async function ensureSchedulerReliabilitySchema(
  prisma: PrismaClient,
  logger: pino.Logger
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS scheduler_event_inbox (
      id VARCHAR(120) PRIMARY KEY,
      event_type VARCHAR(120) NOT NULL,
      stream_message_id VARCHAR(64),
      process_state VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
      correlation_id VARCHAR(100),
      user_id VARCHAR(50),
      proposal_id VARCHAR(50),
      decision_id VARCHAR(50),
      session_id VARCHAR(50),
      session_revision INTEGER,
      payload JSONB NOT NULL,
      delivery_count INTEGER NOT NULL DEFAULT 1,
      last_error VARCHAR(1000),
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_scheduler_event_inbox_event_state
      ON scheduler_event_inbox (event_type, process_state)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_scheduler_event_inbox_session_proposal_revision
      ON scheduler_event_inbox (session_id, proposal_id, session_revision)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_scheduler_event_inbox_last_seen_at
      ON scheduler_event_inbox (last_seen_at)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS scheduler_handshake_state (
      id VARCHAR(100) PRIMARY KEY,
      user_id VARCHAR(50),
      correlation_id VARCHAR(100),
      proposal_id VARCHAR(50) NOT NULL,
      decision_id VARCHAR(50),
      session_id VARCHAR(50) NOT NULL,
      session_revision INTEGER NOT NULL,
      state VARCHAR(20) NOT NULL,
      last_event_type VARCHAR(120) NOT NULL,
      last_stream_message_id VARCHAR(64),
      metadata JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_scheduler_handshake_state_session_proposal
      ON scheduler_handshake_state (session_id, proposal_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_scheduler_handshake_state_decision_id
      ON scheduler_handshake_state (decision_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_scheduler_handshake_state_correlation_id
      ON scheduler_handshake_state (correlation_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_scheduler_handshake_state_session_revision
      ON scheduler_handshake_state (session_id, session_revision)
  `);

  logger.info('Ensured scheduler reliability schema');
}
