import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Ignore TypeScript errors during builds
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,HEAD,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-Twilio-Signature" },
        ],
      },
    ];
  },
};

export default nextConfig;
