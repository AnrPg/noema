import type { IGraphEdge, IGraphNode, ISubgraph, UserId } from '@noema/types';

export type GraphRestorationScope =
  | {
      readonly graphType: 'pkg';
      readonly userId: UserId;
      readonly domain?: string;
    }
  | {
      readonly graphType: 'ckg';
      readonly domain?: string;
    };

export interface IGraphSnapshotPayload {
  readonly nodes: readonly IGraphNode[];
  readonly edges: readonly IGraphEdge[];
}

export interface IGraphRestorationRepository {
  captureScope(scope: GraphRestorationScope): Promise<ISubgraph>;
  replaceScope(scope: GraphRestorationScope, snapshot: IGraphSnapshotPayload): Promise<void>;
}
