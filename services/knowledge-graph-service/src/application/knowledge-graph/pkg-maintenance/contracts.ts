export interface IPkgBulkDeleteInput {
  userId: string;
  nodeIds: string[];
  actorId?: string;
  correlationId?: string;
}

export interface IPkgBulkDeleteResult {
  userId: string;
  deletedNodeIds: string[];
  deletedEdgeCount: number;
  failed: {
    nodeId: string;
    reason: string;
  }[];
  deletedAt: string;
}

export interface IPkgResetInput {
  userId: string;
}

export interface IPkgResetResult {
  userId: string;
  deletedNeo4jPkgNodes: number;
  deletedNeo4jPkgEdges: number;
  deletedOperationLogCount: number;
  deletedMetricSnapshotCount: number;
  deletedMetricsStalenessCount: number;
  deletedMisconceptionCount: number;
  deletedAggregationEvidenceCount: number;
  clearedCachePatterns: string[];
  resetAt: string;
}

export interface IPkgMaintenancePort {
  reset(input: IPkgResetInput): Promise<IPkgResetResult>;
}

export interface IPkgMaintenanceApplicationService {
  bulkDeleteNodes(input: IPkgBulkDeleteInput): Promise<IPkgBulkDeleteResult>;
  resetPkg(input: IPkgResetInput): Promise<IPkgResetResult>;
}
