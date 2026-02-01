// =============================================================================
// IN-MEMORY MASTERY STATE STORE - For Testing
// =============================================================================
// A simple in-memory implementation of the MasteryStateStore interface.
// Suitable for unit tests and development.
// NOT for production use - data is lost when the process exits.
// =============================================================================

import type {
  NodeId,
  Timestamp,
  RevisionNumber,
  NormalizedValue,
} from "../../types/lkgc/foundation";
import type {
  MasteryState,
  MasteryStateDelta,
  MasteryGranularity,
} from "../../types/lkgc/mastery";
import type {
  MasteryStateStore,
  MasteryStateStoreOptions,
  MasteryStateId,
  MasteryStateRecord,
  MasteryStateRevision,
  MasteryStateQueryOptions,
  MasteryStateQueryResult,
  UpsertMasteryStateInput,
  UpsertMasteryStateResult,
  MaterializationWatermark,
  MasteryStoreStatistics,
} from "../mastery-state-store";
import { now as nowFn, revision } from "../id-generator";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create a composite key for node + granularity
 */
function makeKey(nodeId: NodeId, granularity: MasteryGranularity): string {
  return `${nodeId}::${granularity}`;
}

/**
 * Generate a mastery state ID
 */
function generateMasteryStateId(): MasteryStateId {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `mst_${timestamp}_${random}` as MasteryStateId;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * In-memory implementation of MasteryStateStore
 */
export class InMemoryMasteryStateStore implements MasteryStateStore {
  /** Main storage: composite key -> record */
  private readonly records: Map<string, MasteryStateRecord> = new Map();

  /** Revision history: composite key -> revisions (newest first) */
  private readonly revisions: Map<string, MasteryStateRevision[]> = new Map();

  /** Current watermark */
  private watermark: MaterializationWatermark;

  constructor(options?: MasteryStateStoreOptions) {
    this.watermark = options?.initialWatermark ?? {
      featureRevision: revision(0),
      graphRevision: revision(0),
      materializedAt: nowFn(),
      statesUpdated: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // WRITE OPERATIONS
  // ---------------------------------------------------------------------------

  async upsert(
    input: UpsertMasteryStateInput,
  ): Promise<UpsertMasteryStateResult> {
    const key = makeKey(input.nodeId, input.granularity);
    const now = nowFn();
    const existing = this.records.get(key);

    // Check expected revision
    if (input.expectedRev !== undefined && existing) {
      if (existing.rev !== input.expectedRev) {
        return {
          success: false,
          error: `Revision mismatch: expected ${input.expectedRev}, got ${existing.rev}`,
        };
      }
    }

    if (existing) {
      // Update existing record
      const newRev = revision((existing.rev as unknown as number) + 1);

      const updatedRecord: MasteryStateRecord = {
        ...existing,
        state: input.state,
        rev: newRev,
        updatedAt: now,
        materialization: input.materialization,
      };

      this.records.set(key, updatedRecord);

      // Store revision
      const revisionEntry: MasteryStateRevision = {
        state: input.state,
        rev: newRev,
        createdAt: now,
        delta: input.delta ?? null,
        materialization: input.materialization,
        previousRev: existing.rev,
      };
      const existingRevisions = this.revisions.get(key) ?? [];
      existingRevisions.unshift(revisionEntry); // Newest first
      this.revisions.set(key, existingRevisions);

      return {
        success: true,
        record: updatedRecord,
        rev: newRev,
        operation: "update",
      };
    } else {
      // Create new record
      const newRev = revision(1);
      const masteryStateId = generateMasteryStateId();

      const newRecord: MasteryStateRecord = {
        masteryStateId,
        nodeId: input.nodeId,
        granularity: input.granularity,
        state: input.state,
        rev: newRev,
        createdAt: now,
        updatedAt: now,
        materialization: input.materialization,
      };

      this.records.set(key, newRecord);

      // Store initial revision
      const revisionEntry: MasteryStateRevision = {
        state: input.state,
        rev: newRev,
        createdAt: now,
        delta: input.delta ?? null,
        materialization: input.materialization,
        previousRev: null,
      };
      this.revisions.set(key, [revisionEntry]);

      return {
        success: true,
        record: newRecord,
        rev: newRev,
        operation: "create",
      };
    }
  }

  async upsertBatch(
    inputs: readonly UpsertMasteryStateInput[],
  ): Promise<readonly UpsertMasteryStateResult[]> {
    // Process sequentially (could be parallelized if needed)
    const results: UpsertMasteryStateResult[] = [];
    for (const input of inputs) {
      const result = await this.upsert(input);
      results.push(result);
    }
    return results;
  }

  async delete(
    nodeId: NodeId,
    granularity: MasteryGranularity,
  ): Promise<boolean> {
    const key = makeKey(nodeId, granularity);
    const existing = this.records.get(key);

    if (!existing) {
      return false;
    }

    // Soft delete by marking deletedAt in the state
    const now = nowFn();
    const deletedState = {
      ...existing.state,
      deletedAt: now,
    };

    const newRev = revision((existing.rev as unknown as number) + 1);
    const updatedRecord: MasteryStateRecord = {
      ...existing,
      state: deletedState as MasteryState,
      rev: newRev,
      updatedAt: now,
    };

    this.records.set(key, updatedRecord);

    // Store deletion revision
    const revisionEntry: MasteryStateRevision = {
      state: deletedState as MasteryState,
      rev: newRev,
      createdAt: now,
      delta: null,
      materialization: existing.materialization,
      previousRev: existing.rev,
    };
    const existingRevisions = this.revisions.get(key) ?? [];
    existingRevisions.unshift(revisionEntry);
    this.revisions.set(key, existingRevisions);

    return true;
  }

  // ---------------------------------------------------------------------------
  // READ OPERATIONS - Single Record
  // ---------------------------------------------------------------------------

  async get(
    nodeId: NodeId,
    granularity: MasteryGranularity,
  ): Promise<MasteryStateRecord | null> {
    const key = makeKey(nodeId, granularity);
    const record = this.records.get(key);

    if (!record) {
      return null;
    }

    // Check if deleted
    if (record.state.deletedAt) {
      return null;
    }

    return record;
  }

  async getMany(
    nodeIds: readonly NodeId[],
    granularity: MasteryGranularity,
  ): Promise<readonly MasteryStateRecord[]> {
    const results: MasteryStateRecord[] = [];
    for (const nodeId of nodeIds) {
      const record = await this.get(nodeId, granularity);
      if (record) {
        results.push(record);
      }
    }
    return results;
  }

  async exists(
    nodeId: NodeId,
    granularity: MasteryGranularity,
  ): Promise<boolean> {
    const record = await this.get(nodeId, granularity);
    return record !== null;
  }

  // ---------------------------------------------------------------------------
  // READ OPERATIONS - Queries
  // ---------------------------------------------------------------------------

  async query(
    options: MasteryStateQueryOptions,
  ): Promise<MasteryStateQueryResult> {
    let results = Array.from(this.records.values());

    // Filter deleted
    if (!options.includeDeleted) {
      results = results.filter((r) => !r.state.deletedAt);
    }

    // Filter by granularity
    if (options.granularity) {
      results = results.filter((r) => r.granularity === options.granularity);
    }

    // Filter by node IDs
    if (options.nodeIds && options.nodeIds.length > 0) {
      const nodeIdSet = new Set(options.nodeIds);
      results = results.filter((r) => nodeIdSet.has(r.nodeId));
    }

    // Filter by retrievability
    if (options.minRetrievability !== undefined) {
      results = results.filter(
        (r) =>
          (r.state.memory.retrievability as unknown as number) >=
          (options.minRetrievability as unknown as number),
      );
    }
    if (options.maxRetrievability !== undefined) {
      results = results.filter(
        (r) =>
          (r.state.memory.retrievability as unknown as number) <=
          (options.maxRetrievability as unknown as number),
      );
    }

    // Filter by learning state
    if (options.learningStates && options.learningStates.length > 0) {
      const stateSet = new Set(options.learningStates);
      results = results.filter((r) =>
        stateSet.has(r.state.memory.learningState),
      );
    }

    // Filter by staleness
    if (options.maxDaysSinceUpdate !== undefined) {
      const cutoff =
        Date.now() - options.maxDaysSinceUpdate * 24 * 60 * 60 * 1000;
      results = results.filter(
        (r) => (r.updatedAt as unknown as number) >= cutoff,
      );
    }

    // Sort
    if (options.sortBy) {
      const direction = options.sortDirection === "desc" ? -1 : 1;
      results.sort((a, b) => {
        let aVal: number;
        let bVal: number;

        switch (options.sortBy) {
          case "updatedAt":
            aVal = a.updatedAt as unknown as number;
            bVal = b.updatedAt as unknown as number;
            break;
          case "retrievability":
            aVal = a.state.memory.retrievability as unknown as number;
            bVal = b.state.memory.retrievability as unknown as number;
            break;
          case "dueDate":
            aVal = a.state.memory.dueDate as unknown as number;
            bVal = b.state.memory.dueDate as unknown as number;
            break;
          case "stability":
            aVal = a.state.memory.stability;
            bVal = b.state.memory.stability;
            break;
          default:
            return 0;
        }

        return (aVal - bVal) * direction;
      });
    }

    // Get total before pagination
    const totalCount = results.length;

    // Pagination
    if (options.offset) {
      results = results.slice(options.offset);
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return {
      states: results,
      totalCount,
      hasMore: options.limit ? results.length === options.limit : false,
    };
  }

  async getByGranularity(
    granularity: MasteryGranularity,
    options?: Omit<MasteryStateQueryOptions, "granularity">,
  ): Promise<MasteryStateQueryResult> {
    return this.query({ ...options, granularity });
  }

  async getDueStates(
    threshold: NormalizedValue,
    options?: Omit<MasteryStateQueryOptions, "maxRetrievability">,
  ): Promise<MasteryStateQueryResult> {
    return this.query({ ...options, maxRetrievability: threshold });
  }

  async getStaleStates(
    maxAge: number,
    options?: Omit<MasteryStateQueryOptions, "maxDaysSinceUpdate">,
  ): Promise<MasteryStateQueryResult> {
    // Invert: stale = NOT updated in maxAge days
    // So we need custom filtering
    const cutoff = Date.now() - maxAge * 24 * 60 * 60 * 1000;

    let results = Array.from(this.records.values());

    // Filter to stale ones (updated BEFORE cutoff)
    results = results.filter(
      (r) => (r.updatedAt as unknown as number) < cutoff && !r.state.deletedAt,
    );

    if (options?.granularity) {
      results = results.filter((r) => r.granularity === options.granularity);
    }

    return {
      states: results,
      totalCount: results.length,
      hasMore: false,
    };
  }

  // ---------------------------------------------------------------------------
  // REVISION HISTORY
  // ---------------------------------------------------------------------------

  async getRevisions(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    options?: { limit?: number; offset?: number },
  ): Promise<readonly MasteryStateRevision[]> {
    const key = makeKey(nodeId, granularity);
    let revisions = this.revisions.get(key) ?? [];

    // Revisions are already newest-first
    if (options?.offset) {
      revisions = revisions.slice(options.offset);
    }
    if (options?.limit) {
      revisions = revisions.slice(0, options.limit);
    }

    return revisions;
  }

  async getAtRevision(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    rev: RevisionNumber,
  ): Promise<MasteryState | null> {
    const key = makeKey(nodeId, granularity);
    const revisions = this.revisions.get(key) ?? [];

    const revision = revisions.find((r) => r.rev === rev);
    return revision?.state ?? null;
  }

  async getDelta(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    fromRev: RevisionNumber,
    toRev: RevisionNumber,
  ): Promise<MasteryStateDelta | null> {
    const key = makeKey(nodeId, granularity);
    const revisions = this.revisions.get(key) ?? [];

    // Find the revision matching toRev
    const toRevision = revisions.find((r) => r.rev === toRev);
    if (!toRevision) {
      return null;
    }

    // If it has a delta and previousRev matches fromRev, return it
    if (toRevision.delta && toRevision.previousRev === fromRev) {
      return toRevision.delta;
    }

    // Otherwise, we'd need to compute the delta (not implemented here)
    return null;
  }

  // ---------------------------------------------------------------------------
  // WATERMARKS & STATISTICS
  // ---------------------------------------------------------------------------

  async getWatermark(): Promise<MaterializationWatermark> {
    return this.watermark;
  }

  async setWatermark(watermark: MaterializationWatermark): Promise<void> {
    this.watermark = watermark;
  }

  async getStatistics(): Promise<MasteryStoreStatistics> {
    const allRecords = Array.from(this.records.values()).filter(
      (r) => !r.state.deletedAt,
    );

    // Count by granularity
    const statesByGranularity: Partial<Record<MasteryGranularity, number>> = {};
    for (const record of allRecords) {
      statesByGranularity[record.granularity] =
        (statesByGranularity[record.granularity] ?? 0) + 1;
    }

    // Count by learning state
    const statesByLearningState: Record<string, number> = {};
    for (const record of allRecords) {
      const ls = record.state.memory.learningState;
      statesByLearningState[ls] = (statesByLearningState[ls] ?? 0) + 1;
    }

    // Average retrievability and stability
    let sumRetrievability = 0;
    let sumStability = 0;
    for (const record of allRecords) {
      sumRetrievability += record.state.memory
        .retrievability as unknown as number;
      sumStability += record.state.memory.stability;
    }
    const avgRetrievability =
      allRecords.length > 0 ? sumRetrievability / allRecords.length : 0;
    const avgStability =
      allRecords.length > 0 ? sumStability / allRecords.length : 0;

    // Total revisions
    let totalRevisions = 0;
    for (const revs of this.revisions.values()) {
      totalRevisions += revs.length;
    }

    // Oldest/newest
    let oldestState: Timestamp | null = null;
    let newestState: Timestamp | null = null;
    for (const record of allRecords) {
      if (
        oldestState === null ||
        (record.createdAt as unknown as number) <
          (oldestState as unknown as number)
      ) {
        oldestState = record.createdAt;
      }
      if (
        newestState === null ||
        (record.updatedAt as unknown as number) >
          (newestState as unknown as number)
      ) {
        newestState = record.updatedAt;
      }
    }

    return {
      totalStates: allRecords.length,
      statesByGranularity,
      statesByLearningState,
      avgRetrievability,
      avgStability,
      totalRevisions,
      oldestState,
      newestState,
    };
  }

  // ---------------------------------------------------------------------------
  // BULK OPERATIONS
  // ---------------------------------------------------------------------------

  async clear(): Promise<void> {
    this.records.clear();
    this.revisions.clear();
    this.watermark = {
      featureRevision: revision(0),
      graphRevision: revision(0),
      materializedAt: nowFn(),
      statesUpdated: 0,
    };
  }

  async exportAll(): Promise<readonly MasteryStateRecord[]> {
    return Array.from(this.records.values());
  }

  async importAll(records: readonly MasteryStateRecord[]): Promise<void> {
    for (const record of records) {
      const key = makeKey(record.nodeId, record.granularity);
      this.records.set(key, record);

      // Also create a revision entry
      const revisionEntry: MasteryStateRevision = {
        state: record.state,
        rev: record.rev,
        createdAt: record.updatedAt,
        delta: null,
        materialization: record.materialization,
        previousRev: null,
      };
      this.revisions.set(key, [revisionEntry]);
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create an in-memory mastery state store
 */
export function createInMemoryMasteryStateStore(
  options?: MasteryStateStoreOptions,
): MasteryStateStore {
  return new InMemoryMasteryStateStore(options);
}
