export interface ICkgResetInput {
  includeSources?: boolean;
}

export interface ICkgResetResult {
  includeSources: boolean;
  truncatedTables: string[];
  deletedNeo4jCkgNodes: number;
  clearedCachePatterns: string[];
  artifactRootDirectory: string;
  resetAt: string;
}

export interface ICkgSourcePurgeInput {
  streamId: string;
  includeSourceRegistration?: boolean;
}

export interface ICkgSourcePurgeResult {
  streamId: string;
  deletedNeo4jCkgNodes: number;
  deletedNeo4jCkgEdges: number;
  deletedMutationCount: number;
  deletedAggregationEvidenceCount: number;
  deletedImportRunCount: number;
  deletedImportArtifactCount: number;
  deletedImportCheckpointCount: number;
  deletedParsedBatchCount: number;
  deletedSourceRegistrationCount: number;
  clearedCachePatterns: string[];
  artifactDirectoriesRemoved: string[];
  purgedAt: string;
}

export interface ICkgMaintenancePort {
  reset(input?: ICkgResetInput): Promise<ICkgResetResult>;
  purgeBySource(input: ICkgSourcePurgeInput): Promise<ICkgSourcePurgeResult>;
}

export interface ICkgMaintenanceApplicationService {
  resetCkg(input?: ICkgResetInput): Promise<ICkgResetResult>;
  purgeCkgBySource(input: ICkgSourcePurgeInput): Promise<ICkgSourcePurgeResult>;
}
