/**
 * Cross-service contracts for session blueprint orchestration, adaptive
 * checkpoints, scheduler dual-lane guidance, and offline intent tokens.
 */

export interface ICognitivePolicySnapshot {
  pacingPolicy: {
    targetSecondsPerCard: number;
    hardCapSecondsPerCard: number;
    slowdownOnError: boolean;
  };
  hintPolicy: {
    maxHintsPerCard: number;
    progressiveHintsOnly: boolean;
    allowAnswerReveal: boolean;
  };
  commitPolicy: {
    requireConfidenceBeforeCommit: boolean;
    requireVerificationGate: boolean;
  };
  reflectionPolicy: {
    postAttemptReflection: boolean;
    postSessionReflection: boolean;
  };
}

export interface ISchedulerLaneMix {
  retention: number;
  calibration: number;
}

export type AdaptiveCheckpointSignal =
  | 'confidence_drift'
  | 'latency_spike'
  | 'error_cascade'
  | 'streak_break'
  | 'manual';

export interface ISessionBlueprint {
  blueprintVersion: 'v1';
  generatedAt: string;
  generatedBy: 'agent';
  deckQueryId: string;
  initialCardIds: string[];
  laneMix: ISchedulerLaneMix;
  checkpointSignals: AdaptiveCheckpointSignal[];
  policySnapshot: ICognitivePolicySnapshot;
  assumptions: string[];
}

export interface IAdaptiveCheckpointDirective {
  action:
    | 'rebalance_queue'
    | 'slowdown'
    | 'increase_support'
    | 'reduce_calibration_lane'
    | 'switch_teaching_approach'
    | 'continue';
  reason: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface IDualLaneSchedulerPlan {
  planVersion: 'v1';
  createdAt: string;
  laneMix: ISchedulerLaneMix;
  retentionCardIds: string[];
  calibrationCardIds: string[];
  rationale: string;
}

export interface IOfflineIntentTokenClaims {
  tokenVersion: 'v1';
  userId: string;
  sessionBlueprint: ISessionBlueprint;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}
