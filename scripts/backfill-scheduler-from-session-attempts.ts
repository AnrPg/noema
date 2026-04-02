/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

import type { Redis } from 'ioredis';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pino from 'pino';

import { PrismaClient as SchedulerPrismaClient } from '../services/scheduler-service/generated/prisma/index.js';
import { PrismaCalibrationDataRepository } from '../services/scheduler-service/src/infrastructure/database/prisma-calibration-data.repository.js';
import { PrismaEventReliabilityRepository } from '../services/scheduler-service/src/infrastructure/database/prisma-event-reliability.repository.js';
import { PrismaReviewRepository } from '../services/scheduler-service/src/infrastructure/database/prisma-review.repository.js';
import { PrismaSchedulerCardRepository } from '../services/scheduler-service/src/infrastructure/database/prisma-scheduler-card.repository.js';
import { ReviewRecordedConsumer } from '../services/scheduler-service/src/events/consumers/review-recorded.consumer.js';
import { PrismaClient as SessionPrismaClient } from '../services/session-service/generated/prisma/index.js';

type StudyMode = 'language_learning' | 'knowledge_gaining';
type SchedulerLane = 'retention' | 'calibration';
type BackfillAttemptRow = Awaited<ReturnType<SessionPrismaClient['attempt']['findMany']>>[number];
type BackfillQueueItemRow = Awaited<
  ReturnType<SessionPrismaClient['sessionQueueItem']['findMany']>
>[number];

function loadRootEnvFile(): void {
  const scriptDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));
  const envPath = resolve(scriptDirectory, '..', '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (key === '' || process.env[key] !== undefined) {
      continue;
    }

    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"(.*)"$/u, '$1')
      .replace(/^'(.*)'$/u, '$1');
    process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeStudyMode(value: string | null | undefined): StudyMode {
  return value?.toLowerCase() === 'language_learning' ? 'language_learning' : 'knowledge_gaining';
}

function normalizeLane(value: string | null | undefined): SchedulerLane {
  return value?.toLowerCase() === 'calibration' ? 'calibration' : 'retention';
}

function normalizeRating(value: string): 'again' | 'hard' | 'good' | 'easy' {
  const normalized = value.toLowerCase();
  if (normalized === 'again' || normalized === 'hard' || normalized === 'easy') {
    return normalized;
  }
  return 'good';
}

function normalizeOutcome(value: string): 'correct' | 'incorrect' | 'partial' | 'skipped' {
  const normalized = value.toLowerCase();
  if (normalized === 'incorrect' || normalized === 'partial' || normalized === 'skipped') {
    return normalized;
  }
  return 'correct';
}

function createRedisStub(): Redis {
  return {
    xgroup: () => Promise.resolve('OK'),
    xreadgroup: () => Promise.resolve(null),
    xack: () => Promise.resolve(1),
    xadd: () => Promise.resolve('1-0'),
    xautoclaim: () => Promise.resolve(['0-0', []]),
  } as unknown as Redis;
}

