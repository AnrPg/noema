export interface ICombineSignalConfig {
  highReasoningThreshold: number;
  mediumReasoningThreshold: number;
  highReasoningTraceWeight: number;
  mediumReasoningTraceWeight: number;
  lowReasoningTraceWeight: number;
}

export const DEFAULT_COMBINE_SIGNAL_CONFIG: ICombineSignalConfig = {
  highReasoningThreshold: 0.7,
  mediumReasoningThreshold: 0.3,
  highReasoningTraceWeight: 0.85,
  mediumReasoningTraceWeight: 0.6,
  lowReasoningTraceWeight: 0.95,
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const LOW_REASONING_MAX_COMBINED_SCORE = 0.2999;

export function combineSignals(
  reasoningQuality: number,
  confidenceSignal: number,
  config: ICombineSignalConfig = DEFAULT_COMBINE_SIGNAL_CONFIG
): number {
  const reasoning = clamp01(reasoningQuality);
  const confidence = clamp01(confidenceSignal);
  const traceWeight =
    reasoning > config.highReasoningThreshold
      ? config.highReasoningTraceWeight
      : reasoning >= config.mediumReasoningThreshold
        ? config.mediumReasoningTraceWeight
        : config.lowReasoningTraceWeight;
  const selfWeight = 1 - traceWeight;
  const combined = Number((traceWeight * reasoning + selfWeight * confidence).toFixed(4));

  if (reasoning < config.mediumReasoningThreshold) {
    return Math.min(combined, LOW_REASONING_MAX_COMBINED_SCORE);
  }

  return combined;
}
