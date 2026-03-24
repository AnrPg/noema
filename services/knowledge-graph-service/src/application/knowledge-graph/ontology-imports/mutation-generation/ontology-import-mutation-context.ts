import type { ICkgMutation } from '../../../../domain/knowledge-graph-service/mutation.repository.js';

export interface IOntologyImportMutationContext {
  runId: string | null;
  sourceId: string | null;
  candidateId: string | null;
}

export interface IOntologyImportMutationGroupSummary {
  runId: string;
  sourceId: string | null;
  mutationCount: number;
}

const ONTOLOGY_IMPORT_MARKER_PATTERN =
  /\[ontology-import runId=(?<runId>[^\s\]]+) sourceId=(?<sourceId>[^\s\]]+) candidateId=(?<candidateId>[^\]]+)\]/u;

export function getOntologyImportMutationContext(
  mutation: Pick<ICkgMutation, 'rationale' | 'operations'>
): IOntologyImportMutationContext {
  const rationaleContext = parseOntologyImportMarker(mutation.rationale);
  if (rationaleContext !== null) {
    return rationaleContext;
  }

  for (const operation of mutation.operations) {
    const operationRationale =
      typeof operation['rationale'] === 'string' ? operation['rationale'] : null;
    const parsed = parseOntologyImportMarker(operationRationale);
    if (parsed !== null) {
      return parsed;
    }
  }

  return {
    runId: readRunIdFromOperations(mutation),
    sourceId: readSourceIdFromOperations(mutation),
    candidateId: null,
  };
}

export function groupMutationsByOntologyImportRun(
  mutations: readonly Pick<ICkgMutation, 'rationale' | 'operations'>[]
): IOntologyImportMutationGroupSummary[] {
  const groups = new Map<string, IOntologyImportMutationGroupSummary>();

  for (const mutation of mutations) {
    const context = getOntologyImportMutationContext(mutation);
    if (context.runId === null) {
      continue;
    }

    const key = `${context.runId}:${context.sourceId ?? 'unknown'}`;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.mutationCount += 1;
      continue;
    }

    groups.set(key, {
      runId: context.runId,
      sourceId: context.sourceId,
      mutationCount: 1,
    });
  }

  return [...groups.values()].sort((left, right) => left.runId.localeCompare(right.runId));
}

function parseOntologyImportMarker(
  value: string | null | undefined
): IOntologyImportMutationContext | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = ONTOLOGY_IMPORT_MARKER_PATTERN.exec(value);
  if (match?.groups === undefined) {
    return null;
  }

  return {
    runId: match.groups['runId'] ?? null,
    sourceId: match.groups['sourceId'] ?? null,
    candidateId: match.groups['candidateId'] ?? null,
  };
}

function readRunIdFromOperations(mutation: Pick<ICkgMutation, 'operations'>): string | null {
  for (const operation of mutation.operations) {
    const properties = readOntologyImportProperties(operation);
    const runId = properties?.['runId'];
    if (typeof runId === 'string' && runId !== '') {
      return runId;
    }
  }

  return null;
}

function readSourceIdFromOperations(mutation: Pick<ICkgMutation, 'operations'>): string | null {
  for (const operation of mutation.operations) {
    const properties = readOntologyImportProperties(operation);
    const sourceId = properties?.['sourceId'];
    if (typeof sourceId === 'string' && sourceId !== '') {
      return sourceId;
    }
  }

  return null;
}

function readOntologyImportProperties(
  operation: Record<string, unknown>
): Record<string, unknown> | null {
  const properties =
    operation['type'] === 'add_node'
      ? readRecord(operation['properties'])
      : operation['type'] === 'update_node'
        ? readRecord(readRecord(operation['updates'])?.['properties'])
        : null;

  return (
    readRecord(properties?.['ontologyImport']) ??
    readRecord(properties?.['ontologyImportEnrichment'])
  );
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
