import type {
  IConceptCandidateDto,
  IDocumentChunkDto,
  IDocumentDto,
  IDocumentIrDto,
  IVectorSearchResultDto,
} from '@noema/contracts';
import type { CurriculumId, NodeId, UserId } from '@noema/types';

export interface IParsedDocument {
  rawText: string;
  language?: string | undefined;
  blocks: IDocumentIrDto['blocks'];
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
    document: IDocumentDto;
    ir: IDocumentIrDto;
    chunks: IDocumentChunkDto[];
  }): Promise<
    {
      label: string;
      definition?: string | undefined;
      evidenceChunkIds: string[];
      salience: number;
    }[]
  >;
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
