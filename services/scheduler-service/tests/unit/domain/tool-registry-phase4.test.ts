import { describe, expect, it, vi } from 'vitest';

import { SCHEDULER_TOOL_DEFINITIONS } from '../../../src/agents/tools/scheduler.tools.js';
import { createToolRegistry, ToolRegistry } from '../../../src/agents/tools/tool.registry.js';
import type { IToolDefinition } from '../../../src/agents/tools/tool.types.js';
import type { SchedulerService } from '../../../src/domain/scheduler-service/scheduler.service.js';

describe('tool registry phase 4', () => {
  it('registers full scheduler tool surface', () => {
    const service = {} as SchedulerService;
    const registry = createToolRegistry(service);

    const definitions = registry.listDefinitions();
    expect(definitions).toHaveLength(9);

    const names = definitions.map((definition) => definition.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'plan-dual-lane',
        'get-srs-schedule',
        'predict-retention',
        'propose-review-windows',
        'propose-session-candidates',
        'reconcile-session-candidates',
        'apply-session-adjustments',
        'update-card-scheduling',
        'batch-update-card-scheduling',
      ])
    );
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
    expect(metadata.failureDomain).toBe('validation');
  });

  it('validates input schema before handler execution', async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn().mockResolvedValue({
      success: true,
      data: { ok: true },
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 1,
        sourceQuality: 'high',
        validityPeriod: 'long',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0, effort: 0, roi: 0 },
        preferenceAlignment: [],
        reasoning: 'ok',
      },
    });

    const definition: IToolDefinition = {
      name: 'test-tool',
      description: 'test',
      service: 'scheduler-service',
      priority: 'P1',
      scopeRequirement: {
        match: 'all',
        requiredScopes: ['scheduler:tools:execute'],
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

    const definition = SCHEDULER_TOOL_DEFINITIONS[0] as IToolDefinition;
    registry.register(definition, async () => ({
      success: true,
      data: { ok: true },
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 1,
        sourceQuality: 'high',
        validityPeriod: 'long',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0, effort: 0, roi: 0 },
        preferenceAlignment: [],
        reasoning: 'ok',
      },
    }));

    const result = await registry.execute(
      'plan-dual-lane',
      {
        userId: 'usr_1',
        retentionCardIds: [],
        calibrationCardIds: [],
        maxCards: 10,
      },
      'usr_1',
      'cor_1'
    );

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

    const definition = SCHEDULER_TOOL_DEFINITIONS[0] as IToolDefinition;
    registry.register(definition, async () => ({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'bad input',
      },
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 1,
        sourceQuality: 'high',
        validityPeriod: 'long',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0, effort: 0, roi: 0 },
        preferenceAlignment: [],
        reasoning: 'bad input',
      },
    }));

    const result = await registry.execute(
      'plan-dual-lane',
      {
        userId: 'usr_1',
        retentionCardIds: [],
        calibrationCardIds: [],
        maxCards: 10,
      },
      'usr_1',
      'cor_1'
    );

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
