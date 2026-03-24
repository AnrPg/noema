import type { ICkgMutation } from '../../../../domain/knowledge-graph-service/mutation.repository.js';
import type {
  OntologyMergeConfidenceBand,
  OntologyMergeConflictKind,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

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

export interface IOntologyImportReviewHints {
  confidenceScore: number | null;
  confidenceBand: OntologyMergeConfidenceBand | null;
  conflictFlags: OntologyMergeConflictKind[];
}

const ONTOLOGY_IMPORT_MARKER_PATTERN =
  /\[ontology-import runId=(?<runId>[^\s\]]+) sourceId=(?<sourceId>[^\s\]]+) candidateId=(?<candidateId>[^\]]+)\]/u;
const ONTOLOGY_REVIEW_MARKER_PATTERN =
  /\[ontology-review confidence=(?<confidence>[0-9.]+) band=(?<band>low|medium|high) conflicts=(?<conflicts>[^\]]+)\]/u;

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

export function getOntologyImportReviewHints(
  mutation: Pick<ICkgMutation, 'rationale' | 'operations'>
): IOntologyImportReviewHints {
  const rationaleHints = parseReviewMarker(mutation.rationale);
  if (rationaleHints !== null) {
    return rationaleHints;
  }

  for (const operation of mutation.operations) {
    const operationRationale =
      typeof operation['rationale'] === 'string' ? operation['rationale'] : null;
    const parsed = parseReviewMarker(operationRationale);
    if (parsed !== null) {
      return parsed;
    }
  }

  return {
    confidenceScore: null,
    confidenceBand: null,
    conflictFlags: [],
  };
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

function parseReviewMarker(value: string | null | undefined): IOntologyImportReviewHints | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = ONTOLOGY_REVIEW_MARKER_PATTERN.exec(value);
  if (match?.groups === undefined) {
    return null;
  }

  const band = match.groups['band'];
  const conflicts = match.groups['conflicts'];

  return {
    confidenceScore: Number(match.groups['confidence']),
    confidenceBand: band === 'low' || band === 'medium' || band === 'high' ? band : null,
    conflictFlags:
      typeof conflicts === 'string' && conflicts !== 'none'
        ? (conflicts.split('|').filter((entry) => entry !== '') as OntologyMergeConflictKind[])
        : [],
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
