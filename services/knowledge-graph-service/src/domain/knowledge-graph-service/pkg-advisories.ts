/**
 * @noema/knowledge-graph-service — PKG Advisory Classification
 *
 * Centralises non-blocking PKG semantic and pedagogy warnings so write paths
 * can keep structural integrity blockers strict while returning actionable
 * advisory feedback to callers and downstream event consumers.
 */

import type { IWarning } from '@noema/contracts';
import type { Metadata } from '@noema/types';
import { GraphType, type IGraphEdge, type IGraphNode, type UserId } from '@noema/types';
import type { Logger } from 'pino';

import { getConflictingEdgeTypesForAdvisory } from './ckg-validation-stages.js';
import type { IGraphRepository } from './graph.repository.js';

const DUPLICATE_PROBE_PAGE_SIZE = 50;
const MAX_DUPLICATE_PROBE_PAGES = 4;
const MAX_DUPLICATE_PROBES = 6;
const FALLBACK_DUPLICATE_DOMAIN_NODE_LIMIT = 1000;
const GENERIC_RELATION_EDGE_TYPES = new Set(['related_to']);
const VAGUE_LABELS = new Set([
  'concept',
  'concepts',
  'item',
  'items',
  'misc',
  'miscellaneous',
  'other',
  'others',
  'stuff',
  'thing',
  'things',
  'topic',
  'topics',
]);
const COMPOUND_LABEL_PATTERN = /\s(?:and|or|vs)\s|\/|,|;/i;

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeKey(label: string): string {
  return normalizeLabel(label).replace(/[^a-z0-9]+/g, '');
}

function buildDuplicateSearchProbes(label: string): string[] {
  const trimmed = label.trim();
  const normalized = normalizeLabel(label);
  const alphanumericWords = normalized
    .split(/[^a-z0-9]+/g)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
  const joinedWords = alphanumericWords.join(' ');
  const sortedDistinctWords = [...new Set(alphanumericWords)].sort(
    (left, right) => right.length - left.length
  );

  const quotedPhrases = [trimmed, normalized, joinedWords]
    .filter((probe) => probe.length >= 3)
    .map((probe) => `"${probe}"`);

  return [...new Set([trimmed, normalized, joinedWords, ...quotedPhrases, ...sortedDistinctWords])]
    .filter((probe) => probe.length >= 3)
    .slice(0, MAX_DUPLICATE_PROBES);
}

function dedupeWarnings(warnings: readonly IWarning[]): IWarning[] {
  const seen = new Set<string>();
  const unique: IWarning[] = [];

  for (const warning of warnings) {
    const key = JSON.stringify({
      type: warning.type,
      severity: warning.severity,
      message: warning.message,
      relatedIds: [...(warning.relatedIds ?? [])].sort(),
      suggestedFix: warning.suggestedFix ?? null,
    });

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(warning);
  }

  return unique;
}

export function serializeWarningsForEvent(warnings: readonly IWarning[]): Metadata[] {
  return warnings.map((warning) => ({
    type: warning.type,
    severity: warning.severity,
    message: warning.message,
    ...(warning.relatedIds !== undefined ? { relatedIds: warning.relatedIds } : {}),
    ...(warning.suggestedFix !== undefined ? { suggestedFix: warning.suggestedFix } : {}),
    ...(warning.autoFixable !== undefined ? { autoFixable: warning.autoFixable } : {}),
  }));
}

