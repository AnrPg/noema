import type { IGraphNode } from '@noema/types';
import type {
  ICanonicalNodeResolution,
  ICanonicalNodeResolver,
  INormalizedOntologyConceptCandidate,
  INormalizedOntologyGraphBatch,
  INormalizedOntologyMappingCandidate,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import type { INodeRepository } from '../../../../domain/knowledge-graph-service/graph.repository.js';

const MAPPING_KINDS_FOR_RESOLUTION = new Set(['exact_match', 'close_match']);

export class GraphCanonicalNodeResolver implements ICanonicalNodeResolver {
  constructor(private readonly nodeRepository: INodeRepository) {}

  async resolveConcept(
    concept: INormalizedOntologyConceptCandidate,
    batch: INormalizedOntologyGraphBatch
  ): Promise<ICanonicalNodeResolution | null> {
    const identifiers = collectIdentifiers(concept, batch.mappings);
    const candidates = await this.findCandidateNodes(batch, concept, identifiers.labels);

    const externalIdMatch = candidates.find((candidate) =>
      identifiers.externalIds.some((identifier) => matchesExternalId(candidate, identifier))
    );
    if (externalIdMatch !== undefined) {
      return toResolution(externalIdMatch, 'external_id');
    }

    const iriMatch = candidates.find((candidate) =>
      identifiers.iris.some((identifier) => matchesIri(candidate, identifier))
    );
    if (iriMatch !== undefined) {
      return toResolution(iriMatch, 'iri');
    }

    const aliasMatch = candidates.find((candidate) =>
      identifiers.labels.some((identifier) => matchesAlias(candidate, identifier))
    );
    if (aliasMatch !== undefined) {
      return toResolution(aliasMatch, 'alias');
    }

    const exactLabelMatch = candidates.find((candidate) =>
      identifiers.labels.some(
        (identifier) => normalizeText(identifier) === normalizeText(candidate.label)
      )
    );
    if (exactLabelMatch !== undefined) {
      return toResolution(exactLabelMatch, 'label');
    }

    const normalizedLabelMatch = candidates.find((candidate) =>
      identifiers.labels.some(
        (identifier) => normalizeSearchText(identifier) === normalizeSearchText(candidate.label)
      )
    );

    return normalizedLabelMatch === undefined
      ? null
      : toResolution(normalizedLabelMatch, 'normalized_label');
  }

  private async findCandidateNodes(
    batch: INormalizedOntologyGraphBatch,
    concept: INormalizedOntologyConceptCandidate,
    labels: string[]
  ): Promise<IGraphNode[]> {
    const nodeType = inferNodeType(concept);
    const domain = inferDomain(batch, concept);
    const seen = new Map<string, IGraphNode>();
    const labelQueries = labels.length > 0 ? labels : [concept.preferredLabel];

    for (const label of labelQueries) {
      for (const filter of buildFilters(label, nodeType, domain)) {
        const nodes = await this.nodeRepository.findNodes(filter, 20, 0);
        for (const node of nodes) {
          seen.set(node.nodeId, node);
        }
      }
    }

    return [...seen.values()];
  }
}

function buildFilters(
  label: string,
  nodeType: IGraphNode['nodeType'] | undefined,
  domain: string | undefined
): {
  graphType: 'ckg';
  includeDeleted: false;
  labelContains: string;
  nodeType?: IGraphNode['nodeType'];
  domain?: string;
}[] {
  const base = {
    graphType: 'ckg' as const,
    includeDeleted: false as const,
    labelContains: label,
  };

  return [
    {
      ...base,
      ...(nodeType !== undefined ? { nodeType } : {}),
      ...(domain !== undefined ? { domain } : {}),
    },
    {
      ...base,
      ...(nodeType !== undefined ? { nodeType } : {}),
    },
    base,
  ];
}

function collectIdentifiers(
  concept: INormalizedOntologyConceptCandidate,
  mappings: INormalizedOntologyMappingCandidate[]
): {
  externalIds: string[];
  iris: string[];
  labels: string[];
} {
  const mappedExternalIds = collectMappedExternalIds(concept.externalId, mappings);

  const labels = dedupeStrings([
    concept.preferredLabel,
    ...concept.aliases,
    ...mappedExternalIds.map(decodeGraphIdentifier),
  ]);
  const externalIds = dedupeStrings([concept.externalId, ...mappedExternalIds]);
  const iris = dedupeStrings([concept.iri ?? '', ...externalIds.filter(isUrlLike)]).filter(
    (value) => value !== ''
  );

  return {
    externalIds,
    iris,
    labels,
  };
}

function collectMappedExternalIds(
  conceptExternalId: string,
  mappings: INormalizedOntologyMappingCandidate[]
): string[] {
  const adjacency = new Map<string, Set<string>>();

  for (const mapping of mappings) {
    if (!MAPPING_KINDS_FOR_RESOLUTION.has(mapping.mappingKind)) {
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

  const queue = [conceptExternalId];
  const seen = new Set<string>([conceptExternalId]);
  const collected: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      continue;
    }

    for (const neighbor of adjacency.get(current) ?? []) {
      if (seen.has(neighbor)) {
        continue;
      }

      seen.add(neighbor);
      collected.push(neighbor);
      queue.push(neighbor);
    }
  }

  return collected;
}

function inferNodeType(
  concept: INormalizedOntologyConceptCandidate
): IGraphNode['nodeType'] | undefined {
  if (concept.nodeKind === 'literal') {
    return 'fact';
  }

  return 'concept';
}

function inferDomain(
  batch: INormalizedOntologyGraphBatch,
  concept: INormalizedOntologyConceptCandidate
): string | undefined {
  const domain =
    typeof concept.properties['domain'] === 'string' ? concept.properties['domain'].trim() : '';

  if (domain !== '') {
    return domain;
  }

  switch (batch.sourceId) {
    case 'yago':
      return 'world-knowledge';
    case 'esco':
      return 'skills-and-occupations';
    case 'conceptnet':
      return 'commonsense';
    default:
      return undefined;
  }
}

function matchesExternalId(node: IGraphNode, externalId: string): boolean {
  const externalIds = readOntologyIdentifiers(node, 'externalId');
  return externalIds.includes(externalId);
}

function matchesIri(node: IGraphNode, iri: string): boolean {
  const iris = readOntologyIdentifiers(node, 'iri');
  return iris.includes(iri);
}

function matchesAlias(node: IGraphNode, alias: string): boolean {
  const nodeAliases = readOntologyAliases(node);
  const normalizedAlias = normalizeText(alias);
  const normalizedSearchAlias = normalizeSearchText(alias);

  return nodeAliases.some(
    (candidate) =>
      normalizeText(candidate) === normalizedAlias ||
      normalizeSearchText(candidate) === normalizedSearchAlias
  );
}

function readOntologyIdentifiers(node: IGraphNode, key: 'externalId' | 'iri'): string[] {
  const ontologyImport = readRecord(node.properties['ontologyImport']);
  const ontologyImportEnrichment = readRecord(node.properties['ontologyImportEnrichment']);

  return [ontologyImport?.[key], ontologyImportEnrichment?.[key]].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  );
}

function readOntologyAliases(node: IGraphNode): string[] {
  const ontologyImport = readRecord(node.properties['ontologyImport']);
  const ontologyImportEnrichment = readRecord(node.properties['ontologyImportEnrichment']);
  const aliases = [
    ...readStringArray(ontologyImport?.['aliases']),
    ...readStringArray(ontologyImportEnrichment?.['aliases']),
  ];

  return dedupeStrings([node.label, ...aliases]);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function decodeGraphIdentifier(value: string): string {
  const trimmed = value.replace(/^<|>$/g, '');
  const lastSegment = trimmed.split(/[/#:]/u).filter(Boolean).at(-1) ?? trimmed;

  try {
    return decodeURIComponent(lastSegment.replaceAll('_', ' '));
  } catch {
    return lastSegment.replaceAll('_', ' ');
  }
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ''))];
}

function isUrlLike(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSearchText(value: string): string {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function toResolution(
  node: IGraphNode,
  strategy: ICanonicalNodeResolution['strategy']
): ICanonicalNodeResolution {
  return {
    nodeId: node.nodeId,
    label: node.label,
    nodeType: node.nodeType,
    domain: node.domain,
    strategy,
  };
}
