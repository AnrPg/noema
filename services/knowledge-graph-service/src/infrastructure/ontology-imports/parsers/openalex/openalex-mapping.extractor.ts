import type { OntologyMappingKind } from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

export interface IOpenAlexExtractedMapping {
  targetExternalId: string;
  mappingKind: OntologyMappingKind;
  sourceField: string;
}

export function extractOpenAlexMappings(
  record: Record<string, unknown>
): IOpenAlexExtractedMapping[] {
  const ids =
    typeof record['ids'] === 'object' && record['ids'] !== null
      ? (record['ids'] as Record<string, unknown>)
      : null;

  if (ids === null) {
    return [];
  }

  const candidates: IOpenAlexExtractedMapping[] = [];
  const mappingConfig: { key: string; mappingKind: OntologyMappingKind }[] = [
    { key: 'wikidata', mappingKind: 'exact_match' },
    { key: 'wikipedia', mappingKind: 'close_match' },
    { key: 'mag', mappingKind: 'related_match' },
  ];

  for (const candidate of mappingConfig) {
    const value = ids[candidate.key];
    if (typeof value !== 'string' || value.trim() === '') {
      continue;
    }

    candidates.push({
      targetExternalId: value.trim(),
      mappingKind: candidate.mappingKind,
      sourceField: `ids.${candidate.key}`,
    });
  }

  return dedupeMappings(candidates);
}

function dedupeMappings(values: IOpenAlexExtractedMapping[]): IOpenAlexExtractedMapping[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.mappingKind}|${value.targetExternalId}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
