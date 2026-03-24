import type { PrismaClient } from '../../../../generated/prisma/index.js';
import type {
  IRegisterOntologySourceInput,
  IOntologySource,
  ISourceCatalogRepository,
  IUpdateOntologySourceInput,
} from '../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

function toDomain(record: {
  id: string;
  name: string;
  role: string;
  accessMode: string;
  description: string;
  homepageUrl: string | null;
  documentationUrl: string | null;
  supportedLanguages: string[];
  supportsIncremental: boolean;
  enabled: boolean;
  latestReleaseVersion: string | null;
  latestReleasePublishedAt: Date | null;
  latestReleaseChecksum: string | null;
  createdAt: Date;
  updatedAt: Date;
}): IOntologySource {
  return {
    id: record.id,
    name: record.name,
    role: record.role as IOntologySource['role'],
    accessMode: record.accessMode as IOntologySource['accessMode'],
    description: record.description,
    homepageUrl: record.homepageUrl,
    documentationUrl: record.documentationUrl,
    supportedLanguages: record.supportedLanguages,
    supportsIncremental: record.supportsIncremental,
    enabled: record.enabled,
    latestRelease:
      record.latestReleaseVersion !== null
        ? {
            version: record.latestReleaseVersion,
            publishedAt: record.latestReleasePublishedAt?.toISOString() ?? null,
            checksum: record.latestReleaseChecksum,
          }
        : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class PrismaOntologySourceRepository implements ISourceCatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<IOntologySource[]> {
    const records = await this.prisma.ontologyImportSource.findMany({
      orderBy: [{ enabled: 'desc' }, { name: 'asc' }],
    });
    return records.map(toDomain);
  }

  async getById(sourceId: string): Promise<IOntologySource | null> {
    const record = await this.prisma.ontologyImportSource.findUnique({
      where: { id: sourceId },
    });
    return record ? toDomain(record) : null;
  }

  async register(input: IRegisterOntologySourceInput): Promise<IOntologySource> {
    const record = await this.prisma.ontologyImportSource.upsert({
      where: { id: input.id },
      update: {
        name: input.name,
        role: input.role,
        accessMode: input.accessMode,
        description: input.description,
        homepageUrl: input.homepageUrl ?? null,
        documentationUrl: input.documentationUrl ?? null,
        supportedLanguages: input.supportedLanguages ?? [],
        supportsIncremental: input.supportsIncremental ?? false,
        enabled: true,
      },
      create: {
        id: input.id,
        name: input.name,
        role: input.role,
        accessMode: input.accessMode,
        description: input.description,
        homepageUrl: input.homepageUrl ?? null,
        documentationUrl: input.documentationUrl ?? null,
        supportedLanguages: input.supportedLanguages ?? [],
        supportsIncremental: input.supportsIncremental ?? false,
        enabled: true,
      },
    });

    return toDomain(record);
  }

  async update(sourceId: string, input: IUpdateOntologySourceInput): Promise<IOntologySource> {
    const record = await this.prisma.ontologyImportSource.update({
      where: { id: sourceId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.accessMode !== undefined ? { accessMode: input.accessMode } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.homepageUrl !== undefined ? { homepageUrl: input.homepageUrl } : {}),
        ...(input.documentationUrl !== undefined
          ? { documentationUrl: input.documentationUrl }
          : {}),
        ...(input.supportedLanguages !== undefined
          ? { supportedLanguages: input.supportedLanguages }
          : {}),
        ...(input.supportsIncremental !== undefined
          ? { supportsIncremental: input.supportsIncremental }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.latestRelease !== undefined
          ? {
              latestReleaseVersion: input.latestRelease?.version ?? null,
              latestReleasePublishedAt:
                input.latestRelease?.publishedAt !== null &&
                input.latestRelease?.publishedAt !== undefined
                  ? new Date(input.latestRelease.publishedAt)
                  : null,
              latestReleaseChecksum: input.latestRelease?.checksum ?? null,
            }
          : {}),
      },
    });

    return toDomain(record);
  }
}
