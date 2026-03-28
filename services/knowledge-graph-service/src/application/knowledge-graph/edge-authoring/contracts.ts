import type {
  CkgNodeStatus,
  EdgeOntologicalCategory,
  GraphEdgeType,
  GraphNodeType,
  NodeId,
} from '@noema/types';

import type { IMutationProposal } from '../../../domain/knowledge-graph-service/ckg-mutation-dsl.js';

export interface ICkgEdgeAuthoringNodeSummary {
  nodeId: NodeId;
  label: string;
  nodeType: GraphNodeType;
  domain: string;
  status: CkgNodeStatus | null;
}

export interface ICkgEdgeAuthoringBlockedReason {
  code:
    | 'duplicate_edge'
    | 'duplicate_symmetric_edge'
    | 'inverse_edge_exists'
    | 'invalid_source_type'
    | 'invalid_target_type'
    | 'self_reference'
    | 'status_blocked'
    | 'acyclicity_risk';
  message: string;
}

export interface ICkgEdgeAuthoringOption {
  edgeType: GraphEdgeType;
  category: EdgeOntologicalCategory;
  description: string;
  defaultWeight: number;
  enabled: boolean;
  blockedReasons: ICkgEdgeAuthoringBlockedReason[];
  existingEdgeIds: string[];
  isSymmetric: boolean;
  requiresAcyclicity: boolean;
}

export interface ICkgEdgeAuthoringPreviewRequest {
  sourceNodeId: NodeId;
  targetNodeId: NodeId;
  edgeType?: GraphEdgeType;
  rationale?: string;
}

export interface ICkgEdgeAuthoringPreview {
  source: ICkgEdgeAuthoringNodeSummary;
  target: ICkgEdgeAuthoringNodeSummary;
  options: ICkgEdgeAuthoringOption[];
  warnings: string[];
  proposal: IMutationProposal | null;
}

export interface ICkgEdgeAuthoringService {
  preview(input: ICkgEdgeAuthoringPreviewRequest): Promise<ICkgEdgeAuthoringPreview>;
}
