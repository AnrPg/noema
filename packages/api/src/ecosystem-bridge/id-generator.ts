// =============================================================================
// ECOSYSTEM BRIDGE ID GENERATOR
// =============================================================================
// Utility functions for generating unique IDs for bridge entities

import { randomBytes } from "crypto";

/**
 * Generate a unique mapping ID
 * Format: ebm_{timestamp}_{random}
 */
export function generateMappingId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(6).toString("hex");
  return `ebm_${timestamp}_${random}`;
}

/**
 * Generate a unique sync event ID
 * Format: ebs_{timestamp}_{random}
 */
export function generateSyncEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(6).toString("hex");
  return `ebs_${timestamp}_${random}`;
}

/**
 * Generate a unique LKGC node ID placeholder
 * Format: lkgc_node_{sourceType}_{sourceId}
 */
export function generateLkgcNodeId(
  sourceType: string,
  sourceId: string,
): string {
  return `lkgc_node_${sourceType}_${sourceId}`;
}

/**
 * Generate a unique LKGC edge ID placeholder
 * Format: lkgc_edge_{sourceType}_{sourceId}
 */
export function generateLkgcEdgeId(
  sourceType: string,
  sourceId: string,
): string {
  return `lkgc_edge_${sourceType}_${sourceId}`;
}

/**
 * Parse a generated ID to extract components
 */
export function parseGeneratedId(id: string): {
  prefix: string;
  timestamp: number;
  random: string;
} | null {
  const match = id.match(/^(eb[ms])_([a-z0-9]+)_([a-f0-9]+)$/);
  if (!match) return null;

  return {
    prefix: match[1],
    timestamp: parseInt(match[2], 36),
    random: match[3],
  };
}
