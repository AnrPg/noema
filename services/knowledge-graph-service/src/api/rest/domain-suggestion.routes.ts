/**
 * @noema/knowledge-graph-service - Domain Suggestion Routes
 */

import type { GraphNodeType, IGraphNode, StudyMode, UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import { NodeFilter } from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { DomainSuggestionQuerySchema } from '../schemas/domain-suggestion.schemas.js';
import {
  type IRouteOptions,
  assertUserAccess,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

type DomainSource = 'pkg' | 'ckg' | 'mixed';
type MatchType = 'exact' | 'alias' | 'fuzzy' | 'related';

interface IDomainCandidate {
  normalizedKey: string;
  label: string;
  nodeCount: number;
  sources: Set<'pkg' | 'ckg'>;
}

interface IDomainSuggestionResult {
  label: string;
  normalizedLabel: string;
  confidence: number;
  matchType: MatchType;
  source: DomainSource;
  nodeCount: number;
}

interface IDomainResolutionResponse {
  input: string;
  normalizedInput: string;
  resolvedDomain: string | null;
  needsDecision: boolean;
  suggestions: IDomainSuggestionResult[];
  proposedDomains: string[];
}

function normalizeDomainValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_/\\-]+/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function compactDomainValue(value: string): string {
  return normalizeDomainValue(value).replace(/\s+/gu, '');
}

function tokenizeDomainValue(value: string): string[] {
  return normalizeDomainValue(value).split(' ').filter((token) => token !== '');
}

function titleCaseDomain(value: string): string {
  return value
    .trim()
    .replace(/\s+/gu, ' ')
    .split(' ')
    .filter((token) => token !== '')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
}

function collectDomainCandidates(
  nodes: readonly IGraphNode[],
  source: 'pkg' | 'ckg',
  target: Map<string, IDomainCandidate>
): void {
  for (const node of nodes) {
    if (typeof node.domain !== 'string' || node.domain.trim() === '') {
      continue;
    }

    const normalizedKey = normalizeDomainValue(node.domain);
    if (normalizedKey === '') {
      continue;
    }

    const existing = target.get(normalizedKey);
    if (existing === undefined) {
      target.set(normalizedKey, {
        normalizedKey,
        label: node.domain.trim(),
        nodeCount: 1,
        sources: new Set([source]),
      });
      continue;
    }

    existing.nodeCount += 1;
    existing.sources.add(source);
    if (node.domain.trim().length < existing.label.length) {
      existing.label = node.domain.trim();
    }
  }
}

function resolveDomainSource(sources: ReadonlySet<'pkg' | 'ckg'>): DomainSource {
  if (sources.has('pkg') && sources.has('ckg')) {
    return 'mixed';
  }
  return sources.has('pkg') ? 'pkg' : 'ckg';
}

function scoreDomainCandidate(
  input: string,
  candidate: IDomainCandidate
): { confidence: number; matchType: MatchType } | null {
  const normalizedInput = normalizeDomainValue(input);
  if (normalizedInput === '') {
    return null;
  }

  const normalizedCandidate = candidate.normalizedKey;
  const compactInput = compactDomainValue(input);
  const compactCandidate = compactDomainValue(candidate.label);

  if (normalizedInput === normalizedCandidate) {
    return { confidence: 1, matchType: 'exact' };
  }

  if (compactInput !== '' && compactInput === compactCandidate) {
    return { confidence: 0.97, matchType: 'alias' };
  }

  const inputTokens = tokenizeDomainValue(input);
  const candidateTokens = tokenizeDomainValue(candidate.label);
  const inputTokenSet = new Set(inputTokens);
  const candidateTokenSet = new Set(candidateTokens);
  const sharedTokenCount = [...inputTokenSet].filter((token) => candidateTokenSet.has(token)).length;
  const unionSize = new Set([...inputTokens, ...candidateTokens]).size;
  const jaccard = unionSize === 0 ? 0 : sharedTokenCount / unionSize;
  const startsWith =
    normalizedCandidate.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCandidate);
  const contains =
    normalizedCandidate.includes(normalizedInput) || normalizedInput.includes(normalizedCandidate);

  let confidence = 0;
  let matchType: MatchType = 'related';

  if (sharedTokenCount > 0) {
    confidence = Math.max(confidence, 0.45 + jaccard * 0.4);
    matchType = jaccard >= 0.65 ? 'fuzzy' : 'related';
  }

  if (startsWith) {
    confidence = Math.max(confidence, 0.88);
    matchType = 'alias';
  } else if (contains) {
    confidence = Math.max(confidence, 0.74);
    matchType = 'fuzzy';
  }

  return confidence >= 0.45 ? { confidence, matchType } : null;
}

