import type {
  IConceptCandidateDto,
  IDocumentChunkDto,
  IDocumentDto,
  IDocumentIrDto,
  IVectorSearchResultDto,
} from '@noema/contracts';
import type { CurriculumId, NodeId, UserId } from '@noema/types';

export interface IExtractionScanWindow {
  windowId: string;
  ordinal: number;
  text: string;
  tokenEstimate: number;
  headingPath: string[];
  blockIds: string[];
  chunkIds: IDocumentChunkDto['id'][];
  metadata: Record<string, unknown>;
}

export interface IParsedDocument {
  rawText: string;
  language?: string | undefined;
  blocks: IDocumentIrDto['blocks'];
  parseWarnings?: { code: string; message: string }[] | undefined;
  format?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface IDocumentParserPort {
  parse(document: IDocumentDto, content: string): Promise<IParsedDocument>;
}

export interface IVectorServicePort {
  embedChunks(chunks: IDocumentChunkDto[]): Promise<IDocumentChunkDto[]>;
  query(input: {
    userId: UserId;
    documentIds?: string[] | undefined;
    query: string;
    limit: number;
  }): Promise<IVectorSearchResultDto[]>;
}

export interface IConceptExtractorPort {
  extract(input: {
    userId: UserId;
    document: IDocumentDto;
    ir: IDocumentIrDto;
    chunks: IDocumentChunkDto[];
    scanWindows: IExtractionScanWindow[];
    intent: 'parse_only' | 'derive_curriculum' | 'seed_cards' | 'both';
    curriculumId?: CurriculumId | undefined;
    studyMode?: string | undefined;
  }): Promise<{
    documentSummary: Record<string, unknown>;
    sectionSummaries: { sectionPath: string[]; summary: string }[];
    conceptCandidates: {
      label: string;
      definition?: string | undefined;
      evidenceChunkIds: string[];
      salience: number;
      confidence: number;
      state?: string | undefined;
      rationale?: string | undefined;
    }[];
    mappingSuggestions: {
      label: string;
      candidateNodeIds: string[];
      decision: string;
      confidence: number;
      reason: string;
      requiresUserApproval: boolean;
    }[];
    handoffRecommendations: {
      target: string;
      allowed: boolean;
      reason: string;
      payload?: Record<string, unknown> | undefined;
    }[];
    parseWarnings?: { code: string; message: string }[];
    groundingReport?: Record<string, unknown>;
  }>;
}

export interface IKnowledgeGraphPort {
  mapConcept(
    candidate: IConceptCandidateDto
  ): Promise<{ nodeId?: NodeId | undefined; confidence: number }>;
  proposeConcept(
    candidate: IConceptCandidateDto
  ): Promise<{ nodeId?: NodeId | undefined; proposalId: string }>;
}

export interface IContentServicePort {
  requestCardSeed(input: {
    userId: UserId;
    document: IDocumentDto;
    candidates: IConceptCandidateDto[];
    curriculumId?: CurriculumId | undefined;
  }): Promise<{ jobIds: string[] }>;
}

export interface ICurriculumServicePort {
  requestCurriculumSeed(input: {
    userId: UserId;
    document: IDocumentDto;
    concepts: IConceptCandidateDto[];
  }): Promise<{
    curriculumId?: CurriculumId | undefined;
    context?: Record<string, unknown> | undefined;
  }>;
}
