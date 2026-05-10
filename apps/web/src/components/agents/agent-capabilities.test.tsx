import { describe, expect, test } from 'vitest';
import {
  AGENT_CAPABILITIES,
  getAgentCapability,
  missingAgentContext,
} from '../../features/agents/agent-capabilities';

describe('embedded agent capabilities', () => {
  test('prioritizes the core learner-facing agents', () => {
    const capabilityNames: string[] = Object.keys(AGENT_CAPABILITIES);

    expect(capabilityNames).toEqual(
      expect.arrayContaining([
        'cognitive-copilot',
        'mental-debugger',
        'calibration-coach',
        'patch-planner-remediation-agent',
        'strategy-replanning-agent',
        'ingestion-concept-extraction-agent',
        'knowledge-graph-agent',
        'curriculum-outline-planner',
        'curriculum-planner',
        'curriculum-revision-agent',
        'content-creation-orchestrator',
        'content-creator-agent',
        'lesson-plan-generator',
      ])
    );
  });

  test('keeps learner-critical session agents realtime', () => {
    expect(getAgentCapability('mental-debugger').defaultExecution).toBe('realtime');
    expect(getAgentCapability('strategy-replanning-agent').defaultExecution).toBe('realtime');
    expect(getAgentCapability('mode-preference-helper').defaultExecution).toBe('realtime');
    expect(getAgentCapability('curriculum-outline-planner').defaultExecution).toBe('realtime');
  });

  test('reports missing required context before a button can run', () => {
    const capability = getAgentCapability('knowledge-graph-agent');

    expect(missingAgentContext(capability, { userId: 'u1', conceptIds: [] })).toEqual([
      'conceptIds',
    ]);
    expect(missingAgentContext(capability, { userId: 'u1', conceptIds: ['Bayes'] })).toEqual([]);
  });

  test('allows goal analysis without fake concept ids', () => {
    const capability = getAgentCapability('curriculum-outline-planner');

    expect(missingAgentContext(capability, { userId: 'u1' })).toEqual([]);
  });

  test('requires approved concept ids before the durable curriculum draft can run', () => {
    const capability = getAgentCapability('curriculum-planner');

    expect(missingAgentContext(capability, { userId: 'u1', conceptIds: [] })).toEqual([
      'conceptIds',
    ]);
    expect(missingAgentContext(capability, { userId: 'u1', conceptIds: ['concept_1'] })).toEqual(
      []
    );
  });

  test('requires curriculum identity for structural revision drafts', () => {
    const capability = getAgentCapability('curriculum-revision-agent');

    expect(missingAgentContext(capability, { userId: 'u1', curriculumId: '' })).toEqual([
      'curriculumId',
    ]);
    expect(missingAgentContext(capability, { userId: 'u1', curriculumId: 'curr_1' })).toEqual(
      []
    );
  });

  test('routes graph review into the knowledge review workspace', () => {
    expect(getAgentCapability('knowledge-graph-agent').actionLabel).toBe('Draft graph suggestions');
    expect(getAgentCapability('knowledge-graph-agent').reviewRoute).toBe(
      '/knowledge?workspace=review&agent=knowledge-graph-agent'
    );
  });
});
