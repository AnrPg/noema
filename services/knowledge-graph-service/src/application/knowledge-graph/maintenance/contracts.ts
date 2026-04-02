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

export interface ICkgResetPort {
  reset(input?: ICkgResetInput): Promise<ICkgResetResult>;
}

export interface ICkgMaintenanceApplicationService {
  resetCkg(input?: ICkgResetInput): Promise<ICkgResetResult>;
}
