/**
 * @noema/knowledge-graph-service - Ontology Import Routes
 *
 * Admin-only routes for source catalog browsing and import-run orchestration.
 *
 * Prefix: /api/v1/ckg/imports
 */

import type { FastifyInstance } from 'fastify';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  CancelOntologyImportRunRequestSchema,
  CreateOntologyImportRunRequestSchema,
  OntologyImportRunIdParamsSchema,
  OntologyImportRunsQuerySchema,
  OntologyImportSourceQuerySchema,
} from '../schemas/ontology-import.schemas.js';
import {
  assertAdminOrAgent,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
  type IRouteOptions,
} from '../shared/route-helpers.js';
import type {
  IOntologyImportRun,
  IOntologySource,
} from '../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import type { IOntologyImportsApplicationService } from '../../application/knowledge-graph/ontology-imports/contracts.js';

interface IRunDto {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceVersion: string | null;
  configuration: IOntologyImportRun['configuration'];
  submittedMutationIds: string[];
  status: IOntologyImportRun['status'];
  trigger: IOntologyImportRun['trigger'];
  initiatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
}

function toRunDto(run: IOntologyImportRun, source: IOntologySource | null): IRunDto {
  return {
    id: run.id,
    sourceId: run.sourceId,
    sourceName: source?.name ?? run.sourceId.toUpperCase(),
    sourceVersion: run.sourceVersion,
    configuration: run.configuration,
    submittedMutationIds: run.submittedMutationIds,
    status: run.status,
    trigger: run.trigger,
    initiatedBy: run.initiatedBy,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    failureReason: run.failureReason,
  };
}

/**
 * Register ontology import source and run routes.
 */
