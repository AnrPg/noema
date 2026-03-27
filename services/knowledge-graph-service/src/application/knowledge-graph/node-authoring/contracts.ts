import type { GraphEdgeType, GraphNodeType, NodeId } from '@noema/types';

import type { IMutationProposal } from '../../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import type { ICkgEdgeAuthoringNodeSummary } from '../edge-authoring/contracts.js';

export type CkgNodeBatchAuthoringAction = 'delete' | 'update';

export interface ICkgNodeBatchUpdateInput {
  nodeType?: GraphNodeType;
  domain?: string;
  tags?: string[];
}

export interface ICkgNodeBatchAuthoringPreviewRequest {
  nodeIds: NodeId[];
  action: CkgNodeBatchAuthoringAction;
  updates?: ICkgNodeBatchUpdateInput;
  rationale?: string;
}

export interface ICkgNodeBatchAuthoringConflict {
  nodeId: NodeId;
  nodeLabel: string;
  edgeId: string;
  edgeType: GraphEdgeType;
  direction: 'source' | 'target';
  otherNodeId: NodeId;
  otherNodeLabel: string;
  message: string;
  suggestions: string[];
}

export interface ICkgNodeBatchAuthoringPreview {
  action: CkgNodeBatchAuthoringAction;
  nodes: ICkgEdgeAuthoringNodeSummary[];
  updates: ICkgNodeBatchUpdateInput | null;
  canProceed: boolean;
  affectedEdgeCount: number;
  warnings: string[];
  conflicts: ICkgNodeBatchAuthoringConflict[];
  proposal: IMutationProposal | null;
}

export interface ICkgNodeBatchAuthoringService {
  preview(input: ICkgNodeBatchAuthoringPreviewRequest): Promise<ICkgNodeBatchAuthoringPreview>;
}
