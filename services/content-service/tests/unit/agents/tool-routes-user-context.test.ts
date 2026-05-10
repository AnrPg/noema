import { describe, expect, it } from 'vitest';

import { resolveToolExecutionUserId } from '../../../src/agents/tools/tool.routes.js';

describe('content tool route user context', () => {
  it('uses x-user-id for service callers executing learner-scoped content tools', () => {
    const userId = resolveToolExecutionUserId(
      { sub: 'agents-service', roles: ['service'], scopes: ['content:tools:execute'] },
      'user_bWPZ_GRfTcYGe39pDZCnd'
    );

    expect(userId).toBe('user_bWPZ_GRfTcYGe39pDZCnd');
  });

  it('does not let ordinary users delegate tool execution to another user', () => {
    const userId = resolveToolExecutionUserId(
      { sub: 'user_actual', roles: ['learner'], scopes: ['content:tools:execute'] },
      'user_other'
    );

    expect(userId).toBe('user_actual');
  });
});
