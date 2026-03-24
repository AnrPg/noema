import type { OntologyMappingKind } from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

export interface IGeoNamesExtractedMapping {
  targetExternalId: string;
  mappingKind: OntologyMappingKind;
  sourceField: string;
}

export function extractGeoNamesMappings(
  record: Record<string, unknown>
): IGeoNamesExtractedMapping[] {
  const candidates: IGeoNamesExtractedMapping[] = [];

  const wikipediaUrl =
    typeof record['wikipediaURL'] === 'string' ? record['wikipediaURL'].trim() : '';
  if (wikipediaUrl !== '') {
    candidates.push({
      targetExternalId: wikipediaUrl,
      mappingKind: 'close_match',
      sourceField: 'wikipediaURL',
    });
  }

  const alternateNames = Array.isArray(record['alternateNames']) ? record['alternateNames'] : [];
  for (const entry of alternateNames) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const alternateName = entry as Record<string, unknown>;
    const alternateValue =
      typeof alternateName['name'] === 'string' ? alternateName['name'].trim() : '';
    const language =
      typeof alternateName['lang'] === 'string' ? alternateName['lang'].trim().toLowerCase() : '';

    if (alternateValue.startsWith('http') && (language === 'link' || language === 'wkdt')) {
      candidates.push({
        targetExternalId: alternateValue,
        mappingKind: language === 'wkdt' ? 'exact_match' : 'close_match',
        sourceField: `alternateNames.${language}`,
      });
    }
  }

  return dedupeMappings(candidates);
}

function dedupeMappings(values: IGeoNamesExtractedMapping[]): IGeoNamesExtractedMapping[] {
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
