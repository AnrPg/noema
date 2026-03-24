import type {
  ICanonicalNodeResolver,
  ICancelOntologyImportRunInput,
  ICreateOntologyImportRunInput,
  IImportArtifactRepository,
  IImportCheckpointRepository,
  IImportRunRepository,
  INormalizedOntologyBatchSummary,
  INormalizationPublisher,
  IOntologyImportArtifact,
  IOntologyMutationPreviewBatch,
  IOntologyMutationPreviewSubmission,
  IOntologyMutationSubmissionPort,
  IRawArtifactStore,
  IParsedOntologyBatch,
  IParsedBatchRepository,
  IRegisterOntologySourceInput,
  IRetryOntologyImportRunInput,
  ISourceCatalogRepository,
  ISourceFetcher,
  ISourceNormalizer,
  ISourceParser,
  IOntologyImportRun,
  IOntologySource,
} from '../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import {
  NormalizedOntologyGraphBatchSchema,
  OntologyMutationPreviewBatchSchema,
} from '../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import type { IExecutionContext } from '../../../domain/knowledge-graph-service/execution-context.js';
import {
  type IListOntologyImportRunsQuery,
  type IListOntologySourcesQuery,
  type IOntologyImportRunDetail,
  type IOntologyImportsApplicationService,
} from './contracts.js';
import { OntologyImportMutationGenerationService } from './mutation-generation/index.js';
import { OntologyImportNormalizationService } from './normalization/index.js';
import { OntologyImportParsingService } from './parsing/index.js';

const DEFAULT_SOURCES: IRegisterOntologySourceInput[] = [
  {
    id: 'yago',
    name: 'YAGO',
    role: 'backbone',
    accessMode: 'snapshot',
    description:
      'Broad world-knowledge backbone imported as reproducible snapshot releases for taxonomy and entity structure.',
    homepageUrl: 'https://yago-knowledge.org/',
    documentationUrl: 'https://yago-knowledge.org/downloads/yago-4-5',
    supportedLanguages: ['en'],
    supportsIncremental: false,
  },
  {
    id: 'esco',
    name: 'ESCO',
    role: 'backbone',
    accessMode: 'linked_data',
    description:
      'Skills and occupations backbone used for competencies, capabilities, and learning pathways.',
    homepageUrl: 'https://esco.ec.europa.eu/',
    documentationUrl:
      'https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/linked-open-data',
    supportedLanguages: ['en', 'fr', 'de', 'es'],
    supportsIncremental: true,
  },
  {
    id: 'conceptnet',
    name: 'ConceptNet',
    role: 'backbone',
    accessMode: 'hybrid',
    description:
      'Commonsense relation graph used to enrich concept adjacency and learning-gap debugging.',
    homepageUrl: 'https://conceptnet.io/',
    documentationUrl: 'https://conceptnet.io/',
    supportedLanguages: ['en', 'multilingual'],
    supportsIncremental: true,
  },
];

export class OntologyImportsApplicationService implements IOntologyImportsApplicationService {
  private readonly sourceFetchersById: Map<string, ISourceFetcher>;
  private readonly sourceParserIds: Set<string>;
  private readonly sourceNormalizerIds: Set<string>;
  private readonly parsingService: OntologyImportParsingService;
  private readonly normalizationService: OntologyImportNormalizationService;
  private readonly mutationGenerationService: OntologyImportMutationGenerationService;
  private readonly mutationSubmissionPort: IOntologyMutationSubmissionPort | undefined;

  constructor(
    private readonly sourceRepository: ISourceCatalogRepository,
    private readonly runRepository: IImportRunRepository,
    private readonly artifactRepository: IImportArtifactRepository,
    private readonly checkpointRepository: IImportCheckpointRepository,
    private readonly parsedBatchRepository: IParsedBatchRepository,
    private readonly normalizationPublisher: INormalizationPublisher,
    private readonly rawArtifactStore: IRawArtifactStore,
    sourceFetchers: ISourceFetcher[] = [],
    sourceParsers: ISourceParser[] = [],
    sourceNormalizers: ISourceNormalizer[] = [],
    options?: {
      canonicalNodeResolver?: ICanonicalNodeResolver;
      mutationSubmissionPort?: IOntologyMutationSubmissionPort;
    }
  ) {
    this.sourceFetchersById = new Map(sourceFetchers.map((fetcher) => [fetcher.sourceId, fetcher]));
    this.sourceParserIds = new Set(sourceParsers.map((parser) => parser.sourceId));
    this.sourceNormalizerIds = new Set(sourceNormalizers.map((normalizer) => normalizer.sourceId));
    this.parsingService = new OntologyImportParsingService(sourceParsers);
    this.normalizationService = new OntologyImportNormalizationService(sourceNormalizers);
    this.mutationGenerationService = new OntologyImportMutationGenerationService(
      options?.canonicalNodeResolver
    );
    this.mutationSubmissionPort = options?.mutationSubmissionPort;
  }

