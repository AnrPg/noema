import type { PrismaClient } from '../../../generated/prisma/index.js';
import type {
  IHandshakeTransitionInput,
  IInboxClaimInput,
  IInboxClaimResult,
  ISchedulerEventReliabilityRepository,
} from '../../domain/scheduler-service/scheduler.repository.js';

export class PrismaEventReliabilityRepository implements ISchedulerEventReliabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claimInbox(input: IInboxClaimInput): Promise<IInboxClaimResult> {
    const rows = await this.prisma.$queryRaw<{ process_state: string }[]>`
      INSERT INTO scheduler_event_inbox (
        id,
        event_type,
        stream_message_id,
        process_state,
        correlation_id,
        user_id,
        proposal_id,
        decision_id,
        session_id,
        session_revision,
        payload,
        delivery_count,
        first_seen_at,
        last_seen_at
      )
      VALUES (
        ${input.idempotencyKey},
        ${input.eventType},
        ${input.streamMessageId ?? null},
        'PROCESSING',
        ${input.linkage.correlationId},
        ${input.linkage.userId ?? null},
        ${input.linkage.proposalId ?? null},
        ${input.linkage.decisionId ?? null},
        ${input.linkage.sessionId ?? null},
        ${input.linkage.sessionRevision ?? null},
        ${JSON.stringify(input.payload)}::jsonb,
        1,
        NOW(),
        NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        last_seen_at = NOW(),
        delivery_count = scheduler_event_inbox.delivery_count + 1,
        stream_message_id = EXCLUDED.stream_message_id,
        last_error = NULL
      RETURNING process_state
    `;

    const row = rows[0];
    const processState = row?.process_state ?? 'PROCESSING';

    if (processState === 'PROCESSED') {
      return { status: 'duplicate_processed' };
    }

    if (processState === 'PROCESSING') {
      const firstSeenRows = await this.prisma.$queryRaw<{ first_seen_at: Date }[]>`
        SELECT first_seen_at
        FROM scheduler_event_inbox
        WHERE id = ${input.idempotencyKey}
      `;

      const firstSeen = firstSeenRows[0]?.first_seen_at;
      if (firstSeen instanceof Date && Date.now() - firstSeen.getTime() > 30_000) {
        return { status: 'duplicate_inflight' };
      }
    }

    return { status: 'claimed' };
  }

  async markInboxProcessed(idempotencyKey: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE scheduler_event_inbox
      SET process_state = 'PROCESSED',
          processed_at = NOW(),
          last_error = NULL,
          last_seen_at = NOW()
      WHERE id = ${idempotencyKey}
    `;
  }

  async markInboxFailed(idempotencyKey: string, errorMessage: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE scheduler_event_inbox
      SET process_state = 'FAILED',
          last_error = ${errorMessage},
          last_seen_at = NOW()
      WHERE id = ${idempotencyKey}
    `;
  }

  async readLatestSessionRevision(sessionId: string, proposalId: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ session_revision: number }[]>`
      SELECT session_revision
      FROM scheduler_handshake_state
      WHERE session_id = ${sessionId}
        AND proposal_id = ${proposalId}
      LIMIT 1
    `;

    const revision = rows[0]?.session_revision;
    return typeof revision === 'number' ? revision : null;
  }

  async applyHandshakeTransition(input: IHandshakeTransitionInput): Promise<void> {
    const sessionId = input.linkage.sessionId;
    const proposalId = input.linkage.proposalId;

    if (sessionId === undefined || proposalId === undefined) {
      return;
    }

    const sessionRevision = input.linkage.sessionRevision ?? 0;

    await this.prisma.$executeRaw`
      INSERT INTO scheduler_handshake_state (
        id,
        user_id,
        correlation_id,
        proposal_id,
        decision_id,
        session_id,
        session_revision,
        state,
        last_event_type,
        last_stream_message_id,
        metadata
      )
      VALUES (
        ${`${sessionId}:${proposalId}`},
        ${input.linkage.userId ?? null},
        ${input.linkage.correlationId},
        ${proposalId},
        ${input.linkage.decisionId ?? null},
        ${sessionId},
        ${sessionRevision},
        ${input.state},
        ${input.eventType},
        ${input.streamMessageId ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
      ON CONFLICT (session_id, proposal_id)
      DO UPDATE SET
        user_id = COALESCE(EXCLUDED.user_id, scheduler_handshake_state.user_id),
        correlation_id = EXCLUDED.correlation_id,
        decision_id = COALESCE(EXCLUDED.decision_id, scheduler_handshake_state.decision_id),
        session_revision = EXCLUDED.session_revision,
        state = EXCLUDED.state,
        last_event_type = EXCLUDED.last_event_type,
        last_stream_message_id = EXCLUDED.last_stream_message_id,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      WHERE EXCLUDED.session_revision >= scheduler_handshake_state.session_revision
    `;
  }
}
