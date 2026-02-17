/**
 * @noema/contracts
 * API contracts and interfaces for Noema services
 *
 * Provides:
 * - AgentHints: Guidance structure for all API/tool responses
 * - Response wrappers: ApiResponse, ToolResult, ServiceResult
 * - Common types for service communication
 */

export const VERSION = '0.1.0';

// AgentHints v2.0.0 for agent guidance
export * from './agent-hints.js';

// Response wrappers for APIs and tools
export * from './responses.js';

// Health check contracts (universal across all services)
export * from './health.js';