async function main(): Promise<void> {
  loadRootEnvFile();

  const schedulerDatabaseUrl = requireEnv('DATABASE_URL_SCHEDULER');
  const sessionDatabaseUrl = requireEnv('DATABASE_URL_SESSION');
  const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

  const sessionPrisma = new SessionPrismaClient({
    datasources: { db: { url: sessionDatabaseUrl } },
  });
  const schedulerPrisma = new SchedulerPrismaClient({
    datasources: { db: { url: schedulerDatabaseUrl } },
  });

  try {
    const schedulerCardRepository = new PrismaSchedulerCardRepository(schedulerPrisma);
    const reviewRepository = new PrismaReviewRepository(schedulerPrisma);
    const calibrationDataRepository = new PrismaCalibrationDataRepository(schedulerPrisma);
    const reliabilityRepository = new PrismaEventReliabilityRepository(schedulerPrisma);

    const consumer = new ReviewRecordedConsumer(createRedisStub(), logger, 'backfill-session-attempts');
    consumer.setDependencies({
      schedulerCardRepository,
      reviewRepository,
      calibrationDataRepository,
      reliabilityRepository,
      eventPublisher: {
        publish: () => Promise.resolve(undefined),
        publishBatch: () => Promise.resolve(undefined),
      },
    });

    const limitRaw = process.env['BACKFILL_LIMIT'];
    const take =
      limitRaw !== undefined && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;
    const userId = process.env['BACKFILL_USER_ID'];
    const studyModeFilter = process.env['BACKFILL_STUDY_MODE'];
    const after = process.env['BACKFILL_AFTER'];
    const resetRequested = process.env['BACKFILL_RESET'] === '1';

    if (resetRequested && (typeof userId !== 'string' || userId.trim() === '')) {
      throw new Error('BACKFILL_RESET=1 requires BACKFILL_USER_ID to avoid destructive global resets');
    }

    if (resetRequested && typeof userId === 'string' && userId.trim() !== '') {
      const scopedStudyMode =
        studyModeFilter === 'language_learning' || studyModeFilter === 'knowledge_gaining'
          ? studyModeFilter
          : undefined;

      await schedulerPrisma.$transaction(async (tx) => {
        await tx.review.deleteMany({
          where: {
            userId,
            ...(scopedStudyMode !== undefined ? { studyMode: scopedStudyMode.toUpperCase() } : {}),
          },
        });
        await tx.calibrationData.deleteMany({
          where: {
            userId,
            ...(scopedStudyMode !== undefined ? { studyMode: scopedStudyMode.toUpperCase() } : {}),
          },
        });
        await tx.schedulerCard.deleteMany({
          where: {
            userId,
            ...(scopedStudyMode !== undefined ? { studyMode: scopedStudyMode.toUpperCase() } : {}),
          },
        });
      });

      logger.warn(
        { userId, studyMode: studyModeFilter ?? 'all' },
        'Reset existing scheduler state before backfill'
      );
    }

    const attempts: BackfillAttemptRow[] = await sessionPrisma.attempt.findMany({
      where: {
        ...(typeof userId === 'string' && userId.trim() !== '' ? { userId } : {}),
        ...(typeof after === 'string' && after.trim() !== ''
          ? { createdAt: { gte: new Date(after) } }
          : {}),
        ...(studyModeFilter === 'language_learning' || studyModeFilter === 'knowledge_gaining'
          ? { session: { studyMode: studyModeFilter.toUpperCase() } }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(take !== undefined ? { take } : {}),
      include: {
        session: {
          select: {
            id: true,
            userId: true,
            studyMode: true,
          },
        },
      },
    });

    const queueItems: BackfillQueueItemRow[] = await sessionPrisma.sessionQueueItem.findMany({
      where: {
        sessionId: { in: [...new Set(attempts.map((attempt) => attempt.sessionId))] },
      },
      select: {
        sessionId: true,
        cardId: true,
        lane: true,
      },
    });

    const laneBySessionCard = new Map<string, SchedulerLane>(
      queueItems.map((item) => [`${item.sessionId}:${item.cardId}`, normalizeLane(item.lane)])
    );

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const studyMode = normalizeStudyMode(attempt.session.studyMode);
      const lane = laneBySessionCard.get(`${attempt.sessionId}:${attempt.cardId}`) ?? 'retention';
      const payload = {
        attemptId: attempt.id,
        sessionId: attempt.sessionId,
        cardId: attempt.cardId,
        userId: attempt.userId,
        rating: normalizeRating(attempt.rating),
        ratingValue: attempt.ratingValue,
        outcome: normalizeOutcome(attempt.outcome),
        responseTimeMs: attempt.responseTimeMs,
        deltaDays:
          typeof (attempt.priorSchedulingState as { elapsedDays?: unknown } | null)?.elapsedDays ===
          'number'
            ? (attempt.priorSchedulingState as { elapsedDays: number }).elapsedDays
            : 0,
        priorSchedulingState:
          attempt.priorSchedulingState !== null &&
          typeof attempt.priorSchedulingState === 'object' &&
          !Array.isArray(attempt.priorSchedulingState)
            ? attempt.priorSchedulingState
            : undefined,
        confidenceBefore: attempt.confidenceBefore ?? undefined,
        confidenceAfter: attempt.confidenceAfter ?? undefined,
        hintRequestCount: attempt.hintRequestCount,
        lane,
        studyMode,
        contextSnapshot:
          attempt.contextSnapshot !== null &&
          typeof attempt.contextSnapshot === 'object' &&
          !Array.isArray(attempt.contextSnapshot)
            ? {
                ...(attempt.contextSnapshot as Record<string, unknown>),
                studyMode,
              }
            : { studyMode },
      };

      try {
        await (
          consumer as unknown as {
            handleStreamMessage(id: string, fields: string[]): Promise<void>;
          }
        ).handleStreamMessage(`${String(index + 1)}-0`, [
          'event',
          JSON.stringify({
            eventType: 'attempt.recorded',
            aggregateType: 'Attempt',
            aggregateId: attempt.id,
            payload,
            metadata: {
              correlationId: `backfill:${attempt.id}`,
              userId: attempt.userId,
            },
          }),
        ]);

        const review = await reviewRepository.findByAttemptId(attempt.id);
        if (review === null) {
          skipped += 1;
        } else {
          processed += 1;
        }
      } catch (error: unknown) {
        failed += 1;
        logger.error(
          { attemptId: attempt.id, sessionId: attempt.sessionId, error },
          'Failed to replay attempt into scheduler'
        );
      }
    }

    logger.info(
      {
        totalAttempts: attempts.length,
        processed,
        skipped,
        failed,
        userId: userId ?? 'all',
        studyMode: studyModeFilter ?? 'all',
      },
      'Scheduler backfill from session attempts completed'
    );
  } finally {
    await Promise.allSettled([sessionPrisma.$disconnect(), schedulerPrisma.$disconnect()]);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
