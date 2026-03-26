/**
 * @noema/knowledge-graph-service - Comparison Application Contracts
 *
 * Transport-safe DTOs for the PKG↔CKG comparison API.
 */

export type ComparisonScopeModeDto = 'domain' | 'engagement_hops';

export interface IComparisonRequestDto {
  domain?: string;
  scopeMode: ComparisonScopeModeDto;
  hopCount: number;
  bootstrapWhenUnseeded: boolean;
}

export interface IComparisonScopeDto {
  mode: ComparisonScopeModeDto;
  hopCount: number;
  requestedDomain: string | null;
  bootstrapApplied: boolean;
  seedNodeCount: number;
  scopedCkgNodeCount: number;
  totalCkgNodeCount: number;
}

export interface IComparisonGraphNodeDto {
  id: string;
  type: 'concept' | 'skill' | 'fact' | 'procedure' | 'principle' | 'example';
  label: string;
  description: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IComparisonGraphEdgeDto {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'prerequisite' | 'related' | 'part_of' | 'example_of' | 'contradicts';
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface IComparisonSubgraphDto {
  nodes: IComparisonGraphNodeDto[];
  edges: IComparisonGraphEdgeDto[];
}

export interface IComparisonResponseDto {
  userId: string;
  pkgNodeCount: number;
  ckgNodeCount: number;
  matchedNodes: number;
  missingFromPkg: IComparisonGraphNodeDto[];
  extraInPkg: IComparisonGraphNodeDto[];
  alignmentScore: number;
  edgeAlignmentScore: number;
  pkgSubgraph: IComparisonSubgraphDto;
  ckgSubgraph: IComparisonSubgraphDto;
  scope: IComparisonScopeDto;
}
