import { RevisionChangeState } from '@noema/types';
import type { RevisionChange } from './curriculum.types.js';

export function rejectFrozenNodeChanges(
  changes: RevisionChange[],
  frozenStableNodeKeys: string[]
): RevisionChange[] {
  const frozen = new Set(frozenStableNodeKeys);
  return changes.map((change) => {
    const touchedKeys = extractTouchedStableNodeKeys(change.payload);
    const touchesFrozen = touchedKeys.some((key) => frozen.has(key));
    return touchesFrozen
      ? { ...change, state: RevisionChangeState.REJECTED, rejectionReason: 'node_frozen' }
      : change;
  });
}

export function approvedChanges(changes: RevisionChange[]): RevisionChange[] {
  return changes.filter((change) => change.state === RevisionChangeState.APPROVED);
}

function extractTouchedStableNodeKeys(payload: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  for (const key of [
    'stableNodeKey',
    'fromStableNodeKey',
    'toStableNodeKey',
    'targetStableNodeKey',
  ]) {
    const value = payload[key];
    if (typeof value === 'string') keys.add(value);
  }
  const arrayValue = payload['stableNodeKeys'];
  if (Array.isArray(arrayValue)) {
    for (const value of arrayValue) {
      if (typeof value === 'string') keys.add(value);
    }
  }
  return [...keys];
}
