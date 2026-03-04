/**
 * @noema/knowledge-graph-service — Prisma Mutation Repository
 *
 * Concrete IMutationRepository backed by PostgreSQL via Prisma.
 * Follows content-service patterns:
 * - Optimistic locking via where: { id, version }
 * - Enum UPPERCASE↔lowercase mapping
 * - JSON double-cast for Prisma.JsonObject
 * - Private toDomain() mapper
 * - Centralized P2025 error handling
 */

import type { Metadata, MutationId, MutationState, ProposerId } from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import { nanoid } from 'nanoid';
import type {
  Prisma,
  CkgMutationState as PrismaCkgMutationState,
  PrismaClient,
} from '../../../../generated/prisma/index.js';

import {
  MutationConflictError,
  MutationNotFoundError,
} from '../../../domain/knowledge-graph-service/errors/index.js';
import type {
  ICkgMutation,
  ICreateMutationInput,
  IMutationAuditEntry,
  IMutationRepository,
} from '../../../domain/knowledge-graph-service/mutation.repository.js';
import { fromPrismaJson, toPrismaJson, toPrismaJsonArray } from './prisma-json.helpers.js';

// ============================================================================
// Helpers
// ============================================================================

function generateMutationId(): MutationId {
  return `${ID_PREFIXES.MutationId}${nanoid()}` as MutationId;
}

function generateAuditId(): string {
  return `audit_${nanoid()}`;
}

/** Domain lowercase → Prisma UPPERCASE */
function toDbState(state: MutationState): PrismaCkgMutationState {
  return state.toUpperCase() as PrismaCkgMutationState;
}

/** Prisma UPPERCASE → Domain lowercase */
function fromDbState(dbState: PrismaCkgMutationState): MutationState {
  return dbState.toLowerCase() as MutationState;
}

// ============================================================================
// PrismaMutationRepository
// ============================================================================

export class PrismaMutationRepository implements IMutationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createMutation(input: ICreateMutationInput): Promise<ICkgMutation> {
    const id = generateMutationId();

    const record = await this.prisma.ckgMutation.create({
      data: {
        id,
        userId: input.proposedBy as string,
        state: 'PROPOSED',
        mutationType: 'standard',
        operation: toPrismaJsonArray(input.operations),
        rationale: input.rationale,
        evidenceCount: input.evidenceCount,
        metadata: {} as Prisma.JsonObject,
        version: 1,
        createdBy: input.proposedBy as string,
      },
    });

