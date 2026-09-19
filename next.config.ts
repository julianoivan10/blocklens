import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Trim what reaches the browser: these packages export large barrels,
  // and only the handful of icons/helpers actually referenced should be
  // bundled.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  // Security headers. The app serves no third-party frames and needs no
  // camera, microphone or geolocation, so those are denied outright.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