export class PkgAdvisoryService {
  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly logger: Logger
  ) {}

  async assessNodeWrite(userId: UserId, node: IGraphNode): Promise<IWarning[]> {
    const warnings: IWarning[] = [];
    const normalizedLabel = normalizeLabel(node.label);
    const normalizedKey = normalizeKey(node.label);

    if (VAGUE_LABELS.has(normalizedLabel)) {
      warnings.push({
        type: 'validation',
        severity: 'medium',
        message: `The label "${node.label}" is too vague to teach or compare well.`,
        relatedIds: [node.nodeId as string],
        suggestedFix: 'Rename the concept to a more specific, discriminative label.',
      });
    }

    if (COMPOUND_LABEL_PATTERN.test(node.label)) {
      warnings.push({
        type: 'validation',
        severity: 'low',
        message:
          `The label "${node.label}" appears to bundle multiple ideas into one node. ` +
          'Splitting them often makes the graph easier to reason about.',
        relatedIds: [node.nodeId as string],
        suggestedFix: 'Split compound labels into separate concepts when they can stand alone.',
      });
    }

    const nearbyNodes = await this.findDuplicateCandidates(userId, node);
    const duplicates = nearbyNodes.filter(
      (candidate) =>
        candidate.nodeId !== node.nodeId && normalizeKey(candidate.label) === normalizedKey
    );

    if (duplicates.length > 0) {
      warnings.push({
        type: 'duplicate',
        severity: 'medium',
        message:
          `A similar concept label already exists in "${node.domain}". ` +
          'Duplicate nodes can fragment mastery and make PKG-to-CKG alignment noisier.',
        relatedIds: duplicates.map((duplicate) => duplicate.nodeId as string),
        suggestedFix:
          'Merge or rename near-duplicate concepts unless they intentionally represent distinct meanings.',
      });
    }

    return dedupeWarnings(warnings);
  }

  private async findDuplicateCandidates(userId: UserId, node: IGraphNode): Promise<IGraphNode[]> {
    const probes = buildDuplicateSearchProbes(node.label);
    const candidates = new Map<string, IGraphNode>();
    const normalizedKey = normalizeKey(node.label);

    for (const probe of probes) {
      for (let page = 0; page < MAX_DUPLICATE_PROBE_PAGES; page++) {
        const results = await this.graphRepository.findNodes(
          {
            graphType: GraphType.PKG,
            userId,
            domain: node.domain,
            labelContains: probe,
            searchMode: probe.startsWith('"') ? 'fulltext' : 'substring',
            includeDeleted: false,
          },
          DUPLICATE_PROBE_PAGE_SIZE,
          page * DUPLICATE_PROBE_PAGE_SIZE
        );

        for (const candidate of results) {
          candidates.set(candidate.nodeId as string, candidate);
        }

        if (results.length < DUPLICATE_PROBE_PAGE_SIZE) {
          break;
        }
      }

      const exactDuplicateCount = [...candidates.values()].filter(
        (candidate) =>
          candidate.nodeId !== node.nodeId && normalizeKey(candidate.label) === normalizedKey
      ).length;
      if (exactDuplicateCount >= 3) {
        break;
      }
    }

    this.logger.debug(
      {
        userId,
        domain: node.domain,
        nodeId: node.nodeId,
        probeCount: probes.length,
        candidateCount: candidates.size,
      },
      'PKG advisory duplicate candidate search completed'
    );

    const candidateList = [...candidates.values()];
    const exactDuplicateCount = candidateList.filter(
      (candidate) =>
        candidate.nodeId !== node.nodeId && normalizeKey(candidate.label) === normalizedKey
    ).length;

    if (exactDuplicateCount > 0) {
      return candidateList;
    }

    const domainNodeCount = await this.graphRepository.countNodes({
      graphType: GraphType.PKG,
      userId,
      domain: node.domain,
      includeDeleted: false,
    });

    if (domainNodeCount > FALLBACK_DUPLICATE_DOMAIN_NODE_LIMIT) {
      return candidateList;
    }

    for (let offset = 0; offset < domainNodeCount; offset += DUPLICATE_PROBE_PAGE_SIZE) {
      const results = await this.graphRepository.findNodes(
        {
          graphType: GraphType.PKG,
          userId,
          domain: node.domain,
          includeDeleted: false,
        },
        DUPLICATE_PROBE_PAGE_SIZE,
        offset
      );

      for (const candidate of results) {
        candidates.set(candidate.nodeId as string, candidate);
      }
    }

    this.logger.debug(
      {
        userId,
        domain: node.domain,
        nodeId: node.nodeId,
        fallbackSweepCount: domainNodeCount,
        candidateCount: candidates.size,
      },
      'PKG advisory duplicate candidate search used bounded domain sweep fallback'
    );

    return [...candidates.values()];
  }

  async assessEdgeWrite(
    _userId: UserId,
    edge: IGraphEdge,
    sourceNode: IGraphNode,
    targetNode: IGraphNode
  ): Promise<IWarning[]> {
    const warnings: IWarning[] = [];

    if (GENERIC_RELATION_EDGE_TYPES.has(edge.edgeType)) {
      warnings.push({
        type: 'validation',
        severity: 'low',
        message: `The "${edge.edgeType}" relation is generic. A more specific relation often improves explanations, scheduling, and canonical aggregation.`,
        relatedIds: [edge.edgeId as string],
        suggestedFix:
          'Prefer a more explicit relation when possible, such as prerequisite, kind-of, or part-of.',
      });
    }

    const conflictingTypes = getConflictingEdgeTypesForAdvisory(edge.edgeType);
    if (conflictingTypes.length > 0) {
      const conflicts = await this.graphRepository.findConflictingEdges(
        edge.sourceNodeId,
        edge.targetNodeId,
        conflictingTypes
      );

      const filteredConflicts = conflicts.filter((conflict) => conflict.edgeId !== edge.edgeId);
      const firstConflict = filteredConflicts[0];
      if (firstConflict !== undefined) {
        warnings.push({
          type: 'conflict',
          severity: 'medium',
          message:
            `This ${edge.edgeType} edge conflicts with existing ${firstConflict.edgeType} structure. ` +
            'Taxonomic and mereological links encode different kinds of meaning.',
          relatedIds: filteredConflicts.map((conflict) => conflict.edgeId as string),
          suggestedFix: `Review whether "${sourceNode.label}" should be modelled as a kind of "${targetNode.label}" or as a part of it, rather than both.`,
        });

        this.logger.info(
          {
            edgeId: edge.edgeId,
            edgeType: edge.edgeType,
            conflictingEdges: filteredConflicts.length,
            conflictingType: firstConflict.edgeType,
          },
          'PKG advisory: ontological conflict detected (non-blocking)'
        );
      }
    }

    return dedupeWarnings(warnings);
  }
}
