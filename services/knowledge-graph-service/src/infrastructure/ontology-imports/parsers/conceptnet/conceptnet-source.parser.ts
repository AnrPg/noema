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

interface IConceptNetTargetedEdge {
  '@id'?: string;
  rel?: { '@id'?: string; label?: string };
  start?: { '@id'?: string; label?: string; language?: string };
  end?: { '@id'?: string; label?: string; language?: string };
}

export class ConceptNetSourceParser implements ISourceParser {
  readonly sourceId = 'conceptnet' as const;

  constructor(private readonly artifactRootDirectory: string) {}

  async parse(
    run: IOntologyImportRun,
    artifacts: IOntologyImportArtifact[]
  ): Promise<IParsedOntologyGraphBatch> {
    const payloadArtifacts = artifacts.filter((artifact) => artifact.kind === 'raw_payload');
    const records: IOntologyGraphRecord[] = [];
    const seenConcepts = new Set<string>();

    for (const artifact of payloadArtifacts) {
      const body = await readArtifactText(this.artifactRootDirectory, artifact);

      if (artifact.storageKey.endsWith('.json')) {
        const payload = JSON.parse(body) as {
          edges?: IConceptNetTargetedEdge[];
        };

        for (const edge of payload.edges ?? []) {
          const start = edge.start;
          const end = edge.end;
          const relation = edge.rel;
          if (
            edge['@id'] === undefined ||
            relation?.['@id'] === undefined ||
            start?.['@id'] === undefined ||
            end?.['@id'] === undefined
          ) {
            continue;
          }

          const typedNodes = [
            { id: start['@id'], label: start.label, language: start.language },
            { id: end['@id'], label: end.label, language: end.language },
          ];

          for (const node of typedNodes) {
            if (seenConcepts.has(node.id)) {
              continue;
            }

            seenConcepts.add(node.id);
            records.push(
              buildConceptRecord({
                sourceId: this.sourceId,
                run,
                artifact,
                requestUrl: null,
                externalId: node.id,
                iri: node.id,
                preferredLabel: node.label ?? decodeGraphIdentifier(node.id),
                languages:
                  typeof node.language === 'string' && node.language !== '' ? [node.language] : [],
                sourceTypes: ['conceptnet_node'],
                nodeKind: 'concept',
              })
            );
          }

          records.push({
            recordKind: 'relation',
            externalId: edge['@id'],
            iri: edge['@id'],
            sourcePredicate: relation['@id'],
            predicateLabel: relation.label ?? decodeGraphIdentifier(relation['@id']),
            subjectExternalId: start['@id'],
            objectExternalId: end['@id'],
            direction: 'directed',
            languages: [start.language, end.language].flatMap((value) =>
              typeof value === 'string' && value !== '' ? [value] : []
            ),
            properties: edge as Record<string, unknown>,
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
          const mappingSourceId = selectMappedConceptId(start['@id'], end['@id']);
          const mappingTargetId = selectMappedExternalId(start['@id'], end['@id']);
          const mappingKind = inferConceptNetMappingKind(relation['@id'], mappingTargetId);
          if (mappingKind !== null && mappingSourceId !== null && mappingTargetId !== null) {
            records.push(
              buildMappingRecord({
                sourceId: this.sourceId,
                run,
                artifact,
                requestUrl: null,
                externalId: `${edge['@id']}#mapping`,
                sourceExternalId: mappingSourceId,
                targetExternalId: mappingTargetId,
                mappingKind,
              })
            );
          }
        }

        continue;
      }

      const rows = body
        .split(/\r?\n/u)
        .map((row) => row.trim())
        .filter((row) => row !== '');
      for (const row of rows) {
        const columns = row.split('\t');
        if (columns.length < 4) {
          continue;
        }
        const assertionId = columns[0];
        const predicate = columns[1];
        const subject = columns[2];
        const object = columns[3];
        if (
          assertionId === undefined ||
          predicate === undefined ||
          subject === undefined ||
          object === undefined
        ) {
          continue;
        }

        for (const nodeId of [subject, object]) {
          if (seenConcepts.has(nodeId)) {
            continue;
          }

          seenConcepts.add(nodeId);
          records.push(
            buildConceptRecord({
              sourceId: this.sourceId,
              run,
              artifact,
              requestUrl: null,
              externalId: nodeId,
              iri: nodeId,
              preferredLabel: decodeGraphIdentifier(nodeId),
              sourceTypes: ['conceptnet_node'],
              nodeKind: 'concept',
            })
          );
        }

        records.push({
          recordKind: 'relation',
          externalId: assertionId,
          iri: assertionId,
          sourcePredicate: predicate,
          predicateLabel: decodeGraphIdentifier(predicate),
          subjectExternalId: subject,
          objectExternalId: object,
          direction: 'directed',
          languages: [],
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

        const mappingSourceId = selectMappedConceptId(subject, object);
        const mappingTargetId = selectMappedExternalId(subject, object);
        const mappingKind = inferConceptNetMappingKind(predicate, mappingTargetId);
        if (mappingKind !== null && mappingSourceId !== null && mappingTargetId !== null) {
          records.push(
            buildMappingRecord({
              sourceId: this.sourceId,
              run,
              artifact,
              requestUrl: null,
              externalId: `${assertionId}#mapping`,
              sourceExternalId: mappingSourceId,
              targetExternalId: mappingTargetId,
              mappingKind,
            })
          );
        }
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

function inferConceptNetMappingKind(
  predicate: string,
  targetExternalId: string | null
): OntologyMappingKind | null {
  const normalizedPredicate = predicate.trim().toLowerCase();
  if (normalizedPredicate === '/r/externalurl') {
    return isTrustedExternalIdentifier(targetExternalId) ? 'close_match' : 'related_match';
  }

  return null;
}

function selectMappedConceptId(left: string, right: string): string | null {
  if (isConceptNetConceptId(left) && !isConceptNetConceptId(right)) {
    return left;
  }

  if (isConceptNetConceptId(right) && !isConceptNetConceptId(left)) {
    return right;
  }

  return null;
}

function selectMappedExternalId(left: string, right: string): string | null {
  if (isConceptNetConceptId(left) && !isConceptNetConceptId(right)) {
    return right;
  }

  if (isConceptNetConceptId(right) && !isConceptNetConceptId(left)) {
    return left;
  }

  return null;
}

function isConceptNetConceptId(value: string): boolean {
  return value.startsWith('/c/');
}

function isTrustedExternalIdentifier(value: string | null): boolean {
  if (value === null) {
    return false;
  }

  return [
    'wikidata.org',
    'dbpedia.org',
    'geonames.org',
    'getty.edu',
    'vocab.getty.edu',
    'id.loc.gov',
    'data.europa.eu',
    'openalex.org',
  ].some((host) => value.includes(host));
}
