/**
 * @noema/knowledge-graph-service - Graph Restore Confirmation Token Repository
 *
 * Stores restore confirmation token usage state so replay protection works
 * across multiple service instances and survives process restarts.
 */

export interface IGraphRestoreTokenRepository {
  reserveToken(input: {
    tokenId: string;
    snapshotId: string;
    actorId: string | null;
    summaryHash: string;
    expiresAt: string;
  }): Promise<boolean>;

  consumeToken(tokenId: string): Promise<void>;

  releaseToken(tokenId: string): Promise<void>;

  pruneExpiredTokens(now: string): Promise<number>;
}