    return this.toDomain(record);
  }

  async getMutation(mutationId: MutationId): Promise<ICkgMutation | null> {
    const record = await this.prisma.ckgMutation.findUnique({
      where: { id: mutationId },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async updateMutationState(
    mutationId: MutationId,
    newState: MutationState,
    expectedVersion: number
  ): Promise<ICkgMutation> {
    try {
      const record = await this.prisma.ckgMutation.update({
        where: { id: mutationId, version: expectedVersion },
        data: {
          state: toDbState(newState),
          version: { increment: 1 },
        },
      });

      return this.toDomain(record);
    } catch (error) {
      return this.handleOptimisticLockError(error, mutationId, expectedVersion);
    }
  }

  async appendAuditEntry(
    entry: Omit<IMutationAuditEntry, 'timestamp'>
  ): Promise<IMutationAuditEntry> {
    const record = await this.prisma.ckgMutationAuditLog.create({
      data: {
        id: generateAuditId(),
        mutationId: entry.mutationId,
        fromState: toDbState(entry.fromState),
        toState: toDbState(entry.toState),
        triggeredBy: entry.performedBy,
        snapshot: toPrismaJson(entry.context ?? {}),
      },
    });

    const result: IMutationAuditEntry = {
      mutationId: record.mutationId as MutationId,
      fromState: fromDbState(record.fromState),
      toState: fromDbState(record.toState),
      performedBy: record.triggeredBy,
      timestamp: record.createdAt.toISOString(),
    };
    if (record.snapshot !== null) {
      (result as { context: Metadata }).context = record.snapshot as Metadata;
    }
    return result;
  }

  async getAuditLog(mutationId: MutationId): Promise<IMutationAuditEntry[]> {
    const records = await this.prisma.ckgMutationAuditLog.findMany({
      where: { mutationId },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((r) => {
      const entry: IMutationAuditEntry = {
        mutationId: r.mutationId as MutationId,
        fromState: fromDbState(r.fromState),
        toState: fromDbState(r.toState),
        performedBy: r.triggeredBy,
        timestamp: r.createdAt.toISOString(),
      };
      if (r.snapshot !== null) {
        (entry as { context: Metadata }).context = r.snapshot as Metadata;
      }
      return entry;
    });
  }

  async findMutationsByState(state: MutationState): Promise<ICkgMutation[]> {
    const records = await this.prisma.ckgMutation.findMany({
      where: { state: toDbState(state) },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findMutationsByStates(states: MutationState[]): Promise<ICkgMutation[]> {
    const records = await this.prisma.ckgMutation.findMany({
      where: { state: { in: states.map(toDbState) } },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findMutationsByProposer(proposerId: ProposerId): Promise<ICkgMutation[]> {
    const records = await this.prisma.ckgMutation.findMany({
      where: { createdBy: proposerId as string },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async countMutationsByState(state: MutationState): Promise<number> {
    return this.prisma.ckgMutation.count({
      where: { state: toDbState(state) },
    });
  }

  async findMutations(filters: {
    state?: MutationState;
    proposedBy?: ProposerId;
    createdAfter?: string;
    createdBefore?: string;
  }): Promise<ICkgMutation[]> {
    const where: Record<string, unknown> = {};

    if (filters.state !== undefined) {
      where['state'] = toDbState(filters.state);
    }
    if (filters.proposedBy !== undefined) {
      where['createdBy'] = filters.proposedBy as string;
    }
    if (filters.createdAfter !== undefined || filters.createdBefore !== undefined) {
      const createdAt: Record<string, Date> = {};
      if (filters.createdAfter !== undefined) {
        createdAt['gte'] = new Date(filters.createdAfter);
      }
      if (filters.createdBefore !== undefined) {
        createdAt['lte'] = new Date(filters.createdBefore);
      }
      where['createdAt'] = createdAt;
    }

    const records = await this.prisma.ckgMutation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async transitionStateWithAudit(
    mutationId: MutationId,
    newState: MutationState,
    expectedVersion: number,
    auditEntry: Omit<IMutationAuditEntry, 'timestamp'>
  ): Promise<{ mutation: ICkgMutation; audit: IMutationAuditEntry }> {
    try {
      const [updatedRecord, auditRecord] = await this.prisma.$transaction([
        this.prisma.ckgMutation.update({
          where: { id: mutationId, version: expectedVersion },
          data: {
            state: toDbState(newState),
            version: { increment: 1 },
          },
        }),
        this.prisma.ckgMutationAuditLog.create({
          data: {
            id: generateAuditId(),
            mutationId: auditEntry.mutationId,
            fromState: toDbState(auditEntry.fromState),
            toState: toDbState(auditEntry.toState),
            triggeredBy: auditEntry.performedBy,
            snapshot: toPrismaJson(auditEntry.context ?? {}),
          },
        }),
      ]);

      const mutation = this.toDomain(updatedRecord);
      const audit: IMutationAuditEntry = {
        mutationId: auditRecord.mutationId as MutationId,
        fromState: fromDbState(auditRecord.fromState),
        toState: fromDbState(auditRecord.toState),
        performedBy: auditRecord.triggeredBy,
        timestamp: auditRecord.createdAt.toISOString(),
      };
      if (auditRecord.snapshot !== null) {
        (audit as { context: Metadata }).context = auditRecord.snapshot as Metadata;
      }

      return { mutation, audit };
    } catch (error) {
      return this.handleOptimisticLockError(error, mutationId, expectedVersion);
    }
  }

  async incrementRecoveryAttempts(mutationId: MutationId): Promise<ICkgMutation> {
    try {
      const record = await this.prisma.ckgMutation.update({
        where: { id: mutationId },
        data: {
          recoveryAttempts: { increment: 1 },
        },
      });

      return this.toDomain(record);
    } catch (error) {
      if (
        error instanceof Error &&
        ((error as { code?: string }).code === 'P2025' ||
          error.message.includes('Record to update not found'))
      ) {
        throw new MutationNotFoundError(mutationId);
      }
      throw error;
    }
  }

  async updateMutationFields(
    mutationId: MutationId,
    fields: Partial<{
      operations: Metadata[];
      revisionFeedback: string | null;
      revisionCount: number;
    }>
  ): Promise<ICkgMutation> {
    const data: Record<string, unknown> = {};

    if (fields.operations !== undefined) {
      data['operation'] = toPrismaJsonArray(fields.operations);
    }
    if ('revisionFeedback' in fields) {
      data['revisionFeedback'] = fields.revisionFeedback;
    }
    if (fields.revisionCount !== undefined) {
      data['revisionCount'] = fields.revisionCount;
    }

    try {
      const record = await this.prisma.ckgMutation.update({
        where: { id: mutationId },
        data,
      });

      return this.toDomain(record);
    } catch (error) {
      if (
        error instanceof Error &&
        ((error as { code?: string }).code === 'P2025' ||
          error.message.includes('Record to update not found'))
      ) {
        throw new MutationNotFoundError(mutationId);
      }
      throw error;
    }
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  /**
   * Map a Prisma record to the domain ICkgMutation interface.
   *
   * Note: The Prisma schema stores additional write-only columns
   * (`mutationType`, `targetNodeIds`, `targetEdgeIds`, `proofResult`,
   * `commitResult`, `rejectionReason`, `priority`) for DB-level indexing
   * and future admin query capabilities. These are intentionally not
   * surfaced in the domain model — their data lives in the `operation`
   * JSON blob or the audit log.
   */
  private toDomain(record: {
    id: string;
    state: PrismaCkgMutationState;
    createdBy: string | null;
    version: number;
    operation: Prisma.JsonValue; // DB column is singular `operation` (Json); domain uses plural `operations` (Metadata[]). Migration deferred — no functional impact.
    rationale: string | null;
    evidenceCount: number;
    recoveryAttempts: number;
    revisionCount: number;
    revisionFeedback: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ICkgMutation {
    return {
      mutationId: record.id as MutationId,
      state: fromDbState(record.state),
      proposedBy: (record.createdBy ?? '') as ProposerId,
      version: record.version,
      operations: fromPrismaJson<Metadata[]>(record.operation),
      rationale: record.rationale ?? '',
      evidenceCount: record.evidenceCount,
      recoveryAttempts: record.recoveryAttempts,
      revisionCount: record.revisionCount,
      revisionFeedback: record.revisionFeedback,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Handle P2025 "Record to update not found" errors.
   * Re-queries to distinguish not-found from version conflict.
   */
  private async handleOptimisticLockError(
    error: unknown,
    mutationId: MutationId,
    expectedVersion: number
  ): Promise<never> {
    if (
      error instanceof Error &&
      ((error as { code?: string }).code === 'P2025' ||
        error.message.includes('Record to update not found'))
    ) {
      const current = await this.prisma.ckgMutation.findUnique({
        where: { id: mutationId },
      });

      if (!current) {
        throw new MutationNotFoundError(mutationId);
      }

      throw new MutationConflictError(mutationId, expectedVersion, current.version);
    }

    throw error;
  }
}
