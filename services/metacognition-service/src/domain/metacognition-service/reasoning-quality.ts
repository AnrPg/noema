import type { ISevenFrameTraceDto } from '@noema/contracts';

export interface IFrameScore {
  frame: string;
  score: number;
  evidence: string[];
}

export interface IReasoningQualityResult {
  reasoningQuality: number;
  frameScores: IFrameScore[];
}

const REQUIRED_FRAMES = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function scoreFromExplicitValue(frame: Record<string, unknown>): number | undefined {
  const candidates = ['score', 'quality', 'reasoningQuality', 'confidence'];
  for (const key of candidates) {
    const value = frame[key];
    if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value);
  }
  return undefined;
}

function scoreFromFlags(frame: Record<string, unknown>): IFrameScore['score'] {
  let score = 0.5;

  const positiveFlags = [
    'goalAligned',
    'parsedCorrectly',
    'diagnosticCue',
    'reconstructed',
    'validReasoning',
    'selfChecked',
    'accurateAttribution',
  ];
  const negativeFlags = [
    'guess',
    'superficialCue',
    'misread',
    'interference',
    'invalidReasoning',
    'prematureCommit',
    'wrongAttribution',
  ];

  for (const flag of positiveFlags) {
    if (frame[flag] === true) score += 0.1;
  }
  for (const flag of negativeFlags) {
    if (frame[flag] === true) score -= 0.16;
  }

  const diagnosticity = frame['cueDiagnosticity'];
  if (diagnosticity === 'diagnostic') score += 0.2;
  if (diagnosticity === 'semi_diagnostic') score += 0.05;
  if (diagnosticity === 'superficial') score -= 0.25;

  const retrievalMode = frame['retrievalMode'];
  if (retrievalMode === 'guess') score -= 0.3;
  if (retrievalMode === 'reconstruct' || retrievalMode === 'compute') score += 0.15;

  const selfCheck = frame['selfCheck'];
  if (selfCheck === 'none') score -= 0.15;
  if (typeof selfCheck === 'string' && selfCheck !== 'none') score += 0.1;

  const errorCount = frame['errorCount'];
  if (typeof errorCount === 'number' && Number.isFinite(errorCount)) {
    score -= Math.min(0.3, errorCount * 0.08);
  }

  return clamp01(score);
}

function collectEvidence(frame: Record<string, unknown>): string[] {
  const evidence = frame['evidence'];
  if (Array.isArray(evidence)) {
    return evidence.filter((item): item is string => typeof item === 'string');
  }
  const notes = frame['notes'];
  return typeof notes === 'string' && notes.trim().length > 0 ? [notes] : [];
}

export function scoreReasoningQuality(trace: ISevenFrameTraceDto): IReasoningQualityResult {
  const frames = asRecord(trace.frames);
  const frameScores = REQUIRED_FRAMES.map((frameName) => {
    const frame = asRecord(frames[frameName]);
    const explicitScore = scoreFromExplicitValue(frame);
    return {
      frame: frameName,
      score: explicitScore ?? scoreFromFlags(frame),
      evidence: collectEvidence(frame),
    };
  });

  const average =
    frameScores.reduce((total, frame) => total + frame.score, 0) / Math.max(1, frameScores.length);

  return {
    reasoningQuality: Number(clamp01(average).toFixed(4)),
    frameScores,
  };
}