  async ensureDefaultSources(): Promise<void> {
    const existing = await this.sourceRepository.list();
    const existingIds = new Set(existing.map((source) => source.id));

    await Promise.all(
      DEFAULT_SOURCES.filter((source) => !existingIds.has(source.id)).map((source) =>
        this.sourceRepository.register(source)
      )
    );
  }

  async registerSource(input: IRegisterOntologySourceInput): Promise<IOntologySource> {
    return this.sourceRepository.register(input);
  }

  async listSources(query?: IListOntologySourcesQuery): Promise<IOntologySource[]> {
    const sources = await this.sourceRepository.list();
    return sources.filter((source) => {
      if (query?.role !== undefined && source.role !== query.role) return false;
      if (query?.accessMode !== undefined && source.accessMode !== query.accessMode) return false;
      return true;
    });
  }

  async createImportRun(input: ICreateOntologyImportRunInput): Promise<IOntologyImportRun> {
    return this.runRepository.create({
      sourceId: input.sourceId,
      trigger: input.trigger,
      ...(input.sourceVersion !== undefined ? { sourceVersion: input.sourceVersion } : {}),
      ...(input.configuration !== undefined ? { configuration: input.configuration } : {}),
      ...(input.initiatedBy !== undefined ? { initiatedBy: input.initiatedBy } : {}),
    });
  }

  async startImportRun(input: { runId: string }): Promise<IOntologyImportRun> {
    const startedAt = new Date().toISOString();
    const queuedRun = await this.runRepository.updateStatus(input.runId, 'fetching', {
      startedAt,
      completedAt: null,
    });

    const fetcher = this.sourceFetchersById.get(queuedRun.sourceId);
    if (fetcher === undefined) {
      await this.checkpointRepository.create({
        runId: queuedRun.id,
        step: 'fetch',
        status: 'running',
        startedAt,
        completedAt: null,
        detail: 'Import run started and is waiting for a source-specific fetch worker.',
      });
      return queuedRun;
    }

    try {
      const artifacts = await fetcher.fetch(queuedRun);
      const fetchCompletedAt = new Date().toISOString();

      await this.checkpointRepository.create({
        runId: queuedRun.id,
        step: 'fetch',
        status: 'completed',
        startedAt,
        completedAt: fetchCompletedAt,
        detail: `Fetched ${String(artifacts.length)} ontology artifacts from ${queuedRun.sourceId}.`,
      });

      let currentRun = await this.runRepository.updateStatus(queuedRun.id, 'fetched', {
        startedAt,
        completedAt: null,
      });

      if (!this.sourceParserIds.has(currentRun.sourceId)) {
        return currentRun;
      }

      const parseStartedAt = new Date().toISOString();
      currentRun = await this.runRepository.updateStatus(currentRun.id, 'parsing', {
        startedAt,
        completedAt: null,
      });

      let parsedGraphBatch;
      try {
        parsedGraphBatch = await this.parsingService.parseRun(currentRun, artifacts);
      } catch (error) {
        await this.failRun(currentRun.id, 'parse', startedAt, error);
        throw error;
      }

      const parsedBatchArtifact = await this.rawArtifactStore.savePayloadArtifact({
        runId: currentRun.id,
        sourceId: currentRun.sourceId,
        kind: 'parsed_batch',
        storageKey: buildBatchStorageKey(currentRun, 'parsed-batch.json'),
        contentType: 'application/json',
        payload: JSON.stringify(parsedGraphBatch, null, 2),
      });

      await this.parsedBatchRepository.save({
        runId: currentRun.id,
        sourceId: currentRun.sourceId,
        sourceVersion: currentRun.sourceVersion,
        recordCount: parsedGraphBatch.records.length,
        artifactId: parsedBatchArtifact.id,
      });

      const parseCompletedAt = new Date().toISOString();
      await this.checkpointRepository.create({
        runId: currentRun.id,
        step: 'parse',
        status: 'completed',
        startedAt: parseStartedAt,
        completedAt: parseCompletedAt,
        detail: `Parsed ${String(parsedGraphBatch.records.length)} staged records for ${currentRun.sourceId}.`,
      });

      currentRun = await this.runRepository.updateStatus(currentRun.id, 'parsed', {
        startedAt,
        completedAt: null,
      });

      if (!this.sourceNormalizerIds.has(currentRun.sourceId)) {
        return currentRun;
      }

      const normalizationStartedAt = new Date().toISOString();
      let normalizedBatch;
      try {
        normalizedBatch = await this.normalizationService.normalizeBatch(parsedGraphBatch);
      } catch (error) {
        await this.failRun(currentRun.id, 'stage', startedAt, error);
        throw error;
      }
      const normalizedBatchArtifact = await this.rawArtifactStore.savePayloadArtifact({
        runId: currentRun.id,
        sourceId: currentRun.sourceId,
        kind: 'normalized_batch',
        storageKey: buildBatchStorageKey(currentRun, 'normalized-batch.json'),
        contentType: 'application/json',
        payload: JSON.stringify(normalizedBatch, null, 2),
      });
      const mutationPreview = await this.mutationGenerationService.generate(normalizedBatch);
      const mutationPreviewArtifact = await this.rawArtifactStore.savePayloadArtifact({
        runId: currentRun.id,
        sourceId: currentRun.sourceId,
        kind: 'mutation_preview',
        storageKey: buildBatchStorageKey(currentRun, 'mutation-preview.json'),
        contentType: 'application/json',
        payload: JSON.stringify(mutationPreview, null, 2),
      });
      const normalizationCompletedAt = new Date().toISOString();

      await this.checkpointRepository.create({
        runId: currentRun.id,
        step: 'stage',
        status: 'completed',
        startedAt: normalizationStartedAt,
        completedAt: normalizationCompletedAt,
        detail:
          `Normalized ${String(normalizedBatch.conceptCount)} concepts and ${String(normalizedBatch.relationCount)} relations into ${normalizedBatchArtifact.storageKey}. ` +
          `Prepared ${String(mutationPreview.readyProposalCount)} mutation-ready proposals and ${String(mutationPreview.blockedCandidateCount)} deferred candidates in ${mutationPreviewArtifact.storageKey}.`,
      });

      return await this.runRepository.updateStatus(currentRun.id, 'ready_for_normalization', {
        startedAt,
        completedAt: null,
      });
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : 'Unknown ontology source fetch failure.';

      if ((await this.runRepository.getById(queuedRun.id))?.status !== 'failed') {
        await this.failRun(queuedRun.id, 'fetch', startedAt, failureReason);
      }

      throw error;
    }
  }