function buildDomainResolution(
  input: string,
  candidates: readonly IDomainCandidate[],
  limit: number
): IDomainResolutionResponse {
  const normalizedInput = normalizeDomainValue(input);
  const suggestions =
    normalizedInput === ''
      ? candidates
          .slice()
          .sort((left, right) => right.nodeCount - left.nodeCount || left.label.localeCompare(right.label))
          .slice(0, limit)
          .map<IDomainSuggestionResult>((candidate) => ({
            label: candidate.label,
            normalizedLabel: candidate.normalizedKey,
            confidence: 0.6,
            matchType: 'related',
            source: resolveDomainSource(candidate.sources),
            nodeCount: candidate.nodeCount,
          }))
      : candidates
          .map((candidate) => {
            const score = scoreDomainCandidate(input, candidate);
            if (score === null) {
              return null;
            }
            return {
              label: candidate.label,
              normalizedLabel: candidate.normalizedKey,
              confidence: score.confidence,
              matchType: score.matchType,
              source: resolveDomainSource(candidate.sources),
              nodeCount: candidate.nodeCount,
            } satisfies IDomainSuggestionResult;
          })
          .filter((candidate): candidate is IDomainSuggestionResult => candidate !== null)
          .sort(
            (left, right) =>
              right.confidence - left.confidence ||
              right.nodeCount - left.nodeCount ||
              left.label.localeCompare(right.label)
          )
          .slice(0, limit);

  const [firstSuggestion, secondSuggestion] = suggestions;
  const resolvedDomain =
    firstSuggestion !== undefined &&
    firstSuggestion.confidence >= 0.92 &&
    (secondSuggestion === undefined || firstSuggestion.confidence - secondSuggestion.confidence >= 0.08)
      ? firstSuggestion.label
      : null;
  const needsDecision =
    normalizedInput !== '' &&
    resolvedDomain === null &&
    firstSuggestion !== undefined &&
    secondSuggestion !== undefined &&
    firstSuggestion.confidence >= 0.74 &&
    secondSuggestion.confidence >= 0.74 &&
    Math.abs(firstSuggestion.confidence - secondSuggestion.confidence) <= 0.06;

  return {
    input,
    normalizedInput,
    resolvedDomain,
    needsDecision,
    suggestions,
    proposedDomains: normalizedInput !== '' && suggestions.length === 0 ? [titleCaseDomain(input)] : [],
  };
}

export function registerDomainSuggestionRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/domain-suggestions',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Domain Suggestions'],
        summary: 'Suggest or canonicalize graph domains',
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            label: { type: 'string' },
            nodeType: { type: 'string' },
            studyMode: { type: 'string', enum: ['language_learning', 'knowledge_gaining'] },
            limit: { type: 'number', minimum: 1, maximum: 10 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const query = DomainSuggestionQuerySchema.parse(request.query);
        const context = buildContext(request);

        if (query.userId !== undefined) {
          assertUserAccess(request, query.userId);
        }

        const lookupPromises: Promise<readonly IGraphNode[]>[] = [
          service
            .listCkgNodes(
              NodeFilter.create({
                graphType: 'ckg',
                ...(query.nodeType !== undefined ? { nodeType: query.nodeType as GraphNodeType } : {}),
                ...(query.studyMode !== undefined ? { studyMode: query.studyMode as StudyMode } : {}),
                sortBy: 'updatedAt',
                sortOrder: 'desc',
              }),
              { limit: 200, offset: 0 },
              context
            )
            .then((result) => result.data.items),
        ];

        if (query.userId !== undefined) {
          lookupPromises.push(
            service
              .listNodes(
                query.userId as UserId,
                NodeFilter.create({
                  graphType: 'pkg',
                  userId: query.userId,
                  ...(query.nodeType !== undefined ? { nodeType: query.nodeType as GraphNodeType } : {}),
                  ...(query.studyMode !== undefined ? { studyMode: query.studyMode as StudyMode } : {}),
                  sortBy: 'updatedAt',
                  sortOrder: 'desc',
                }),
                { limit: 200, offset: 0 },
                context
              )
              .then((result) => result.data.items)
          );
        }

        const lookupResults = await Promise.all(lookupPromises);
        const ckgNodes = lookupResults[0] ?? [];
        const pkgNodes = lookupResults[1] ?? [];
        const candidates = new Map<string, IDomainCandidate>();
        collectDomainCandidates(ckgNodes, 'ckg', candidates);
        collectDomainCandidates(pkgNodes, 'pkg', candidates);

        reply.send(
          wrapResponse(
            buildDomainResolution(query.label ?? '', Array.from(candidates.values()), query.limit),
            undefined,
            request
          )
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
