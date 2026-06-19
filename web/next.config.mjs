/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  async headers() {
    return [
      {
        // Permite que páginas /embed/* sejam abertas em iframe pelos sites parceiros.
        source: '/embed/:path*',
        headers: [
          // CSP frame-ancestors: lista de origens autorizadas a embedar.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://*.geometricagency.com http://localhost:3000 http://localhost:3001" },
        ],
      },
    ];
  },
};
export default nextConfig;
