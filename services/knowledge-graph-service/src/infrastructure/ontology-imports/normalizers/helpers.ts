import type {
  INormalizedOntologyConceptCandidate,
  INormalizedOntologyGraphBatch,
  INormalizedOntologyMappingCandidate,
  INormalizedOntologyRelationCandidate,
  IOntologyGraphRecord,
  IOntologyGraphRecordProvenance,
  IParsedOntologyGraphBatch,
} from '../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import { scoreNormalizedMappings } from './confidence/index.js';

export function createNormalizedBatch(
  batch: IParsedOntologyGraphBatch,
  normalizePredicate: (value: string) => string
): INormalizedOntologyGraphBatch {
  const conceptMap = new Map<string, INormalizedOntologyConceptCandidate>();
  const relationMap = new Map<string, INormalizedOntologyRelationCandidate>();
  const mappingMap = new Map<string, INormalizedOntologyMappingCandidate>();

  for (const record of batch.records) {
    switch (record.recordKind) {
      case 'concept':
        upsertConceptCandidate(conceptMap, record);
        break;
      case 'alias':
        appendAlias(conceptMap, record.conceptExternalId, record.alias, record.provenance);
        break;
      case 'relation':
        upsertRelationCandidate(relationMap, record, normalizePredicate);
        break;
      case 'mapping':
        upsertMappingCandidate(mappingMap, record);
        break;
    }
  }

  return {
    runId: batch.runId,
    sourceId: batch.sourceId,
    sourceVersion: batch.sourceVersion,
    generatedAt: new Date().toISOString(),
    rawRecordCount: batch.records.length,
    conceptCount: conceptMap.size,
    relationCount: relationMap.size,
    mappingCount: mappingMap.size,
    concepts: [...conceptMap.values()].sort(compareByExternalId),
    relations: [...relationMap.values()].sort(compareByExternalId),
    mappings: scoreNormalizedMappings(buildNormalizedMappings(mappingMap)).sort(
      compareByExternalId
    ),
  };
}

function upsertConceptCandidate(
  conceptMap: Map<string, INormalizedOntologyConceptCandidate>,
  record: Extract<IOntologyGraphRecord, { recordKind: 'concept' }>
): void {
  const existing = conceptMap.get(record.externalId);
  if (existing === undefined) {
    conceptMap.set(record.externalId, {
      externalId: record.externalId,
      iri: record.iri,
      nodeKind: record.nodeKind,
      preferredLabel: cleanLabel(record.preferredLabel),
      aliases: dedupeStrings(record.altLabels),
      description: normalizeNullableString(record.description),
      languages: dedupeStrings(record.languages),
      sourceTypes: dedupeStrings(record.sourceTypes),
      properties: record.properties,
      provenance: [record.provenance],
    });
    return;
  }

  existing.iri ??= record.iri;
  existing.description ??= normalizeNullableString(record.description);
  existing.nodeKind = pickNodeKind(existing.nodeKind, record.nodeKind);
  existing.aliases = dedupeStrings([...existing.aliases, ...record.altLabels]);
  existing.languages = dedupeStrings([...existing.languages, ...record.languages]);
  existing.sourceTypes = dedupeStrings([...existing.sourceTypes, ...record.sourceTypes]);
  existing.properties = mergeProperties(existing.properties, record.properties);
  existing.provenance = dedupeProvenance([...existing.provenance, record.provenance]);
}

function appendAlias(
  conceptMap: Map<string, INormalizedOntologyConceptCandidate>,
  conceptExternalId: string,
  alias: string,
  provenance: IOntologyGraphRecordProvenance
): void {
  const existing = conceptMap.get(conceptExternalId);
  if (existing === undefined) {
    conceptMap.set(conceptExternalId, {
      externalId: conceptExternalId,
      iri: null,
      nodeKind: 'concept',
      preferredLabel: cleanLabel(conceptExternalId),
      aliases: [alias],
      description: null,
      languages: [],
      sourceTypes: [],
      properties: {},
      provenance: [provenance],
    });
    return;
  }

  existing.aliases = dedupeStrings([...existing.aliases, alias]);
  existing.provenance = dedupeProvenance([...existing.provenance, provenance]);
}

