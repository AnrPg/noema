import { z } from 'zod';
import {
  OntologyAccessModeSchema,
  OntologyImportStatusSchema,
  OntologyRunTriggerSchema,
  OntologySourceRoleSchema,
  type ICancelOntologyImportRunInput,
  type ICreateOntologyImportRunInput,
  type INormalizedOntologyBatchSummary,
  type IOntologyImportsSystemStatus,
  type IOntologyMutationPreviewBatch,
  type IOntologyMutationPreviewSubmission,
  type IParsedOntologyBatch,
  type IRegisterOntologySourceInput,
  type IUpdateOntologySourceInput,
  type IRetryOntologyImportRunInput,
  type IOntologyImportArtifact,
  type IOntologyImportCheckpoint,
  type IOntologyImportRun,
  type IOntologySource,
} from '../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import type { IExecutionContext } from '../../../domain/knowledge-graph-service/execution-context.js';

export interface IListOntologyImportRunsQuery {
  sourceId?: string;
  status?: z.infer<typeof OntologyImportStatusSchema>;
}

export interface IListOntologySourcesQuery {
  role?: z.infer<typeof OntologySourceRoleSchema>;
  accessMode?: z.infer<typeof OntologyAccessModeSchema>;
}

export interface IStartOntologyImportRunInput {
  runId: string;
}

export interface IOntologyImportRunDetail {
  run: IOntologyImportRun;
  source: IOntologySource | null;
  artifacts: IOntologyImportArtifact[];
  checkpoints: IOntologyImportCheckpoint[];
  parsedBatch: IParsedOntologyBatch | null;
  normalizedBatch: INormalizedOntologyBatchSummary | null;
  mutationPreview: IOntologyMutationPreviewBatch | null;
}

export interface IOntologyImportArtifactContent {
  artifact: IOntologyImportArtifact;
  content: string;
}

export interface IOntologyImportsApplicationService {
  registerSource(input: IRegisterOntologySourceInput): Promise<IOntologySource>;
  listSources(query?: IListOntologySourcesQuery): Promise<IOntologySource[]>;
  updateSource(sourceId: string, input: IUpdateOntologySourceInput): Promise<IOntologySource>;
  syncSourceMetadata(sourceId: string): Promise<IOntologySource>;
  getSystemStatus(): Promise<IOntologyImportsSystemStatus>;
  createImportRun(input: ICreateOntologyImportRunInput): Promise<IOntologyImportRun>;
  startImportRun(input: IStartOntologyImportRunInput): Promise<IOntologyImportRun>;
  cancelImportRun(input: ICancelOntologyImportRunInput): Promise<IOntologyImportRun>;
  retryImportRun(input: IRetryOntologyImportRunInput): Promise<IOntologyImportRun>;
  listImportRuns(query?: IListOntologyImportRunsQuery): Promise<IOntologyImportRun[]>;
  getImportRun(runId: string): Promise<IOntologyImportRunDetail | null>;
  getArtifactContent(
    runId: string,
    artifactId: string
  ): Promise<IOntologyImportArtifactContent | null>;
  publishParsedBatchForNormalization(runId: string): Promise<IParsedOntologyBatch>;
  submitMutationPreview(input: {
    runId: string;
    context: IExecutionContext;
    candidateIds?: string[];
  }): Promise<IOntologyMutationPreviewSubmission>;
}

export const ListOntologySourcesQuerySchema = z.object({
  role: OntologySourceRoleSchema.optional(),
  accessMode: OntologyAccessModeSchema.optional(),
});

export const ListOntologyImportRunsQuerySchema = z.object({
  sourceId: z.string().min(1).optional(),
  status: OntologyImportStatusSchema.optional(),
});

export const StartOntologyImportRunInputSchema = z.object({
  runId: z.string().min(1, 'Run id is required'),
});

export const CreateOntologyImportRunInputSchema = z.object({
  sourceId: z.string().min(1, 'Source id is required'),
  trigger: OntologyRunTriggerSchema.default('manual'),
  initiatedBy: z.string().min(1).optional(),
  sourceVersion: z.string().min(1).optional(),
  configuration: z
    .object({
      mode: z.string().min(1).nullable().default(null),
      language: z.string().min(1).nullable().default(null),
      seedNodes: z.array(z.string().min(1)).default([]),
    })
    .optional(),
});
