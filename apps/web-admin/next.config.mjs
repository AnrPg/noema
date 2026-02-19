/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@noema/ui', '@noema/auth', '@noema/api-client'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
