import { describe, expect, it } from 'vitest';
import {
  ConceptIdSchema,
  CurriculumNodeIdSchema,
  LearningEventRegistry,
  LearningEventSchemas,
  LearningEventType,
  LessonPlanSchema,
  MetacognitionTriggerFiredPayloadSchema,
  SessionCurriculumSliceSelectedPayloadSchema,
  StepAnsweredEventPayloadSchema,
  closedLoopGoldenStepAnswered,
  parseLearningEvent,
} from './index.js';

describe('learning kernel ID boundaries', () => {
  it('does not allow curriculum node IDs as concept IDs', () => {
    expect(ConceptIdSchema.safeParse('concept_123456789012345678901').success).toBe(true);
    expect(CurriculumNodeIdSchema.safeParse('cnode_123456789012345678901').success).toBe(true);
    expect(ConceptIdSchema.safeParse('cnode_123456789012345678901').success).toBe(false);
  });
});

describe('learning kernel event schemas', () => {
  it('validates the golden Step answered event', () => {
    expect(() => parseLearningEvent(closedLoopGoldenStepAnswered)).not.toThrow();
  });

  it('rejects Step answered events with curriculum node IDs in conceptRefs', () => {
    const payload = {
      ...closedLoopGoldenStepAnswered.payload,
      conceptRefs: ['cnode_123456789012345678901'],
    };
    expect(StepAnsweredEventPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('requires selected curriculum nodes on Step answered events', () => {
    const payload = {
      ...closedLoopGoldenStepAnswered.payload,
      selectedNodeIds: [],
    };
    expect(StepAnsweredEventPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('requires selected curriculum nodes on session slices and lesson plans', () => {
    expect(
      SessionCurriculumSliceSelectedPayloadSchema.safeParse({
        sessionId: 'session_123456789012345678901',
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        userId: 'user_123456789012345678901',
        selectedNodeIds: [],
        conceptIds: ['concept_123456789012345678901'],
      }).success
    ).toBe(false);

    expect(
      LessonPlanSchema.safeParse({
        id: 'lplan_123456789012345678901',
        sessionId: 'session_123456789012345678901',
        userId: 'user_123456789012345678901',
        curriculumId: 'curr_123456789012345678901',
        curriculumVersionId: 'cver_123456789012345678901',
        selectedNodeIds: [],
        studyMode: 'knowledge_gaining',
        learningMode: 'exploration',
        rigorLevel: 'minimal',
        topic: 'Kernel test',
      }).success
    ).toBe(false);
  });

  it('requires studyMode and selectedNodeIds on trigger events', () => {
    expect(
      MetacognitionTriggerFiredPayloadSchema.safeParse({
        triggerId: 'trigger_123456789012345678901',
        userId: 'user_123456789012345678901',
        type: 'confusion',
        severity: 0.5,
        conceptRefs: ['concept_123456789012345678901'],
        selectedNodeIds: ['cnode_123456789012345678901'],
        stepId: 'step_123456789012345678901',
        sessionId: 'session_123456789012345678901',
        studyMode: 'knowledge_gaining',
        recommendedIntervention: 'insert_repair_step',
      }).success
    ).toBe(true);
  });

  it('registers schemas and topology for every learning event', () => {
    for (const eventType of Object.values(LearningEventType)) {
      expect(LearningEventSchemas[eventType]).toBeDefined();
      expect(LearningEventRegistry[eventType].producer).toMatch(/-service$/);
      expect(LearningEventRegistry[eventType].stream).toMatch(/^noema:events:/);
      expect(LearningEventRegistry[eventType].consumers.length).toBeGreaterThan(0);
    }
  });
});
