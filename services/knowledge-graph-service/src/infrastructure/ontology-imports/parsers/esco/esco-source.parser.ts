import type {
  IOntologyGraphRecord,
  IOntologyImportArtifact,
  IOntologyImportRun,
  IParsedOntologyGraphBatch,
  OntologyMappingKind,
  ISourceParser,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import {
  buildAliasRecords,
  buildConceptRecord,
  buildMappingRecord,
  normalizeStringArray,
  readArtifactText,
} from '../helpers.js';

interface IEscoManifest {
  pages?: {
    storageKey: string;
    requestUrl?: string;
  }[];
}

export class EscoSourceParser implements ISourceParser {
  readonly sourceId = 'esco' as const;

  constructor(private readonly artifactRootDirectory: string) {}

  async parse(
    run: IOntologyImportRun,
    artifacts: IOntologyImportArtifact[]
  ): Promise<IParsedOntologyGraphBatch> {
    const manifestRequestUrls = await loadManifestRequestUrls(
      this.artifactRootDirectory,
      artifacts
    );
    const payloadArtifacts = artifacts.filter((artifact) => artifact.kind === 'raw_payload');
    const records: IOntologyGraphRecord[] = [];

    for (const artifact of payloadArtifacts) {
      const body = await readArtifactText(this.artifactRootDirectory, artifact);
      const payload = JSON.parse(body) as {
        _embedded?: Record<string, unknown>;
      };
      const requestUrl = manifestRequestUrls.get(artifact.storageKey) ?? null;

      for (const itemRecord of extractEmbeddedRecords(payload)) {
        const externalId = readString(itemRecord, ['uri', '@id', 'id']);
        if (externalId === null) {
          continue;
        }

        const altLabels = normalizeStringArray(
          readUnknown(itemRecord, ['altLabels', 'alternativeLabel', 'altLabel'])
        );
        const preferredLabel =
          readLabel(itemRecord, ['preferredLabel', 'title', 'name']) ?? externalId;
        const description = readLabel(itemRecord, ['description']);
        const languages = collectLanguages(itemRecord);
        const conceptRecord = buildConceptRecord({
          sourceId: this.sourceId,
          run,
          artifact,
          requestUrl,
          externalId,
          iri: externalId,
          preferredLabel,
          altLabels,
          description,
          languages,
          sourceTypes: collectSourceTypes(itemRecord),
          properties: itemRecord,
          nodeKind: 'concept',
        });

        records.push(conceptRecord);
        records.push(
          ...buildAliasRecords({
            sourceId: this.sourceId,
            run,
            artifact,
            requestUrl,
            conceptExternalId: externalId,
            aliases: altLabels,
            language: languages[0] ?? null,
            aliasType: 'alt_label',
          })
        );
        records.push(
          ...buildMappingRecords({
            run,
            artifact,
            externalId,
            itemRecord,
            requestUrl,
          })
        );
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

function extractEmbeddedRecords(payload: {
  _embedded?: Record<string, unknown>;
}): Record<string, unknown>[] {
  const embedded = payload._embedded ?? {};

  return Object.values(embedded).flatMap((entry) => {
    if (Array.isArray(entry)) {
      return entry.flatMap((item) =>
        typeof item === 'object' && item !== null ? [item as Record<string, unknown>] : []
      );
    }

    if (typeof entry === 'object' && entry !== null) {
      return [entry as Record<string, unknown>];
    }

    return [];
  });
}

async function loadManifestRequestUrls(
  artifactRootDirectory: string,
  artifacts: IOntologyImportArtifact[]
): Promise<Map<string, string>> {
  const manifestArtifact = artifacts.find((artifact) => artifact.kind === 'manifest');
  if (manifestArtifact === undefined) {
    return new Map();
  }

  const body = await readArtifactText(artifactRootDirectory, manifestArtifact);
  const manifest = JSON.parse(body) as IEscoManifest;

  return new Map(
    (manifest.pages ?? [])
      .filter(
        (page): page is { storageKey: string; requestUrl: string } =>
          typeof page.storageKey === 'string' && typeof page.requestUrl === 'string'
      )
      .map((page) => [page.storageKey, page.requestUrl])
  );
}

function readUnknown(record: object, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return (record as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

function readString(record: object, keys: string[]): string | null {
  const value = readUnknown(record, keys);
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readLabel(record: object, keys: string[]): string | null {
  const value = readUnknown(record, keys);

  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'label' in value &&
    typeof value.label === 'string' &&
    value.label.trim() !== ''
  ) {
    return value.label.trim();
  }

  return null;
}

function collectLanguages(record: object): string[] {
  const preferredLabelValue = readUnknown(record, ['preferredLabel']);
  const preferredLabelRecord =
    typeof preferredLabelValue === 'object' && preferredLabelValue !== null
      ? (preferredLabelValue as Record<string, unknown>)
      : null;
  const candidates = [
    readString(record, ['language']),
    typeof preferredLabelRecord?.['language'] === 'string'
      ? preferredLabelRecord['language']
      : undefined,
  ];

  return candidates.flatMap((value) =>
    typeof value === 'string' && value.trim() !== '' ? [value.trim()] : []
  );
}

function collectSourceTypes(record: object): string[] {
  const candidates = [
    readString(record, ['className']),
    readString(record, ['conceptType']),
    readString(record, ['type']),
  ];

  return candidates.flatMap((value) =>
    typeof value === 'string' && value.trim() !== '' ? [value.trim()] : []
  );
}

function buildMappingRecords(input: {
  run: IOntologyImportRun;
  artifact: IOntologyImportArtifact;
  externalId: string;
  itemRecord: Record<string, unknown>;
  requestUrl: string | null;
}): IOntologyGraphRecord[] {
  const mappingRecords: IOntologyGraphRecord[] = [];
  const mappingCandidates: { key: string; mappingKind: OntologyMappingKind }[] = [
    { key: 'sameAs', mappingKind: 'exact_match' },
    { key: 'exactMatch', mappingKind: 'exact_match' },
    { key: 'closeMatch', mappingKind: 'close_match' },
    { key: 'broadMatch', mappingKind: 'broad_match' },
    { key: 'narrowMatch', mappingKind: 'narrow_match' },
    { key: 'relatedMatch', mappingKind: 'related_match' },
    { key: 'externalClassification', mappingKind: 'close_match' },
    { key: 'externalClassifications', mappingKind: 'close_match' },
    { key: 'classification', mappingKind: 'close_match' },
    { key: 'classifications', mappingKind: 'close_match' },
  ];

  for (const candidate of mappingCandidates) {
    const values = extractUriValues(input.itemRecord[candidate.key]);
    values.forEach((targetExternalId, index) => {
      mappingRecords.push(
        buildMappingRecord({
          sourceId: 'esco',
          run: input.run,
          artifact: input.artifact,
          requestUrl: input.requestUrl,
          externalId: `${input.externalId}#${candidate.key}-${String(index)}`,
          sourceExternalId: input.externalId,
          targetExternalId,
          mappingKind: candidate.mappingKind,
        })
      );
    });
  }

  const linkedMappings = extractLinkedMappings(input.itemRecord);
  linkedMappings.forEach((mapping, index) => {
    mappingRecords.push(
      buildMappingRecord({
        sourceId: 'esco',
        run: input.run,
        artifact: input.artifact,
        requestUrl: input.requestUrl,
        externalId: `${input.externalId}#linked-${String(index)}`,
        sourceExternalId: input.externalId,
        targetExternalId: mapping.targetExternalId,
        mappingKind: mapping.mappingKind,
      })
    );
  });

  return dedupeMappings(mappingRecords);
}

function extractLinkedMappings(record: Record<string, unknown>): {
  targetExternalId: string;
  mappingKind: OntologyMappingKind;
}[] {
  const links =
    typeof record['_links'] === 'object' && record['_links'] !== null
      ? (record['_links'] as Record<string, unknown>)
      : null;
  if (links === null) {
    return [];
  }

  const candidates: { targetExternalId: string; mappingKind: OntologyMappingKind }[] = [];
  const knownLinkKinds: Record<string, OntologyMappingKind> = {
    sameAs: 'exact_match',
    exactMatch: 'exact_match',
    closeMatch: 'close_match',
    relatedMatch: 'related_match',
    broaderConcept: 'broad_match',
    narrowerConcept: 'narrow_match',
    externalClassification: 'close_match',
    externalClassifications: 'close_match',
    classification: 'close_match',
    classifications: 'close_match',
  };

  for (const [key, value] of Object.entries(links)) {
    const inferredMappingKind = inferExternalClassificationMappingKind(key, value);
    const mappingKind = knownLinkKinds[key] ?? inferredMappingKind;
    if (mappingKind === undefined) {
      continue;
    }

    const targetExternalIds =
      inferredMappingKind === undefined
        ? extractUriValues(value)
        : extractUriValues(value).filter(isTrustedExternalClassificationTarget);
    for (const targetExternalId of targetExternalIds) {
      candidates.push({ targetExternalId, mappingKind });
    }
  }

  return candidates;
}

function extractUriValues(value: unknown): string[] {
  if (typeof value === 'string' && value.trim() !== '') {
    return isUriLike(value) ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractUriValues(entry));
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const uriCandidate = [record['uri'], record['@id'], record['href'], record['resource']].find(
    (entry) => typeof entry === 'string' && entry.trim() !== ''
  );

  if (typeof uriCandidate === 'string') {
    return isUriLike(uriCandidate) ? [uriCandidate.trim()] : [];
  }

  if ('_links' in record) {
    return extractUriValues(record['_links']);
  }

  return [];
}

function isUriLike(value: string): boolean {
  return /^https?:\/\//u.test(value.trim());
}

function inferExternalClassificationMappingKind(
  key: string,
  value: unknown
): OntologyMappingKind | undefined {
  const normalizedKey = key.trim().toLowerCase();
  if (!normalizedKey.includes('classification') && !normalizedKey.includes('taxonomy')) {
    return undefined;
  }

  const targets = extractUriValues(value).filter(isTrustedExternalClassificationTarget);
  return targets.length > 0 ? 'close_match' : undefined;
}

function isTrustedExternalClassificationTarget(value: string): boolean {
  return [
    'wikidata.org',
    'dbpedia.org',
    'geonames.org',
    'id.loc.gov',
    'vocab.getty.edu',
    'data.europa.eu',
    'openalex.org',
  ].some((host) => value.includes(host));
}

function dedupeMappings(records: IOntologyGraphRecord[]): IOntologyGraphRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (record.recordKind !== 'mapping') {
      return true;
    }

    const key = [record.sourceExternalId, record.targetExternalId, record.mappingKind].join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
