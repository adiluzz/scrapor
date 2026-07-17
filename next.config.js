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
    ];
  },
  async headers() {
    // OpenReel needs SharedArrayBuffer / WebCodecs (cross-origin isolation).
    const isolation = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ];
    return [
      { source: "/admin/video-editor", headers: isolation },
      { source: "/admin/video-editor/:path*", headers: isolation },
      { source: "/openreel", headers: isolation },
      { source: "/openreel/:path*", headers: isolation },
    ];
  },
};

module.exports = nextConfig;
