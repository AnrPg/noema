import { describe, expect, test } from 'vitest';
import nextConfig from '../next.config.mjs';

describe('web rewrites', () => {
  test('proxies curriculum API requests to curriculum-service', async () => {
    const rewrites = await nextConfig.rewrites();

    expect(rewrites).toContainEqual({
      source: '/api/v1/curricula/:path*',
      destination: 'http://localhost:3017/v1/curricula/:path*',
    });
  });

  test('proxies domain suggestion requests to knowledge-graph-service', async () => {
    const rewrites = await nextConfig.rewrites();

    expect(rewrites).toContainEqual({
      source: '/api/v1/domain-suggestions',
      destination: 'http://localhost:3006/api/v1/domain-suggestions',
    });
  });

  test('proxies user stability and gamification requests to their owning services', async () => {
    const rewrites = await nextConfig.rewrites();

    expect(rewrites).toContainEqual({
      source: '/api/v1/users/:userId/stability-summary',
      destination: 'http://localhost:3006/api/v1/users/:userId/stability-summary',
    });
    expect(rewrites).toContainEqual({
      source: '/api/v1/users/:userId/gamification/:path*',
      destination: 'http://localhost:3005/v1/users/:userId/gamification/:path*',
    });
  });

  test('proxies concept-first read models to scheduler and knowledge-graph services', async () => {
    const rewrites = await nextConfig.rewrites();

    expect(rewrites).toContainEqual({
      source: '/api/v1/concepts/due',
      destination: 'http://localhost:3003/v1/concepts/due',
    });
    expect(rewrites).toContainEqual({
      source: '/api/v1/concepts/:conceptId/schedule',
      destination: 'http://localhost:3003/v1/concepts/:conceptId/schedule',
    });
    expect(rewrites).toContainEqual({
      source: '/api/v1/concepts/:conceptId/transformation-history',
      destination: 'http://localhost:3003/v1/concepts/:conceptId/transformation-history',
    });
    expect(rewrites).toContainEqual({
      source: '/api/v1/concepts/:conceptId/state',
      destination: 'http://localhost:3006/api/v1/concepts/:conceptId/state',
    });
    expect(rewrites).toContainEqual({
      source: '/api/v1/concepts/:conceptId/state/history',
      destination: 'http://localhost:3006/api/v1/concepts/:conceptId/state/history',
    });
    expect(rewrites).toContainEqual({
      source: '/api/v1/concepts/:conceptId/prerequisite-gaps',
      destination: 'http://localhost:3006/api/v1/concepts/:conceptId/prerequisite-gaps',
    });
  });
});

describe('web webpack config', () => {
  test('stubs unused react-force-graph 3D entrypoints', () => {
    const configured = nextConfig.webpack(
      { resolve: { alias: {} }, watchOptions: {} },
      { dev: false }
    );

    expect(configured.resolve.alias['3d-force-graph']).toContain('react-force-graph-stub.ts');
    expect(configured.resolve.alias['3d-force-graph-vr']).toContain('react-force-graph-stub.ts');
    expect(configured.resolve.alias['3d-force-graph-ar']).toContain('react-force-graph-stub.ts');
  });
});
