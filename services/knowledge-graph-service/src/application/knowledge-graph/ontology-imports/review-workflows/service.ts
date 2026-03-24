import type { MutationId } from '@noema/types';
import type { ICkgMutation } from '../../../../domain/knowledge-graph-service/mutation.repository.js';
import type { IExecutionContext } from '../../../../domain/knowledge-graph-service/execution-context.js';
import type { IKnowledgeGraphService } from '../../../../domain/knowledge-graph-service/knowledge-graph.service.js';
import { getOntologyImportMutationContext } from '../mutation-generation/index.js';
import type {
  IOntologyImportBulkReviewInput,
  IOntologyImportBulkReviewResult,
  IOntologyImportReviewWorkflowService,
} from './contracts.js';

const MAX_BULK_REVIEW_MUTATIONS = 200;

export class OntologyImportReviewWorkflowService implements IOntologyImportReviewWorkflowService {
  constructor(private readonly knowledgeGraphService: IKnowledgeGraphService) {}

  async executeBulkReview(
    input: IOntologyImportBulkReviewInput,
    context: IExecutionContext
  ): Promise<IOntologyImportBulkReviewResult> {
    const mutations = await this.resolveMutations(input, context);
    const result: IOntologyImportBulkReviewResult = {
      action: input.action,
      importRunId: input.importRunId ?? null,
      requestedCount: mutations.length,
      processedCount: 0,
      skippedCount: 0,
      succeededMutationIds: [],
      failed: [],
    };

    for (const mutation of mutations) {
      try {
        if (mutation.state !== 'pending_review') {
          result.skippedCount += 1;
          result.failed.push({
            mutationId: mutation.mutationId,
            reason: `Mutation is in ${mutation.state} and cannot be bulk-reviewed.`,
          });
          continue;
        }

        await this.executeAction(mutation.mutationId, input.action, input.note, context);
        result.processedCount += 1;
        result.succeededMutationIds.push(mutation.mutationId);
      } catch (error) {
        result.failed.push({
          mutationId: mutation.mutationId,
          reason: error instanceof Error ? error.message : 'Unknown bulk review failure.',
        });
      }
    }

    return result;
  }

  private async resolveMutations(
    input: IOntologyImportBulkReviewInput,
    context: IExecutionContext
  ): Promise<ICkgMutation[]> {
    const explicitMutationIds =
      input.mutationIds?.filter(
        (mutationId, index, source) => source.indexOf(mutationId) === index
      ) ?? [];
    const importRunId = input.importRunId?.trim();

    if (explicitMutationIds.length > MAX_BULK_REVIEW_MUTATIONS) {
      throw new Error(
        `Bulk review supports at most ${String(MAX_BULK_REVIEW_MUTATIONS)} mutations at a time.`
      );
    }

    if (importRunId !== undefined && importRunId !== '') {
      const pendingReviewMutations = await this.knowledgeGraphService.listMutations(
        { state: 'pending_review' },
        context
      );
      const scopedMutations = pendingReviewMutations.data.filter((mutation) =>
        this.belongsToImportRun(mutation, importRunId)
      );

      if (explicitMutationIds.length === 0) {
        if (scopedMutations.length > MAX_BULK_REVIEW_MUTATIONS) {
          throw new Error(
            `Import run ${importRunId} has more than ${String(MAX_BULK_REVIEW_MUTATIONS)} reviewable mutations. Narrow the selection first.`
          );
        }
        return scopedMutations;
      }

      const scopedMutationMap = new Map(
        scopedMutations.map((mutation) => [mutation.mutationId, mutation])
      );
      return explicitMutationIds.map((mutationId) => {
        const mutation = scopedMutationMap.get(mutationId);
        if (mutation === undefined) {
          throw new Error(
            `Mutation ${mutationId} does not belong to ontology import run ${importRunId}.`
          );
        }
        return mutation;
      });
    }

    if (explicitMutationIds.length === 0) {
      throw new Error('Bulk review requires either mutationIds or an importRunId.');
    }

    return Promise.all(
      explicitMutationIds.map(async (mutationId) => {
        const mutation = await this.knowledgeGraphService.getMutation(mutationId, context);
        return mutation.data;
      })
    );
  }

  private belongsToImportRun(mutation: ICkgMutation, importRunId: string): boolean {
    const ontologyImportContext = getOntologyImportMutationContext({
      rationale: mutation.rationale,
      operations: mutation.operations,
    });
    return ontologyImportContext.runId === importRunId;
  }

  private async executeAction(
    mutationId: MutationId,
    action: IOntologyImportBulkReviewInput['action'],
    note: string,
    context: IExecutionContext
  ): Promise<void> {
    switch (action) {
      case 'approve':
        await this.knowledgeGraphService.approveEscalatedMutation(mutationId, note, context);
        return;
      case 'reject':
        await this.knowledgeGraphService.rejectEscalatedMutation(mutationId, note, context);
        return;
      case 'request_revision':
        await this.knowledgeGraphService.requestMutationRevision(mutationId, note, context);
        return;
    }
  }
}
