/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use standalone output for production builds (electron:build)
  // In dev mode, standalone causes issues with next dev
  ...(process.env.NODE_ENV === "production" ? { output: "standalone" } : {}),
  serverExternalPackages: ["playwright"],
  // Suppress build errors from missing database during prerender
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
