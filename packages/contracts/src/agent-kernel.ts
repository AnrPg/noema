/**
 * Contracts for the agent kernel, capability discovery, and custom agent runs.
 */

import type {
  AgentContextPack,
  AgentExplanationEnvelope,
  AgentIdentity,
  AgentOutputEnvelope,
  AgentRoleContract,
  CapabilityDefinition,
  FunctionDefinition,
  FunctionExecutionResult,
  ReplayReference,
  ToolDefinition,
  ToolExecutionRequest,
  ToolExecutionResult,
} from '@noema/types';

export interface ICapabilityDiscoveryDto {
  registryVersion: string;
  generatedAt: string;
  capabilities: CapabilityDefinition[];
}

export interface ICapabilityExecutionRequestDto<TInput = unknown> {
  capability: string;
  input: TInput;
  dryRun?: boolean;
  contextOverrides?: Record<string, unknown>;
}

export interface ICapabilityExecutionResponseDto<TResult = unknown> {
  capability: CapabilityDefinition;
  result: ToolExecutionResult<TResult> | FunctionExecutionResult<TResult>;
}

export interface IAgentRunRequestDto {
  agent: AgentIdentity;
  contract: AgentRoleContract;
  contextPack: AgentContextPack;
  allowedTools: ToolDefinition[];
  allowedFunctions: FunctionDefinition[];
  promptTemplateId?: string;
}

export interface IAgentRunResultDto {
  runId: string;
  outputs: AgentOutputEnvelope[];
  explanations?: AgentExplanationEnvelope[];
  replay: ReplayReference;
  toolRequests?: ToolExecutionRequest[];
}
