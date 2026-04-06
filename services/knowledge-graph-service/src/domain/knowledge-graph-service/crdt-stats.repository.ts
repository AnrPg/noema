import type { Metadata, UserId } from '@noema/types';

export type GraphCrdtTargetKind = 'ckg_node' | 'proposed_label';
export type GraphCrdtDirection = 'support' | 'oppose' | 'neutral';

export interface IGraphCrdtStat {
  readonly statKey: string;
  readonly graphType: 'ckg';
  readonly targetKind: GraphCrdtTargetKind;
  readonly targetNodeId: string | null;
  readonly proposedLabel: string | null;
  readonly evidenceType: string;
  readonly supportCount: number;
  readonly opposeCount: number;
  readonly neutralCount: number;
  readonly totalObservations: number;
  readonly averageConfidence: number;
  readonly supportCounterByReplica: Readonly<Record<string, number>>;
  readonly opposeCounterByReplica: Readonly<Record<string, number>>;
  readonly neutralCounterByReplica: Readonly<Record<string, number>>;
  readonly confidenceCounterByReplica: Readonly<Record<string, number>>;
  readonly metadata: Metadata;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IGraphCrdtStatsRepository {
  applyEvidenceSignal(input: {
    evidenceId: string;
    replicaId: string;
    graphType: 'ckg';
    targetKind: GraphCrdtTargetKind;
    targetNodeId?: string;
    proposedLabel?: string;
    evidenceType: string;
    direction: GraphCrdtDirection;
    confidence: number;
    sourceUserId: UserId;
    metadata?: Metadata;
  }): Promise<IGraphCrdtStat>;

  listStats(filters: {
    targetKind?: GraphCrdtTargetKind;
    targetNodeId?: string;
    proposedLabel?: string;
    evidenceType?: string;
  }, pagination?: {
    limit: number;
    offset: number;
  }): Promise<{
    items: IGraphCrdtStat[];
    total: number;
    hasMore: boolean;
  }>;
}