  async cancelImportRun(input: ICancelOntologyImportRunInput): Promise<IOntologyImportRun> {
    return this.runRepository.cancel(input);
  }

  async retryImportRun(input: IRetryOntologyImportRunInput): Promise<IOntologyImportRun> {
    return this.runRepository.retry(input);
  }

  async listImportRuns(query?: IListOntologyImportRunsQuery): Promise<IOntologyImportRun[]> {
    return this.runRepository.list({
      ...(query?.sourceId !== undefined ? { sourceId: query.sourceId } : {}),
      ...(query?.status !== undefined ? { status: query.status } : {}),
    });
  }

  async getImportRun(runId: string): Promise<IOntologyImportRunDetail | null> {
    const run = await this.runRepository.getById(runId);
    if (run === null) {
      return null;
    }

    const [source, artifacts, checkpoints, parsedBatch] = await Promise.all([
      this.sourceRepository.getById(run.sourceId),
      this.artifactRepository.listByRunId(runId),
      this.checkpointRepository.listByRunId(runId),
      this.parsedBatchRepository.getByRunId(runId),
    ]);
    const normalizedArtifact = findLatestArtifact(artifacts, 'normalized_batch');
    const mutationPreviewArtifact = findLatestArtifact(artifacts, 'mutation_preview');
    const [normalizedBatch, mutationPreview] = await Promise.all([
      this.readNormalizedBatchSummary(normalizedArtifact),
      this.readMutationPreview(mutationPreviewArtifact),
    ]);

    return {
      run,
      source,
      artifacts,
      checkpoints,
      parsedBatch,
      normalizedBatch,
      mutationPreview,
    };
  }

  async publishParsedBatchForNormalization(runId: string): Promise<IParsedOntologyBatch> {
    const parsedBatch = await this.parsedBatchRepository.getByRunId(runId);
    if (parsedBatch === null) {
      throw new Error('Parsed batch not found for run');
    }

    await this.normalizationPublisher.publish(parsedBatch);
    await this.runRepository.updateStatus(runId, 'ready_for_normalization');
    return parsedBatch;
  }

