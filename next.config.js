/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  eslint: {
    // Lint is run separately (`npm run lint`); don't fail the production build on it.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/icon",
        permanent: true,
      },
      {
        source: "/stars",
        destination: "/team",
        permanent: false,
      },
      {
        source: "/stars/:slug",
        destination: "/team/:slug",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