function upsertRelationCandidate(
  relationMap: Map<string, INormalizedOntologyRelationCandidate>,
  record: Extract<IOntologyGraphRecord, { recordKind: 'relation' }>,
  normalizePredicate: (value: string) => string
): void {
  const key = [
    record.subjectExternalId,
    normalizePredicate(record.sourcePredicate),
    record.objectExternalId,
  ].join('::');
  const existing = relationMap.get(key);

  if (existing === undefined) {
    relationMap.set(key, {
      externalId: record.externalId,
      iri: record.iri,
      normalizedPredicate: normalizePredicate(record.sourcePredicate),
      predicateLabel: normalizeNullableString(record.predicateLabel),
      subjectExternalId: record.subjectExternalId,
      objectExternalId: record.objectExternalId,
      direction: record.direction,
      sourcePredicates: dedupeStrings([record.sourcePredicate]),
      properties: record.properties,
      provenance: [record.provenance],
    });
    return;
  }

  existing.sourcePredicates = dedupeStrings([...existing.sourcePredicates, record.sourcePredicate]);
  existing.provenance = dedupeProvenance([...existing.provenance, record.provenance]);
}

function upsertMappingCandidate(
  mappingMap: Map<string, INormalizedOntologyMappingCandidate>,
  record: Extract<IOntologyGraphRecord, { recordKind: 'mapping' }>
): void {
  const key = `${record.sourceExternalId}::${record.mappingKind}::${record.targetExternalId}`;
  const existing = mappingMap.get(key);

  if (existing === undefined) {
    mappingMap.set(key, {
      externalId: record.externalId,
      sourceExternalId: record.sourceExternalId,
      targetExternalId: record.targetExternalId,
      mappingKind: record.mappingKind,
      confidenceScore: 0,
      confidenceBand: 'low',
      conflictFlags: [],
      provenance: [record.provenance],
    });
    return;
  }

  existing.provenance = dedupeProvenance([...existing.provenance, record.provenance]);
}

function buildNormalizedMappings(
  mappingMap: Map<string, INormalizedOntologyMappingCandidate>
): INormalizedOntologyMappingCandidate[] {
  const expanded = new Map<string, INormalizedOntologyMappingCandidate>(mappingMap);

  addReverseMappings(expanded);
  addExactMatchClosure(expanded);
  addCloseMatchPropagation(expanded);

  return [...expanded.values()];
}

function addReverseMappings(mappingMap: Map<string, INormalizedOntologyMappingCandidate>): void {
  for (const mapping of [...mappingMap.values()]) {
    if (mapping.mappingKind !== 'exact_match' && mapping.mappingKind !== 'close_match') {
      continue;
    }

    const reverseKey = buildMappingKey(
      mapping.targetExternalId,
      mapping.mappingKind,
      mapping.sourceExternalId
    );
    if (mappingMap.has(reverseKey)) {
      continue;
    }

    mappingMap.set(reverseKey, {
      externalId: `${mapping.externalId}#reverse`,
      sourceExternalId: mapping.targetExternalId,
      targetExternalId: mapping.sourceExternalId,
      mappingKind: mapping.mappingKind,
      confidenceScore: mapping.confidenceScore,
      confidenceBand: mapping.confidenceBand,
      conflictFlags: mapping.conflictFlags,
      provenance: mapping.provenance,
    });
  }
}

