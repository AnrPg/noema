import type { IPaginatedResponse, UserId } from '@noema/types';

import type {
  GraphRestorationScope,
  IGraphSnapshotPayload,
} from './graph-restoration.repository.js';

export interface IGraphSnapshotRecord {
  readonly snapshotId: string;
  readonly graphType: 'pkg' | 'ckg';
  readonly scope: GraphRestorationScope;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly schemaVersion: number;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly createdBy: UserId | string | null;
  readonly sourceCursor: string | null;
  readonly payload: IGraphSnapshotPayload;
}

export interface ICreateGraphSnapshotInput {
  readonly graphType: 'pkg' | 'ckg';
  readonly scope: GraphRestorationScope;
  readonly payload: IGraphSnapshotPayload;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly schemaVersion: number;
  readonly reason?: string;
  readonly createdBy?: string | null;
  readonly sourceCursor?: string | null;
}

export interface IGraphSnapshotListFilters {
  readonly graphType?: 'pkg' | 'ckg';
  readonly userId?: UserId;
  readonly domain?: string;
}

export interface IGraphSnapshotRepository {
  createSnapshot(input: ICreateGraphSnapshotInput): Promise<IGraphSnapshotRecord>;
  getSnapshot(snapshotId: string): Promise<IGraphSnapshotRecord | null>;
  listSnapshots(
    filters: IGraphSnapshotListFilters,
    limit: number,
    offset: number
  ): Promise<IPaginatedResponse<IGraphSnapshotRecord>>;
}
