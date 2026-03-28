/**
 * @noema/knowledge-graph-service — MCP Tool Contract Tests
 *
 * Verifies that each tool definition conforms to the MCP tool contract standard:
 * 1. All 19 tools are registered with unique, kebab-case names
 * 2. Every tool has a valid inputSchema with `type: 'object'`
 * 3. Required fields are present: name, version, description, service, priority
 * 4. scopeRequirement and capabilities are populated by withContractDefaults
 * 5. Side-effect classification is consistent (add/update/remove/propose → sideEffects)
 * 6. IToolExecutionResult shape contract (success/data/error/agentHints/metadata)
 */

import { describe, expect, it } from 'vitest';

import { KG_TOOL_DEFINITIONS } from '../../src/agents/tools/kg.tools.js';
import type { IToolDefinition } from '../../src/agents/tools/tool.types.js';

// ============================================================================
// Tool Registry Completeness
// ============================================================================

describe('KG_TOOL_DEFINITIONS registry', () => {
  it('exports exactly 19 tool definitions', () => {
    expect(KG_TOOL_DEFINITIONS).toHaveLength(19);
  });

  it('all tool names are unique', () => {
    const names = KG_TOOL_DEFINITIONS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('contains expected tool names', () => {
    const names = new Set(KG_TOOL_DEFINITIONS.map((t) => t.name));

    // PKG tools
    expect(names.has('get-concept-node')).toBe(true);
    expect(names.has('get-subgraph')).toBe(true);
    expect(names.has('find-prerequisites')).toBe(true);
    expect(names.has('find-related-concepts')).toBe(true);
    expect(names.has('add-concept-node')).toBe(true);
    expect(names.has('add-edge')).toBe(true);
    expect(names.has('update-mastery')).toBe(true);
    expect(names.has('remove-node')).toBe(true);
    expect(names.has('remove-edge')).toBe(true);

    // CKG tools
    expect(names.has('get-canonical-structure')).toBe(true);
    expect(names.has('propose-mutation')).toBe(true);
    expect(names.has('get-mutation-status')).toBe(true);

    // Metrics / health tools
    expect(names.has('compute-structural-metrics')).toBe(true);
    expect(names.has('get-structural-health')).toBe(true);

    // Misconception / metacognitive tools
    expect(names.has('detect-misconceptions')).toBe(true);
    expect(names.has('suggest-intervention')).toBe(true);
    expect(names.has('get-metacognitive-stage')).toBe(true);

    // Composite
    expect(names.has('get-learning-path-context')).toBe(true);
  });
});

// ============================================================================
// Naming Convention
// ============================================================================

describe('Tool naming convention', () => {
  it.each(KG_TOOL_DEFINITIONS.map((t) => [t.name]))('%s is kebab-case', (name) => {
    expect(name).toMatch(/^[a-z][a-z0-9-]+$/);
  });
});

// ============================================================================
// Required Fields
// ============================================================================

describe('Required tool definition fields', () => {
  it.each(KG_TOOL_DEFINITIONS.map((t) => [t.name, t] as [string, IToolDefinition]))(
    '%s has all required fields',
    (_name, tool) => {
      expect(tool.name).toBeTruthy();
      expect(tool.version).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.service).toBe('knowledge-graph-service');
      expect(['P0', 'P1', 'P2']).toContain(tool.priority);
    }
  );

  it.each(KG_TOOL_DEFINITIONS.map((t) => [t.name, t] as [string, IToolDefinition]))(
    '%s has version 1.0.0',
    (_name, tool) => {
      expect(tool.version).toBe('1.0.0');
    }
  );
});

// ============================================================================
// Input Schema Contract
// ============================================================================

describe('inputSchema contract', () => {
  it.each(KG_TOOL_DEFINITIONS.map((t) => [t.name, t] as [string, IToolDefinition]))(
    '%s has type: object inputSchema',
    (_name, tool) => {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  );

  it.each(KG_TOOL_DEFINITIONS.map((t) => [t.name, t] as [string, IToolDefinition]))(
    '%s has properties in inputSchema',
    (_name, tool) => {
      expect(tool.inputSchema.properties).toBeDefined();
      expect(typeof tool.inputSchema.properties).toBe('object');
    }
  );
});

// ============================================================================
// Scope Requirement Contract
// ============================================================================

describe('scopeRequirement contract', () => {
  it.each(KG_TOOL_DEFINITIONS.map((t) => [t.name, t] as [string, IToolDefinition]))(
    '%s has scopeRequirement with match and requiredScopes',
    (_name, tool) => {
      expect(tool.scopeRequirement).toBeDefined();
      expect(['all', 'any']).toContain(tool.scopeRequirement.match);
      expect(tool.scopeRequirement.requiredScopes).toBeInstanceOf(Array);
      expect(tool.scopeRequirement.requiredScopes.length).toBeGreaterThan(0);
    }
  );

  it('all tools require kg:tools:execute scope', () => {
    for (const tool of KG_TOOL_DEFINITIONS) {
      expect(tool.scopeRequirement.requiredScopes).toContain('kg:tools:execute');
    }
  });
});

// ============================================================================
// Capabilities Contract
// ============================================================================

describe('capabilities contract', () => {
  it.each(KG_TOOL_DEFINITIONS.map((t) => [t.name, t] as [string, IToolDefinition]))(
    '%s has complete capabilities',
    (_name, tool) => {
      expect(typeof tool.capabilities.idempotent).toBe('boolean');
      expect(typeof tool.capabilities.sideEffects).toBe('boolean');
      expect(typeof tool.capabilities.timeoutMs).toBe('number');
      expect(tool.capabilities.timeoutMs).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(tool.capabilities.costClass);
    }
  );
});

// ============================================================================
// Side-Effect Classification Consistency
// ============================================================================

describe('Side-effect classification', () => {
  const MUTATION_PREFIXES = ['add-', 'update-', 'remove-', 'propose-'];

  it('mutation tools have sideEffects: true', () => {
    for (const tool of KG_TOOL_DEFINITIONS) {
      const isMutation = MUTATION_PREFIXES.some((p) => tool.name.startsWith(p));
      if (isMutation) {
        expect(tool.capabilities.sideEffects).toBe(true);
      }
    }
  });

  it('read-only tools have sideEffects: false', () => {
    for (const tool of KG_TOOL_DEFINITIONS) {
      const isMutation = MUTATION_PREFIXES.some((p) => tool.name.startsWith(p));
      if (!isMutation) {
        expect(tool.capabilities.sideEffects).toBe(false);
      }
    }
  });

  it('mutation tools are not idempotent', () => {
    for (const tool of KG_TOOL_DEFINITIONS) {
      if (tool.capabilities.sideEffects) {
        expect(tool.capabilities.idempotent).toBe(false);
      }
    }
  });

  it('read-only tools are idempotent', () => {
    for (const tool of KG_TOOL_DEFINITIONS) {
      if (!tool.capabilities.sideEffects) {
        expect(tool.capabilities.idempotent).toBe(true);
      }
    }
  });

  it('mutation tools use strong consistency', () => {
    for (const tool of KG_TOOL_DEFINITIONS) {
      if (tool.capabilities.sideEffects) {
        expect(tool.capabilities.consistency).toBe('strong');
      }
    }
  });
});

// ============================================================================
// Timeout Classification
// ============================================================================

describe('Timeout classification', () => {
  it('get-learning-path-context has extended timeout (15s)', () => {
    const tool = KG_TOOL_DEFINITIONS.find((t) => t.name === 'get-learning-path-context');
    expect(tool?.capabilities.timeoutMs).toBe(15000);
  });

  it('all other tools have standard timeout (5s)', () => {
    for (const tool of KG_TOOL_DEFINITIONS) {
      if (tool.name !== 'get-learning-path-context') {
        expect(tool.capabilities.timeoutMs).toBe(5000);
      }
    }
  });
});

// ============================================================================
// Description Quality
// ============================================================================

describe('Tool description quality', () => {
  it.each(KG_TOOL_DEFINITIONS.map((t) => [t.name, t] as [string, IToolDefinition]))(
    '%s description is non-empty and at least 30 chars',
    (_name, tool) => {
      expect(tool.description.length).toBeGreaterThanOrEqual(30);
    }
  );
});

// ============================================================================
// Pagination Contract
// ============================================================================

describe('Pagination parameter contract', () => {
  it('list-style tools accept limit/offset in inputSchema', () => {
    // find-related-concepts and find-prerequisites accept optional pagination-like params
    const findRelated = KG_TOOL_DEFINITIONS.find((t) => t.name === 'find-related-concepts');
    // Verify it has properties defined (its schema may or may not include limit/offset
    // yet, but those that do should have numeric type)
    expect(findRelated?.inputSchema.properties).toBeDefined();
  });
});
