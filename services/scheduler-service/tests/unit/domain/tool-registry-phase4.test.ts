import { describe, expect, it, vi } from 'vitest';

import { SCHEDULER_TOOL_DEFINITIONS } from '../../../src/agents/tools/scheduler.tools.js';
import { createToolRegistry, ToolRegistry } from '../../../src/agents/tools/tool.registry.js';
import type { SchedulerReadService } from '../../../src/domain/scheduler-service/scheduler-read.service.js';
import type { IToolDefinition } from '../../../src/agents/tools/tool.types.js';
import type { SchedulerService } from '../../../src/domain/scheduler-service/scheduler.service.js';

describe('tool registry phase 4', () => {
  it('registers full scheduler tool surface', () => {
    const service = {} as SchedulerService;
    const readService = {} as SchedulerReadService;
    const registry = createToolRegistry(service, readService);

    const definitions = registry.listDefinitions();
    expect(definitions).toHaveLength(13);

    const names = definitions.map((definition) => definition.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'plan-dual-lane',
        'get-srs-schedule',
        'get-progress-summary',
        'get-card-focus-summary',
        'get-study-guidance',
        'predict-retention',
        'get-card-projection',
        'propose-review-windows',
        'propose-session-candidates',
        'reconcile-session-candidates',
        'apply-session-adjustments',
        'update-card-scheduling',
        'batch-update-card-scheduling',
      ])
    );
  });

  it('executes the progress summary tool against the read service', async () => {
    const service = {} as SchedulerService;
    const readService = {
      getProgressSummary: vi.fn().mockResolvedValue({
        data: {
          userId: 'usr_1',
          studyMode: 'language_learning',
          totalCards: 10,
          trackedCards: 7,
          dueNow: 2,
          dueToday: 3,
          overdueCards: 1,
          newCards: 3,
          learningCards: 2,
          matureCards: 4,
          suspendedCards: 1,
          retentionCards: 6,
          calibrationCards: 4,
          fsrsCards: 6,
          hlrCards: 4,
          sm2Cards: 0,
          averageRecallProbability: 0.72,
          strongRecallCards: 3,
          fragileCards: 2,
        },
        agentHints: {
          suggestedNextActions: [],
          relatedResources: [],
          confidence: 1,
          sourceQuality: 'high',
          validityPeriod: 'short',
          contextNeeded: [],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0.6, effort: 0.2, roi: 3 },
          preferenceAlignment: [],
          reasoning: 'summary ready',
        },
      }),
    } as unknown as SchedulerReadService;
    const registry = createToolRegistry(service, readService);

    const result = await registry.execute(
      'get-progress-summary',
      { userId: 'usr_1', studyMode: 'language_learning' },
      'usr_1',
      'cor_1'
    );

    expect(result.success).toBe(true);
    expect(readService.getProgressSummary).toHaveBeenCalledWith('usr_1', 'language_learning');
  });

  it('executes the card focus summary tool against the read service', async () => {
    const service = {} as SchedulerService;
    const readService = {
      getCardFocusSummary: vi.fn().mockResolvedValue({
        data: {
          userId: 'usr_1',
          studyMode: 'knowledge_gaining',
          weakestCards: [],
          strongestCards: [],
        },
        agentHints: {
          suggestedNextActions: [],
          relatedResources: [],
          confidence: 1,
          sourceQuality: 'high',
          validityPeriod: 'short',
          contextNeeded: [],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0.6, effort: 0.2, roi: 3 },
          preferenceAlignment: [],
          reasoning: 'focus ready',
        },
      }),
    } as unknown as SchedulerReadService;
    const registry = createToolRegistry(service, readService);

    const result = await registry.execute(
      'get-card-focus-summary',
      { userId: 'usr_1', studyMode: 'knowledge_gaining', limit: 4 },
      'usr_1',
      'cor_1'
    );

    expect(result.success).toBe(true);
    expect(readService.getCardFocusSummary).toHaveBeenCalledWith('usr_1', 'knowledge_gaining', 4);
  });

  it('executes the study guidance tool against the read service', async () => {
    const service = {} as SchedulerService;
    const readService = {
      getStudyGuidanceSummary: vi.fn().mockResolvedValue({
        data: {
          userId: 'usr_1',
          studyMode: 'knowledge_gaining',
          recommendations: [],
        },
        agentHints: {
          suggestedNextActions: [],
          relatedResources: [],
          confidence: 1,
          sourceQuality: 'high',
          validityPeriod: 'short',
          contextNeeded: [],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0.6, effort: 0.2, roi: 3 },
          preferenceAlignment: [],
          reasoning: 'guidance ready',
        },
      }),
    } as unknown as SchedulerReadService;
    const registry = createToolRegistry(service, readService);

    const result = await registry.execute(
      'get-study-guidance',
      { userId: 'usr_1', studyMode: 'knowledge_gaining' },
      'usr_1',
      'cor_1'
    );

    expect(result.success).toBe(true);
    expect(readService.getStudyGuidanceSummary).toHaveBeenCalledWith('usr_1', 'knowledge_gaining');
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
      version: '1.0.0',
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
