import { describe, expect, it } from 'vitest';
import { AgentId, CorrelationId, SessionId, StepId, ToolId, UserId } from '@noema/types';
import {
  AgentContextPackSchema,
  AgentOutputEnvelopeSchema,
  CapabilityDefinitionSchema,
  CommitIntentSchema,
  ToolDefinitionSchema,
  ToolExecutionResultSchema,
} from './index.js';

const suffix = 'ABCDEFGHIJKLMNOPQRSTU';

describe('agent kernel schemas', () => {
  it('accepts a bounded context pack with freshness and provenance', () => {
    const contextPack = {
      runContext: {
        key: 'runContext',
        authority: 'recorded_fact',
        value: {
          runId: 'run-session-001',
          correlationId: CorrelationId.create(`correlation_${suffix}`),
          principalType: 'agent',
          initiatedByUserId: UserId.create(`user_${suffix}`),
          sessionId: SessionId.create(`session_${suffix}`),
          stepId: StepId.create(`step_${suffix}`),
          startedAt: '2026-05-04T08:00:00.000Z',
        },
      },
      userContext: [],
      roleContext: [],
      learningContext: [],
      artifactContext: [],
      serviceFacts: [],
      detectedSignals: [],
      historyWindow: [],
      activeSurface: [],
      policyContext: [],
      allowedActions: {
        key: 'allowedActions',
        authority: 'recorded_fact',
        value: ['session.get-next-step', 'metacognition.get-remediation-brief'],
      },
      forbiddenActions: {
        key: 'forbiddenActions',
        authority: 'recorded_fact',
        value: ['session.complete-session'],
      },
      outputContract: {
        key: 'outputContract',
        authority: 'recorded_fact',
        value: {
          kind: 'proposal',
          schema: 'lesson-plan-proposal.v1',
        },
      },
      provenance: {
        key: 'provenance',
        authority: 'recorded_fact',
        value: [
          {
            type: 'tool_call',
            id: 'tool-call-001',
            service: 'session-service',
          },
        ],
      },
      freshness: {
        key: 'freshness',
        authority: 'recorded_fact',
        value: [
          {
            fetchedAt: '2026-05-04T08:00:00.000Z',
            replayable: true,
            mayRefreshLive: true,
            ttlMs: 30000,
          },
        ],
      },
      openQuestions: {
        key: 'openQuestions',
        authority: 'agent_inference',
        value: ['Should the plan insert a repair step before transfer?'],
      },
      reviewState: {
        key: 'reviewState',
        authority: 'recorded_fact',
        value: {
          state: 'needs_review',
        },
      },
    };

    expect(AgentContextPackSchema.parse(contextPack)).toEqual(contextPack);
  });

  it('accepts typed capability definitions for tools and reviewed writes', () => {
    const toolDefinition = {
      name: 'session.get-next-step',
      version: '1.0.0',
      description: 'Return the next Step for an active session.',
      service: 'session-service',
      capabilityClass: 'tool',
      priority: 'P0',
      tags: ['read', 'inspect', 'plan'],
      requiredScopes: ['session:read'],
      riskClassification: 'low',
      outputAuthorities: ['recorded_fact'],
      idempotent: true,
      sideEffects: false,
      timeoutMs: 5000,
      toolId: ToolId.create(`tool_${suffix}`),
    };

    expect(ToolDefinitionSchema.parse(toolDefinition)).toEqual(toolDefinition);
    expect(CapabilityDefinitionSchema.parse(toolDefinition)).toEqual({
      name: 'session.get-next-step',
      version: '1.0.0',
      description: 'Return the next Step for an active session.',
      service: 'session-service',
      capabilityClass: 'tool',
      priority: 'P0',
      tags: ['read', 'inspect', 'plan'],
      requiredScopes: ['session:read'],
      riskClassification: 'low',
      outputAuthorities: ['recorded_fact'],
      idempotent: true,
      sideEffects: false,
      timeoutMs: 5000,
    });
  });

  it('accepts reviewed-write commit intents and agent outputs', () => {
    const commitIntent = {
      intentId: 'intent-replan-001',
      stage: 'propose',
      artifactType: 'session_replan',
      action: 'insert_repair_step',
      ownerService: 'session-service',
      actor: {
        agentId: AgentId.create(`agent_${suffix}`),
        role: 'strategy-replanning-agent',
        family: 'learner-loop',
        version: '1.0.0',
      },
      payload: {
        sessionId: SessionId.create(`session_${suffix}`),
        stepId: StepId.create(`step_${suffix}`),
        insertedStepObjective: 'Repair the unstable prerequisite before transfer.',
      },
      riskClassification: 'medium',
      validationRequirement: {
        required: true,
        gates: ['service_invariant', 'pedagogy_guardian'],
        blocking: true,
      },
      reviewRequirement: {
        required: true,
        reviewers: ['human', 'policy'],
        autoCommitAllowed: false,
      },
      provenance: [
        {
          type: 'agent_run',
          id: 'run-replan-001',
          service: 'agents',
          authority: 'agent_proposal',
        },
      ],
      createdAt: '2026-05-04T08:05:00.000Z',
    };

    const outputEnvelope = {
      kind: 'proposal',
      authorityLabel: 'agent_proposal',
      summary: 'Insert a repair step before the learner attempts transfer.',
      payload: {
        recommendation: 'insert_repair_step',
      },
      agent: commitIntent.actor,
      runId: 'run-replan-001',
      riskClassification: 'medium',
      uncertainty: 'low',
      provenance: commitIntent.provenance,
      evidence: [
        {
          id: 'eval-brief-001',
          type: 'evaluation',
          authority: 'detected_signal',
        },
      ],
      validationRequirement: commitIntent.validationRequirement,
      reviewRequirement: commitIntent.reviewRequirement,
      generatedAt: '2026-05-04T08:05:05.000Z',
    };

    expect(CommitIntentSchema.parse(commitIntent)).toEqual(commitIntent);
    expect(AgentOutputEnvelopeSchema.parse(outputEnvelope)).toEqual(outputEnvelope);
  });

  it('keeps execution results authority-labeled', () => {
    const result = {
      success: true,
      data: {
        nextStepId: StepId.create(`step_${suffix}`),
      },
      authorityLabel: 'recorded_fact',
      provenance: [
        {
          type: 'tool_call',
          id: 'tool-call-002',
          service: 'session-service',
        },
      ],
      uncertainty: 'none',
    };

    expect(ToolExecutionResultSchema.parse(result)).toEqual(result);
  });
});
