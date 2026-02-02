// =============================================================================
// IN-MEMORY AI AUDIT LOG - In-memory implementation of AI audit trail
// =============================================================================
// Provides an in-memory implementation of AIAuditLog for:
// - Development and testing
// - Single-session applications
// - Environments without persistent storage
//
// NOT for production use where durability is required.
//
// NO UI. NO REAL ML. FULL AUDITABILITY.
// =============================================================================

import type {
  EntityId,
  NodeId,
  UserId,
  ProposalId,
  SnapshotId,
  Timestamp,
  Duration,
} from "../../types/lkgc/foundation";
import type {
  AIAuditLog,
  AIAuditId,
  AIAuditRecord,
  AIAuditRecordType,
  AIAuditStatistics,
  PendingHumanDecision,
  OperationGroupAppliedAudit,
  OperationGroupRejectedAudit,
  HumanDecisionReceivedAudit,
} from "./audit-types";

// =============================================================================
// IN-MEMORY AI AUDIT LOG
// =============================================================================

/**
 * Configuration for InMemoryAIAuditLog
 */
export interface InMemoryAIAuditLogConfig {
  /** Maximum number of records to store (FIFO eviction) */
  readonly maxRecords: number;

  /** Whether to index by node ID (uses more memory but faster queries) */
  readonly indexByNode: boolean;

  /** Whether to log to console (for debugging) */
  readonly logToConsole: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_AUDIT_LOG_CONFIG: InMemoryAIAuditLogConfig = {
  maxRecords: 10000,
  indexByNode: true,
  logToConsole: false,
};

/**
 * InMemoryAIAuditLog - In-memory implementation of AIAuditLog
 *
 * Features:
 * - Fast in-memory storage with configurable size limits
 * - Multiple indexes for efficient queries
 * - Supports pending human decision tracking
 * - Statistics computation
 */
export class InMemoryAIAuditLog implements AIAuditLog {
  private readonly config: InMemoryAIAuditLogConfig;

  // Primary storage (ordered by timestamp)
  private records: AIAuditRecord[] = [];

  // Indexes
  private readonly byId = new Map<AIAuditId, AIAuditRecord>();
  private readonly byProposal = new Map<ProposalId, AIAuditRecord[]>();
  private readonly bySnapshot = new Map<SnapshotId, AIAuditRecord[]>();
  private readonly byUser = new Map<UserId, AIAuditRecord[]>();
  private readonly byType = new Map<AIAuditRecordType, AIAuditRecord[]>();
  private readonly byNode = new Map<NodeId, AIAuditRecord[]>();

  // Pending decisions
  private readonly pendingDecisions = new Map<EntityId, PendingHumanDecision>();

  // ID generation
  private auditIdCounter = 0;
  private decisionIdCounter = 0;

  constructor(config: Partial<InMemoryAIAuditLogConfig> = {}) {
    this.config = { ...DEFAULT_AUDIT_LOG_CONFIG, ...config };
  }

  // ===========================================================================
  // WRITE OPERATIONS
  // ===========================================================================

  async append(record: Omit<AIAuditRecord, "auditId">): Promise<AIAuditId> {
    const auditId = this.generateAuditId();
    const fullRecord = { ...record, auditId } as AIAuditRecord;

    // Enforce size limit (FIFO eviction)
    if (this.records.length >= this.config.maxRecords) {
      const evicted = this.records.shift();
      if (evicted) {
        this.removeFromIndexes(evicted);
      }
    }

    // Add to primary storage
    this.records.push(fullRecord);

    // Add to indexes
    this.addToIndexes(fullRecord);

    // Debug logging
    if (this.config.logToConsole) {
      console.log(`[AIAuditLog] ${record.recordType}:`, fullRecord);
    }

    return auditId;
  }

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  async getById(auditId: AIAuditId): Promise<AIAuditRecord | undefined> {
    return this.byId.get(auditId);
  }

  async queryByProposal(
    proposalId: ProposalId,
  ): Promise<readonly AIAuditRecord[]> {
    return this.byProposal.get(proposalId) ?? [];
  }

  async queryBySnapshot(
    snapshotId: SnapshotId,
  ): Promise<readonly AIAuditRecord[]> {
    return this.bySnapshot.get(snapshotId) ?? [];
  }

  async queryByUser(userId: UserId): Promise<readonly AIAuditRecord[]> {
    return this.byUser.get(userId) ?? [];
  }

  async queryByType(
    recordType: AIAuditRecordType,
    limit?: number,
  ): Promise<readonly AIAuditRecord[]> {
    const records = this.byType.get(recordType) ?? [];
    return limit ? records.slice(-limit) : records;
  }

  async queryByTimeRange(
    startAt: Timestamp,
    endAt: Timestamp,
    limit?: number,
  ): Promise<readonly AIAuditRecord[]> {
    const filtered = this.records.filter(
      (r) => r.timestamp >= startAt && r.timestamp <= endAt,
    );
    return limit ? filtered.slice(-limit) : filtered;
  }

