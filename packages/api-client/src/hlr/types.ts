/**
 * @noema/api-client - HLR Sidecar Types
 *
 * The HLR (Half-Life Regression) sidecar is a Python service running
 * separately from the main API. Its base URL is configured independently
 * via configureHlrClient().
 */

// ============================================================================
// HLR Types
// ============================================================================

export interface IHLRPredictionInput {
  /** User ID for retrieval history lookup */
  userId: string;
  /** Card ID to predict recall for */
  cardId: string;
  /** Optional: timestamp to predict recall at (ISO 8601, defaults to now) */
  asOf?: string;
}

export interface IHLRPredictionResult {
  cardId: string;
  recallProbability: number;
  halfLifeDays: number;
  predictedAt: string;
}

export interface IHLRTrainInput {
  userId: string;
  cardId: string;
  /** Whether the card was recalled correctly */
  recalled: boolean;
  /** Time elapsed since last review in days */
  deltaT: number;
  /** Timestamp of the review */
  reviewedAt: string;
}

export interface IHLRTrainResult {
  cardId: string;
  updatedHalfLife: number;
  trainedAt: string;
}

export interface IHLRWeights {
  /** Intercept term */
  theta0: number;
  /** Half-life coefficient */
  theta1: number;
  /** Difficulty coefficient */
  theta2: number;
  /** Additional feature weights */
  extra: Record<string, number>;
  updatedAt: string;
}

export interface IHLRHealthResult {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
}

// ============================================================================
// Backward-compat aliases (non-I names)
// ============================================================================

export type HLRPredictionInput = IHLRPredictionInput;
export type HLRPredictionResult = IHLRPredictionResult;
export type HLRTrainInput = IHLRTrainInput;
export type HLRTrainResult = IHLRTrainResult;
export type HLRWeights = IHLRWeights;
export type HLRHealthResult = IHLRHealthResult;
