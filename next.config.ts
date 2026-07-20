import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 배포용 최소 런타임 출력
  output: "standalone",
  experimental: {
    allowedDevOrigins: ["10.2.0.2", "localhost:3000"],
  },
};

export default nextConfig;
