import { nanoid } from 'nanoid';
import { Prisma, type PrismaClient } from '../../../../generated/prisma/index.js';
import type {
  IPkgPostWriteRecoveryRepository,
  IPkgPostWriteTask,
  PkgPostWriteTaskStatus,
  PkgPostWriteTaskType,
} from '../../../domain/knowledge-graph-service/post-write-recovery.repository.js';
import type { Metadata } from '@noema/types';

import { fromPrismaJson, toPrismaJson } from './prisma-json.helpers.js';

function generateTaskId(): string {
  return `pwtask_${nanoid()}`;
}

export class PrismaPkgPostWriteRecoveryRepository implements IPkgPostWriteRecoveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueueTask(input: {
    taskType: PkgPostWriteTaskType;
    payload: Record<string, unknown>;
    userId?: string;
    dedupeKey?: string;
    nextAttemptAt?: string;
  }): Promise<void> {
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "pkg_post_write_tasks" (
          "id",
          "task_type",
          "status",
          "user_id",
          "dedupe_key",
          "payload",
          "attempts",
          "next_attempt_at"
        ) VALUES (
          ${generateTaskId()},
          ${input.taskType},
          ${'pending'},
          ${input.userId ?? null},
          ${input.dedupeKey ?? null},
          ${toPrismaJson(input.payload)},
          0,
          ${new Date(input.nextAttemptAt ?? new Date().toISOString())}
        )
        ON CONFLICT ("dedupe_key")
        DO NOTHING
      `
    );
  }

  async claimDueTasks(limit: number): Promise<readonly IPkgPostWriteTask[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        taskType: PkgPostWriteTaskType;
        status: PkgPostWriteTaskStatus;
        userId: string | null;
        dedupeKey: string | null;
        payload: Prisma.JsonValue;
        attempts: number;
        nextAttemptAt: Date;
        lastError: string | null;
        createdAt: Date;
        updatedAt: Date;
      }[]
    >(
      Prisma.sql`
        WITH due AS (
          SELECT "id"
          FROM "pkg_post_write_tasks"
          WHERE "status" IN ('pending', 'retryable')
            AND "next_attempt_at" <= CURRENT_TIMESTAMP
          ORDER BY "next_attempt_at" ASC, "created_at" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "pkg_post_write_tasks" AS tasks
        SET
          "status" = 'in_progress',
          "attempts" = tasks."attempts" + 1,
          "updated_at" = CURRENT_TIMESTAMP
        FROM due
        WHERE tasks."id" = due."id"
        RETURNING
          tasks."id" AS "id",
          tasks."task_type" AS "taskType",
          tasks."status" AS "status",
          tasks."user_id" AS "userId",
          tasks."dedupe_key" AS "dedupeKey",
          tasks."payload" AS "payload",
          tasks."attempts" AS "attempts",
          tasks."next_attempt_at" AS "nextAttemptAt",
          tasks."last_error" AS "lastError",
          tasks."created_at" AS "createdAt",
          tasks."updated_at" AS "updatedAt"
      `
    );

    return rows.map((row) => this.toDomain(row));
  }

  async completeTask(taskId: string): Promise<void> {
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM "pkg_post_write_tasks" WHERE "id" = ${taskId}`
    );
  }

  async rescheduleTask(input: {
    taskId: string;
    lastError: string;
    nextAttemptAt: string;
  }): Promise<void> {
    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE "pkg_post_write_tasks"
        SET
          "status" = 'retryable',
          "last_error" = ${input.lastError},
          "next_attempt_at" = ${new Date(input.nextAttemptAt)},
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.taskId}
      `
    );
  }

  async failTask(input: { taskId: string; lastError: string }): Promise<void> {
    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE "pkg_post_write_tasks"
        SET
          "status" = 'failed',
          "last_error" = ${input.lastError},
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.taskId}
      `
    );
  }

  private toDomain(row: {
    id: string;
    taskType: PkgPostWriteTaskType;
    status: PkgPostWriteTaskStatus;
    userId: string | null;
    dedupeKey: string | null;
    payload: Prisma.JsonValue;
    attempts: number;
    nextAttemptAt: Date;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): IPkgPostWriteTask {
    return {
      id: row.id,
      taskType: row.taskType,
      status: row.status,
      userId: row.userId as never,
      dedupeKey: row.dedupeKey,
      payload: fromPrismaJson<Metadata>(row.payload),
      attempts: row.attempts,
      nextAttemptAt: row.nextAttemptAt.toISOString(),
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
