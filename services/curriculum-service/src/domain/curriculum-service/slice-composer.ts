import {
  CurriculumBranchDriftState,
  CurriculumNodeRuntimeState,
} from '@noema/types';
import { branchInfoForNode } from './branching.js';
import type {
  CurriculumBranchState,
  CurriculumNode,
  CurriculumProgress,
  ScheduleSnapshot,
  SessionSlicePolicy,
} from './curriculum.types.js';

export interface SessionSliceDecision {
  selectedNodes: CurriculumNode[];
  rationale: string;
  selectedBranchGroupKeys: string[];
  selectionReason: string;
  branchDecisionState: CurriculumBranchDriftState;
  blockedMainPathNodeKeys: string[];
  rejoinPlan: string[];
  nextBranchStates: CurriculumBranchState[];
}

export function composeSessionSlice(
  frontier: CurriculumNode[],
  progressRows: CurriculumProgress[],
  schedules: ScheduleSnapshot[],
  policy: SessionSlicePolicy,
  branchStates: CurriculumBranchState[] = []
): SessionSliceDecision {
  const progressByKey = new Map(progressRows.map((row) => [row.stableNodeKey, row]));
  const scheduleByConcept = new Map(schedules.map((schedule) => [schedule.conceptId, schedule]));
  const branchStateByKey = new Map(branchStates.map((state) => [state.branchGroupKey, state]));
  const now = Date.now();

  const inProgress = frontier
    .filter(
      (node) =>
        progressByKey.get(node.stableNodeKey)?.runtimeState ===
        CurriculumNodeRuntimeState.IN_PROGRESS
    )
    .sort((left, right) => compareNodes(left, right, scheduleByConcept, branchStateByKey, now));

  const unlocked = frontier
    .filter(
      (node) =>
        progressByKey.get(node.stableNodeKey)?.runtimeState !==
        CurriculumNodeRuntimeState.IN_PROGRESS
    )
    .sort((left, right) => compareNodes(left, right, scheduleByConcept, branchStateByKey, now))
    .slice(0, policy.maxNewNodes);

  const selectedNodes = [...inProgress, ...unlocked].slice(0, policy.maxNodes);
  if (selectedNodes.length === 0) {
    throw new Error('Curriculum frontier produced no selectable nodes for the session slice.');
  }

  const selectedBranchGroupKeys = Array.from(
    new Set(
      selectedNodes
        .map((node) => branchInfoForNode(node)?.branchGroupKey)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );
  const preferredBranchGroupKeys = policy.preferredBranchGroupKeys ?? [];
  const matchedPreferred = selectedBranchGroupKeys.filter((key) =>
    preferredBranchGroupKeys.includes(key)
  );
  const selectedBranchReason =
    matchedPreferred.length > 0
      ? 'preferred_branch_continued'
      : selectedNodes.some((node) => {
            const info = branchInfoForNode(node);
            return info?.pathRole === 'diversion' || info?.pathRole === 'remediation';
          })
        ? 'diversion_selected_for_progress'
        : 'main_path_progression';
  const branchDecisionState =
    selectedBranchReason === 'diversion_selected_for_progress'
      ? CurriculumBranchDriftState.EXPLORING_DIVERSION
      : CurriculumBranchDriftState.ON_PATH;

  const blockedMainPathNodeKeys = frontier
    .filter((node) => {
      const branch = branchInfoForNode(node);
      return branch?.isMainPath === true && !selectedNodes.some((item) => item.id === node.id);
    })
    .map((node) => node.stableNodeKey);
  const rejoinPlan = selectedNodes.flatMap((node) => branchInfoForNode(node)?.branchExitTargets ?? []);

  const nextBranchStates = mergeBranchStates(branchStates, selectedNodes, branchDecisionState);
  const rationale = `Selected ${String(selectedNodes.length)} node(s): in-progress work first, then branch-aware novelty.`;
  const selectionReason =
    selectedBranchReason === 'preferred_branch_continued'
      ? 'Continued the learner-preferred branch while preserving maintenance work.'
      : selectedBranchReason === 'diversion_selected_for_progress'
        ? 'Selected a diversion/remediation branch because it is the most actionable unlocked path.'
        : 'Selected the strongest available main-path progression.';

  return {
    selectedNodes,
    rationale,
    selectedBranchGroupKeys,
    selectionReason,
    branchDecisionState,
    blockedMainPathNodeKeys,
    rejoinPlan: Array.from(new Set(rejoinPlan)),
    nextBranchStates,
  };
}

function compareNodes(
  left: CurriculumNode,
  right: CurriculumNode,
  schedules: Map<string, ScheduleSnapshot>,
  branchStates: Map<string, CurriculumBranchState>,
  now: number
): number {
  const leftBranch = branchInfoForNode(left);
  const rightBranch = branchInfoForNode(right);
  const leftBranchRank = branchPreferenceRank(leftBranch?.branchGroupKey, branchStates);
  const rightBranchRank = branchPreferenceRank(rightBranch?.branchGroupKey, branchStates);
  if (leftBranchRank !== rightBranchRank) return leftBranchRank - rightBranchRank;

  const leftPathRoleRank = pathRoleRank(leftBranch?.pathRole);
  const rightPathRoleRank = pathRoleRank(rightBranch?.pathRole);
  if (leftPathRoleRank !== rightPathRoleRank) return leftPathRoleRank - rightPathRoleRank;

  const leftDue =
    left.ckgConceptId !== undefined ? schedules.get(left.ckgConceptId)?.dueAt?.getTime() : undefined;
  const rightDue =
    right.ckgConceptId !== undefined
      ? schedules.get(right.ckgConceptId)?.dueAt?.getTime()
      : undefined;
  const leftDueRank =
    leftDue === undefined ? Number.MAX_SAFE_INTEGER : leftDue <= now ? leftDue : leftDue + now;
  const rightDueRank =
    rightDue === undefined ? Number.MAX_SAFE_INTEGER : rightDue <= now ? rightDue : rightDue + now;
  if (leftDueRank !== rightDueRank) return leftDueRank - rightDueRank;

  if ((leftBranch?.isMainPath ?? false) !== (rightBranch?.isMainPath ?? false)) {
    return leftBranch?.isMainPath ? -1 : 1;
  }
  if (left.traversalWeight !== right.traversalWeight) {
    return right.traversalWeight - left.traversalWeight;
  }
  return left.stableNodeKey.localeCompare(right.stableNodeKey);
}

function branchPreferenceRank(
  branchGroupKey: string | undefined,
  branchStates: Map<string, CurriculumBranchState>
): number {
  if (branchGroupKey === undefined) return 3;
  const state = branchStates.get(branchGroupKey);
  if (state === undefined) return 2;
  switch (state.driftState) {
    case CurriculumBranchDriftState.ON_PATH:
      return 0;
    case CurriculumBranchDriftState.REJOINED:
      return 1;
    case CurriculumBranchDriftState.STALLED_ON_PREREQ:
      return 2;
    case CurriculumBranchDriftState.EXPLORING_DIVERSION:
      return 1;
    case CurriculumBranchDriftState.REMEDIATION_LOOP:
      return 1;
    default:
      return 2;
  }
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

function mergeBranchStates(
  currentStates: CurriculumBranchState[],
  selectedNodes: CurriculumNode[],
  driftState: CurriculumBranchDriftState
): CurriculumBranchState[] {
  const merged = new Map(currentStates.map((state) => [state.branchGroupKey, { ...state }]));
  const now = new Date().toISOString();
  for (const node of selectedNodes) {
    const branch = branchInfoForNode(node);
    if (branch?.branchGroupKey === undefined) continue;
    merged.set(branch.branchGroupKey, {
      branchGroupKey: branch.branchGroupKey,
      selectedPathRole: branch.pathRole,
      selectedNodeKey: node.stableNodeKey,
      selectionSource: 'system_selected',
      selectedAt: merged.get(branch.branchGroupKey)?.selectedAt ?? now,
      lastConfirmedAt: now,
      driftState,
    });
  }
  return [...merged.values()].sort((left, right) =>
    left.branchGroupKey.localeCompare(right.branchGroupKey)
  );
}
