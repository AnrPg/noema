import { describe, expect, it } from 'vitest';

import { resolveToolExecutionUserId } from '../../../src/agents/tools/tool.routes.js';

describe('knowledge-graph tool route user context', () => {
  it('uses x-user-id for service callers executing learner-scoped PKG tools', () => {
    const userId = resolveToolExecutionUserId(
      { sub: 'agents-service', roles: ['service'], scopes: ['kg:tools:execute'] },
      'user_bWPZ_GRfTcYGe39pDZCnd'
    );

    expect(userId).toBe('user_bWPZ_GRfTcYGe39pDZCnd');
  });

  it('does not let ordinary users delegate tool execution to another user', () => {
    const userId = resolveToolExecutionUserId(
      { sub: 'user_actual', roles: ['learner'], scopes: ['kg:tools:execute'] },
      'user_other'
    );

    expect(userId).toBe('user_actual');
  });
});
