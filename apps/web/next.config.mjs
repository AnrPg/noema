import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@noema/ui', '@noema/auth', '@noema/api-client'],
  experimental: {
    typedRoutes: true,
  },
  async rewrites() {
    return [
      { source: '/api/auth/:path*', destination: 'http://localhost:3001/auth/:path*' },
      { source: '/api/users/:path*', destination: 'http://localhost:3001/users/:path*' },
      { source: '/api/me/:path*', destination: 'http://localhost:3001/me/:path*' },
      {
        source: '/api/v1/users/:userId/stability-summary',
        destination: 'http://localhost:3006/api/v1/users/:userId/stability-summary',
      },
      {
        source: '/api/v1/users/:userId/gamification/:path*',
        destination: 'http://localhost:3005/v1/users/:userId/gamification/:path*',
      },
      { source: '/api/v1/users/:userId/:section(pkg|metrics|misconceptions|health|comparison)/:path*', destination: 'http://localhost:3006/api/v1/users/:userId/:section/:path*' },
      { source: '/api/v1/concepts/due', destination: 'http://localhost:3003/v1/concepts/due' },
      {
        source: '/api/v1/concepts/:conceptId/schedule',
        destination: 'http://localhost:3003/v1/concepts/:conceptId/schedule',
      },
      {
        source: '/api/v1/concepts/:conceptId/transformation-history',
        destination: 'http://localhost:3003/v1/concepts/:conceptId/transformation-history',
      },
      {
        source: '/api/v1/concepts/:conceptId/state/history',
        destination: 'http://localhost:3006/api/v1/concepts/:conceptId/state/history',
      },
      {
        source: '/api/v1/concepts/:conceptId/state',
        destination: 'http://localhost:3006/api/v1/concepts/:conceptId/state',
      },
      {
        source: '/api/v1/concepts/:conceptId/prerequisite-gaps',
        destination: 'http://localhost:3006/api/v1/concepts/:conceptId/prerequisite-gaps',
      },
      { source: '/api/v1/users/:path*', destination: 'http://localhost:3001/v1/users/:path*' },
      { source: '/api/v1/cards/:path*', destination: 'http://localhost:3002/v1/cards/:path*' },
      { source: '/api/v1/templates/:path*', destination: 'http://localhost:3002/v1/templates/:path*' },
      { source: '/api/v1/media/:path*', destination: 'http://localhost:3002/v1/media/:path*' },
      { source: '/api/v1/sessions/:path*', destination: 'http://localhost:3004/v1/sessions/:path*' },
      { source: '/api/v1/offline-intents/:path*', destination: 'http://localhost:3004/v1/offline-intents/:path*' },
      { source: '/api/v1/scheduler/:path*', destination: 'http://localhost:3003/v1/scheduler/:path*' },
      { source: '/api/v1/schedule/:path*', destination: 'http://localhost:3003/v1/schedule/:path*' },
      { source: '/api/v1/curricula/:path*', destination: 'http://localhost:3017/v1/curricula/:path*' },
      { source: '/api/v1/ckg/:path*', destination: 'http://localhost:3006/api/v1/ckg/:path*' },
      { source: '/api/v1/domain-suggestions', destination: 'http://localhost:3006/api/v1/domain-suggestions' },
      { source: '/api/hlr/:path*', destination: 'http://localhost:8020/:path*' },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: config.watchOptions?.poll ?? 1000,
      };
    }

    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // The knowledge graph only uses the 2D canvas renderer. Stubbing the
      // unused 3D/VR/AR modules keeps the react-force-graph umbrella import
      // from pulling in Three/A-Frame stacks that trigger duplicate-runtime
      // warnings in development.
      '3d-force-graph': path.join(__dirname, 'src/lib/react-force-graph-stub.ts'),
      '3d-force-graph-vr': path.join(__dirname, 'src/lib/react-force-graph-stub.ts'),
      '3d-force-graph-ar': path.join(__dirname, 'src/lib/react-force-graph-stub.ts'),
    };

    return config;
  },
};

export default nextConfig;
