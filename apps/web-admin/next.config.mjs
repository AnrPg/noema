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
      { source: '/api/v1/users/:userId/:section(pkg|metrics|misconceptions|health|comparison)/:path*', destination: 'http://localhost:3006/api/v1/users/:userId/:section/:path*' },
      { source: '/api/v1/users/:path*', destination: 'http://localhost:3001/v1/users/:path*' },
      { source: '/api/v1/cards/:path*', destination: 'http://localhost:3002/v1/cards/:path*' },
      { source: '/api/v1/templates/:path*', destination: 'http://localhost:3002/v1/templates/:path*' },
      { source: '/api/v1/media/:path*', destination: 'http://localhost:3002/v1/media/:path*' },
      { source: '/api/v1/sessions/:path*', destination: 'http://localhost:3004/v1/sessions/:path*' },
      { source: '/api/v1/offline-intents/:path*', destination: 'http://localhost:3004/v1/offline-intents/:path*' },
      { source: '/api/v1/scheduler/:path*', destination: 'http://localhost:3003/v1/scheduler/:path*' },
      { source: '/api/v1/schedule/:path*', destination: 'http://localhost:3003/v1/schedule/:path*' },
      { source: '/api/v1/ckg/:path*', destination: 'http://localhost:3006/api/v1/ckg/:path*' },
      { source: '/api/hlr/:path*', destination: 'http://localhost:8020/:path*' },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid eval-wrapped dev chunks on Windows; they can break when workspace
      // package comments include Unicode characters.
      config.devtool = 'source-map';
      config.watchOptions = {
        ...config.watchOptions,
        poll: config.watchOptions?.poll ?? 1000,
      };
    }

    return config;
  },
};

export default nextConfig;
