/**
 * @noema/api-client - HLR Sidecar API
 *
 * All calls pass `baseUrl` to override the global API base URL.
 * Configure the sidecar URL with configureHlrClient() before calling
 * any method in this module.
 */

import { http } from '../client.js';
import type {
  IHLRHealthResult,
  IHLRPredictionInput,
  IHLRPredictionResult,
  IHLRTrainInput,
  IHLRTrainResult,
  IHLRWeights,
} from './types.js';

// ============================================================================
// HLR Base URL Config
// ============================================================================

let hlrBaseUrl: string | undefined;

/**
 * Configure the HLR sidecar base URL.
 * Call this during app startup alongside configureApiClient().
 *
 * @example
 * configureHlrClient('http://localhost:3005');
 */
export function configureHlrClient(baseUrl: string): void {
  hlrBaseUrl = baseUrl;
}

function getHlrBaseUrl(): string {
  if (hlrBaseUrl === undefined) {
    throw new Error('HLR client not configured. Call configureHlrClient(url) first.');
  }
  return hlrBaseUrl;
}

// ============================================================================
// HLR API
// ============================================================================

export const hlrApi = {
  /** Health check for the HLR sidecar. */
  health: (): Promise<IHLRHealthResult> => http.get('/health', { baseUrl: getHlrBaseUrl() }),

  /** Predict recall probability and half-life for a card. */
  predict: (input: IHLRPredictionInput): Promise<IHLRPredictionResult> =>
    http.post('/predict', input, { baseUrl: getHlrBaseUrl() }),

  /** Online weight update after a review event. */
  train: (input: IHLRTrainInput): Promise<IHLRTrainResult> =>
    http.post('/train', input, { baseUrl: getHlrBaseUrl() }),

  /** Get current model weights. */
  getWeights: (): Promise<IHLRWeights> => http.get('/weights', { baseUrl: getHlrBaseUrl() }),

  /** Replace model weights (admin only). */
  putWeights: (weights: Omit<IHLRWeights, 'updatedAt'>): Promise<IHLRWeights> =>
    http.put('/weights', weights, { baseUrl: getHlrBaseUrl() }),
};