  async submitMutationPreview(input: {
    runId: string;
    context: IExecutionContext;
  }): Promise<IOntologyMutationPreviewSubmission> {
    if (this.mutationSubmissionPort === undefined) {
      throw new Error('Ontology mutation submission is not configured for this service.');
    }

    const run = await this.runRepository.getById(input.runId);
    if (run === null) {
      throw new Error(`Ontology import run ${input.runId} not found.`);
    }
    if (run.status === 'staging_validated') {
      throw new Error(`Mutation preview for run ${input.runId} has already been submitted.`);
    }

    const artifacts = await this.artifactRepository.listByRunId(input.runId);
    const mutationPreviewArtifact = findLatestArtifact(artifacts, 'mutation_preview');
    if (mutationPreviewArtifact === null) {
      throw new Error(`Run ${input.runId} does not have a mutation preview to submit.`);
    }

    const mutationPreview = await this.readMutationPreview(mutationPreviewArtifact);
    if (mutationPreview === null) {
      throw new Error(`Run ${input.runId} has an unreadable mutation preview artifact.`);
    }

    const readyCandidates = mutationPreview.candidates.filter(
      (candidate) => candidate.status === 'ready' && candidate.proposal !== null
    );
    if (readyCandidates.length === 0) {
      throw new Error(`Run ${input.runId} does not contain any mutation-ready proposals.`);
    }

    const mutationIds: string[] = [];
    for (const candidate of readyCandidates) {
      if (candidate.proposal === null) {
        continue;
      }

      const submission = await this.mutationSubmissionPort.submitProposal(
        candidate.proposal,
        input.context
      );
      mutationIds.push(submission.mutationId);
    }

    const submittedAt = new Date().toISOString();
    await this.checkpointRepository.create({
      runId: input.runId,
      step: 'validation',
      status: 'completed',
      startedAt: submittedAt,
      completedAt: submittedAt,
      detail: `Submitted ${String(mutationIds.length)} mutation proposals to the CKG review queue from ${String(readyCandidates.length)} ready candidates.`,
    });
    await this.runRepository.recordSubmittedMutations(input.runId, mutationIds);
    await this.runRepository.updateStatus(input.runId, 'staging_validated', {
      startedAt: run.startedAt,
      completedAt: submittedAt,
    });

    return {
      runId: input.runId,
      submittedAt,
      submittedCount: mutationIds.length,
      skippedCount: mutationPreview.candidates.length - readyCandidates.length,
      mutationIds,
    };
  }

  private async readNormalizedBatchSummary(
    artifact: IOntologyImportArtifact | null
  ): Promise<INormalizedOntologyBatchSummary | null> {
    if (artifact === null) {
      return null;
    }

    const batch = await this.readValidatedJsonArtifact(
      artifact,
      NormalizedOntologyGraphBatchSchema
    );

    return {
      runId: batch.runId,
      sourceId: batch.sourceId,
      sourceVersion: batch.sourceVersion,
      artifactId: artifact.id,
      generatedAt: batch.generatedAt,
      rawRecordCount: batch.rawRecordCount,
      conceptCount: batch.conceptCount,
      relationCount: batch.relationCount,
      mappingCount: batch.mappingCount,
    };
  }

  private async readMutationPreview(
    artifact: IOntologyImportArtifact | null
  ): Promise<IOntologyMutationPreviewBatch | null> {
    if (artifact === null) {
      return null;
    }

    const batch = await this.readValidatedJsonArtifact(
      artifact,
      OntologyMutationPreviewBatchSchema
    );
    return {
      ...batch,
      artifactId: artifact.id,
    };
  }

  private async failRun(
    runId: string,
    step: 'fetch' | 'parse' | 'stage',
    startedAt: string,
    error: unknown
  ): Promise<void> {
    const completedAt = new Date().toISOString();
    const failureReason =
      error instanceof Error ? error.message : 'Unknown ontology import pipeline failure.';

    await this.checkpointRepository.create({
      runId,
      step,
      status: 'failed',
      startedAt,
      completedAt,
      detail: failureReason,
    });

    await this.runRepository.updateStatus(runId, 'failed', {
      startedAt,
      completedAt,
      failureReason,
    });
  }

  private async readValidatedJsonArtifact<T>(
    artifact: IOntologyImportArtifact,
    schema: { parse(value: unknown): T }
  ): Promise<T> {
    const raw = await this.rawArtifactStore.readPayload(artifact.storageKey);
    return schema.parse(JSON.parse(raw.toString('utf8')));
  }
}

export class NoopNormalizationPublisher implements INormalizationPublisher {
  async publish(): Promise<void> {
    return Promise.resolve();
  }
}

function buildBatchStorageKey(run: IOntologyImportRun, fileName: string): string {
  return ['ontology-imports', run.sourceId, run.id, fileName].join('/');
}

function findLatestArtifact(
  artifacts: readonly IOntologyImportArtifact[],
  kind: IOntologyImportArtifact['kind']
): IOntologyImportArtifact | null {
  const matchingArtifacts = artifacts
    .filter((artifact) => artifact.kind === kind)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return matchingArtifacts[0] ?? null;
}
