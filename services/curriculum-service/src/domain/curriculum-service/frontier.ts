import { CurriculumEdgeType, CurriculumNodeRuntimeState } from '@noema/types';
import type {
  CurriculumNode,
  CurriculumProgress,
  CurriculumVersionGraph,
} from './curriculum.types.js';
import { branchInfoForNode } from './branching.js';

export function computeFrontier(
  graph: CurriculumVersionGraph,
  progressRows: CurriculumProgress[]
): CurriculumNode[] {
  const progressByKey = new Map(progressRows.map((row) => [row.stableNodeKey, row]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const prerequisiteEdges = graph.edges.filter(
    (edge) => edge.type === CurriculumEdgeType.PREREQUISITE
  );

  return graph.nodes
    .filter((node) => {
      const progress = progressByKey.get(node.stableNodeKey);
      if (
        progress?.runtimeState === CurriculumNodeRuntimeState.IN_PROGRESS ||
        progress?.runtimeState === CurriculumNodeRuntimeState.UNLOCKED
      ) {
        return true;
      }
      if (
        progress?.runtimeState === CurriculumNodeRuntimeState.COMPLETED ||
        progress?.runtimeState === CurriculumNodeRuntimeState.SKIPPED ||
        progress?.runtimeState === CurriculumNodeRuntimeState.BLOCKED
      ) {
        return false;
      }

      const incomingPrerequisites = prerequisiteEdges.filter((edge) => edge.toNodeId === node.id);
      return incomingPrerequisites.every((edge) => {
        const source = nodeById.get(edge.fromNodeId);
        if (source === undefined) return false;
        const sourceProgress = progressByKey.get(source.stableNodeKey);
        return (
          sourceProgress?.runtimeState === CurriculumNodeRuntimeState.COMPLETED ||
          sourceProgress?.runtimeState === CurriculumNodeRuntimeState.SKIPPED
        );
      });
    })
    .sort((left, right) => {
      const leftProgress = progressByKey.get(left.stableNodeKey);
      const rightProgress = progressByKey.get(right.stableNodeKey);
      const leftRank =
        leftProgress?.runtimeState === CurriculumNodeRuntimeState.IN_PROGRESS ? 0 : 1;
      const rightRank =
        rightProgress?.runtimeState === CurriculumNodeRuntimeState.IN_PROGRESS ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;
      const leftBranch = branchInfoForNode(left);
      const rightBranch = branchInfoForNode(right);
      const leftPathRank = pathRoleRank(leftBranch?.pathRole);
      const rightPathRank = pathRoleRank(rightBranch?.pathRole);
      if (leftPathRank !== rightPathRank) return leftPathRank - rightPathRank;
      if ((leftBranch?.isMainPath ?? false) !== (rightBranch?.isMainPath ?? false)) {
        return leftBranch?.isMainPath ? -1 : 1;
      }
      if (left.traversalWeight !== right.traversalWeight)
        return right.traversalWeight - left.traversalWeight;
      return left.stableNodeKey.localeCompare(right.stableNodeKey);
    });
}

function pathRoleRank(pathRole: string | undefined): number {
  switch (pathRole) {
    case 'foundation':
      return 0;
    case 'core':
      return 1;
    case 'focus_area':
      return 2;
    case 'diversion':
      return 3;
    case 'remediation':
      return 4;
    case 'capstone':
      return 5;
    default:
      return 6;
  }
}
