import type {
  IOntologyGraphConceptRecord,
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
  buildRelationRecord,
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

    for (const artifact of parseableArtifacts) {
      if (artifact.storageKey.endsWith('.zip')) {
        throw new Error(
          'YAGO parser currently expects extracted text artifacts; zip extraction is not implemented yet.'
        );
      }

      const conceptMap = new Map<string, IMutableConceptRecord>();
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

        const parsedObject = parseObjectToken(objectExternalId);
        const subjectConcept = ensureConceptRecord(
          conceptMap,
          buildConceptSeed(subjectExternalId, inferSubjectConceptRole(predicate))
        );

        const mappingKind = inferMappingKind(predicate);
        if (mappingKind !== null && parsedObject.kind === 'resource') {
          records.push(
            buildMappingRecord({
              sourceId: this.sourceId,
              run,
              artifact,
              requestUrl: null,
              externalId: `${artifact.id}#${String(index)}`,
              sourceExternalId: subjectExternalId,
              targetExternalId: parsedObject.value,
              mappingKind,
            })
          );
          continue;
        }

        if (parsedObject.kind === 'literal') {
          if (isLabelPredicate(predicate)) {
            applyLabelLiteral(subjectConcept, parsedObject);
            continue;
          }

          if (isDescriptionPredicate(predicate)) {
            applyDescriptionLiteral(subjectConcept, parsedObject);
            continue;
          }

          appendLiteralFact(subjectConcept, predicate, parsedObject);
          continue;
        }

        ensureConceptRecord(
          conceptMap,
          buildConceptSeed(parsedObject.value, inferObjectConceptRole(predicate))
        );

        records.push(
          buildRelationRecord({
            sourceId: this.sourceId,
            run,
            artifact,
            requestUrl: null,
            externalId: `${artifact.id}#${String(index)}`,
            subjectExternalId,
            objectExternalId: parsedObject.value,
            sourcePredicate: predicate,
            predicateLabel: decodeGraphIdentifier(predicate),
            languages: ['en'],
            properties: buildRelationProperties(predicate),
          })
        );
      }

      for (const concept of conceptMap.values()) {
        records.push(
          buildConceptRecord({
            sourceId: this.sourceId,
            run,
            artifact,
            requestUrl: null,
            externalId: concept.externalId,
            iri: concept.iri,
            preferredLabel: concept.preferredLabel,
            altLabels: [...concept.altLabels],
            description: concept.description,
            languages: [...concept.languages],
            sourceTypes: [...concept.sourceTypes],
            properties: concept.properties,
            nodeKind: concept.nodeKind,
          })
        );

        records.push(
          ...buildAliasRecords({
            sourceId: this.sourceId,
            run,
            artifact,
            requestUrl: null,
            conceptExternalId: concept.externalId,
            aliases: [...concept.altLabels],
            language: 'en',
            aliasType: 'label_variant',
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

function maybeUrl(value: string): string | null {
  const normalized = value.replace(/^<|>$/g, '');
  return normalized.startsWith('http://') || normalized.startsWith('https://') ? normalized : null;
}

function inferMappingKind(predicate: string): OntologyMappingKind | null {
  const normalizedPredicate = predicate.trim().replace(/^<|>$/g, '').toLowerCase();

  if (normalizedPredicate.includes('sameas') || normalizedPredicate.includes('exactmatch')) {
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

interface IMutableConceptRecord {
  externalId: string;
  iri: string | null;
  preferredLabel: string;
  altLabels: Set<string>;
  description: string | null;
  languages: Set<string>;
  sourceTypes: Set<string>;
  properties: Record<string, unknown>;
  nodeKind: IOntologyGraphConceptRecord['nodeKind'];
}

type ParsedObjectToken =
  | { kind: 'resource'; value: string }
  | { kind: 'literal'; value: string; language: string | null; datatype: string | null };

type YagoConceptRole = 'instance' | 'class';

function parseObjectToken(value: string): ParsedObjectToken {
  const literalMatch =
    /^"(?<literal>(?:[^"\\]|\\.)*)"(?:(?:@(?<language>[A-Za-z-]+))|\^\^(?<datatype>.+))?$/u.exec(
      value
    );
  if (literalMatch?.groups !== undefined) {
    return {
      kind: 'literal',
      value: decodeLiteralValue(literalMatch.groups['literal'] ?? ''),
      language: literalMatch.groups['language'] ?? null,
      datatype: literalMatch.groups['datatype']?.replace(/^<|>$/g, '') ?? null,
    };
  }

  return { kind: 'resource', value };
}

function decodeLiteralValue(value: string): string {
  return value
    .replace(/\\"/gu, '"')
    .replace(/\\n/gu, '\n')
    .replace(/\\r/gu, '\r')
    .replace(/\\t/gu, '\t')
    .replace(/\\\\/gu, '\\');
}

function ensureConceptRecord(
  conceptMap: Map<string, IMutableConceptRecord>,
  seed: IMutableConceptRecord
): IMutableConceptRecord {
  const existing = conceptMap.get(seed.externalId);
  if (existing === undefined) {
    conceptMap.set(seed.externalId, seed);
    return seed;
  }

  if (shouldPreferLabel(seed.preferredLabel, existing.preferredLabel)) {
    existing.altLabels.add(existing.preferredLabel);
    existing.preferredLabel = seed.preferredLabel;
  } else if (seed.preferredLabel !== existing.preferredLabel) {
    existing.altLabels.add(seed.preferredLabel);
  }

  for (const alias of seed.altLabels) {
    if (alias !== existing.preferredLabel) {
      existing.altLabels.add(alias);
    }
  }
  for (const language of seed.languages) {
    existing.languages.add(language);
  }
  for (const sourceType of seed.sourceTypes) {
    existing.sourceTypes.add(sourceType);
  }

  existing.iri ??= seed.iri;
  existing.description ??= seed.description;
  existing.nodeKind = mergeNodeKind(existing.nodeKind, seed.nodeKind);
  existing.properties = mergeProperties(existing.properties, seed.properties);
  return existing;
}

function buildConceptSeed(externalId: string, role: YagoConceptRole): IMutableConceptRecord {
  return {
    externalId,
    iri: maybeUrl(externalId),
    preferredLabel: decodeGraphIdentifier(externalId),
    altLabels: new Set<string>(),
    description: null,
    languages: new Set(['en']),
    sourceTypes: new Set(['yago_resource', role === 'class' ? 'yago_class' : 'yago_instance']),
    properties: {
      yagoResourceKind: role,
    },
    nodeKind: role === 'class' ? 'concept' : 'entity',
  };
}

function inferSubjectConceptRole(predicate: string): YagoConceptRole {
  return isSubclassPredicate(predicate) ? 'class' : 'instance';
}

function inferObjectConceptRole(predicate: string): YagoConceptRole {
  if (isTypePredicate(predicate) || isSubclassPredicate(predicate)) {
    return 'class';
  }
  return 'instance';
}

function isTypePredicate(predicate: string): boolean {
  const normalized = predicate.replace(/^<|>$/g, '').toLowerCase();
  return normalized === 'rdf:type' || normalized.endsWith('#type') || normalized.endsWith('/type');
}

function isSubclassPredicate(predicate: string): boolean {
  const normalized = predicate.replace(/^<|>$/g, '').toLowerCase();
  return (
    normalized === 'rdfs:subclassof' ||
    normalized.endsWith('#subclassof') ||
    normalized.endsWith('/subclassof')
  );
}

function isLabelPredicate(predicate: string): boolean {
  const normalized = predicate.replace(/^<|>$/g, '').toLowerCase();
  return (
    normalized === 'rdfs:label' ||
    normalized.endsWith('#label') ||
    normalized.endsWith('/label') ||
    normalized.endsWith('/name') ||
    normalized.endsWith('#name')
  );
}

function isDescriptionPredicate(predicate: string): boolean {
  const normalized = predicate.replace(/^<|>$/g, '').toLowerCase();
  return (
    normalized === 'rdfs:comment' ||
    normalized.endsWith('#comment') ||
    normalized.endsWith('/comment') ||
    normalized.endsWith('/description') ||
    normalized.endsWith('#description')
  );
}

function applyLabelLiteral(
  concept: IMutableConceptRecord,
  literal: Extract<ParsedObjectToken, { kind: 'literal' }>
): void {
  const label = literal.value.trim();
  if (label === '') {
    return;
  }

  if (literal.language === null || literal.language.toLowerCase().startsWith('en')) {
    if (shouldPreferLabel(label, concept.preferredLabel)) {
      concept.altLabels.add(concept.preferredLabel);
      concept.preferredLabel = label;
    } else if (label !== concept.preferredLabel) {
      concept.altLabels.add(label);
    }
  } else {
    concept.altLabels.add(label);
  }

  if (literal.language !== null) {
    concept.languages.add(literal.language);
  }
}

function applyDescriptionLiteral(
  concept: IMutableConceptRecord,
  literal: Extract<ParsedObjectToken, { kind: 'literal' }>
): void {
  const description = literal.value.trim();
  if (description === '') {
    return;
  }

  concept.description ??= description;
  if (literal.language !== null) {
    concept.languages.add(literal.language);
  }
}

function appendLiteralFact(
  concept: IMutableConceptRecord,
  predicate: string,
  literal: Extract<ParsedObjectToken, { kind: 'literal' }>
): void {
  const propertyKey = normalizePropertyKey(predicate);
  const literalFacts = readRecord(concept.properties['literalFacts']);
  const currentValues = readArray(literalFacts[propertyKey]);
  const nextEntry = {
    value: literal.value,
    datatype: literal.datatype,
    language: literal.language,
    sourcePredicate: predicate,
  };

  concept.properties['literalFacts'] = {
    ...literalFacts,
    [propertyKey]: dedupeUnknownEntries([...currentValues, nextEntry]),
  };
  if (literal.language !== null) {
    concept.languages.add(literal.language);
  }
}

function normalizePropertyKey(predicate: string): string {
  return decodeGraphIdentifier(predicate).replace(/\s+/gu, '_');
}

function shouldPreferLabel(nextLabel: string, currentLabel: string): boolean {
  if (currentLabel.trim() === '') {
    return true;
  }

  const currentLooksLikeIdentifier = currentLabel.includes('_') || currentLabel.includes(':');
  return currentLooksLikeIdentifier && !nextLabel.includes('_') && !nextLabel.includes(':');
}

function mergeNodeKind(
  current: IOntologyGraphConceptRecord['nodeKind'],
  next: IOntologyGraphConceptRecord['nodeKind']
): IOntologyGraphConceptRecord['nodeKind'] {
  const priority: Record<IOntologyGraphConceptRecord['nodeKind'], number> = {
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
      merged[key] = dedupeUnknownEntries([...readArray(currentValue), ...readArray(nextValue)]);
      continue;
    }

    merged[key] = currentValue ?? nextValue;
  }

  return merged;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function dedupeUnknownEntries(values: unknown[]): unknown[] {
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

function buildRelationProperties(predicate: string): Record<string, unknown> {
  if (isTypePredicate(predicate) || isSubclassPredicate(predicate)) {
    return {
      relationFamily: 'taxonomy',
      pedagogicalInference: 'disabled',
    };
  }

  return {};
}