function addExactMatchClosure(mappingMap: Map<string, INormalizedOntologyMappingCandidate>): void {
  const adjacency = buildAdjacency(mappingMap, 'exact_match');
  const seenNodes = new Set<string>();

  for (const nodeId of adjacency.keys()) {
    if (seenNodes.has(nodeId)) {
      continue;
    }

    const component = collectComponent(nodeId, adjacency, seenNodes);
    if (component.length < 2) {
      continue;
    }

    for (const sourceExternalId of component) {
      for (const targetExternalId of component) {
        if (sourceExternalId === targetExternalId) {
          continue;
        }

        const key = buildMappingKey(sourceExternalId, 'exact_match', targetExternalId);
        if (mappingMap.has(key)) {
          continue;
        }

        mappingMap.set(key, {
          externalId: `derived:${sourceExternalId}#exact#${targetExternalId}`,
          sourceExternalId,
          targetExternalId,
          mappingKind: 'exact_match',
          confidenceScore: 0,
          confidenceBand: 'low',
          conflictFlags: [],
          provenance: collectComponentProvenance(component, mappingMap, 'exact_match'),
        });
      }
    }
  }
}

function addCloseMatchPropagation(
  mappingMap: Map<string, INormalizedOntologyMappingCandidate>
): void {
  const exactAdjacency = buildAdjacency(mappingMap, 'exact_match');
  const componentByNode = buildComponentByNode(exactAdjacency);
  const closeMappings = [...mappingMap.values()].filter(
    (mapping) => mapping.mappingKind === 'close_match'
  );

  for (const mapping of closeMappings) {
    const sourceComponent = componentByNode.get(mapping.sourceExternalId) ?? [
      mapping.sourceExternalId,
    ];
    const targetComponent = componentByNode.get(mapping.targetExternalId) ?? [
      mapping.targetExternalId,
    ];

    for (const sourceExternalId of sourceComponent) {
      for (const targetExternalId of targetComponent) {
        if (sourceExternalId === targetExternalId) {
          continue;
        }

        const key = buildMappingKey(sourceExternalId, 'close_match', targetExternalId);
        if (mappingMap.has(key)) {
          continue;
        }

        mappingMap.set(key, {
          externalId: `derived:${sourceExternalId}#close#${targetExternalId}`,
          sourceExternalId,
          targetExternalId,
          mappingKind: 'close_match',
          confidenceScore: 0,
          confidenceBand: 'low',
          conflictFlags: [],
          provenance: collectDerivedProvenance(
            mapping.provenance,
            sourceComponent,
            targetComponent,
            mappingMap
          ),
        });
      }
    }
  }
}

function buildAdjacency(
  mappingMap: Map<string, INormalizedOntologyMappingCandidate>,
  mappingKind: INormalizedOntologyMappingCandidate['mappingKind']
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const mapping of mappingMap.values()) {
    if (mapping.mappingKind !== mappingKind) {
      continue;
    }

    if (!adjacency.has(mapping.sourceExternalId)) {
      adjacency.set(mapping.sourceExternalId, new Set());
    }
    if (!adjacency.has(mapping.targetExternalId)) {
      adjacency.set(mapping.targetExternalId, new Set());
    }

    adjacency.get(mapping.sourceExternalId)?.add(mapping.targetExternalId);
    adjacency.get(mapping.targetExternalId)?.add(mapping.sourceExternalId);
  }

  return adjacency;
}

function collectComponent(
  startNodeId: string,
  adjacency: Map<string, Set<string>>,
  seenNodes: Set<string>
): string[] {
  const queue = [startNodeId];
  const component: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || seenNodes.has(current)) {
      continue;
    }

    seenNodes.add(current);
    component.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      if (!seenNodes.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return component.sort((left, right) => left.localeCompare(right));
}

function buildComponentByNode(adjacency: Map<string, Set<string>>): Map<string, string[]> {
  const componentByNode = new Map<string, string[]>();
  const seenNodes = new Set<string>();

  for (const nodeId of adjacency.keys()) {
    if (seenNodes.has(nodeId)) {
      continue;
    }

    const component = collectComponent(nodeId, adjacency, seenNodes);
    for (const member of component) {
      componentByNode.set(member, component);
    }
  }

  return componentByNode;
}

