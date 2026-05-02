import { CurriculumNodeRuntimeState } from '@noema/types';
import type {
  CurriculumNode,
  CurriculumProgress,
  ScheduleSnapshot,
  SessionSlicePolicy,
} from './curriculum.types.js';

export function composeSessionSlice(
  frontier: CurriculumNode[],
  progressRows: CurriculumProgress[],
  schedules: ScheduleSnapshot[],
  policy: SessionSlicePolicy
): { selectedNodes: CurriculumNode[]; rationale: string } {
  const progressByKey = new Map(progressRows.map((row) => [row.stableNodeKey, row]));
  const scheduleByConcept = new Map(schedules.map((schedule) => [schedule.conceptId, schedule]));
  const now = Date.now();

  const inProgress = frontier
    .filter(
      (node) =>
        progressByKey.get(node.stableNodeKey)?.runtimeState ===
        CurriculumNodeRuntimeState.IN_PROGRESS
    )
    .sort((left, right) => compareDue(left, right, scheduleByConcept, now));

  const unlocked = frontier
    .filter(
      (node) =>
        progressByKey.get(node.stableNodeKey)?.runtimeState !==
        CurriculumNodeRuntimeState.IN_PROGRESS
    )
    .sort((left, right) => left.stableNodeKey.localeCompare(right.stableNodeKey))
    .slice(0, policy.maxNewNodes);

  const selectedNodes = [...inProgress, ...unlocked].slice(0, policy.maxNodes);
  const rationale = `Selected ${String(selectedNodes.length)} node(s): in-progress maintenance before bounded novelty.`;

  return { selectedNodes, rationale };
}

function compareDue(
  left: CurriculumNode,
  right: CurriculumNode,
  schedules: Map<string, ScheduleSnapshot>,
  now: number
): number {
  const leftDue =
    left.ckgConceptId !== undefined
      ? schedules.get(left.ckgConceptId)?.dueAt?.getTime()
      : undefined;
  const rightDue =
    right.ckgConceptId !== undefined
      ? schedules.get(right.ckgConceptId)?.dueAt?.getTime()
      : undefined;
  const leftRank =
    leftDue === undefined ? Number.MAX_SAFE_INTEGER : leftDue <= now ? leftDue : leftDue + now;
  const rightRank =
    rightDue === undefined ? Number.MAX_SAFE_INTEGER : rightDue <= now ? rightDue : rightDue + now;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.stableNodeKey.localeCompare(right.stableNodeKey);
}
