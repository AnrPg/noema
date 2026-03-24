/**
 * @noema/knowledge-graph-service - Ontology Import API Schemas
 *
 * Zod validation schemas for ontology import source and run routes.
 */

import { z } from 'zod';
import {
  OntologyAccessModeSchema,
  OntologyImportRunConfigurationSchema,
  OntologyImportStatusSchema,
  OntologyRunTriggerSchema,
  OntologySourceRoleSchema,
} from '../../domain/knowledge-graph-service/ontology-imports.contracts.js';

export const OntologyImportSourceQuerySchema = z.object({
  role: OntologySourceRoleSchema.optional(),
  accessMode: OntologyAccessModeSchema.optional(),
});

export const OntologyImportRunsQuerySchema = z.object({
  sourceId: z.string().min(1, 'Source id is required').optional(),
  status: OntologyImportStatusSchema.optional(),
});

export const OntologyImportRunIdParamsSchema = z.object({
  runId: z.string().min(1, 'Run id is required'),
});

export const CreateOntologyImportRunRequestSchema = z.object({
  sourceId: z.string().min(1, 'Source id is required'),
  trigger: OntologyRunTriggerSchema.default('manual'),
  sourceVersion: z.string().min(1).optional(),
  configuration: OntologyImportRunConfigurationSchema.partial().optional(),
});

export const CancelOntologyImportRunRequestSchema = z.object({
  reason: z.string().min(1).max(2000).optional(),
});

export type OntologyImportSourceQuery = z.infer<typeof OntologyImportSourceQuerySchema>;
export type OntologyImportRunsQuery = z.infer<typeof OntologyImportRunsQuerySchema>;
export type OntologyImportRunIdParams = z.infer<typeof OntologyImportRunIdParamsSchema>;
export type CreateOntologyImportRunRequest = z.infer<typeof CreateOntologyImportRunRequestSchema>;
export type CancelOntologyImportRunRequest = z.infer<typeof CancelOntologyImportRunRequestSchema>;
