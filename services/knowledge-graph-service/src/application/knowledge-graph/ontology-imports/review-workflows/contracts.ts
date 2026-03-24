import type { MutationId } from '@noema/types';
import type { IExecutionContext } from '../../../../domain/knowledge-graph-service/execution-context.js';

export type OntologyImportBulkReviewAction = 'approve' | 'reject' | 'request_revision';

export interface IOntologyImportBulkReviewInput {
  action: OntologyImportBulkReviewAction;
  mutationIds?: MutationId[];
  importRunId?: string;
  note: string;
}

export interface IOntologyImportBulkReviewResult {
  action: OntologyImportBulkReviewAction;
  importRunId: string | null;
  requestedCount: number;
  processedCount: number;
  skippedCount: number;
  succeededMutationIds: MutationId[];
  failed: {
    mutationId: MutationId;
    reason: string;
  }[];
}

export interface IOntologyImportReviewWorkflowService {
  executeBulkReview(
    input: IOntologyImportBulkReviewInput,
    context: IExecutionContext
  ): Promise<IOntologyImportBulkReviewResult>;
}
