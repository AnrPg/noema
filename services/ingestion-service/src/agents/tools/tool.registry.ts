import { createEmptyAgentHints } from '@noema/contracts';
import type { DocumentId, UserId } from '@noema/types';
import type { IngestionService } from '../../domain/ingestion-service/ingestion.service.js';

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
  metadata?: Record<string, unknown>;
}

type ToolHandler = (
  input: unknown,
  userId: string,
  correlationId: string
) => Promise<IToolResult>;

export class ToolRegistry {
  private readonly tools = new Map<string, { definition: IToolDefinition; handler: ToolHandler }>();

  register(definition: IToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  listDefinitions(): IToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(
    name: string,
    input: unknown,
    userId: string,
    correlationId: string
  ): Promise<IToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: { code: 'TOOL_NOT_FOUND', message: `Unknown tool: ${name}` },
        agentHints: createEmptyAgentHints(),
      };
    }
    return tool.handler(input, userId, correlationId);
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function requiredDocumentId(input: unknown): DocumentId {
  const candidate = record(input)['documentId'];
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new Error('documentId is required');
  }
  return candidate as DocumentId;
}

const TOOL_DEFINITIONS: IToolDefinition[] = [
  {
    name: 'get-document-context',
    version: '1.0.0',
    description: 'Fetch document metadata and parser context for an ingested document.',
    service: 'ingestion-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['ingestion:agent'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['documentId'], properties: { documentId: { type: 'string' } } },
  },
  {
    name: 'get-document-ir',
    version: '1.0.0',
    description: 'Fetch the normalized document IR for an ingested document.',
    service: 'ingestion-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['ingestion:agent'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['documentId'], properties: { documentId: { type: 'string' } } },
  },
  {
    name: 'get-document-chunks',
    version: '1.0.0',
    description: 'Fetch persisted document chunks for an ingested document.',
    service: 'ingestion-service',
    priority: 'P0',
    scopeRequirement: { match: 'any', requiredScopes: ['ingestion:agent'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 3000, costClass: 'low' },
    inputSchema: { type: 'object', required: ['documentId'], properties: { documentId: { type: 'string' } } },
  },
  {
    name: 'retrieval-query',
    version: '1.0.0',
    description: 'Run a retrieval query scoped to ingested documents and return chunk evidence.',
    service: 'ingestion-service',
    priority: 'P1',
    scopeRequirement: { match: 'any', requiredScopes: ['ingestion:agent'] },
    capabilities: { idempotent: true, sideEffects: false, timeoutMs: 5000, costClass: 'medium' },
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } },
  },
];

export function createToolRegistry(service: IngestionService): ToolRegistry {
  const registry = new ToolRegistry();
  const documentContextTool = TOOL_DEFINITIONS[0];
  const documentIrTool = TOOL_DEFINITIONS[1];
  const documentChunksTool = TOOL_DEFINITIONS[2];
  const retrievalQueryTool = TOOL_DEFINITIONS[3];
  if (
    documentContextTool === undefined ||
    documentIrTool === undefined ||
    documentChunksTool === undefined ||
    retrievalQueryTool === undefined
  ) {
    throw new Error('Ingestion tool definitions are incomplete.');
  }
  registry.register(documentContextTool, async (input, userId) => {
    const data = await service.getDocumentContext(requiredDocumentId(input), {
      userId: userId as UserId,
      correlationId: 'cor_tool_ingestion' as never,
      roles: ['ingestion:agent'],
    });
    return { success: true, data, agentHints: createEmptyAgentHints() };
  });
  registry.register(documentIrTool, async (input, userId) => {
    const data = await service.getDocumentIr(requiredDocumentId(input), {
      userId: userId as UserId,
      correlationId: 'cor_tool_ingestion' as never,
      roles: ['ingestion:agent'],
    });
    return { success: true, data, agentHints: createEmptyAgentHints() };
  });
  registry.register(documentChunksTool, async (input, userId) => {
    const data = await service.getDocumentChunks(requiredDocumentId(input), {
      userId: userId as UserId,
      correlationId: 'cor_tool_ingestion' as never,
      roles: ['ingestion:agent'],
    });
    return { success: true, data, agentHints: createEmptyAgentHints() };
  });
  registry.register(retrievalQueryTool, async (input, userId, correlationId) => {
    const payload = record(input);
    const query = typeof payload['query'] === 'string' ? payload['query'] : '';
    const data = await service.retrievalQuery(
      {
        query,
        documentIds: Array.isArray(payload['documentIds'])
          ? payload['documentIds'].filter((value): value is DocumentId => typeof value === 'string')
          : undefined,
        limit: typeof payload['limit'] === 'number' ? payload['limit'] : 8,
      },
      {
        userId: userId as UserId,
        correlationId: correlationId as never,
        roles: ['ingestion:agent'],
      }
    );
    return { success: true, data, agentHints: createEmptyAgentHints() };
  });
  return registry;
}
