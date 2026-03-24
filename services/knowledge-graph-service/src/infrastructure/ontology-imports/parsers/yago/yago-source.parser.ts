import type {
  IOntologyGraphRecord,
  IOntologyImportArtifact,
  IOntologyImportRun,
  IParsedOntologyGraphBatch,
  OntologyMappingKind,
  ISourceParser,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import {
  buildConceptRecord,
  buildMappingRecord,
  decodeGraphIdentifier,
  readArtifactText,
} from '../helpers.js';

export class YagoSourceParser implements ISourceParser {
  readonly sourceId = 'yago' as const;

  constructor(private readonly artifactRootDirectory: string) {}

  async parse(
    run: IOntologyImportRun,
    artifacts: IOntologyImportArtifact[]
  ): Promise<IParsedOntologyGraphBatch> {
    const payloadArtifacts = artifacts.filter((artifact) => artifact.kind === 'raw_payload');
    const extractedPayloadArtifacts = payloadArtifacts.filter(
      (artifact) => !artifact.storageKey.endsWith('.zip')
    );
    const parseableArtifacts =
      extractedPayloadArtifacts.length > 0 ? extractedPayloadArtifacts : payloadArtifacts;
    const records: IOntologyGraphRecord[] = [];
    const seenConcepts = new Set<string>();

    for (const artifact of parseableArtifacts) {
      if (artifact.storageKey.endsWith('.zip')) {
        throw new Error(
          'YAGO parser currently expects extracted text artifacts; zip extraction is not implemented yet.'
        );
      }

      const body = await readArtifactText(this.artifactRootDirectory, artifact);
      const lines = body
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#'));

      for (const [index, line] of lines.entries()) {
        const parts = line
          .split('\t')
          .map((entry) => entry.trim())
          .filter(Boolean);
        if (parts.length < 3) {
          continue;
        }

        const [subjectExternalId, predicate, objectExternalId] = parts;
        if (
          subjectExternalId === undefined ||
          predicate === undefined ||
          objectExternalId === undefined
        ) {
          continue;
        }

        if (!seenConcepts.has(subjectExternalId)) {
          seenConcepts.add(subjectExternalId);
          records.push(
            buildConceptRecord({
              sourceId: this.sourceId,
              run,
              artifact,
              requestUrl: null,
              externalId: subjectExternalId,
              iri: maybeUrl(subjectExternalId),
              preferredLabel: decodeGraphIdentifier(subjectExternalId),
              sourceTypes: ['yago_resource'],
              nodeKind: 'entity',
            })
          );
        }

        if (isResourceObject(objectExternalId) && !seenConcepts.has(objectExternalId)) {
          seenConcepts.add(objectExternalId);
          records.push(
            buildConceptRecord({
              sourceId: this.sourceId,
              run,
              artifact,
              requestUrl: null,
              externalId: objectExternalId,
              iri: maybeUrl(objectExternalId),
              preferredLabel: decodeGraphIdentifier(objectExternalId),
              sourceTypes: ['yago_resource'],
              nodeKind: 'entity',
            })
          );
        }

        const mappingKind = inferMappingKind(predicate);
        if (mappingKind !== null && isResourceObject(objectExternalId)) {
          records.push(
            buildMappingRecord({
              sourceId: this.sourceId,
              run,
              artifact,
              requestUrl: null,
              externalId: `${artifact.id}#${String(index)}`,
              sourceExternalId: subjectExternalId,
              targetExternalId: objectExternalId,
              mappingKind,
            })
          );
          continue;
        }

        records.push({
          recordKind: 'relation',
          externalId: `${artifact.id}#${String(index)}`,
          iri: null,
          sourcePredicate: predicate,
          predicateLabel: decodeGraphIdentifier(predicate),
          subjectExternalId,
          objectExternalId,
          direction: 'directed',
          languages: ['en'],
          properties: {},
          provenance: {
            sourceId: this.sourceId,
            sourceVersion: run.sourceVersion,
            runId: run.id,
            artifactId: artifact.id,
            harvestedAt: artifact.createdAt,
            license: null,
            requestUrl: null,
          },
        });
      }
    }

    return {
      runId: run.id,
      sourceId: this.sourceId,
      sourceVersion: run.sourceVersion,
      generatedAt: new Date().toISOString(),
      records,
    };
  }
}

function isResourceObject(value: string): boolean {
  return !value.startsWith('"');
}

function maybeUrl(value: string): string | null {
  const normalized = value.replace(/^<|>$/g, '');
  return normalized.startsWith('http://') || normalized.startsWith('https://') ? normalized : null;
}

function inferMappingKind(predicate: string): OntologyMappingKind | null {
  const normalizedPredicate = predicate.trim().replace(/^<|>$/g, '').toLowerCase();

  if (
    normalizedPredicate.includes('sameas') ||
    normalizedPredicate.includes('exactmatch') ||
    normalizedPredicate.includes('equivalentclass')
  ) {
    return 'exact_match';
  }

  if (normalizedPredicate.includes('closematch')) {
    return 'close_match';
  }

  if (normalizedPredicate.includes('broadmatch')) {
    return 'broad_match';
  }

  if (normalizedPredicate.includes('narrowmatch')) {
    return 'narrow_match';
  }

  if (normalizedPredicate.includes('relatedmatch')) {
    return 'related_match';
  }

  return null;
}