function collectComponentProvenance(
  component: string[],
  mappingMap: Map<string, INormalizedOntologyMappingCandidate>,
  mappingKind: INormalizedOntologyMappingCandidate['mappingKind']
): IOntologyGraphRecordProvenance[] {
  const provenance: IOntologyGraphRecordProvenance[] = [];

  for (const sourceExternalId of component) {
    for (const targetExternalId of component) {
      if (sourceExternalId === targetExternalId) {
        continue;
      }

      const mapping = mappingMap.get(
        buildMappingKey(sourceExternalId, mappingKind, targetExternalId)
      );
      if (mapping !== undefined) {
        provenance.push(...mapping.provenance);
      }
    }
  }

  return dedupeProvenance(provenance);
}

function collectDerivedProvenance(
  baseProvenance: IOntologyGraphRecordProvenance[],
  sourceComponent: string[],
  targetComponent: string[],
  mappingMap: Map<string, INormalizedOntologyMappingCandidate>
): IOntologyGraphRecordProvenance[] {
  const provenance = [...baseProvenance];

  provenance.push(...collectComponentProvenance(sourceComponent, mappingMap, 'exact_match'));
  provenance.push(...collectComponentProvenance(targetComponent, mappingMap, 'exact_match'));

  return dedupeProvenance(provenance);
}

function buildMappingKey(
  sourceExternalId: string,
  mappingKind: INormalizedOntologyMappingCandidate['mappingKind'],
  targetExternalId: string
): string {
  return `${sourceExternalId}::${mappingKind}::${targetExternalId}`;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function pickNodeKind(
  current: INormalizedOntologyConceptCandidate['nodeKind'],
  next: INormalizedOntologyConceptCandidate['nodeKind']
): INormalizedOntologyConceptCandidate['nodeKind'] {
  const priority: Record<INormalizedOntologyConceptCandidate['nodeKind'], number> = {
    literal: 3,
    concept: 2,
    entity: 1,
  };

  return priority[next] > priority[current] ? next : current;
}

function mergeProperties(
  current: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };

  for (const [key, nextValue] of Object.entries(next)) {
    const currentValue = merged[key];
    if (isPlainRecord(currentValue) && isPlainRecord(nextValue)) {
      merged[key] = mergeProperties(currentValue, nextValue);
      continue;
    }

    if (Array.isArray(currentValue) && Array.isArray(nextValue)) {
      merged[key] = dedupeUnknownArray([...readArray(currentValue), ...readArray(nextValue)]);
      continue;
    }

    merged[key] = currentValue ?? nextValue;
  }

  return merged;
}

function dedupeUnknownArray(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: unknown[] = [];
  for (const entry of value) {
    entries.push(entry);
  }
  return entries;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dedupeProvenance(
  values: IOntologyGraphRecordProvenance[]
): IOntologyGraphRecordProvenance[] {
  const byKey = new Map<string, IOntologyGraphRecordProvenance>();
  for (const value of values) {
    const key = `${value.runId}:${value.artifactId}:${value.requestUrl ?? ''}`;
    byKey.set(key, value);
  }
  return [...byKey.values()];
}

function normalizeNullableString(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function cleanLabel(value: string): string {
  return value.trim();
}

function compareByExternalId(
  left:
    | INormalizedOntologyConceptCandidate
    | INormalizedOntologyRelationCandidate
    | INormalizedOntologyMappingCandidate,
  right:
    | INormalizedOntologyConceptCandidate
    | INormalizedOntologyRelationCandidate
    | INormalizedOntologyMappingCandidate
): number {
  return left.externalId.localeCompare(right.externalId);
}

export function slugifyPredicate(value: string): string {
  return (
    value
      .replace(/^<|>$/g, '')
      .split(/[/#:]/u)
      .filter(Boolean)
      .at(-1)
      ?.replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() ?? 'related_to'
  );
}
