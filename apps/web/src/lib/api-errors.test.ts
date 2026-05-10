import { describe, expect, it } from 'vitest';

import { formatApiErrorMessage } from './api-errors';

describe('formatApiErrorMessage', () => {
  it('explains upstream unavailability for 502-style failures', () => {
    const message = formatApiErrorMessage(
      {
        message: 'Could not reach knowledge-graph-agent',
        code: 'UPSTREAM_SERVICE_UNAVAILABLE',
        status: 502,
        requestId: 'req_123',
      },
      {
        action: 'generate expansion proposals',
        fallback: 'Unable to generate expansion proposals.',
      }
    );

    expect(message).toContain('backend service is temporarily unavailable');
    expect(message).toContain('req_123');
  });

  it('explains malformed backend responses distinctly from network failures', () => {
    const message = formatApiErrorMessage(
      {
        message: 'The server returned an invalid JSON response.',
        code: 'BAD_RESPONSE',
        status: 200,
      },
      {
        action: 'generate expansion proposals',
        fallback: 'Unable to generate expansion proposals.',
      }
    );

    expect(message).toContain('returned an invalid response');
  });
});