  async queryByNode(nodeId: NodeId): Promise<readonly AIAuditRecord[]> {
    if (!this.config.indexByNode) {
      // Fallback to scan if indexing disabled
      return this.records.filter((r) => this.recordInvolvesNode(r, nodeId));
    }
    return this.byNode.get(nodeId) ?? [];
  }

  // ===========================================================================
  // PENDING DECISIONS
  // ===========================================================================

  async getPendingDecisions(
    userId: UserId,
  ): Promise<readonly PendingHumanDecision[]> {
    const pending: PendingHumanDecision[] = [];
    for (const decision of this.pendingDecisions.values()) {
      if (decision.userId === userId && decision.status === "pending") {
        pending.push(decision);
      }
    }
    return pending;
  }

  async addPendingDecision(
    decision: Omit<PendingHumanDecision, "decisionId">,
  ): Promise<EntityId> {
    const decisionId = this.generateDecisionId();
    const fullDecision: PendingHumanDecision = { ...decision, decisionId };
    this.pendingDecisions.set(decisionId, fullDecision);
    return decisionId;
  }

  async updatePendingDecision(
    decisionId: EntityId,
    update: Partial<
      Pick<PendingHumanDecision, "status" | "decision" | "decidedAt">
    >,
  ): Promise<void> {
    const existing = this.pendingDecisions.get(decisionId);
    if (existing) {
      this.pendingDecisions.set(decisionId, { ...existing, ...update });
    }
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  async getStatistics(userId: UserId): Promise<AIAuditStatistics> {
    const userRecords = await this.queryByUser(userId);

    // Count by type
    let snapshotsGenerated = 0;
    let proposalsReceived = 0;
    let operationsApplied = 0;
    let operationsRejected = 0;
    let humanDecisionsRequested = 0;
    let humanDecisionsMade = 0;
    let totalDecisionTime = 0;
    let decisionTimeCount = 0;

    const proposalStatusCounts: Record<string, number> = {};
    const rejectionReasons: Record<string, number> = {};
    const modelsUsed = new Set<string>();

    for (const record of userRecords) {
      switch (record.recordType) {
        case "snapshot_generated":
          snapshotsGenerated++;
          break;

        case "proposal_received": {
          proposalsReceived++;
          const pr = record;
          modelsUsed.add(pr.model.modelId);
          break;
        }

        case "proposal_validated": {
          const pv = record;
          proposalStatusCounts["validated"] =
            (proposalStatusCounts["validated"] ?? 0) + 1;
          if (!pv.isValid) {
            proposalStatusCounts["invalid"] =
              (proposalStatusCounts["invalid"] ?? 0) + 1;
          }
          break;
        }

        case "operation_group_applied": {
          const applied = record as OperationGroupAppliedAudit;
          operationsApplied += applied.operationsApplied;
          break;
        }

        case "operation_group_rejected": {
          const rejected = record as OperationGroupRejectedAudit;
          operationsRejected += rejected.affectedOperationCount;
          for (const reason of rejected.rejectionReasons) {
            rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
          }
          break;
        }

        case "human_decision_requested":
          humanDecisionsRequested++;
          break;

        case "human_decision_received": {
          humanDecisionsMade++;
          const hdr = record as HumanDecisionReceivedAudit;
          if (hdr.decisionDuration) {
            totalDecisionTime += hdr.decisionDuration;
            decisionTimeCount++;
          }
          break;
        }
      }
    }

    // Compute top rejection reasons
    const sortedRejections = Object.entries(rejectionReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      snapshotsGenerated,
      proposalsReceived,
      proposalsByStatus: proposalStatusCounts,
      operationsApplied,
      operationsRejected,
      humanDecisionsRequested,
      humanDecisionsMade,
      avgHumanDecisionTime:
        decisionTimeCount > 0
          ? ((totalDecisionTime / decisionTimeCount) as Duration)
          : (0 as Duration),
      modelsUsed: Array.from(modelsUsed),
      topRejectionReasons: sortedRejections,
    };
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Clear all records (for testing)
   */
  clear(): void {
    this.records = [];
    this.byId.clear();
    this.byProposal.clear();
    this.bySnapshot.clear();
    this.byUser.clear();
    this.byType.clear();
    this.byNode.clear();
    this.pendingDecisions.clear();
  }

  /**
   * Get total record count
   */
  getRecordCount(): number {
    return this.records.length;
  }

  /**
   * Get pending decision count
   */
  getPendingDecisionCount(): number {
    let count = 0;
    for (const d of this.pendingDecisions.values()) {
      if (d.status === "pending") count++;
    }
    return count;
  }

  /**
   * Export all records (for backup/debugging)
   */
  exportRecords(): readonly AIAuditRecord[] {
    return [...this.records];
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private generateAuditId(): AIAuditId {
    return `audit_${Date.now()}_${++this.auditIdCounter}` as AIAuditId;
  }

  private generateDecisionId(): EntityId {
    return `decision_${Date.now()}_${++this.decisionIdCounter}` as EntityId;
  }

  private addToIndexes(record: AIAuditRecord): void {
    // By ID
    this.byId.set(record.auditId, record);

    // By type
    const typeRecords = this.byType.get(record.recordType) ?? [];
    typeRecords.push(record);
    this.byType.set(record.recordType, typeRecords);

    // By user (if present)
    if (record.userId) {
      const userRecords = this.byUser.get(record.userId) ?? [];
      userRecords.push(record);
      this.byUser.set(record.userId, userRecords);
    }

    // Type-specific indexes
    this.addTypeSpecificIndexes(record);
  }

  private addTypeSpecificIndexes(record: AIAuditRecord): void {
    // Index by proposal ID
    const proposalId = this.extractProposalId(record);
    if (proposalId) {
      const proposalRecords = this.byProposal.get(proposalId) ?? [];
      proposalRecords.push(record);
      this.byProposal.set(proposalId, proposalRecords);
    }

    // Index by snapshot ID
    const snapshotId = this.extractSnapshotId(record);
    if (snapshotId) {
      const snapshotRecords = this.bySnapshot.get(snapshotId) ?? [];
      snapshotRecords.push(record);
      this.bySnapshot.set(snapshotId, snapshotRecords);
    }

    // Index by node ID (if enabled)
    if (this.config.indexByNode) {
      const nodeIds = this.extractNodeIds(record);
      for (const nodeId of nodeIds) {
        const nodeRecords = this.byNode.get(nodeId) ?? [];
        nodeRecords.push(record);
        this.byNode.set(nodeId, nodeRecords);
      }
    }
  }

  private removeFromIndexes(record: AIAuditRecord): void {
    // By ID
    this.byId.delete(record.auditId);

    // By type
    const typeRecords = this.byType.get(record.recordType);
    if (typeRecords) {
      const idx = typeRecords.findIndex((r) => r.auditId === record.auditId);
      if (idx >= 0) typeRecords.splice(idx, 1);
    }

    // By user
    if (record.userId) {
      const userRecords = this.byUser.get(record.userId);
      if (userRecords) {
        const idx = userRecords.findIndex((r) => r.auditId === record.auditId);
        if (idx >= 0) userRecords.splice(idx, 1);
      }
    }

    // By proposal
    const proposalId = this.extractProposalId(record);
    if (proposalId) {
      const proposalRecords = this.byProposal.get(proposalId);
      if (proposalRecords) {
        const idx = proposalRecords.findIndex(
          (r) => r.auditId === record.auditId,
        );
        if (idx >= 0) proposalRecords.splice(idx, 1);
      }
    }

    // By snapshot
    const snapshotId = this.extractSnapshotId(record);
    if (snapshotId) {
      const snapshotRecords = this.bySnapshot.get(snapshotId);
      if (snapshotRecords) {
        const idx = snapshotRecords.findIndex(
          (r) => r.auditId === record.auditId,
        );
        if (idx >= 0) snapshotRecords.splice(idx, 1);
      }
    }

    // By node (if enabled)
    if (this.config.indexByNode) {
      const nodeIds = this.extractNodeIds(record);
      for (const nodeId of nodeIds) {
        const nodeRecords = this.byNode.get(nodeId);
        if (nodeRecords) {
          const idx = nodeRecords.findIndex(
            (r) => r.auditId === record.auditId,
          );
          if (idx >= 0) nodeRecords.splice(idx, 1);
        }
      }
    }
  }

  private extractProposalId(record: AIAuditRecord): ProposalId | undefined {
    switch (record.recordType) {
      case "proposal_received":
      case "proposal_validated":
      case "operation_group_validated":
      case "operation_group_applied":
      case "operation_group_rejected":
      case "human_decision_requested":
      case "human_decision_received":
      case "proposal_expired":
      case "proposal_superseded":
        return (record as { proposalId: ProposalId }).proposalId;
      default:
        return undefined;
    }
  }

  private extractSnapshotId(record: AIAuditRecord): SnapshotId | undefined {
    switch (record.recordType) {
      case "snapshot_generated":
        return (record as { snapshotId: SnapshotId }).snapshotId;
      case "proposal_received":
        return (record as { snapshotId: SnapshotId }).snapshotId;
      default:
        return undefined;
    }
  }

  private extractNodeIds(record: AIAuditRecord): NodeId[] {
    const nodeIds: NodeId[] = [];

    switch (record.recordType) {
      case "operation_group_applied": {
        const applied = record as OperationGroupAppliedAudit;
        for (const change of applied.stateChanges) {
          nodeIds.push(change.targetNodeId);
        }
        break;
      }
      case "operation_group_rejected": {
        const rejected = record as OperationGroupRejectedAudit;
        nodeIds.push(...rejected.affectedNodeIds);
        break;
      }
      case "human_decision_requested": {
        const requested = record as { affectedNodeIds: readonly NodeId[] };
        nodeIds.push(...requested.affectedNodeIds);
        break;
      }
    }

    return nodeIds;
  }

  private recordInvolvesNode(record: AIAuditRecord, nodeId: NodeId): boolean {
    const nodeIds = this.extractNodeIds(record);
    return nodeIds.includes(nodeId);
  }
}
