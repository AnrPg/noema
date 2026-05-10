import { CurriculumBranchDriftState } from '@noema/types';
import type {
  ICurriculum,
  ICurriculumNode,
} from '@noema/contracts';
import type {
  CurriculumBranchInfo,
  CurriculumBranchState,
  CurriculumNode,
} from './curriculum.types.js';

function _string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function _string_array(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return items.length > 0 ? items : undefined;
}

export function branchInfoForNode(
  node: Pick<CurriculumNode, 'branchInfo' | 'metadata'>
): CurriculumBranchInfo | undefined {
  if (node.branchInfo !== undefined) return node.branchInfo;
  const metadata = node.metadata;
  if (typeof metadata !== 'object' || metadata === null) return undefined;
  const branch = (metadata as Record<string, unknown>)['branch'];
  if (typeof branch !== 'object' || branch === null) return undefined;
  const value = branch as Record<string, unknown>;
  const info: CurriculumBranchInfo = {
    pathRole: _string(value['pathRole']) as CurriculumBranchInfo['pathRole'],
    branchGroupKey: _string(value['branchGroupKey']),
    branchEntryStrategy: _string(value['branchEntryStrategy']) as CurriculumBranchInfo['branchEntryStrategy'],
    branchExitTargets: _string_array(value['branchExitTargets']),
    focusTags: _string_array(value['focusTags']),
    isMainPath: typeof value['isMainPath'] === 'boolean' ? value['isMainPath'] : undefined,
  };
  return Object.values(info).some((item) => item !== undefined) ? info : undefined;
}

export function withBranchInfoMetadata(
  metadata: Record<string, unknown> | undefined,
  branchInfo: CurriculumBranchInfo | undefined
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) };
  if (branchInfo === undefined) return next;
  next['branch'] = {
    ...(branchInfo.pathRole !== undefined ? { pathRole: branchInfo.pathRole } : {}),
    ...(branchInfo.branchGroupKey !== undefined ? { branchGroupKey: branchInfo.branchGroupKey } : {}),
    ...(branchInfo.branchEntryStrategy !== undefined
      ? { branchEntryStrategy: branchInfo.branchEntryStrategy }
      : {}),
    ...(branchInfo.branchExitTargets !== undefined ? { branchExitTargets: branchInfo.branchExitTargets } : {}),
    ...(branchInfo.focusTags !== undefined ? { focusTags: branchInfo.focusTags } : {}),
    ...(branchInfo.isMainPath !== undefined ? { isMainPath: branchInfo.isMainPath } : {}),
  };
  return next;
}

export function branchStatesFromCurriculum(
  curriculum: Pick<ICurriculum, 'metadata'>
): CurriculumBranchState[] {
  const branchStates = curriculum.metadata.branchStates;
  if (!Array.isArray(branchStates)) return [];
  return branchStates.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const value = item as unknown as Record<string, unknown>;
    const branchGroupKey = _string(value['branchGroupKey']);
    if (branchGroupKey === undefined) return [];
    return [
      {
        branchGroupKey,
        selectedPathRole: _string(value['selectedPathRole']) as CurriculumBranchState['selectedPathRole'],
        selectedNodeKey: _string(value['selectedNodeKey']),
        selectionSource: _string(value['selectionSource']),
        selectedAt: _string(value['selectedAt']),
        lastConfirmedAt: _string(value['lastConfirmedAt']),
        driftState:
          (_string(value['driftState']) as CurriculumBranchState['driftState']) ??
          CurriculumBranchDriftState.ON_PATH,
      },
    ];
  });
}

export function curriculumMetadataWithBranchStates(
  curriculum: Pick<ICurriculum, 'metadata'>,
  branchStates: CurriculumBranchState[]
): ICurriculum['metadata'] {
  return {
    ...curriculum.metadata,
    branchStates: branchStates.map((item) => ({
      branchGroupKey: item.branchGroupKey,
      ...(item.selectedPathRole !== undefined ? { selectedPathRole: item.selectedPathRole } : {}),
      ...(item.selectedNodeKey !== undefined ? { selectedNodeKey: item.selectedNodeKey } : {}),
      ...(item.selectionSource !== undefined ? { selectionSource: item.selectionSource } : {}),
      ...(item.selectedAt !== undefined
        ? { selectedAt: item.selectedAt instanceof Date ? item.selectedAt.toISOString() : item.selectedAt }
        : {}),
      ...(item.lastConfirmedAt !== undefined
        ? {
            lastConfirmedAt:
              item.lastConfirmedAt instanceof Date
                ? item.lastConfirmedAt.toISOString()
                : item.lastConfirmedAt,
          }
        : {}),
      driftState: item.driftState,
    })),
  };
}

export function mapContractNodeBranchInfo(
  node: Pick<ICurriculumNode, 'branchInfo' | 'metadata'>
): CurriculumBranchInfo | undefined {
  if (node.branchInfo !== undefined) return node.branchInfo;
  return branchInfoForNode(node as Pick<CurriculumNode, 'branchInfo' | 'metadata'>);
}
