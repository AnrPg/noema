/**
 * @noema/validation - Mental Debugger Schemas
 *
 * Zod schemas for Mental Debugger types including:
 * - Thinking trace frames
 * - Failure taxonomy (10 families)
 * - Diagnostic types
 */

import {
  AttentionFailureSubtype,
  AttributionFailureSubtype,
  CalibrationFailureSubtype,
  CommitmentFailureSubtype,
  CueDiagnosticity,
  CueSelectionFailureSubtype,
  CueType,
  DecisionPolicy,
  DiscriminationFailureSubtype,
  EnergyState,
  ErrorSeverity,
  FailureFamily,
  GoalType,
  InstructionFeature,
  InterferenceMarker,
  MonitoringFailureSubtype,
  MotivationState,
  OperationType,
  ParsingFailureSubtype,
  PartialKnowledge,
  PatchIntrusiveness,
  PatchTimeframe,
  PromptFocus,
  ReasoningFailureSubtype,
  RepresentationType,
  RetrievalFailureSubtype,
  RetrievalMode,
  SelfCheckType,
  StakesMode,
  StopCondition,
  TraceFrame,
} from '@noema/types';
import { z } from 'zod';

// ============================================================================
// Helper to create enum schema from const object
// ============================================================================

function createEnumSchema<T extends Record<string, string>>(enumObj: T, description: string) {
  const values = Object.values(enumObj) as [string, ...string[]];
  return z.enum(values).describe(description);
}

// ============================================================================
// Frame Schemas
// ============================================================================

export const TraceFrameSchema = createEnumSchema(TraceFrame, 'Trace frame (0-6)');
export const GoalTypeSchema = createEnumSchema(GoalType, 'Goal type');
export const StakesModeSchema = createEnumSchema(StakesMode, 'Stakes mode');
export const MotivationStateSchema = createEnumSchema(MotivationState, 'Motivation state');
export const EnergyStateSchema = createEnumSchema(EnergyState, 'Energy state');
export const PromptFocusSchema = createEnumSchema(PromptFocus, 'Prompt focus');
export const InstructionFeatureSchema = createEnumSchema(InstructionFeature, 'Instruction feature');
export const CueTypeSchema = createEnumSchema(CueType, 'Cue type');
export const CueDiagnosticitySchema = createEnumSchema(CueDiagnosticity, 'Cue diagnosticity');
export const RetrievalModeSchema = createEnumSchema(RetrievalMode, 'Retrieval mode');
export const InterferenceMarkerSchema = createEnumSchema(InterferenceMarker, 'Interference marker');
export const PartialKnowledgeSchema = createEnumSchema(PartialKnowledge, 'Partial knowledge');
export const OperationTypeSchema = createEnumSchema(OperationType, 'Operation type');
export const RepresentationTypeSchema = createEnumSchema(RepresentationType, 'Representation type');
export const DecisionPolicySchema = createEnumSchema(DecisionPolicy, 'Decision policy');
export const SelfCheckTypeSchema = createEnumSchema(SelfCheckType, 'Self-check type');
export const StopConditionSchema = createEnumSchema(StopCondition, 'Stop condition');

// ============================================================================
// Failure Taxonomy Schemas
// ============================================================================

export const FailureFamilySchema = createEnumSchema(FailureFamily, 'Failure family');
export const ParsingFailureSubtypeSchema = createEnumSchema(
  ParsingFailureSubtype,
  'Parsing failure subtype'
);
export const AttentionFailureSubtypeSchema = createEnumSchema(
  AttentionFailureSubtype,
  'Attention failure subtype'
);
export const CueSelectionFailureSubtypeSchema = createEnumSchema(
  CueSelectionFailureSubtype,
  'Cue selection failure subtype'
);
export const RetrievalFailureSubtypeSchema = createEnumSchema(
  RetrievalFailureSubtype,
  'Retrieval failure subtype'
);
export const DiscriminationFailureSubtypeSchema = createEnumSchema(
  DiscriminationFailureSubtype,
  'Discrimination failure subtype'
);
export const ReasoningFailureSubtypeSchema = createEnumSchema(
  ReasoningFailureSubtype,
  'Reasoning failure subtype'
);
export const MonitoringFailureSubtypeSchema = createEnumSchema(
  MonitoringFailureSubtype,
  'Monitoring failure subtype'
);
export const CommitmentFailureSubtypeSchema = createEnumSchema(
  CommitmentFailureSubtype,
  'Commitment failure subtype'
);
export const CalibrationFailureSubtypeSchema = createEnumSchema(
  CalibrationFailureSubtype,
  'Calibration failure subtype'
);
export const AttributionFailureSubtypeSchema = createEnumSchema(
  AttributionFailureSubtype,
  'Attribution failure subtype'
);

/**
 * Union of all failure subtypes.
 */
export const FailureSubtypeSchema = z.union([
  ParsingFailureSubtypeSchema,
  AttentionFailureSubtypeSchema,
  CueSelectionFailureSubtypeSchema,
  RetrievalFailureSubtypeSchema,
  DiscriminationFailureSubtypeSchema,
  ReasoningFailureSubtypeSchema,
  MonitoringFailureSubtypeSchema,
  CommitmentFailureSubtypeSchema,
  CalibrationFailureSubtypeSchema,
  AttributionFailureSubtypeSchema,
]);

// ============================================================================
// Diagnostic Schemas
// ============================================================================

export const ErrorSeveritySchema = createEnumSchema(ErrorSeverity, 'Error severity');
export const PatchTimeframeSchema = createEnumSchema(PatchTimeframe, 'Patch timeframe');
export const PatchIntrusivenessSchema = createEnumSchema(PatchIntrusiveness, 'Patch intrusiveness');

// ============================================================================
// Type Inference
// ============================================================================

export type TraceFrameInput = z.input<typeof TraceFrameSchema>;
export type GoalTypeInput = z.input<typeof GoalTypeSchema>;
export type StakesModeInput = z.input<typeof StakesModeSchema>;
export type FailureFamilyInput = z.input<typeof FailureFamilySchema>;
export type FailureSubtypeInput = z.input<typeof FailureSubtypeSchema>;
export type ErrorSeverityInput = z.input<typeof ErrorSeveritySchema>;
export type PatchTimeframeInput = z.input<typeof PatchTimeframeSchema>;
export type PatchIntrusivenessInput = z.input<typeof PatchIntrusivenessSchema>;
