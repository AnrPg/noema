import { createEmptyAgentHints } from '@noema/contracts';
import type { DocumentId, UserId } from '@noema/types';
import type { VectorService } from '../../domain/vector-service/vector.service.js';

interface IToolDefinition {
  name: string;
  version: string;
  description: string;
  service: string;
  priority: string;
  scopeRequirement: { match: 'any' | 'all'; requiredScopes: string[] };
  capabilities: {
    idempotent: boolean;
    sideEffects: boolean;
    timeoutMs: number;
    costClass: string;
  };
  inputSchema: Record<string, unknown>;
}

interface IToolResult {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  agentHints: ReturnType<typeof createEmptyAgentHints>;
}

type ToolHandler = (input: unknown, userId: string) => Promise<IToolResult>;

export class ToolRegistry {
  private readonly tools = new Map<string, { definition: IToolDefinition; handler: ToolHandler }>();

  register(definition: IToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(name: string, input: unknown, userId: string): Promise<IToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: { code: 'TOOL_NOT_FOUND', message: `Unknown tool: ${name}` },
        agentHints: createEmptyAgentHints(),
      };
    }
    return tool.handler(input, userId);
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

const TOOL_DEFINITION: IToolDefinition = {
  name: 'retrieve-document-chunks',
  version: '1.0.0',
  description: 'Retrieve chunk grounding for a document using vector search.',
  service: 'vector-service',
  priority: 'P0',
  scopeRequirement: { match: 'any', requiredScopes: ['vector:agent'] },
  capabilities: { idempotent: true, sideEffects: false, timeoutMs: 5000, costClass: 'medium' },
  inputSchema: {
    type: 'object',
    required: ['documentId'],
    properties: {
      documentId: { type: 'string' },
      query: { type: 'string' },
      conceptLabels: { type: 'array' },
      conceptIds: { type: 'array' },
      limit: { type: 'number' },
    },
  },
};

export function createToolRegistry(service: VectorService): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(TOOL_DEFINITION, async (input, userId) => {
    const payload = record(input);
    const documentId = typeof payload['documentId'] === 'string' ? payload['documentId'] : '';
    if (documentId.length === 0) {
      return {
        success: false,
        error: { code: 'INVALID_INPUT', message: 'documentId is required' },
        agentHints: createEmptyAgentHints(),
      };
    }
    const query =
      typeof payload['query'] === 'string' && payload['query'].trim().length > 0
        ? payload['query'].trim()
        : undefined;
    const conceptLabels = Array.isArray(payload['conceptLabels'])
      ? payload['conceptLabels'].filter((value): value is string => typeof value === 'string')
      : [];
    const conceptIds = Array.isArray(payload['conceptIds'])
      ? payload['conceptIds'].filter((value): value is string => typeof value === 'string')
      : [];
    const limit = typeof payload['limit'] === 'number' ? payload['limit'] : 8;
    const semanticLabels =
      conceptLabels.length > 0
        ? conceptLabels.map((label) => label.trim()).filter((label) => label.length > 0)
        : conceptIds
            .map(toSemanticLabel)
            .filter((label): label is string => label !== undefined);
    const queries =
      query !== undefined
        ? [{ key: query, query }]
        : semanticLabels.map((label) => ({ key: label, query: label }));
    if (queries.length === 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message:
            'Provide a semantic query or conceptLabels for retrieval; documentId alone is insufficient.',
        },
        agentHints: createEmptyAgentHints(),
      };
    }
    const matches = await Promise.all(
      queries.map(async (item) => ({
        query: item.key,
        conceptLabel: item.key,
        chunks: await service.search({
          query: item.query,
          userId: userId as UserId,
          documentIds: [documentId as DocumentId],
          limit,
        }),
      }))
    );
    const dedupedChunks = dedupeChunks(matches.flatMap((match) => match.chunks));
    return {
      success: true,
      data: {
        documentId,
        queryPlan: {
          mode: query !== undefined ? 'single_query' : 'per_concept_label',
          queries: queries.map((item) => item.key),
        },
        matches,
        chunks: dedupedChunks,
      },
      agentHints: createEmptyAgentHints(),
    };
  });
  return registry;
}

function toSemanticLabel(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!trimmed.startsWith('concept_')) return trimmed;
  const tail = trimmed.slice('concept_'.length);
  if (tail.length === 0 || /\d/.test(tail) || /[A-Z]/.test(tail) || !/[a-z]/.test(tail))
    return undefined;
  return tail.replace(/[_-]+/g, ' ').trim();
}

function dedupeChunks<T extends { chunkId?: string }>(chunks: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const chunk of chunks) {
    const key = typeof chunk.chunkId === 'string' ? chunk.chunkId : JSON.stringify(chunk);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(chunk);
  }
  return deduped;
}