export function registerOntologyImportRoutes(
  fastify: FastifyInstance,
  ontologyImportsService: IOntologyImportsApplicationService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  _options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/imports/sources',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Ontology Imports'],
        summary: 'List ontology import sources',
        description:
          'List the registered ontology import sources available to the admin ontology-import workspace.',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const query = OntologyImportSourceQuerySchema.parse(request.query);
        const context = buildContext(request);
        const sources = await ontologyImportsService.listSources({
          ...(query.role !== undefined ? { role: query.role } : {}),
          ...(query.accessMode !== undefined ? { accessMode: query.accessMode } : {}),
        });
        reply.send(
          wrapResponse(
            sources,
            [
              {
                type: 'system',
                message: `Ontology source catalog retrieved for ${context.userId ?? 'admin'}`,
              },
            ],
            request
          )
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/imports/runs',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Ontology Imports'],
        summary: 'List ontology import runs',
        description:
          'List ontology import runs with source-aware metadata for the admin dashboard.',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const query = OntologyImportRunsQuerySchema.parse(request.query);
        const [runs, sources] = await Promise.all([
          ontologyImportsService.listImportRuns({
            ...(query.sourceId !== undefined ? { sourceId: query.sourceId } : {}),
            ...(query.status !== undefined ? { status: query.status } : {}),
          }),
          ontologyImportsService.listSources(),
        ]);

        const sourcesById = new Map(sources.map((source) => [source.id, source]));
        reply.send(
          wrapResponse(
            runs.map((run) => toRunDto(run, sourcesById.get(run.sourceId) ?? null)),
            [],
            request
          )
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.get<{ Params: { runId: string } }>(
    '/api/v1/ckg/imports/runs/:runId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Ontology Imports'],
        summary: 'Get ontology import run detail',
        description:
          'Inspect the source, raw artifacts, checkpoints, parsed batch metadata, normalized batch summaries, and mutation-preview payloads for a single run.',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { runId } = OntologyImportRunIdParamsSchema.parse(request.params);
        const detail = await ontologyImportsService.getImportRun(runId);

        if (detail === null) {
          reply.status(404).send({
            error: {
              code: 'ONTOLOGY_IMPORT_RUN_NOT_FOUND',
              message: `Ontology import run ${runId} was not found.`,
            },
            metadata: {
              requestId: request.id,
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        reply.send(
          wrapResponse(
            {
              run: toRunDto(detail.run, detail.source),
              source: detail.source,
              artifacts: detail.artifacts,
              checkpoints: detail.checkpoints,
              parsedBatch: detail.parsedBatch,
              normalizedBatch: detail.normalizedBatch,
              mutationPreview: detail.mutationPreview,
            },
            [],
            request
          )
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Body: Record<string, unknown> }>(
    '/api/v1/ckg/imports/runs',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Ontology Imports'],
        summary: 'Create ontology import run',
        description:
          'Create a queued ontology import run for a registered source without starting source-specific fetching yet.',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const parsed = CreateOntologyImportRunRequestSchema.parse(request.body);
        const context = buildContext(request);
        const configuration =
          parsed.configuration === undefined
            ? undefined
            : {
                mode: parsed.configuration.mode ?? null,
                language: parsed.configuration.language ?? null,
                seedNodes: parsed.configuration.seedNodes ?? [],
              };
        const run = await ontologyImportsService.createImportRun({
          initiatedBy: context.userId ?? 'admin',
          sourceId: parsed.sourceId,
          trigger: parsed.trigger,
          ...(parsed.sourceVersion !== undefined ? { sourceVersion: parsed.sourceVersion } : {}),
          ...(configuration !== undefined ? { configuration } : {}),
        });
        const source = await ontologyImportsService
          .listSources()
          .then((sources) => sources.find((entry) => entry.id === run.sourceId) ?? null);

        reply.status(201).send(wrapResponse(toRunDto(run, source ?? null), [], request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { runId: string } }>(
    '/api/v1/ckg/imports/runs/:runId/submit',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Ontology Imports'],
        summary: 'Submit mutation preview to the CKG review queue',
        description:
          'Submit all mutation-ready ontology preview candidates for a run into the canonical CKG mutation review queue.',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { runId } = OntologyImportRunIdParamsSchema.parse(request.params);
        const submission = await ontologyImportsService.submitMutationPreview({
          runId,
          context: buildContext(request),
        });

        reply.status(201).send(wrapResponse(submission, [], request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { runId: string } }>(
    '/api/v1/ckg/imports/runs/:runId/start',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Ontology Imports'],
        summary: 'Start ontology import run',
        description:
          'Move a queued import run into the fetching state and execute the registered fetch, parse, and initial normalization stages immediately when adapters are available.',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { runId } = OntologyImportRunIdParamsSchema.parse(request.params);
        const run = await ontologyImportsService.startImportRun({ runId });
        const source = await ontologyImportsService
          .listSources()
          .then((sources) => sources.find((entry) => entry.id === run.sourceId) ?? null);

        reply.send(wrapResponse(toRunDto(run, source ?? null), [], request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { runId: string }; Body: Record<string, unknown> }>(
    '/api/v1/ckg/imports/runs/:runId/cancel',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Ontology Imports'],
        summary: 'Cancel ontology import run',
        description: 'Cancel a queued or in-progress ontology import run.',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { runId } = OntologyImportRunIdParamsSchema.parse(request.params);
        const parsed = CancelOntologyImportRunRequestSchema.parse(request.body);
        const run = await ontologyImportsService.cancelImportRun(
          parsed.reason !== undefined ? { runId, reason: parsed.reason } : { runId }
        );
        const source = await ontologyImportsService
          .listSources()
          .then((sources) => sources.find((entry) => entry.id === run.sourceId));

        reply.send(wrapResponse(toRunDto(run, source ?? null), [], request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { runId: string } }>(
    '/api/v1/ckg/imports/runs/:runId/retry',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['Ontology Imports'],
        summary: 'Retry ontology import run',
        description: 'Requeue a failed or cancelled ontology import run.',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { runId } = OntologyImportRunIdParamsSchema.parse(request.params);
        const run = await ontologyImportsService.retryImportRun({
          runId,
          reason: 'Retry requested from admin console',
        });
        const source = await ontologyImportsService
          .listSources()
          .then((sources) => sources.find((entry) => entry.id === run.sourceId) ?? null);

        reply.send(wrapResponse(toRunDto(run, source ?? null), [], request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
