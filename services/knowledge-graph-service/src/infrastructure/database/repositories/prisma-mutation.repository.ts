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

import type { AgentId, Metadata, MutationId, MutationState } from '@noema/types';
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
        operation: input.operations as unknown as Prisma.JsonArray,
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
        snapshot: (entry.context ?? {}) as unknown as Prisma.JsonObject,
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

  async findMutationsByProposer(agentId: AgentId): Promise<ICkgMutation[]> {
    const records = await this.prisma.ckgMutation.findMany({
      where: { createdBy: agentId as string },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async countMutationsByState(state: MutationState): Promise<number> {
    return this.prisma.ckgMutation.count({
      where: { state: toDbState(state) },
    });
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  /**
   * Map a Prisma record to the domain ICkgMutation interface.
   */
  private toDomain(record: {
    id: string;
    state: PrismaCkgMutationState;
    createdBy: string | null;
    version: number;
    operation: Prisma.JsonValue;
    rationale: string | null;
    evidenceCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): ICkgMutation {
    return {
      mutationId: record.id as MutationId,
      state: fromDbState(record.state),
      proposedBy: (record.createdBy ?? '') as AgentId,
      version: record.version,
      operations: record.operation as unknown as Metadata[],
      rationale: record.rationale ?? '',
      evidenceCount: record.evidenceCount,
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
