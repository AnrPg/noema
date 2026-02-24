import { describe, expect, it, vi } from 'vitest';

import { SESSION_TOOL_DEFINITIONS } from '../../../src/agents/tools/session.tools.js';
import { createToolRegistry, ToolRegistry } from '../../../src/agents/tools/tool.registry.js';
import type { IToolDefinition } from '../../../src/agents/tools/tool.types.js';
import type { SessionService } from '../../../src/domain/session-service/session.service.js';

function buildAgentHints(reasoning: string) {
  return {
    suggestedNextActions: [],
    relatedResources: [],
    confidence: 1,
    sourceQuality: 'high' as const,
    validityPeriod: 'long' as const,
    contextNeeded: [],
    assumptions: [],
    riskFactors: [],
    dependencies: [],
    estimatedImpact: { benefit: 0, effort: 0, roi: 0 },
    preferenceAlignment: [],
    reasoning,
  };
}

describe('session tool registry contract', () => {
  it('registers full session tool surface', () => {
    const service = {} as SessionService;
    const registry = createToolRegistry(service);

    const definitions = registry.listDefinitions();
    expect(definitions).toHaveLength(13);

    const names = definitions.map((definition) => definition.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'get-session-history',
        'record-attempt',
        'get-attempt-history',
        'get-thinking-trace',
        'record-dialogue-turn',
        'validate-session-blueprint',
        'evaluate-session-checkpoint',
        'propose-cohort',
        'accept-cohort',
        'revise-cohort',
        'commit-cohort',
        'issue-offline-intent-token',
        'verify-offline-intent-token',
      ])
    );
  });

  it('requires cohort-specific write scope for cohort lifecycle tools', () => {
    const cohortTools = SESSION_TOOL_DEFINITIONS.filter((definition) =>
      ['propose-cohort', 'accept-cohort', 'revise-cohort', 'commit-cohort'].includes(
        definition.name
      )
    );

    expect(cohortTools).toHaveLength(4);
    for (const definition of cohortTools) {
      expect(definition.scopeRequirement.match).toBe('all');
      expect(definition.scopeRequirement.requiredScopes).toEqual([
        'session:tools:execute',
        'session:cohort:write',
      ]);
    }
  });

  it('keeps record-attempt outcome enum aligned with domain contract', () => {
    const recordAttemptDefinition = SESSION_TOOL_DEFINITIONS.find(
      (definition) => definition.name === 'record-attempt'
    );

    expect(recordAttemptDefinition).toBeDefined();

    const outcomeEnum = (
      recordAttemptDefinition as unknown as {
        inputSchema: {
          properties: {
            outcome: {
              enum: string[];
            };
          };
        };
      }
    ).inputSchema.properties.outcome.enum;

    expect(outcomeEnum).toEqual(['correct', 'incorrect', 'partial', 'skipped']);
  });

  it('returns TOOL_NOT_FOUND metadata for unknown tool', async () => {
    const registry = new ToolRegistry();

    const result = await registry.execute('does-not-exist', {}, 'usr_1', 'cor_1');
    const metadata = result.metadata as {
      resultCode?: string;
      retryClass?: string;
      failureDomain?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TOOL_NOT_FOUND');
    expect(metadata.resultCode).toBe('TOOL_NOT_FOUND');
    expect(metadata.retryClass).toBe('permanent');
    expect(metadata.failureDomain).toBe('state');
  });

  it('validates input schema before handler execution', async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn().mockResolvedValue({
      success: true,
      data: { ok: true },
      agentHints: buildAgentHints('ok'),
    });

    const definition: IToolDefinition = {
      name: 'test-tool',
      version: '1.0.0',
      description: 'test',
      service: 'session-service',
      priority: 'P1',
      scopeRequirement: {
        match: 'all',
        requiredScopes: ['session:tools:execute'],
      },
      capabilities: {
        idempotent: true,
        sideEffects: false,
        timeoutMs: 1000,
        costClass: 'low',
      },
      inputSchema: {
        type: 'object',
        required: ['requiredField'],
        properties: {
          requiredField: { type: 'string' },
        },
      },
    };

    registry.register(definition, handler);

    const result = await registry.execute('test-tool', {}, 'usr_1', 'cor_1');
    const metadata = result.metadata as { resultCode?: string };

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TOOL_INPUT_VALIDATION_FAILED');
    expect(metadata.resultCode).toBe('TOOL_INPUT_VALIDATION_FAILED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('attaches observability metadata for successful execution', async () => {
    const registry = new ToolRegistry();

    const definition = SESSION_TOOL_DEFINITIONS[0] as IToolDefinition;
    registry.register(definition, async () => ({
      success: true,
      data: { ok: true },
      agentHints: buildAgentHints('ok'),
    }));

    const result = await registry.execute('get-session-history', {}, 'usr_1', 'cor_1');

    const metadata = result.metadata as {
      resultCode?: string;
      retryClass?: string;
      correlationId?: string;
    };

    expect(result.success).toBe(true);
    expect(metadata.resultCode).toBe('SUCCESS');
    expect(metadata.retryClass).toBe('unknown');
    expect(metadata.correlationId).toBe('cor_1');
  });

  it('categorizes handler failures for retry and domain', async () => {
    const registry = new ToolRegistry();

    const definition = SESSION_TOOL_DEFINITIONS[0] as IToolDefinition;
    registry.register(definition, async () => ({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'bad input',
      },
      agentHints: buildAgentHints('bad input'),
    }));

    const result = await registry.execute('get-session-history', {}, 'usr_1', 'cor_1');

    const metadata = result.metadata as {
      resultCode?: string;
      retryClass?: string;
      failureDomain?: string;
    };

    expect(result.success).toBe(false);
    expect(metadata.resultCode).toBe('VALIDATION_FAILED');
    expect(metadata.retryClass).toBe('permanent');
    expect(metadata.failureDomain).toBe('validation');
  });
});
