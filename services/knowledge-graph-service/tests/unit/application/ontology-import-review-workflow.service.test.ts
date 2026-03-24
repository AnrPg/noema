import { describe, expect, it } from 'vitest';
import { OntologyImportReviewWorkflowService } from '../../../src/application/knowledge-graph/ontology-imports/review-workflows/service.js';
import { ckgMutation, executionContext, serviceResult } from '../../fixtures/index.js';
import { mockKnowledgeGraphService } from '../../helpers/mocks.js';

const ADMIN_CONTEXT = executionContext({
  userId: 'user_test_admin',
  roles: ['admin'],
});

describe('OntologyImportReviewWorkflowService', () => {
  it('bulk-approves selected ontology import mutations', async () => {
    const service = mockKnowledgeGraphService();
    const workflow = new OntologyImportReviewWorkflowService(service);
    const firstMutation = ckgMutation({
      rationale:
        '[ontology-import runId=run_yago_001 sourceId=yago candidateId=concept:yago:graph_theory] Import concept',
      state: 'pending_review',
    });
    const secondMutation = ckgMutation({
      rationale:
        '[ontology-import runId=run_yago_001 sourceId=yago candidateId=relation:yago:rel_001] Import relation',
      state: 'pending_review',
    });

    service.getMutation
      .mockResolvedValueOnce(serviceResult(firstMutation))
      .mockResolvedValueOnce(serviceResult(secondMutation));
    service.approveEscalatedMutation
      .mockResolvedValueOnce(serviceResult(firstMutation))
      .mockResolvedValueOnce(serviceResult(secondMutation));

    const result = await workflow.executeBulkReview(
      {
        action: 'approve',
        mutationIds: [firstMutation.mutationId, secondMutation.mutationId],
        note: 'Approved in bulk from reviewer queue.',
      },
      ADMIN_CONTEXT
    );

    expect(result.processedCount).toBe(2);
    expect(result.failed).toEqual([]);
    expect(service.approveEscalatedMutation).toHaveBeenCalledTimes(2);
  });

  it('scopes bulk review to a single import run', async () => {
    const service = mockKnowledgeGraphService();
    const workflow = new OntologyImportReviewWorkflowService(service);
    const scopedMutation = ckgMutation({
      rationale:
        '[ontology-import runId=run_esco_001 sourceId=esco candidateId=concept:esco:skill_python] Import concept',
      state: 'pending_review',
    });
    const otherMutation = ckgMutation({
      rationale:
        '[ontology-import runId=run_yago_001 sourceId=yago candidateId=concept:yago:graph_theory] Import concept',
      state: 'pending_review',
    });

    service.listMutations.mockResolvedValue(serviceResult([scopedMutation, otherMutation]));
    service.rejectEscalatedMutation.mockResolvedValue(serviceResult(scopedMutation));

    const result = await workflow.executeBulkReview(
      {
        action: 'reject',
        importRunId: 'run_esco_001',
        note: 'Rejected as a scoped import-run workflow.',
      },
      ADMIN_CONTEXT
    );

    expect(result.requestedCount).toBe(1);
    expect(result.processedCount).toBe(1);
    expect(service.rejectEscalatedMutation).toHaveBeenCalledWith(
      scopedMutation.mutationId,
      'Rejected as a scoped import-run workflow.',
      ADMIN_CONTEXT
    );
  });
});
