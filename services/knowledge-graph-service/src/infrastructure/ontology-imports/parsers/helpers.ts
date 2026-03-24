import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  IOntologyGraphAliasRecord,
  IOntologyGraphConceptRecord,
  IOntologyGraphMappingRecord,
  IOntologyGraphRecordProvenance,
  IOntologyImportArtifact,
  IOntologyImportRun,
  OntologyMappingKind,
  OntologySourceId,
} from '../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

export async function readArtifactText(
  artifactRootDirectory: string,
  artifact: IOntologyImportArtifact
): Promise<string> {
  const absolutePath = path.join(artifactRootDirectory, artifact.storageKey);
  const buffer = await readFile(absolutePath);

  if (artifact.storageKey.endsWith('.gz')) {
    return gunzipSync(buffer).toString('utf8');
  }

  return buffer.toString('utf8');
}

export function buildProvenance(
  sourceId: OntologySourceId,
  run: IOntologyImportRun,
  artifact: IOntologyImportArtifact,
  requestUrl: string | null
): IOntologyGraphRecordProvenance {
  return {
    sourceId,
    sourceVersion: run.sourceVersion,
    runId: run.id,
    artifactId: artifact.id,
    harvestedAt: artifact.createdAt,
    license: null,
    requestUrl,
  };
}

export function decodeGraphIdentifier(value: string): string {
  const trimmed = value.replace(/^<|>$/g, '');
  const lastSegment = trimmed.split(/[/#:]/).filter(Boolean).at(-1) ?? trimmed;
  try {
    return decodeURIComponent(lastSegment.replaceAll('_', ' '));
  } catch {
    return lastSegment.replaceAll('_', ' ');
  }
}

export function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: string[] = [];
  for (const entry of values) {
    if (typeof entry === 'string' && entry.trim() !== '') {
      normalized.push(entry.trim());
      continue;
    }

    if (
      typeof entry === 'object' &&
      entry !== null &&
      'label' in entry &&
      typeof (entry as { label?: unknown }).label === 'string'
    ) {
      const label = (entry as { label: string }).label.trim();
      if (label !== '') {
        normalized.push(label);
      }
    }
  }

  return normalized;
}

export function buildConceptRecord(input: {
  sourceId: OntologySourceId;
  run: IOntologyImportRun;
  artifact: IOntologyImportArtifact;
  requestUrl: string | null;
  externalId: string;
  iri?: string | null;
  preferredLabel: string;
  altLabels?: string[];
  description?: string | null;
  languages?: string[];
  sourceTypes?: string[];
  properties?: Record<string, unknown>;
  nodeKind?: IOntologyGraphConceptRecord['nodeKind'];
}): IOntologyGraphConceptRecord {
  return {
    recordKind: 'concept',
    externalId: input.externalId,
    iri: input.iri ?? null,
    nodeKind: input.nodeKind ?? 'concept',
    preferredLabel: input.preferredLabel,
    altLabels: input.altLabels ?? [],
    description: input.description ?? null,
    languages: input.languages ?? [],
    sourceTypes: input.sourceTypes ?? [],
    properties: input.properties ?? {},
    provenance: buildProvenance(input.sourceId, input.run, input.artifact, input.requestUrl),
  };
}

export function buildAliasRecords(input: {
  sourceId: OntologySourceId;
  run: IOntologyImportRun;
  artifact: IOntologyImportArtifact;
  requestUrl: string | null;
  conceptExternalId: string;
  aliases: string[];
  language?: string | null;
  aliasType?: string | null;
}): IOntologyGraphAliasRecord[] {
  return input.aliases.map((alias, index) => ({
    recordKind: 'alias',
    externalId: `${input.conceptExternalId}#alias-${String(index)}`,
    conceptExternalId: input.conceptExternalId,
    alias,
    language: input.language ?? null,
    aliasType: input.aliasType ?? null,
    provenance: buildProvenance(input.sourceId, input.run, input.artifact, input.requestUrl),
  }));
}

export function buildMappingRecord(input: {
  sourceId: OntologySourceId;
  run: IOntologyImportRun;
  artifact: IOntologyImportArtifact;
  requestUrl: string | null;
  externalId: string;
  sourceExternalId: string;
  targetExternalId: string;
  mappingKind: OntologyMappingKind;
}): IOntologyGraphMappingRecord {
  return {
    recordKind: 'mapping',
    externalId: input.externalId,
    sourceExternalId: input.sourceExternalId,
    targetExternalId: input.targetExternalId,
    mappingKind: input.mappingKind,
    provenance: buildProvenance(input.sourceId, input.run, input.artifact, input.requestUrl),
  };
}
